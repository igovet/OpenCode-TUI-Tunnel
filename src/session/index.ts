import { randomUUID } from 'node:crypto';

import type { AppConfig } from '../config/index.js';
import {
  type Database,
  type SessionRecord,
  getSession,
  insertSession,
  listSessions,
  logEvent,
  updateSessionStatus,
} from '../db/index.js';
import {
  attachPty,
  createSession,
  killSession,
  listTunnelSessions,
  sendCommand,
  type TmuxPtyHandle,
} from '../tmux/adapter.js';

export interface SessionInfo {
  id: string;
  tmuxName: string;
  cwd: string;
  status: 'starting' | 'running' | 'exited' | 'failed' | 'interrupted';
  startedAt: Date;
  endedAt?: Date;
  exitCode?: number;
  cols: number;
  rows: number;
  clientCount: number;
}

class CountingPtyHandle implements TmuxPtyHandle {
  private closed = false;
  private readonly inner: TmuxPtyHandle;
  private readonly onClose: () => void;

  public constructor(inner: TmuxPtyHandle, onClose: () => void) {
    this.inner = inner;
    this.onClose = onClose;
  }

  public onData(cb: (data: Buffer) => void): void {
    this.inner.onData(cb);
  }

  public write(data: string): void {
    this.inner.write(data);
  }

  public resize(cols: number, rows: number): void {
    this.inner.resize(cols, rows);
  }

  public pause(): void {
    this.inner.pause();
  }

  public resume(): void {
    this.inner.resume();
  }

  public close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.inner.close();
    this.onClose();
  }
}

function buildCommand(command: string, args: string[]): string {
  const quoted = [command, ...args].map((segment) => {
    if (/^[A-Za-z0-9_./:-]+$/.test(segment)) {
      return segment;
    }

    return `'${segment.replaceAll("'", "'\\''")}'`;
  });

  return quoted.join(' ');
}

function normalizeTunnelUrl(host: string, port: number): string {
  const normalizedHost =
    host === '0.0.0.0' || host === '::' || host === '[::]' ? '127.0.0.1' : host;
  return `http://${normalizedHost}:${port}`;
}

function mapRecordToInfo(record: SessionRecord): SessionInfo {
  return {
    id: record.id,
    tmuxName: record.tmux_session_name ?? `oct-${record.id}`,
    cwd: record.cwd,
    status: record.status as SessionInfo['status'],
    startedAt: new Date(record.started_at),
    endedAt: record.ended_at ? new Date(record.ended_at) : undefined,
    exitCode: record.exit_code ?? undefined,
    cols: record.cols,
    rows: record.rows,
    clientCount: 0,
  };
}

export class SessionSupervisor {
  private readonly db: Database;
  private readonly config: AppConfig;
  private readonly sessions = new Map<string, SessionInfo>();

  public constructor(db: Database, config: AppConfig) {
    this.db = db;
    this.config = config;
  }

  public async launch(cwd: string, cols?: number, rows?: number): Promise<SessionInfo> {
    const activeCount = [...this.sessions.values()].filter((s) => s.status === 'running').length;

    if (activeCount >= this.config.sessions.maxConcurrent) {
      throw new Error(
        `Cannot launch session: maxConcurrent (${this.config.sessions.maxConcurrent}) reached`,
      );
    }

    const id = randomUUID();
    const tmuxName = `oct-${id}`;
    const startedAt = new Date();
    const sessionCols = cols ?? this.config.sessions.defaultCols;
    const sessionRows = rows ?? this.config.sessions.defaultRows;
    const command = buildCommand(this.config.opencode.command, this.config.opencode.defaultArgs);

    const sessionInfo: SessionInfo = {
      id,
      tmuxName,
      cwd,
      status: 'starting',
      startedAt,
      cols: sessionCols,
      rows: sessionRows,
      clientCount: 0,
    };

    this.sessions.set(id, sessionInfo);

    try {
      await createSession(
        tmuxName,
        cwd,
        normalizeTunnelUrl(this.config.server.host, this.config.server.port),
      );
      await sendCommand(tmuxName, command);

      sessionInfo.status = 'running';
      this.sessions.set(id, sessionInfo);

      insertSession(this.db, {
        id,
        backend: 'tmux',
        status: 'running',
        cwd,
        command_json: JSON.stringify({
          command: this.config.opencode.command,
          args: this.config.opencode.defaultArgs,
        }),
        pid: null,
        tmux_session_name: tmuxName,
        cols: sessionCols,
        rows: sessionRows,
        started_at: startedAt.toISOString(),
        ended_at: null,
        exit_code: null,
        last_seq: 0,
        reconnectable: 1,
        interrupted_reason: null,
      });

      logEvent(this.db, id, 'session_started', {
        tmuxName,
        cwd,
        cols: sessionCols,
        rows: sessionRows,
      });

      return sessionInfo;
    } catch (error) {
      try {
        await killSession(tmuxName);
      } catch {
        // best-effort cleanup
      }

      sessionInfo.status = 'failed';
      sessionInfo.endedAt = new Date();
      this.sessions.set(id, sessionInfo);
      throw error;
    }
  }

