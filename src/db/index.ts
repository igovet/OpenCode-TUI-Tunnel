import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';

import { encryptPassphrase, isPassphraseEncrypted } from '../crypto/index.js';
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
  ssh_connection_id: string | null;
}

export interface ProjectHistoryRecord {
  path: string;
  last_used_at: string;
  session_count: number;
  source: string | null;
}

export interface PushSubscriptionRow {
  id: number;
  endpoint: string;
  keys: string;
  created_at: number;
}

export interface SshConnectionRecord {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: string;
  private_key_path: string | null;
  passphrase_encrypted: string | null;
  opencode_provider: string;
  opencode_command: string | null;
  created_at: string;
  updated_at: string;
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

CREATE TABLE IF NOT EXISTS ssh_connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 22,
  username TEXT NOT NULL,
  auth_type TEXT NOT NULL,
  private_key_path TEXT,
  passphrase_encrypted TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

function getDbPath(): string {
  return join(getConfigDir(), 'sessions.db');
}

function hasColumn(db: Database, tableName: string, columnName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
  }>;
  return rows.some((row) => row.name === columnName);
}

function migrateSchema(db: Database): void {
  if (!hasColumn(db, 'sessions', 'ssh_connection_id')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN ssh_connection_id TEXT REFERENCES ssh_connections(id)`);
  }
  if (!hasColumn(db, 'project_history', 'source')) {
    db.exec(`ALTER TABLE project_history ADD COLUMN source TEXT`);
  }
  if (!hasColumn(db, 'ssh_connections', 'opencode_provider')) {
    db.exec(`ALTER TABLE ssh_connections ADD COLUMN opencode_provider TEXT NOT NULL DEFAULT 'server'`);
  }
  if (!hasColumn(db, 'ssh_connections', 'opencode_command')) {
    db.exec(`ALTER TABLE ssh_connections ADD COLUMN opencode_command TEXT`);
  }
}

export function openDb(): Database {
  mkdirSync(getConfigDir(), { recursive: true });

  const db = new BetterSqlite3(getDbPath());
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);
  migrateSchema(db);

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
        interrupted_reason,
        ssh_connection_id
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
        @interrupted_reason,
        @ssh_connection_id
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

export function listAllTmuxSessionNames(db: Database): string[] {
  const rows = db
    .prepare(
      `
        SELECT DISTINCT tmux_session_name
        FROM sessions
        WHERE tmux_session_name IS NOT NULL
      `,
    )
    .all() as Array<{ tmux_session_name: string }>;

  return rows.map((row) => row.tmux_session_name);
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

export function upsertProjectHistory(db: Database, path: string, source?: string): void {
  const now = new Date().toISOString();

  db.prepare(
    `
      INSERT INTO project_history (
        path,
        last_used_at,
        session_count,
        source
      ) VALUES (?, ?, 1, ?)
      ON CONFLICT(path) DO UPDATE SET
        last_used_at = excluded.last_used_at,
        session_count = project_history.session_count + 1,
        source = COALESCE(excluded.source, project_history.source)
    `,
  ).run(path, now, source ?? null);
}

export function listProjectHistory(db: Database, limit = 20): ProjectHistoryRecord[] {
  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20;

  return db
    .prepare(
      `
        SELECT path, last_used_at, session_count, source
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

export function insertSshConnection(db: Database, record: SshConnectionRecord): void {
  db.prepare(
    `
      INSERT INTO ssh_connections (
        id, name, host, port, username, auth_type,
        private_key_path, passphrase_encrypted, opencode_provider, opencode_command, created_at, updated_at
      ) VALUES (
        @id, @name, @host, @port, @username, @auth_type,
        @private_key_path, @passphrase_encrypted, @opencode_provider, @opencode_command, @created_at, @updated_at
      )
    `,
  ).run(record);
}

export function updateSshConnection(
  db: Database,
  id: string,
  updates: Partial<Omit<SshConnectionRecord, 'id' | 'created_at'>>,
): void {
  const allowedKeys = ['name', 'host', 'port', 'username', 'auth_type', 'private_key_path', 'passphrase_encrypted', 'opencode_provider', 'opencode_command', 'updated_at'];
  const entries = Object.entries(updates).filter(([key]) => allowedKeys.includes(key));

  if (entries.length === 0) {
    return;
  }

  const setParts = entries.map(([key]) => `${key} = @${key}`);
  const params: Record<string, unknown> = { id };

  for (const [key, value] of entries) {
    params[key] = value;
  }

  db.prepare(`UPDATE ssh_connections SET ${setParts.join(', ')} WHERE id = @id`).run(params);
}

export function deleteSshConnection(db: Database, id: string): void {
  db.prepare('DELETE FROM ssh_connections WHERE id = ?').run(id);
}

export function getSshConnection(db: Database, id: string): SshConnectionRecord | null {
  const row = db.prepare('SELECT * FROM ssh_connections WHERE id = ?').get(id) as
    | SshConnectionRecord
    | undefined;

  if (!row) {
    return null;
  }

  // Migrate plaintext passphrase to encrypted format if needed
  if (row.passphrase_encrypted && !isPassphraseEncrypted(row.passphrase_encrypted)) {
    const encrypted = encryptPassphrase(row.passphrase_encrypted);
    db.prepare('UPDATE ssh_connections SET passphrase_encrypted = ? WHERE id = ?').run(
      encrypted,
      id,
    );
    row.passphrase_encrypted = encrypted;
  }

  return row;
}

export function getSshConnectionByName(db: Database, name: string): SshConnectionRecord | null {
  const row = db.prepare('SELECT * FROM ssh_connections WHERE name = ?').get(name) as
    | SshConnectionRecord
    | undefined;

  if (!row) {
    return null;
  }

  // Migrate plaintext passphrase to encrypted format if needed
  if (row.passphrase_encrypted && !isPassphraseEncrypted(row.passphrase_encrypted)) {
    const encrypted = encryptPassphrase(row.passphrase_encrypted);
    db.prepare('UPDATE ssh_connections SET passphrase_encrypted = ? WHERE name = ?').run(
      encrypted,
      name,
    );
    row.passphrase_encrypted = encrypted;
  }

  return row;
}

export function listSshConnections(db: Database): SshConnectionRecord[] {
  const rows = db
    .prepare('SELECT * FROM ssh_connections ORDER BY name ASC')
    .all() as SshConnectionRecord[];

  // Migrate any plaintext passphrases to encrypted format
  for (const row of rows) {
    if (row.passphrase_encrypted && !isPassphraseEncrypted(row.passphrase_encrypted)) {
      const encrypted = encryptPassphrase(row.passphrase_encrypted);
      db.prepare('UPDATE ssh_connections SET passphrase_encrypted = ? WHERE id = ?').run(
        encrypted,
        row.id,
      );
      row.passphrase_encrypted = encrypted;
    }
  }

  return rows;
}

export function countActiveSessionsForSshConnection(db: Database, sshConnectionId: string): number {
  const row = db
    .prepare(
      `
        SELECT COUNT(*) as count
        FROM sessions
        WHERE ssh_connection_id = ?
          AND status IN ('starting', 'running')
      `,
    )
    .get(sshConnectionId) as { count: number } | undefined;

  return row?.count ?? 0;
}
