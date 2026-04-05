import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ensureRuntimeDirectories, getRuntimePaths } from './process-state.js';

export type StartupTerminalStatus = 'ready' | 'error';

interface StartupHandshakeBase {
  token: string;
}

interface StartupHandshakePending extends StartupHandshakeBase {
  status: 'pending';
}

export interface StartupHandshakeReady extends StartupHandshakeBase {
  status: 'ready';
  pid: number;
  url: string;
}

export interface StartupHandshakeError extends StartupHandshakeBase {
  status: 'error';
  message: string;
}

export type StartupHandshakeRecord =
  | StartupHandshakePending
  | StartupHandshakeReady
  | StartupHandshakeError;

function atomicWriteFileSync(filePath: string, content: string): void {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, content, { encoding: 'utf8', mode: 0o600 });
  renameSync(tmpPath, filePath);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function parseHandshakeRecord(value: unknown): StartupHandshakeRecord | null {
  if (!isRecord(value) || typeof value.token !== 'string') {
    return null;
  }

  if (value.status === 'pending') {
    return {
      token: value.token,
      status: 'pending',
    };
  }

  if (value.status === 'ready') {
    if (
      !isPositiveInteger(value.pid) ||
      typeof value.url !== 'string' ||
      value.url.trim().length === 0
    ) {
      return null;
    }

    return {
      token: value.token,
      status: 'ready',
      pid: value.pid,
      url: value.url,
    };
  }

  if (value.status === 'error') {
    if (typeof value.message !== 'string' || value.message.trim().length === 0) {
      return null;
    }

    return {
      token: value.token,
      status: 'error',
      message: value.message,
    };
  }

  return null;
}

export function getStartupHandshakePath(token: string): string {
  const paths = getRuntimePaths();
  return join(paths.runDirPath, `startup-${token}.json`);
}

export function createStartupHandshakeToken(): { token: string; filePath: string } {
  ensureRuntimeDirectories();

  const token = randomUUID();
  const filePath = getStartupHandshakePath(token);

  const pendingRecord: StartupHandshakePending = {
    token,
    status: 'pending',
  };

  atomicWriteFileSync(filePath, `${JSON.stringify(pendingRecord, null, 2)}\n`);

  return {
    token,
    filePath,
  };
}

export function readStartupHandshake(token: string): StartupHandshakeRecord | null {
  const filePath = getStartupHandshakePath(token);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    const record = parseHandshakeRecord(parsed);

    if (!record || record.token !== token) {
      return null;
    }

    return record;
  } catch {
    return null;
  }
}

export function writeStartupReady(token: string, payload: { pid: number; url: string }): void {
  const readyRecord: StartupHandshakeReady = {
    token,
    status: 'ready',
    pid: payload.pid,
    url: payload.url,
  };

  const filePath = getStartupHandshakePath(token);
  atomicWriteFileSync(filePath, `${JSON.stringify(readyRecord, null, 2)}\n`);
}

export function writeStartupError(token: string, message: string): void {
  const errorRecord: StartupHandshakeError = {
    token,
    status: 'error',
    message,
  };

  const filePath = getStartupHandshakePath(token);
  atomicWriteFileSync(filePath, `${JSON.stringify(errorRecord, null, 2)}\n`);
}

export function removeStartupHandshake(token: string): void {
  const filePath = getStartupHandshakePath(token);

  if (!existsSync(filePath)) {
    return;
  }

  try {
    unlinkSync(filePath);
  } catch {
    // best-effort cleanup
  }
}

export async function waitForStartupHandshake(
  token: string,
  options?: {
    timeoutMs?: number;
    pollIntervalMs?: number;
  },
): Promise<StartupHandshakeReady> {
  const timeoutMs = options?.timeoutMs ?? 5_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 100;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const record = readStartupHandshake(token);

    if (record?.status === 'ready') {
      return record;
    }

    if (record?.status === 'error') {
      throw new Error(record.message);
    }

    await delay(pollIntervalMs);
  }

  throw new Error(`Timed out waiting for server startup handshake (${timeoutMs}ms)`);
}
