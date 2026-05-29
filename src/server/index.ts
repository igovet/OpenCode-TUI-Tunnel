import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';

import { encryptPassphrase } from '../crypto/index.js';
import type { AppConfig } from '../config/index.js';
import {
  type Database,
  countActiveSessionsForSshConnection,
  deleteSshConnection,
  findManagedSessionByTmuxSessionName,
  getSshConnection,
  insertSshConnection,
  insertSession,
  listProjectHistory,
  listSshConnections,
  logEvent,
  openDb,
  removePushSubscriptionByEndpoint,
  updateSshConnection,
  upsertPushSubscription,
  upsertProjectHistory,
} from '../db/index.js';
import { suggestPaths } from './fs-suggest.js';
import { SessionSupervisor, type SessionInfo } from '../session/index.js';
import {
  attachToTmuxSession,
  listAllTmuxSessions,
  type TmuxPtyHandle,
} from '../tmux/adapter.js';
import { attachRemotePty, connectSshClient, listRemoteTunnelSessions, testSshConnection } from '../ssh/adapter.js';
import {
  checkSshfsAvailable,
  cleanupStaleMounts,
  cleanupAllMounts,
} from '../sshfs/adapter.js';
import {
  configureWebPush,
  encodePushKeys,
  ensureVapidConfig,
  isValidPushSubscription,
  sendPushNotification,
} from './push.js';

interface RuntimeState {
  app: FastifyInstance;
  db: Database;
  supervisor: SessionSupervisor;
}

export interface ServerStartInfo {
  address: string;
}

interface StreamSocket {
  send(data: string | Buffer, cb?: (error?: Error) => void): void;
  close(code?: number, reason?: string): void;
  readonly bufferedAmount?: number;
  readonly readyState?: number;
  on(event: 'message', listener: (raw: unknown) => void): void;
  on(event: 'close' | 'error', listener: () => void): void;
}

type WebSocketIncomingMessage =
  | { type: 'hello'; cols?: unknown; rows?: unknown }
  | { type: 'input'; data?: unknown }
  | { type: 'resize'; cols?: unknown; rows?: unknown }
  | { type: 'ping' };

interface OpencodeNotifyPayload {
  type:
    | 'permission_requested'
    | 'permission_resolved'
    | 'question_requested'
    | 'question_resolved'
    | 'session_idle'
    | 'dialog_finished';
  sessionId: string;
  opencodeSessionId?: string;
  tmuxSessionName?: string;
  projectName?: string;
  title?: string;
  permissionId?: string | null;
  questionId?: string | null;
  timestamp?: string;
}

let runtimeState: RuntimeState | null = null;
let stopInProgress: Promise<void> | null = null;

const WS_DEFAULT_COLS = 120;
const WS_DEFAULT_ROWS = 30;
const WS_BACKPRESSURE_HIGH_WATERMARK_BYTES = 256 * 1024;
const WS_BACKPRESSURE_LOW_WATERMARK_BYTES = 64 * 1024;
const WS_BACKPRESSURE_POLL_INTERVAL_MS = 8;
const WS_READY_STATE_OPEN = 1;

function expandHomePath(inputPath: string): string {
  if (inputPath === '~') {
    return homedir();
  }

  if (inputPath.startsWith('~/')) {
    return join(homedir(), inputPath.slice(2));
  }

  return inputPath;
}

function isUnderAllowedRoots(cwd: string, allowedRoots: string[]): boolean {
  const cwdResolved = resolve(expandHomePath(cwd));

  return allowedRoots
    .map((root) => resolve(expandHomePath(root)))
    .some((root) => {
      const rel = relative(root, cwdResolved);
      return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
    });
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function deriveProjectNameFromWorkdir(workdir: string | null | undefined): string | undefined {
  if (typeof workdir !== 'string' || workdir.trim().length === 0) {
    return undefined;
  }

  const candidate = basename(workdir.trim());
  if (!candidate || candidate === '/' || candidate === '.' || candidate === '..') {
    return undefined;
  }

  return candidate;
}

function resolveProjectName(options: {
  providedProjectName: unknown;
  workdir: string | null | undefined;
  fallbackSessionName: string | null | undefined;
}): string {
  if (
    typeof options.providedProjectName === 'string' &&
    options.providedProjectName.trim().length > 0
  ) {
    return options.providedProjectName.trim();
  }

  const derivedFromWorkdir = deriveProjectNameFromWorkdir(options.workdir);
  if (derivedFromWorkdir) {
    return derivedFromWorkdir;
  }

  if (
    typeof options.fallbackSessionName === 'string' &&
    options.fallbackSessionName.trim().length > 0
  ) {
    return options.fallbackSessionName.trim();
  }

  return 'OpenCode TUI';
}

function serializeSession(session: SessionInfo) {
  return {
    ...session,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString(),
    backend: session.backend ?? 'tmux',
    sshConnectionId: session.sshConnectionId ?? null,
  };
}

function resolveWebRoot(): string {
  const currentModulePath = fileURLToPath(import.meta.url);
  const moduleDir = dirname(currentModulePath);
  let packageRoot = moduleDir;

  while (!existsSync(join(packageRoot, 'package.json'))) {
    const parent = dirname(packageRoot);
    if (parent === packageRoot) {
      break;
    }
    packageRoot = parent;
  }

  const candidates = [
    resolve(currentModulePath, '../..', 'web'),
    join(packageRoot, 'dist', 'web'),
    join(packageRoot, 'web'),
  ];

  const existing = candidates.find((candidate) => existsSync(candidate));
  return existing ?? candidates[0];
}

function addCorsForNetworkMode(app: FastifyInstance, config: AppConfig): void {
  if (config.security.listenMode !== 'network') {
    return;
  }

  app.addHook('onRequest', (request, reply, done) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
      reply.code(204).send();
      return;
    }

    done();
  });
}

