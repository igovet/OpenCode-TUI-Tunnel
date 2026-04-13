import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';

import { getConfigDir } from '../config/index.js';

export type Database = BetterSqlite3.Database;

export interface SessionRecord {
  id: string;
  backend: string;
  status: string;
  cwd: string;
  command_json: string;
  pid: number | null;
  tmux_session_name: string | null;
  cols: number;
  rows: number;
  started_at: string;
  ended_at: string | null;
  exit_code: number | null;
  last_seq: number;
  reconnectable: number;
  interrupted_reason: string | null;
}

export interface ProjectHistoryRecord {
  path: string;
  last_used_at: string;
  session_count: number;
}

export interface PushSubscriptionRow {
  id: number;
  endpoint: string;
  keys: string;
  created_at: number;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  backend TEXT NOT NULL,
  status TEXT NOT NULL,
  cwd TEXT NOT NULL,
  command_json TEXT NOT NULL,
  pid INTEGER,
  tmux_session_name TEXT,
  cols INTEGER NOT NULL,
  rows INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  exit_code INTEGER,
  last_seq INTEGER NOT NULL DEFAULT 0,
  reconnectable INTEGER NOT NULL DEFAULT 1,
  interrupted_reason TEXT
);

CREATE TABLE IF NOT EXISTS reconnect_tokens (
  token_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS session_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_history (
  path TEXT PRIMARY KEY,
  last_used_at TEXT NOT NULL,
  session_count INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  keys TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

function getDbPath(): string {
  return join(getConfigDir(), 'sessions.db');
}

export function openDb(): Database {
  mkdirSync(getConfigDir(), { recursive: true });

  const db = new BetterSqlite3(getDbPath());
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);

  return db;
}

export function insertSession(db: Database, session: SessionRecord): void {
  db.prepare(
    `
      INSERT INTO sessions (
        id,
        backend,
        status,
        cwd,
        command_json,
        pid,
        tmux_session_name,
        cols,
        rows,
        started_at,
        ended_at,
        exit_code,
        last_seq,
        reconnectable,
        interrupted_reason
      ) VALUES (
        @id,
        @backend,
        @status,
        @cwd,
        @command_json,
        @pid,
        @tmux_session_name,
        @cols,
        @rows,
        @started_at,
        @ended_at,
        @exit_code,
        @last_seq,
        @reconnectable,
        @interrupted_reason
      )
    `,
  ).run(session);
}

export function updateSessionStatus(
  db: Database,
  id: string,
  status: string,
  extra: Partial<SessionRecord> = {},
): void {
  const updateParts = ['status = @status'];
  const params: Record<string, unknown> = {
    id,
    status,
  };

  for (const [key, value] of Object.entries(extra)) {
    if (key === 'id') {
      continue;
    }
    updateParts.push(`${key} = @${key}`);
    params[key] = value;
  }

  db.prepare(`UPDATE sessions SET ${updateParts.join(', ')} WHERE id = @id`).run(params);
}

export function getSession(db: Database, id: string): SessionRecord | null {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
    | SessionRecord
    | undefined;
  return row ?? null;
}

export function listSessions(db: Database): SessionRecord[] {
  return db
    .prepare('SELECT * FROM sessions ORDER BY datetime(started_at) DESC, id DESC')
    .all() as SessionRecord[];
}

export function findManagedSessionByTmuxSessionName(
  db: Database,
  tmuxSessionName: string,
): SessionRecord | null {
  const row = db
    .prepare(
      `
        SELECT *
        FROM sessions
        WHERE tmux_session_name = ?
          AND status IN ('starting', 'running')
        ORDER BY datetime(started_at) DESC, id DESC
        LIMIT 1
      `,
    )
    .get(tmuxSessionName) as SessionRecord | undefined;

  return row ?? null;
}

export function logEvent(
  db: Database,
  sessionId: string,
  eventType: string,
  payload: object,
): void {
  db.prepare(
    `
      INSERT INTO session_events (
        session_id,
        event_type,
        payload_json,
        created_at
      ) VALUES (?, ?, ?, ?)
    `,
  ).run(sessionId, eventType, JSON.stringify(payload), new Date().toISOString());
}

export function upsertProjectHistory(db: Database, path: string): void {
  const now = new Date().toISOString();

  db.prepare(
    `
      INSERT INTO project_history (
        path,
        last_used_at,
        session_count
      ) VALUES (?, ?, 1)
      ON CONFLICT(path) DO UPDATE SET
        last_used_at = excluded.last_used_at,
        session_count = project_history.session_count + 1
    `,
  ).run(path, now);
}

export function listProjectHistory(db: Database, limit = 20): ProjectHistoryRecord[] {
  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20;

  return db
    .prepare(
      `
        SELECT path, last_used_at, session_count
        FROM project_history
        ORDER BY datetime(last_used_at) DESC, path ASC
        LIMIT ?
      `,
    )
    .all(normalizedLimit) as ProjectHistoryRecord[];
}

export function upsertPushSubscription(
  db: Database,
  endpoint: string,
  keys: string,
  createdAt: number,
): void {
  db.prepare(
    `
      INSERT INTO push_subscriptions (
        endpoint,
        keys,
        created_at
      ) VALUES (?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET
        keys = excluded.keys,
        created_at = excluded.created_at
    `,
  ).run(endpoint, keys, createdAt);
}

export function removePushSubscriptionByEndpoint(db: Database, endpoint: string): void {
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}

export function listPushSubscriptions(db: Database): PushSubscriptionRow[] {
  return db
    .prepare(
      `
        SELECT id, endpoint, keys, created_at
        FROM push_subscriptions
        ORDER BY created_at DESC, id DESC
      `,
    )
    .all() as PushSubscriptionRow[];
}
