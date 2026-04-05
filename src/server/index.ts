import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';

import type { AppConfig } from '../config/index.js';
import {
  type Database,
  findManagedSessionByTmuxSessionName,
  insertSession,
  listProjectHistory,
  logEvent,
  openDb,
  upsertProjectHistory,
} from '../db/index.js';
import { suggestPaths } from './fs-suggest.js';
import { SessionSupervisor, type SessionInfo } from '../session/index.js';
import { attachToTmuxSession, listAllTmuxSessions, type TmuxPtyHandle } from '../tmux/adapter.js';

interface RuntimeState {
  app: FastifyInstance;
  db: Database;
  supervisor: SessionSupervisor;
}

export interface ServerStartInfo {
  address: string;
}

interface StreamSocket {
  send(data: string | Buffer): void;
  close(code?: number, reason?: string): void;
  on(event: 'message', listener: (raw: unknown) => void): void;
  on(event: 'close' | 'error', listener: () => void): void;
}

type WebSocketIncomingMessage =
  | { type: 'hello'; cols?: unknown; rows?: unknown }
  | { type: 'input'; data?: unknown }
  | { type: 'resize'; cols?: unknown; rows?: unknown }
  | { type: 'ping' };

let runtimeState: RuntimeState | null = null;
let stopInProgress: Promise<void> | null = null;

const WS_DEFAULT_COLS = 120;
const WS_DEFAULT_ROWS = 30;

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

function serializeSession(session: SessionInfo) {
  return {
    ...session,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString(),
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
  const activeStreams = new Map<string, Set<StreamSocket>>();

  const registerStream = (sessionId: string, socket: StreamSocket): void => {
    const set = activeStreams.get(sessionId) ?? new Set<StreamSocket>();
    set.add(socket);
    activeStreams.set(sessionId, set);
  };

  const unregisterStream = (sessionId: string, socket: StreamSocket): void => {
    const set = activeStreams.get(sessionId);
    if (!set) {
      return;
    }

    set.delete(socket);
    if (set.size === 0) {
      activeStreams.delete(sessionId);
    }
  };

  const broadcastExit = (sessionId: string, exitCode: number): void => {
    const set = activeStreams.get(sessionId);
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

    activeStreams.delete(sessionId);
  };

  app.get<{ Querystring: { q?: string } }>('/api/fs/suggest', async (request) => {
    const q = typeof request.query.q === 'string' ? request.query.q : '';
    return { suggestions: suggestPaths(q, 5) };
  });

  app.get('/api/projects/history', async () => {
    return { history: listProjectHistory(db) };
  });

  app.get('/api/tmux/sessions', async () => {
    return { sessions: await listAllTmuxSessions() };
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
    const body = request.body as { cwd?: unknown; cols?: unknown; rows?: unknown } | undefined;

    if (!body || typeof body !== 'object') {
      return reply.code(400).send({ error: 'Request body must be an object' });
    }

    if (typeof body.cwd !== 'string' || body.cwd.trim().length === 0) {
      return reply.code(400).send({ error: 'cwd is required' });
    }

    const resolvedCwd = resolve(expandHomePath(body.cwd));

    if (!existsSync(resolvedCwd)) {
      return reply.code(400).send({ error: 'cwd does not exist on disk' });
    }

    if (!isUnderAllowedRoots(resolvedCwd, config.paths.allowedRoots)) {
      return reply.code(403).send({ error: 'cwd is outside configured allowedRoots' });
    }

    const cols = toPositiveInt(body.cols, config.sessions.defaultCols);
    const rows = toPositiveInt(body.rows, config.sessions.defaultRows);

    try {
      const session = await supervisor.launch(resolvedCwd, cols, rows);
      upsertProjectHistory(db, resolvedCwd);
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

    await supervisor.terminate(request.params.id);
    broadcastExit(request.params.id, 0);
    return reply.send({ ok: true });
  });

  app.get<{ Params: { id: string }; Querystring: { cols?: string; rows?: string } }>(
    '/api/sessions/:id/stream',
    { websocket: true },
    (connection, request) => {
      const ws =
        (connection as { socket?: StreamSocket }).socket ?? (connection as unknown as StreamSocket);
      const cols = toPositiveInt(request.query.cols, WS_DEFAULT_COLS);
      const rows = toPositiveInt(request.query.rows, WS_DEFAULT_ROWS);
      const { id } = request.params;

      let handle: TmuxPtyHandle | null = null;
      let handleClosed = false;

      const closeHandle = () => {
        if (!handle || handleClosed) {
          return;
        }

        handleClosed = true;
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

      try {
        handle = supervisor.attach(id, cols, rows);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to attach to session';
        sendJson({ type: 'error', message });
        ws.close(1008, 'Session not found');
        return;
      }

      registerStream(id, ws);

      handle.onData((data) => {
        try {
          ws.send(data);
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
            handle.resize(helloCols, helloRows);
            sendJson({ type: 'status', status: supervisor.get(id)?.status ?? 'running' });
            return;
          }
          case 'input': {
            if (typeof parsed.data !== 'string') {
              sendJson({ type: 'error', message: 'input.data must be a string' });
              return;
            }

            handle.write(parsed.data);
            return;
          }
          case 'resize': {
            const resizedCols = toPositiveInt(parsed.cols, cols);
            const resizedRows = toPositiveInt(parsed.rows, rows);
            handle.resize(resizedCols, resizedRows);
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

  app.get<{ Params: { '*': string } }>('/assets/*', async (request, reply) => {
    return reply.sendFile(`assets/${request.params['*']}`);
  });

  // SPA fallback: serve index.html for all non-api GET requests
  app.get('/*', async (_request, reply) => {
    return reply.sendFile('index.html');
  });
}

export async function startServer(config: AppConfig): Promise<ServerStartInfo> {
  if (runtimeState) {
    throw new Error('Server is already running');
  }

  const db = openDb();
  const supervisor = new SessionSupervisor(db, config);
  await supervisor.restore();

  const app = Fastify({ logger: true });
  const webRoot = resolveWebRoot();

  await app.register(websocket);
  await app.register(fastifyStatic, {
    root: webRoot,
    wildcard: false,
  });

  addCorsForNetworkMode(app, config);
  setupRoutes(app, db, supervisor, config);

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

    try {
      await state.app.close();
    } finally {
      state.db.close();

      stopInProgress = null;
    }
  })();

  return stopInProgress;
}