function setupRoutes(
  app: FastifyInstance,
  db: Database,
  supervisor: SessionSupervisor,
  config: AppConfig,
): void {
  const activeSessionConnections = new Map<string, Set<StreamSocket>>();

  const registerStream = (sessionId: string, socket: StreamSocket): void => {
    const set = activeSessionConnections.get(sessionId) ?? new Set<StreamSocket>();
    set.add(socket);
    activeSessionConnections.set(sessionId, set);
  };

  const unregisterStream = (sessionId: string, socket: StreamSocket): void => {
    const set = activeSessionConnections.get(sessionId);
    if (!set) {
      return;
    }

    set.delete(socket);
    if (set.size === 0) {
      activeSessionConnections.delete(sessionId);
    }
  };

  const broadcastExit = (sessionId: string, exitCode: number): void => {
    const set = activeSessionConnections.get(sessionId);
    if (!set) {
      return;
    }

    for (const socket of set) {
      try {
        socket.send(JSON.stringify({ type: 'exit', exitCode }));
        socket.close(1000, 'Session exited');
      } catch {
        // best-effort notification
      }
    }

    activeSessionConnections.delete(sessionId);
  };

  const listAllSockets = (): StreamSocket[] => {
    const all: StreamSocket[] = [];
    for (const set of activeSessionConnections.values()) {
      for (const socket of set) {
        all.push(socket);
      }
    }
    return all;
  };

  const broadcastOpencodeNotify = (payload: OpencodeNotifyPayload): void => {
    const message = JSON.stringify({
      type: payload.type,
      sessionId: payload.sessionId,
      data: payload,
    });

    for (const socket of listAllSockets()) {
      try {
        socket.send(message);
      } catch {
        // best-effort fanout
      }
    }
  };

  const mapPushMessage = (
    payload: OpencodeNotifyPayload,
  ): { title: string; body: string } | null => {
    switch (payload.type) {
      case 'permission_requested':
        return {
          title: payload.title ?? 'Permission requested',
          body: 'OpenCode is waiting for permission input',
        };
      case 'question_requested':
        return {
          title: payload.title ?? 'Question requested',
          body: 'OpenCode is waiting for your answer',
        };
      case 'dialog_finished':
        return {
          title: payload.title ?? 'Dialog finished',
          body: 'OpenCode dialog is finished',
        };
      default:
        return null;
    }
  };

  const dispatchPushNotification = async (payload: OpencodeNotifyPayload): Promise<void> => {
    const message = mapPushMessage(payload);
    if (!message) {
      return;
    }

    const projectPrefix =
      typeof payload.projectName === 'string' && payload.projectName.trim().length > 0
        ? `${payload.projectName.trim()}: `
        : '';
    const title =
      projectPrefix.length > 0 && !message.title.startsWith(projectPrefix)
        ? `${projectPrefix}${message.title}`
        : message.title;

    await sendPushNotification(db, title, message.body, {
      sessionId: payload.sessionId,
      projectName: payload.projectName,
      timestamp: payload.timestamp,
      type: payload.type,
      permissionId: payload.permissionId,
      questionId: payload.questionId,
    });
  };

  app.get<{ Querystring: { q?: string; sshConnectionId?: string } }>(
    '/api/fs/suggest',
    async (request) => {
      const q = typeof request.query.q === 'string' ? request.query.q : '';
      const sshConnectionId =
        typeof request.query.sshConnectionId === 'string'
          ? request.query.sshConnectionId
          : undefined;

      if (sshConnectionId) {
        const sshConn = getSshConnection(db, sshConnectionId);
        if (!sshConn) {
          return { suggestions: [] };
        }

        try {
          const client = await connectSshClient(sshConn, config);
          try {
            const suggestions = await suggestRemotePaths(client, q, 5);
            return { suggestions };
          } finally {
            client.end();
          }
        } catch {
          return { suggestions: [] };
        }
      }

      const suggestions = suggestPaths(q, 5);
      return { suggestions };
    },
  );

  app.get('/api/projects/history', async () => {
    return { history: listProjectHistory(db) };
  });

  app.get('/api/push/vapid-public-key', async () => {
    return { publicKey: config.push.vapidPublicKey };
  });

  app.post<{ Body: Record<string, unknown> }>('/api/push/subscribe', async (request, reply) => {
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return reply.code(400).send({ error: 'Request body must be an object' });
    }

    const rawSubscription = body.subscription;
    if (!isValidPushSubscription(rawSubscription)) {
      return reply.code(400).send({ error: 'Invalid push subscription payload' });
    }

    upsertPushSubscription(
      db,
      rawSubscription.endpoint,
      encodePushKeys(rawSubscription),
      Date.now(),
    );

    return reply.code(202).send({ ok: true });
  });

  app.delete<{ Body: Record<string, unknown> }>('/api/push/unsubscribe', async (request, reply) => {
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return reply.code(400).send({ error: 'Request body must be an object' });
    }

    const endpoint = body.endpoint;
    if (typeof endpoint !== 'string' || endpoint.trim().length === 0) {
      return reply.code(400).send({ error: 'endpoint is required' });
    }

    removePushSubscriptionByEndpoint(db, endpoint);
    return reply.code(202).send({ ok: true });
  });

  app.get('/api/tmux/sessions', async () => {
    return { sessions: await listAllTmuxSessions() };
  });

  app.post<{ Body: Record<string, unknown> }>('/api/opencode-notify', async (request, reply) => {
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return reply.code(400).send({ error: 'Request body must be an object' });
    }

    const rawType = body.type;
    const rawSessionId = body.sessionId;
    const rawTmuxSessionName = body.tmuxSessionName;
    const rawOpencodeSessionId = body.opencodeSessionId;

    if (typeof rawType !== 'string' || rawType.trim().length === 0) {
      return reply.code(400).send({ error: 'type is required' });
    }

    if (typeof rawSessionId !== 'string' || rawSessionId.trim().length === 0) {
      return reply.code(400).send({ error: 'sessionId is required' });
    }

    const supportedTypes: ReadonlySet<OpencodeNotifyPayload['type']> = new Set([
      'permission_requested',
      'permission_resolved',
      'question_requested',
      'question_resolved',
      'session_idle',
      'dialog_finished',
    ]);

    if (!supportedTypes.has(rawType as OpencodeNotifyPayload['type'])) {
      return reply.code(400).send({ error: `Unsupported notification type: ${rawType}` });
    }

    const mappedSession =
      typeof rawTmuxSessionName === 'string' && rawTmuxSessionName.trim().length > 0
        ? findManagedSessionByTmuxSessionName(db, rawTmuxSessionName)
        : null;
    const resolvedSessionId = mappedSession?.id ?? rawSessionId;
    const resolvedSession = supervisor.get(resolvedSessionId);
    const projectName = resolveProjectName({
      providedProjectName: body.projectName,
      workdir: resolvedSession?.cwd ?? mappedSession?.cwd,
      fallbackSessionName: resolvedSession?.tmuxName ?? mappedSession?.tmux_session_name,
    });
    const activeViewers = activeSessionConnections.get(resolvedSessionId);
    const hasActiveViewer = Boolean(activeViewers && activeViewers.size > 0);

    const payload: OpencodeNotifyPayload = {
      type: rawType as OpencodeNotifyPayload['type'],
      sessionId: resolvedSessionId,
      opencodeSessionId:
        typeof rawOpencodeSessionId === 'string' ? rawOpencodeSessionId : undefined,
      tmuxSessionName: typeof rawTmuxSessionName === 'string' ? rawTmuxSessionName : undefined,
      projectName,
      title: typeof body.title === 'string' ? body.title : undefined,
      permissionId: typeof body.permissionId === 'string' ? body.permissionId : null,
      questionId: typeof body.questionId === 'string' ? body.questionId : null,
      timestamp: typeof body.timestamp === 'string' ? body.timestamp : new Date().toISOString(),
    };

    broadcastOpencodeNotify(payload);

    if (!hasActiveViewer) {
      void dispatchPushNotification(payload);
    }

    return reply.code(202).send({ ok: true });
  });

  app.post<{
    Params: { name: string };
    Body: { cols?: unknown; rows?: unknown };
  }>('/api/tmux/sessions/:name/attach', async (request, reply) => {
    const name = request.params.name?.trim();
    if (!name) {
      return reply.code(400).send({ error: 'Session name is required' });
    }

    const body = request.body;
    if (body !== undefined && (typeof body !== 'object' || body === null || Array.isArray(body))) {
      return reply.code(400).send({ error: 'Request body must be an object' });
    }

    const cols = toPositiveInt(body?.cols, config.sessions.defaultCols);
    const rows = toPositiveInt(body?.rows, config.sessions.defaultRows);

    const existing = findManagedSessionByTmuxSessionName(db, name);
    if (existing) {
      supervisor.get(existing.id);
      return reply.send({
        sessionId: existing.id,
        streamUrl: `/api/sessions/${existing.id}/stream`,
      });
    }

    let probeHandle: TmuxPtyHandle | null = null;

    try {
      probeHandle = await attachToTmuxSession(name, cols, rows);

      const nowIso = new Date().toISOString();
      const sessionId = randomUUID();
      const tmuxSessions = await listAllTmuxSessions();
      const matched = tmuxSessions.find((session) => session.name === name);
      const cwd =
        matched?.currentPath && matched.currentPath.length > 0
          ? matched.currentPath
          : process.cwd();

      insertSession(db, {
        id: sessionId,
        backend: 'tmux',
        status: 'running',
        cwd,
        command_json: JSON.stringify({ source: 'attach', tmuxSessionName: name }),
        pid: null,
        tmux_session_name: name,
        cols,
        rows,
        started_at: nowIso,
        ended_at: null,
        exit_code: null,
        last_seq: 0,
        reconnectable: 1,
        interrupted_reason: null,
        ssh_connection_id: null,
      });

      logEvent(db, sessionId, 'session_attached_existing_tmux', { name, cols, rows, cwd });
      supervisor.get(sessionId);

      return reply.code(201).send({
        sessionId,
        streamUrl: `/api/sessions/${sessionId}/stream`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to attach to tmux session';
      const statusCode = /no server running|failed to connect|can't find session/i.test(message)
        ? 404
        : 500;
      return reply.code(statusCode).send({ error: message });
    } finally {
      try {
        probeHandle?.close();
      } catch {
        // best-effort cleanup
      }
    }
  });

  app.get('/api/sessions', async () => {
    return supervisor.list().map(serializeSession);
  });

  app.post('/api/sessions', async (request, reply) => {
    const body = request.body as
      | { cwd?: unknown; cols?: unknown; rows?: unknown; sshConnectionId?: unknown }
      | undefined;

    if (!body || typeof body !== 'object') {
      return reply.code(400).send({ error: 'Request body must be an object' });
    }

    if (typeof body.cwd !== 'string' || body.cwd.trim().length === 0) {
      return reply.code(400).send({ error: 'cwd is required' });
    }

    const sshConnectionId =
      typeof body.sshConnectionId === 'string' && body.sshConnectionId.trim().length > 0
        ? body.sshConnectionId.trim()
        : undefined;

    const resolvedCwd = resolve(expandHomePath(body.cwd));

    if (!sshConnectionId) {
      if (!existsSync(resolvedCwd)) {
        return reply.code(400).send({ error: 'cwd does not exist on disk' });
      }

      if (!isUnderAllowedRoots(resolvedCwd, config.paths.allowedRoots)) {
        return reply.code(403).send({ error: 'cwd is outside configured allowedRoots' });
      }
    }

    const cols = toPositiveInt(body.cols, config.sessions.defaultCols);
    const rows = toPositiveInt(body.rows, config.sessions.defaultRows);

    let source: string | undefined;
    if (sshConnectionId) {
      const sshConn = getSshConnection(db, sshConnectionId);
      if (!sshConn) {
        return reply.code(404).send({ error: 'SSH connection not found' });
      }
      source = sshConn.name;
    }

    try {
      const session = await supervisor.launch(resolvedCwd, cols, rows, sshConnectionId);
      upsertProjectHistory(db, resolvedCwd, source);
      return reply.code(201).send({
        session: serializeSession(session),
        streamUrl: `/api/sessions/${session.id}/stream`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to launch session';
      const statusCode = message.includes('maxConcurrent') ? 409 : 500;
      return reply.code(statusCode).send({ error: message });
    }
  });

  app.get<{ Params: { id: string } }>('/api/sessions/:id', async (request, reply) => {
    const session = supervisor.get(request.params.id);

    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    return reply.send(serializeSession(session));
  });

  app.delete<{ Params: { id: string } }>('/api/sessions/:id', async (request, reply) => {
    const session = supervisor.get(request.params.id);

    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    try {
      await supervisor.terminate(request.params.id);
    } catch {
      // best-effort: session is dead regardless; proceed with notification
    }

    broadcastExit(request.params.id, 0);
    return reply.send({ ok: true });
  });

  // SSH Connection CRUD endpoints
  app.get('/api/ssh/connections', async () => {
    const connections = listSshConnections(db).map((conn) => ({
      id: conn.id,
      name: conn.name,
      host: conn.host,
      port: conn.port,
      username: conn.username,
      authType: conn.auth_type,
      privateKeyPath: conn.private_key_path,
      opencodeProvider: conn.opencode_provider,
      opencodeCommand: conn.opencode_command,
      createdAt: conn.created_at,
      updatedAt: conn.updated_at,
    }));
    return { connections };
  });

  app.post<{ Body: Record<string, unknown> }>('/api/ssh/connections', async (request, reply) => {
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return reply.code(400).send({ error: 'Request body must be an object' });
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const host = typeof body.host === 'string' ? body.host.trim() : '';
    const port = toPositiveInt(body.port, 22);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const authType = typeof body.authType === 'string' ? body.authType.trim() : '';
    const privateKeyPath =
      typeof body.privateKeyPath === 'string' ? body.privateKeyPath.trim() || null : null;
    const passphrase =
      typeof body.passphrase === 'string' ? body.passphrase.trim() || null : null;
    const opencodeProvider =
      typeof body.opencodeProvider === 'string' ? body.opencodeProvider.trim() : 'server';
    const opencodeCommand =
      typeof body.opencodeCommand === 'string' && body.opencodeCommand.trim().length > 0
        ? body.opencodeCommand.trim()
        : null;

    if (!name) {
      return reply.code(400).send({ error: 'name is required' });
    }
    if (!host) {
      return reply.code(400).send({ error: 'host is required' });
    }
    if (port < 1 || port > 65535) {
      return reply.code(400).send({ error: 'port must be between 1 and 65535' });
    }
    if (!username) {
      return reply.code(400).send({ error: 'username is required' });
    }
    if (authType !== 'key' && authType !== 'agent') {
      return reply.code(400).send({ error: 'authType must be "key" or "agent"' });
    }
    if (opencodeProvider !== 'local' && opencodeProvider !== 'server') {
      return reply.code(400).send({ error: 'opencodeProvider must be "local" or "server"' });
    }

    const existingByName = db
      .prepare('SELECT id FROM ssh_connections WHERE name = ?')
      .get(name) as { id: string } | undefined;
    if (existingByName) {
      return reply.code(409).send({ error: 'SSH connection with this name already exists' });
    }

    const now = new Date().toISOString();
    const encryptedPassphrase = passphrase ? encryptPassphrase(passphrase) : null;
    const record = {
      id: randomUUID(),
      name,
      host,
      port,
      username,
      auth_type: authType,
      private_key_path: privateKeyPath,
      passphrase_encrypted: encryptedPassphrase,
      opencode_provider: opencodeProvider,
      opencode_command: opencodeProvider === 'local' ? null : opencodeCommand,
      created_at: now,
      updated_at: now,
    };

    insertSshConnection(db, record);

    return reply.code(201).send({
      connection: {
        id: record.id,
        name: record.name,
        host: record.host,
        port: record.port,
        username: record.username,
        authType: record.auth_type,
        privateKeyPath: record.private_key_path,
        opencodeProvider: record.opencode_provider,
        opencodeCommand: record.opencode_command,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
      },
    });
  });

  app.get<{ Params: { id: string } }>('/api/ssh/connections/:id', async (request, reply) => {
    const connection = getSshConnection(db, request.params.id);
    if (!connection) {
      return reply.code(404).send({ error: 'SSH connection not found' });
    }
    return {
      connection: {
        id: connection.id,
        name: connection.name,
        host: connection.host,
        port: connection.port,
        username: connection.username,
        authType: connection.auth_type,
        privateKeyPath: connection.private_key_path,
        opencodeProvider: connection.opencode_provider,
        opencodeCommand: connection.opencode_command,
        createdAt: connection.created_at,
        updatedAt: connection.updated_at,
      },
    };
  });

  app.get<{ Params: { id: string } }>('/api/ssh/connections/:id/tmux-sessions', async (request, reply) => {
    const connection = getSshConnection(db, request.params.id);
    if (!connection) {
      return reply.code(404).send({ error: 'SSH connection not found' });
    }

    try {
      const sessions = await listRemoteTunnelSessions(connection, config, null);
      return { sessions };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list remote tmux sessions';
      return reply.code(502).send({ error: message });
    }
  });

  app.post<{
    Params: { id: string; name: string };
    Body: { cols?: unknown; rows?: unknown };
  }>('/api/ssh/connections/:id/tmux-sessions/:name/attach', async (request, reply) => {
    const connection = getSshConnection(db, request.params.id);
    if (!connection) {
      return reply.code(404).send({ error: 'SSH connection not found' });
    }

    const name = request.params.name?.trim();
    if (!name) {
      return reply.code(400).send({ error: 'Session name is required' });
    }

    const body = request.body;
    if (body !== undefined && (typeof body !== 'object' || body === null || Array.isArray(body))) {
      return reply.code(400).send({ error: 'Request body must be an object' });
    }

    const cols = toPositiveInt(body?.cols, config.sessions.defaultCols);
    const rows = toPositiveInt(body?.rows, config.sessions.defaultRows);

    let probeHandle: TmuxPtyHandle | null = null;

    try {
      probeHandle = await attachRemotePty(connection, config, name, cols, rows);

      const nowIso = new Date().toISOString();
      const sessionId = randomUUID();

      insertSession(db, {
        id: sessionId,
        backend: 'ssh',
        status: 'running',
        cwd: '/',
        command_json: JSON.stringify({ source: 'attach', tmuxSessionName: name }),
        pid: null,
        tmux_session_name: name,
        cols,
        rows,
        started_at: nowIso,
        ended_at: null,
        exit_code: null,
        last_seq: 0,
        reconnectable: 1,
        interrupted_reason: null,
        ssh_connection_id: connection.id,
      });

      logEvent(db, sessionId, 'session_attached_existing_tmux', { name, cols, rows, sshConnectionId: connection.id });
      supervisor.get(sessionId);

      return reply.code(201).send({
        sessionId,
        streamUrl: `/api/sessions/${sessionId}/stream`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to attach to remote tmux session';
      const statusCode = /no server running|failed to connect|can't find session/i.test(message)
        ? 404
        : 500;
      return reply.code(statusCode).send({ error: message });
    } finally {
      try {
        probeHandle?.close();
      } catch {
        // best-effort cleanup
      }
    }
  });

  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/api/ssh/connections/:id',
    async (request, reply) => {
      const id = request.params.id;
      const existing = getSshConnection(db, id);
      if (!existing) {
        return reply.code(404).send({ error: 'SSH connection not found' });
      }

      const body = request.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return reply.code(400).send({ error: 'Request body must be an object' });
      }

      const updates: Partial<{
        name: string;
        host: string;
        port: number;
        username: string;
        auth_type: string;
        private_key_path: string | null;
        passphrase_encrypted: string | null;
        opencode_provider: string;
        opencode_command: string | null;
        updated_at: string;
      }> = {};

      if (typeof body.name === 'string') {
        const trimmed = body.name.trim();
        if (trimmed && trimmed !== existing.name) {
          const nameConflict = db
            .prepare('SELECT id FROM ssh_connections WHERE name = ? AND id != ?')
            .get(trimmed, id) as { id: string } | undefined;
          if (nameConflict) {
            return reply.code(409).send({ error: 'SSH connection with this name already exists' });
          }
          updates.name = trimmed;
        }
      }
      if (typeof body.host === 'string') {
        updates.host = body.host.trim();
      }
      if (typeof body.port === 'number' || typeof body.port === 'string') {
        const parsedPort = toPositiveInt(body.port, existing.port);
        if (parsedPort < 1 || parsedPort > 65535) {
          return reply.code(400).send({ error: 'port must be between 1 and 65535' });
        }
        updates.port = parsedPort;
      }
      if (typeof body.username === 'string') {
        updates.username = body.username.trim();
      }
      if (typeof body.authType === 'string') {
        const at = body.authType.trim();
        if (at !== 'key' && at !== 'agent') {
          return reply.code(400).send({ error: 'authType must be "key" or "agent"' });
        }
        updates.auth_type = at;
      }
      if ('privateKeyPath' in body) {
        updates.private_key_path =
          typeof body.privateKeyPath === 'string' ? body.privateKeyPath.trim() || null : null;
      }
      // Only update passphrase if a non-empty passphrase is explicitly provided.
      // An empty/missing passphrase in the request body means "don't change the existing passphrase".
      if (
        typeof body.passphrase === 'string' &&
        body.passphrase.trim().length > 0
      ) {
        updates.passphrase_encrypted = encryptPassphrase(body.passphrase.trim());
      }
      if (typeof body.opencodeProvider === 'string') {
        const provider = body.opencodeProvider.trim();
        if (provider !== 'local' && provider !== 'server') {
          return reply.code(400).send({ error: 'opencodeProvider must be "local" or "server"' });
        }
        updates.opencode_provider = provider;
        // If switching to local, clear custom command
        if (provider === 'local') {
          updates.opencode_command = null;
        }
      }
      if ('opencodeCommand' in body && updates.opencode_provider !== 'local') {
        updates.opencode_command =
          typeof body.opencodeCommand === 'string' && body.opencodeCommand.trim().length > 0
            ? body.opencodeCommand.trim()
            : null;
      }

      updates.updated_at = new Date().toISOString();

      updateSshConnection(db, id, updates);

      const updated = getSshConnection(db, id)!;
      return {
        connection: {
          id: updated.id,
          name: updated.name,
          host: updated.host,
          port: updated.port,
          username: updated.username,
          authType: updated.auth_type,
          privateKeyPath: updated.private_key_path,
          opencodeProvider: updated.opencode_provider,
          opencodeCommand: updated.opencode_command,
          createdAt: updated.created_at,
          updatedAt: updated.updated_at,
        },
      };
    },
  );

  // Explicitly clear the encrypted passphrase for an SSH connection
  app.post<{ Params: { id: string } }>(
    '/api/ssh/connections/:id/clear-passphrase',
    async (request, reply) => {
      const id = request.params.id;
      const existing = getSshConnection(db, id);
      if (!existing) {
        return reply.code(404).send({ error: 'SSH connection not found' });
      }

      updateSshConnection(db, id, {
        passphrase_encrypted: null,
        updated_at: new Date().toISOString(),
      });

      return { success: true };
    },
  );

  app.delete<{ Params: { id: string } }>('/api/ssh/connections/:id', async (request, reply) => {
    const id = request.params.id;
    const existing = getSshConnection(db, id);
    if (!existing) {
      return reply.code(404).send({ error: 'SSH connection not found' });
    }

    const activeCount = countActiveSessionsForSshConnection(db, id);
    if (activeCount > 0) {
      return reply
        .code(409)
        .send({ error: 'Cannot delete SSH connection with active sessions' });
    }

    deleteSshConnection(db, id);
    return reply.send({ ok: true });
  });

  // Rate limiter for SSH test endpoint: 5 requests per minute per IP
  const sshTestRateLimiter = new Map<string, { count: number; windowStart: number }>();
  const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
  const RATE_LIMIT_MAX_REQUESTS = 5;

  app.post<{ Params: { id: string } }>('/api/ssh/connections/:id/test', async (request, reply) => {
    const clientIp = request.ip;
    const now = Date.now();

    // Check rate limit
    const entry = sshTestRateLimiter.get(clientIp);
    if (entry) {
      const elapsed = now - entry.windowStart;
      if (elapsed < RATE_LIMIT_WINDOW_MS) {
        if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
          return reply.code(429).send({
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Maximum ${RATE_LIMIT_MAX_REQUESTS} test requests per minute.`,
            retryAfter: Math.ceil((RATE_LIMIT_WINDOW_MS - elapsed) / 1000),
          });
        }
        entry.count++;
      } else {
        // Window expired, reset
        entry.count = 1;
        entry.windowStart = now;
      }
    } else {
      sshTestRateLimiter.set(clientIp, { count: 1, windowStart: now });
    }

    const id = request.params.id;
    const existing = getSshConnection(db, id);
    if (!existing) {
      return reply.code(404).send({ error: 'SSH connection not found' });
    }

    const result = await testSshConnection(existing, config);
    return reply.send(result);
  });

  app.get<{ Params: { id: string }; Querystring: { cols?: string; rows?: string } }>(
    '/api/sessions/:id/stream',
    { websocket: true },
    async (connection, request) => {
      const ws =
        (connection as { socket?: StreamSocket }).socket ?? (connection as unknown as StreamSocket);
      const cols = toPositiveInt(request.query.cols, WS_DEFAULT_COLS);
      const rows = toPositiveInt(request.query.rows, WS_DEFAULT_ROWS);
      const { id } = request.params;

      let handle: TmuxPtyHandle | null = null;
      let handleClosed = false;
      let ptyPausedForBackpressure = false;
      let backpressureTimer: NodeJS.Timeout | null = null;
      const decoder = new StringDecoder('utf8');

      const clearBackpressureTimer = (): void => {
        if (!backpressureTimer) {
          return;
        }

        clearTimeout(backpressureTimer);
        backpressureTimer = null;
      };

      const scheduleBackpressureResumeCheck = (): void => {
        if (!ptyPausedForBackpressure || backpressureTimer) {
          return;
        }

        backpressureTimer = setTimeout(() => {
          backpressureTimer = null;

          if (!handle || handleClosed || !ptyPausedForBackpressure) {
            return;
          }

          const bufferedAmount = typeof ws.bufferedAmount === 'number' ? ws.bufferedAmount : 0;
          if (bufferedAmount > WS_BACKPRESSURE_LOW_WATERMARK_BYTES) {
            scheduleBackpressureResumeCheck();
            return;
          }

          handle.resume();
          ptyPausedForBackpressure = false;
        }, WS_BACKPRESSURE_POLL_INTERVAL_MS);
      };

      const pausePtyForBackpressure = (): void => {
        if (!handle || handleClosed || ptyPausedForBackpressure) {
          return;
        }

        handle.pause();
        ptyPausedForBackpressure = true;
        scheduleBackpressureResumeCheck();
      };

      const closeHandle = () => {
        clearBackpressureTimer();
        decoder.end();

        if (!handle || handleClosed) {
          return;
        }

        handleClosed = true;
        ptyPausedForBackpressure = false;
        handle.close();
        handle = null;
      };

      const sendJson = (payload: object): void => {
        try {
          ws.send(JSON.stringify(payload));
        } catch {
          closeHandle();
        }
      };

      const closeWithError = (message: string, reason: string): void => {
        sendJson({ type: 'error', message });
        closeHandle();
        try {
          ws.close(1008, reason);
        } catch {
          // best-effort close
        }
      };

      const withHandle = (operation: (active: TmuxPtyHandle) => void): void => {
        if (!handle) {
          sendJson({ type: 'error', message: 'Session stream is closed' });
          return;
        }

        try {
          operation(handle);
        } catch {
          closeWithError('Session ended', 'Session stream unavailable');
        }
      };

      try {
        handle = await supervisor.attach(id, cols, rows);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to attach to session';
        closeWithError(message, 'Session unavailable');
        return;
      }

      registerStream(id, ws);

      handle.onData((data) => {
        try {
          const raw = Buffer.isBuffer(data) ? data : Buffer.from(data as string, 'utf8');

          // Strip any-event mouse tracking sequences (DECSET 1003) from all sessions to
          // ensure xterm.js selection works correctly. When mouse tracking is active,
          // xterm.js onSelectionChange returns 0 and copy doesn't work.
          const output = decoder
            .write(raw)
            .replaceAll('\x1b[?1003h', '')
            .replaceAll('\x1b[?1003l', '');

          if (typeof ws.readyState === 'number' && ws.readyState !== WS_READY_STATE_OPEN) {
            closeHandle();
            return;
          }

          if (ptyPausedForBackpressure) {
            // Backpressure mode intentionally drops stale PTY frames until the socket drains.
            return;
          }

          ws.send(output, (error?: Error) => {
            if (error) {
              closeHandle();
              return;
            }

            if (ptyPausedForBackpressure) {
              scheduleBackpressureResumeCheck();
            }
          });

          const bufferedAmount = typeof ws.bufferedAmount === 'number' ? ws.bufferedAmount : 0;
          if (bufferedAmount > WS_BACKPRESSURE_HIGH_WATERMARK_BYTES) {
            pausePtyForBackpressure();
          }
        } catch {
          closeHandle();
        }
      });

      sendJson({ type: 'ready', sessionId: id });
      sendJson({ type: 'status', status: supervisor.get(id)?.status ?? 'running' });

      ws.on('message', (raw: unknown) => {
        const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);

        let parsed: WebSocketIncomingMessage;
        try {
          parsed = JSON.parse(text) as WebSocketIncomingMessage;
        } catch {
          sendJson({ type: 'error', message: 'Invalid JSON frame' });
          return;
        }

        if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
          sendJson({ type: 'error', message: 'Invalid control frame format' });
          return;
        }

        if (!handle) {
          sendJson({ type: 'error', message: 'Session stream is closed' });
          return;
        }

        switch (parsed.type) {
          case 'hello': {
            const helloCols = toPositiveInt(parsed.cols, cols);
            const helloRows = toPositiveInt(parsed.rows, rows);
            withHandle((active) => active.resize(helloCols, helloRows));
            sendJson({ type: 'status', status: supervisor.get(id)?.status ?? 'running' });
            return;
          }
          case 'input': {
            if (typeof parsed.data !== 'string') {
              sendJson({ type: 'error', message: 'input.data must be a string' });
              return;
            }

            const inputData = parsed.data;
            withHandle((active) => active.write(inputData));
            return;
          }
          case 'resize': {
            const resizedCols = toPositiveInt(parsed.cols, cols);
            const resizedRows = toPositiveInt(parsed.rows, rows);
            withHandle((active) => active.resize(resizedCols, resizedRows));
            return;
          }
          case 'ping': {
            sendJson({ type: 'status', status: supervisor.get(id)?.status ?? 'running' });
            return;
          }
          default: {
            sendJson({ type: 'error', message: 'Unsupported control frame type' });
          }
        }
      });

      ws.on('close', () => {
        unregisterStream(id, ws);
        closeHandle();
      });

      ws.on('error', () => {
        unregisterStream(id, ws);
        closeHandle();
      });
    },
  );

  app.get('/api/system/sshfs', async () => {
    const result = await checkSshfsAvailable();
    return {
      available: result.available,
      path: result.path,
      platform: process.platform,
    };
  });

  app.get<{ Params: { '*': string } }>('/assets/*', async (request, reply) => {
    return reply.sendFile(`assets/${request.params['*']}`);
  });

  // SPA fallback: serve index.html for all non-api GET requests
  app.get('/*', async (_request, reply) => {
    return reply.sendFile('index.html');
  });
}

async function suggestRemotePaths(
  client: import('ssh2').Client,
  partial: string,
  limit: number,
): Promise<string[]> {
  return new Promise((resolve) => {
    const trimmed = partial.trim();

    // Parse partial path into directory to list and prefix to filter by,
    // mirroring the logic in local suggestPaths()
    let dirPart: string;
    let prefixPart: string;

    if (trimmed.length === 0 || trimmed === '~') {
      dirPart = '~';
      prefixPart = '';
    } else if (trimmed === '/') {
      dirPart = '/';
      prefixPart = '';
    } else {
      const lastSlash = trimmed.lastIndexOf('/');
      if (lastSlash >= 0) {
        dirPart = trimmed.slice(0, lastSlash + 1);
        prefixPart = trimmed.slice(lastSlash + 1);
      } else {
        dirPart = '~';
        prefixPart = trimmed;
      }
    }

    // Build a find command that lists immediate subdirectories.
    // -mindepth 1 excludes the parent directory itself.
    // We quote the path for safety, but leave ~ unquoted so the remote
    // shell expands it to the user's home directory.
    const needsQuoting =
      !dirPart.startsWith('~') &&
      (dirPart.includes(' ') || dirPart.includes('"') || dirPart.includes("'"));
    const escapedDir = needsQuoting
      ? `"${dirPart.replace(/"/g, '\\"')}"`
      : dirPart;
    const remoteCmd = `bash -c 'find ${escapedDir} -mindepth 1 -maxdepth 1 -type d 2>/dev/null'`;

    console.log('[suggestRemotePaths] partial=', partial, 'dirPart=', dirPart, 'prefixPart=', prefixPart, 'remoteCmd=', remoteCmd);

    client.exec(remoteCmd, (error, channel) => {
      if (error) {
        console.log('[suggestRemotePaths] exec error:', error);
        resolve([]);
        return;
      }

      let stdout = '';
      let stderr = '';

      channel.on('data', (data: Buffer | string) => {
        const chunk = Buffer.isBuffer(data) ? data.toString('utf8') : data;
        console.log('[suggestRemotePaths] stdout chunk:', JSON.stringify(chunk));
        stdout += chunk;
      });

      channel.stderr.on('data', (data: Buffer | string) => {
        const chunk = Buffer.isBuffer(data) ? data.toString('utf8') : data;
        console.log('[suggestRemotePaths] stderr chunk:', JSON.stringify(chunk));
        stderr += chunk;
      });

      channel.on('close', () => {
        console.log('[suggestRemotePaths] close. total stdout:', JSON.stringify(stdout), 'stderr:', JSON.stringify(stderr));
        if (!stdout.trim()) {
          resolve([]);
          return;
        }

        const lines = stdout.trim().split(/\r?\n/);
        console.log('[suggestRemotePaths] raw lines:', lines);

        const suggestions = lines
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .filter((line) => {
            if (!prefixPart) return true;
            const basename = line.split('/').pop() || '';
            return basename.toLowerCase().startsWith(prefixPart.toLowerCase());
          })
          .sort((a, b) => a.localeCompare(b))
          .slice(0, limit);

        console.log('[suggestRemotePaths] suggestions:', suggestions);
        resolve(suggestions);
      });
    });
  });
}

export async function startServer(config: AppConfig): Promise<ServerStartInfo> {
  if (runtimeState) {
    throw new Error('Server is already running');
  }

  const resolvedConfig = ensureVapidConfig(config);
  configureWebPush(resolvedConfig);

  const db = openDb();
  const supervisor = new SessionSupervisor(db, resolvedConfig);
  await supervisor.restore();

  // Clean up any stale SSHFS mounts from previous runs
  try {
    const cleanedCount = await cleanupStaleMounts();
    if (cleanedCount > 0) {
      console.log(`[server] Cleaned ${cleanedCount} stale SSHFS mount(s) on startup`);
    }
  } catch (error) {
    console.warn('[server] Stale mount cleanup failed (non-fatal):', error);
  }

  const app = Fastify({ logger: true });
  const webRoot = resolveWebRoot();

  await app.register(websocket);
  await app.register(fastifyStatic, {
    root: webRoot,
    wildcard: false,
  });

  addCorsForNetworkMode(app, resolvedConfig);
  setupRoutes(app, db, supervisor, resolvedConfig);

  const address = await app.listen({
    host: config.server.host,
    port: config.server.port,
  });

  runtimeState = {
    app,
    db,
    supervisor,
  };

  app.log.info({ address }, 'opencode-tui-tunnel server listening');

  return { address };
}

export async function stopServer(): Promise<void> {
  if (stopInProgress) {
    return stopInProgress;
  }

  stopInProgress = (async () => {
    const state = runtimeState;
    runtimeState = null;

    if (!state) {
      stopInProgress = null;
      return;
    }

    // Clean up all active SSHFS mounts before shutting down
    try {
      const unmountedCount = await cleanupAllMounts();
      if (unmountedCount > 0) {
        console.log(`[server] Unmounted ${unmountedCount} active SSHFS mount(s) on shutdown`);
      }
    } catch (error) {
      console.warn('[server] Mount cleanup on shutdown failed (non-fatal):', error);
    }

    try {
      await state.app.close();
    } finally {
      state.db.close();

      stopInProgress = null;
    }
  })();

  return stopInProgress;
}
