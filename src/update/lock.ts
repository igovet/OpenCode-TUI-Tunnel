import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

import { ensureUpdateDirectory, getUpdatePaths } from './state.js';

interface LockMetadata {
  pid: number;
  createdAt: string;
}

export interface UpdateLockHandle {
  acquired: boolean;
  reason?: string;
  release: () => void;
}

function parseLockMetadata(raw: string): LockMetadata | null {
  try {
    const parsed = JSON.parse(raw) as unknown;

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      typeof (parsed as { pid?: unknown }).pid !== 'number' ||
      !Number.isInteger((parsed as { pid: number }).pid) ||
      (parsed as { pid: number }).pid <= 0 ||
      typeof (parsed as { createdAt?: unknown }).createdAt !== 'string'
    ) {
      return null;
    }

    const typed = parsed as { pid: number; createdAt: string };
    return {
      pid: typed.pid,
      createdAt: typed.createdAt,
    };
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
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

function removeLockFileIfExists(lockFilePath: string): void {
  if (!existsSync(lockFilePath)) {
    return;
  }

  try {
    unlinkSync(lockFilePath);
  } catch {
    // best-effort cleanup
  }
}

function lockMetadataPayload(): string {
  const payload: LockMetadata = {
    pid: process.pid,
    createdAt: new Date().toISOString(),
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}

function writeLockMetadata(lockFilePath: string, metadata: LockMetadata): void {
  writeFileSync(lockFilePath, `${JSON.stringify(metadata, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function releaseFactory(lockFilePath: string): () => void {
  return () => {
    try {
      const raw = readFileSync(lockFilePath, 'utf8');
      const metadata = parseLockMetadata(raw);

      if (metadata?.pid !== process.pid) {
        return;
      }
    } catch {
      return;
    }

    removeLockFileIfExists(lockFilePath);
  };
}

export function tryAcquireUpdateLock(): UpdateLockHandle {
  ensureUpdateDirectory();
  const { lockFilePath } = getUpdatePaths();

  try {
    const fd = openSync(lockFilePath, 'wx', 0o600);

    try {
      writeFileSync(fd, lockMetadataPayload(), 'utf8');
    } finally {
      closeSync(fd);
    }

    return {
      acquired: true,
      release: releaseFactory(lockFilePath),
    };
  } catch (error) {
    const errno = (error as NodeJS.ErrnoException | null)?.code;

    if (errno !== 'EEXIST') {
      throw error;
    }

    try {
      const raw = readFileSync(lockFilePath, 'utf8');
      const metadata = parseLockMetadata(raw);

      if (metadata && !isProcessAlive(metadata.pid)) {
        removeLockFileIfExists(lockFilePath);

        const retry = openSync(lockFilePath, 'wx', 0o600);

        try {
          writeFileSync(retry, lockMetadataPayload(), 'utf8');
        } finally {
          closeSync(retry);
        }

        return {
          acquired: true,
          reason: 'recovered-stale-lock',
          release: releaseFactory(lockFilePath),
        };
      }

      return {
        acquired: false,
        reason: metadata ? `held-by-pid-${metadata.pid}` : 'lock-exists',
        release: () => {
          // no-op: lock was not acquired by this process
        },
      };
    } catch {
      return {
        acquired: false,
        reason: 'lock-exists-unreadable',
        release: () => {
          // no-op: lock was not acquired by this process
        },
      };
    }
  }
}

export function releaseUpdateLockIfOwnedByCurrentProcess(): void {
  ensureUpdateDirectory();
  const { lockFilePath } = getUpdatePaths();

  if (!existsSync(lockFilePath)) {
    return;
  }

  try {
    const raw = readFileSync(lockFilePath, 'utf8');
    const metadata = parseLockMetadata(raw);

    if (metadata?.pid !== process.pid) {
      return;
    }
  } catch {
    return;
  }

  removeLockFileIfExists(lockFilePath);
}

export function transferUpdateLockOwnership(nextOwnerPid: number): void {
  if (!Number.isInteger(nextOwnerPid) || nextOwnerPid <= 0) {
    throw new Error(`Cannot transfer update lock ownership to invalid pid: ${nextOwnerPid}`);
  }

  ensureUpdateDirectory();
  const { lockFilePath } = getUpdatePaths();

  if (!existsSync(lockFilePath)) {
    throw new Error('Cannot transfer update lock ownership: lock file does not exist.');
  }

  const existingRaw = readFileSync(lockFilePath, 'utf8');
  const existingMetadata = parseLockMetadata(existingRaw);

  const createdAt = existingMetadata?.createdAt ?? new Date().toISOString();
  writeLockMetadata(lockFilePath, {
    pid: nextOwnerPid,
    createdAt,
  });
}