  public get(id: string): SessionInfo | undefined {
    const inMemory = this.sessions.get(id);
    if (inMemory) {
      return inMemory;
    }

    const record = getSession(this.db, id);
    if (!record) {
      return undefined;
    }

    const mapped = mapRecordToInfo(record);
    this.sessions.set(id, mapped);
    return mapped;
  }

  public list(): SessionInfo[] {
    const allRecords = listSessions(this.db);

    for (const record of allRecords) {
      if (!this.sessions.has(record.id)) {
        this.sessions.set(record.id, mapRecordToInfo(record));
      }
    }

    return [...this.sessions.values()]
      .filter((session) => session.status === 'running' || session.status === 'starting')
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  public async terminate(id: string): Promise<void> {
    const current = this.get(id);

    if (!current) {
      throw new Error(`Session not found: ${id}`);
    }

    if (current.status !== 'running' && current.status !== 'starting') {
      return;
    }

    await killSession(current.tmuxName);

    const endedAt = new Date();
    current.status = 'exited';
    current.endedAt = endedAt;
    current.exitCode = 0;
    this.sessions.set(id, current);

    updateSessionStatus(this.db, id, 'exited', {
      ended_at: endedAt.toISOString(),
      exit_code: 0,
      reconnectable: 0,
    });

    logEvent(this.db, id, 'session_terminated', {
      tmuxName: current.tmuxName,
      endedAt: endedAt.toISOString(),
    });
  }

  public attach(id: string, cols: number, rows: number): TmuxPtyHandle {
    const current = this.get(id);

    if (!current) {
      throw new Error(`Session not found: ${id}`);
    }

    if (current.status !== 'running' && current.status !== 'starting') {
      throw new Error(`Session is ${current.status} and cannot be attached`);
    }

    current.cols = cols;
    current.rows = rows;
    current.clientCount += 1;
    this.sessions.set(id, current);

    let baseHandle: TmuxPtyHandle;
    try {
      baseHandle = attachPty(current.tmuxName, cols, rows);
    } catch (error) {
      current.clientCount = Math.max(0, current.clientCount - 1);
      this.sessions.set(id, current);
      throw error;
    }

    return new CountingPtyHandle(baseHandle, () => {
      const fresh = this.sessions.get(id);
      if (!fresh) {
        return;
      }

      fresh.clientCount = Math.max(0, fresh.clientCount - 1);
      this.sessions.set(id, fresh);
    });
  }

  public async restore(): Promise<void> {
    const runningRecords = listSessions(this.db).filter((session) => session.status === 'running');
    const liveSessions = await listTunnelSessions();
    const liveNames = new Set(liveSessions.map((session) => session.name));

    for (const record of runningRecords) {
      const tmuxName = record.tmux_session_name ?? `oct-${record.id}`;

      if (liveNames.has(tmuxName)) {
        const restored = mapRecordToInfo(record);
        restored.status = 'running';
        restored.tmuxName = tmuxName;
        this.sessions.set(record.id, restored);
        continue;
      }

      const endedAt = new Date();
      updateSessionStatus(this.db, record.id, 'interrupted', {
        ended_at: endedAt.toISOString(),
        interrupted_reason: 'tmux_session_missing_on_restore',
        reconnectable: 0,
      });

      this.sessions.set(record.id, {
        id: record.id,
        tmuxName,
        cwd: record.cwd,
        status: 'interrupted',
        startedAt: new Date(record.started_at),
        endedAt,
        exitCode: record.exit_code ?? undefined,
        cols: record.cols,
        rows: record.rows,
        clientCount: 0,
      });

      logEvent(this.db, record.id, 'session_interrupted', {
        reason: 'tmux_session_missing_on_restore',
      });
    }
  }
}
