import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { getConfigDir } from '../config/index.js';

export type UpdateAction =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'update-scheduled'
  | 'updated'
  | 'failed'
  | 'skipped';

export interface UpdateStateRecord {
  schemaVersion: 1;
  checkedAt: string | null;
  currentVersion: string;
  latestVersion: string | null;
  action: UpdateAction;
  updatedAt: string | null;
  lastError: string | null;
  skipReason: string | null;
}

export interface UpdateStateWriteInput {
  currentVersion: string;
  checkedAt?: string | null;
  latestVersion?: string | null;
  action?: UpdateAction;
  updatedAt?: string | null;
  lastError?: string | null;
  skipReason?: string | null;
}

interface UpdateStatePaths {
  updatesDirPath: string;
  stateFilePath: string;
  lockFilePath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUpdateAction(value: unknown): value is UpdateAction {
  return (
    value === 'idle' ||
    value === 'checking' ||
    value === 'up-to-date' ||
    value === 'update-scheduled' ||
    value === 'updated' ||
    value === 'failed' ||
    value === 'skipped'
  );
}

function atomicWriteFileSync(filePath: string, content: string): void {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, content, { encoding: 'utf8', mode: 0o600 });
  renameSync(tmpPath, filePath);
}

function validateUpdateStateRecord(value: unknown): value is UpdateStateRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === 1 &&
    (value.checkedAt === null || typeof value.checkedAt === 'string') &&
    typeof value.currentVersion === 'string' &&
    value.currentVersion.trim().length > 0 &&
    (value.latestVersion === null || typeof value.latestVersion === 'string') &&
    isUpdateAction(value.action) &&
    (value.updatedAt === null || typeof value.updatedAt === 'string') &&
    (value.lastError === null || typeof value.lastError === 'string') &&
    (value.skipReason === null || typeof value.skipReason === 'string')
  );
}

function normalizeIsoTimestamp(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export function getUpdatePaths(): UpdateStatePaths {
  const configDir = getConfigDir();
  const updatesDirPath = join(configDir, 'updates');

  return {
    updatesDirPath,
    stateFilePath: join(updatesDirPath, 'state.json'),
    lockFilePath: join(updatesDirPath, 'install.lock'),
  };
}

export function ensureUpdateDirectory(): UpdateStatePaths {
  const paths = getUpdatePaths();

  if (!existsSync(paths.updatesDirPath)) {
    mkdirSync(paths.updatesDirPath, { recursive: true, mode: 0o700 });
  }

  return paths;
}

export function createDefaultUpdateState(currentVersion: string): UpdateStateRecord {
  const normalizedCurrentVersion = currentVersion.trim().length > 0 ? currentVersion : '0.0.0';

  return {
    schemaVersion: 1,
    checkedAt: null,
    currentVersion: normalizedCurrentVersion,
    latestVersion: null,
    action: 'idle',
    updatedAt: null,
    lastError: null,
    skipReason: null,
  };
}

export function readUpdateState(): UpdateStateRecord | null {
  const { stateFilePath } = getUpdatePaths();

  if (!existsSync(stateFilePath)) {
    return null;
  }

  try {
    const raw = readFileSync(stateFilePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    if (!validateUpdateStateRecord(parsed)) {
      return null;
    }

    return {
      ...parsed,
      checkedAt: normalizeIsoTimestamp(parsed.checkedAt),
      updatedAt: normalizeIsoTimestamp(parsed.updatedAt),
    };
  } catch {
    return null;
  }
}

export function writeUpdateState(record: UpdateStateRecord): void {
  ensureUpdateDirectory();
  const { stateFilePath } = getUpdatePaths();
  atomicWriteFileSync(stateFilePath, `${JSON.stringify(record, null, 2)}\n`);
}

export function mergeWriteUpdateState(input: UpdateStateWriteInput): UpdateStateRecord {
  const existing = readUpdateState() ?? createDefaultUpdateState(input.currentVersion);

  const nextCheckedAt =
    'checkedAt' in input ? normalizeIsoTimestamp(input.checkedAt) : existing.checkedAt;
  const nextLatestVersion =
    'latestVersion' in input ? (input.latestVersion ?? null) : existing.latestVersion;
  const nextAction = 'action' in input ? (input.action ?? existing.action) : existing.action;
  const nextUpdatedAt =
    'updatedAt' in input ? normalizeIsoTimestamp(input.updatedAt) : existing.updatedAt;
  const nextLastError = 'lastError' in input ? (input.lastError ?? null) : existing.lastError;
  const nextSkipReason = 'skipReason' in input ? (input.skipReason ?? null) : existing.skipReason;

  const next: UpdateStateRecord = {
    ...existing,
    schemaVersion: 1,
    currentVersion: input.currentVersion,
    checkedAt: nextCheckedAt,
    latestVersion: nextLatestVersion,
    action: nextAction,
    updatedAt: nextUpdatedAt,
    lastError: nextLastError,
    skipReason: nextSkipReason,
  };

  writeUpdateState(next);
  return next;
}
