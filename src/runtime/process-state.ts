import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { getConfigDir } from '../config/index.js';

export type RuntimeMode = 'daemon' | 'systemd' | 'launchd';

export interface RuntimeRecord {
  schemaVersion: 1;
  pid: number;
  url: string;
  address: string;
  host: string;
  port: number;
  mode: RuntimeMode;
  startedAt: string;
  version: string;
}

export interface RuntimePaths {
  configDir: string;
  runtimeFilePath: string;
  pidFilePath: string;
  runDirPath: string;
  logsDirPath: string;
  daemonLogPath: string;
}

export interface LiveProcessState {
  pid: number;
  url: string | null;
  mode: RuntimeMode | null;
  runtime: RuntimeRecord | null;
  source: 'runtime' | 'pid';
}

function atomicWriteFileSync(filePath: string, content: string): void {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, content, { encoding: 'utf8', mode: 0o600 });
  renameSync(tmpPath, filePath);
}

function parsePositiveInt(value: string | number | null | undefined): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function isRuntimeMode(value: unknown): value is RuntimeMode {
  return value === 'daemon' || value === 'systemd' || value === 'launchd';
}

function isRuntimeRecord(value: unknown): value is RuntimeRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    candidate.schemaVersion === 1 &&
    parsePositiveInt(candidate.pid as number | string | null | undefined) !== null &&
    typeof candidate.url === 'string' &&
    candidate.url.trim().length > 0 &&
    typeof candidate.address === 'string' &&
    candidate.address.trim().length > 0 &&
    typeof candidate.host === 'string' &&
    candidate.host.trim().length > 0 &&
    parsePositiveInt(candidate.port as number | string | null | undefined) !== null &&
    isRuntimeMode(candidate.mode) &&
    typeof candidate.startedAt === 'string' &&
    candidate.startedAt.trim().length > 0 &&
    typeof candidate.version === 'string' &&
    candidate.version.trim().length > 0
  );
}

export function getRuntimePaths(): RuntimePaths {
  const configDir = getConfigDir();

  return {
    configDir,
    runtimeFilePath: join(configDir, 'runtime.json'),
    pidFilePath: join(configDir, 'server.pid'),
    runDirPath: join(configDir, 'run'),
    logsDirPath: join(configDir, 'logs'),
    daemonLogPath: join(configDir, 'logs', 'daemon.log'),
  };
}

export function ensureRuntimeDirectories(): RuntimePaths {
  const paths = getRuntimePaths();

  if (!existsSync(paths.configDir)) {
    mkdirSync(paths.configDir, { recursive: true });
  }

  if (!existsSync(paths.runDirPath)) {
    mkdirSync(paths.runDirPath, { recursive: true });
  }

  if (!existsSync(paths.logsDirPath)) {
    mkdirSync(paths.logsDirPath, { recursive: true });
  }

  return paths;
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function writeRuntimeRecord(record: RuntimeRecord): void {
  const paths = ensureRuntimeDirectories();
  atomicWriteFileSync(paths.runtimeFilePath, `${JSON.stringify(record, null, 2)}\n`);
}

export function readRuntimeRecord(): RuntimeRecord | null {
  const { runtimeFilePath } = getRuntimePaths();

  if (!existsSync(runtimeFilePath)) {
    return null;
  }

  try {
    const raw = readFileSync(runtimeFilePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    if (!isRuntimeRecord(parsed)) {
      return null;
    }

    return {
      ...parsed,
      pid: Number(parsed.pid),
      port: Number(parsed.port),
    };
  } catch {
    return null;
  }
}

export function writePidFile(pid: number): void {
  const normalizedPid = parsePositiveInt(pid);

  if (normalizedPid === null) {
    throw new Error(`Cannot write PID file with invalid pid: ${String(pid)}`);
  }

  const paths = ensureRuntimeDirectories();
  atomicWriteFileSync(paths.pidFilePath, `${normalizedPid}\n`);
}

export function readPidFile(): number | null {
  const { pidFilePath } = getRuntimePaths();

  if (!existsSync(pidFilePath)) {
    return null;
  }

  try {
    const raw = readFileSync(pidFilePath, 'utf8').trim();
    return parsePositiveInt(raw);
  } catch {
    return null;
  }
}

export function removeRuntimeRecord(): void {
  const { runtimeFilePath } = getRuntimePaths();

  if (!existsSync(runtimeFilePath)) {
    return;
  }

  try {
    unlinkSync(runtimeFilePath);
  } catch {
    // best-effort cleanup
  }
}

export function removePidFile(): void {
  const { pidFilePath } = getRuntimePaths();

  if (!existsSync(pidFilePath)) {
    return;
  }

  try {
    unlinkSync(pidFilePath);
  } catch {
    // best-effort cleanup
  }
}

export function clearRuntimeStateFiles(): void {
  removeRuntimeRecord();
  removePidFile();
}

export function getLiveProcessState(options?: { cleanupStale?: boolean }): LiveProcessState | null {
  const cleanupStale = options?.cleanupStale ?? true;
  const runtime = readRuntimeRecord();

  if (runtime) {
    if (isProcessAlive(runtime.pid)) {
      return {
        pid: runtime.pid,
        url: runtime.url,
        mode: runtime.mode,
        runtime,
        source: 'runtime',
      };
    }

    if (cleanupStale) {
      clearRuntimeStateFiles();
    }

    return null;
  }

  const pid = readPidFile();
  if (pid === null) {
    return null;
  }

  if (isProcessAlive(pid)) {
    return {
      pid,
      url: null,
      mode: null,
      runtime: null,
      source: 'pid',
    };
  }

  if (cleanupStale) {
    removePidFile();
  }

  return null;
}
