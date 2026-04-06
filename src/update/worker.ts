import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';

import { loadConfig } from '../config/index.js';
import { releaseUpdateLockIfOwnedByCurrentProcess } from './lock.js';
import { mergeWriteUpdateState } from './state.js';

const execFileAsync = promisify(execFile);

const PACKAGE_NAME = '@igovet/opencode-tui-tunnel';
const DEFAULT_INSTALL_TIMEOUT_MS = 300_000;
const MAX_INSTALL_TIMEOUT_MS = 900_000;

interface SemverApi {
  valid(value: string): string | null;
}

const semver = (() => {
  const require = createRequire(import.meta.url);
  return require('semver') as SemverApi;
})();

function normalizeSemver(value: string): string {
  const normalized = semver.valid(value);

  if (!normalized) {
    throw new Error(`Invalid target version: ${value}`);
  }

  return normalized;
}

function normalizeInstallTimeoutMs(timeoutMs: number): number {
  if (!Number.isFinite(timeoutMs)) {
    return DEFAULT_INSTALL_TIMEOUT_MS;
  }

  const normalized = Math.floor(timeoutMs);
  if (normalized < 5_000) {
    return 5_000;
  }

  if (normalized > MAX_INSTALL_TIMEOUT_MS) {
    return MAX_INSTALL_TIMEOUT_MS;
  }

  return normalized;
}

function extractFailureMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'stderr' in error &&
    typeof (error as { stderr?: unknown }).stderr === 'string'
  ) {
    const stderr = ((error as { stderr?: string }).stderr ?? '').trim();
    if (stderr.length > 0) {
      return stderr;
    }
  }

  return error instanceof Error ? error.message : String(error);
}

export async function runApplyUpdateWorker(input: { targetVersion: string }): Promise<void> {
  const config = loadConfig();
  const currentVersion = resolvePackageVersion();
  const installTimeoutMs = normalizeInstallTimeoutMs(config.updates.installTimeoutMs);
  let targetVersion: string | null = null;

  try {
    targetVersion = normalizeSemver(input.targetVersion);

    await execFileAsync('npm', ['install', '-g', `${PACKAGE_NAME}@${targetVersion}`], {
      timeout: installTimeoutMs,
    });

    mergeWriteUpdateState({
      currentVersion,
      latestVersion: targetVersion,
      action: 'updated',
      updatedAt: new Date().toISOString(),
      lastError: null,
      skipReason: null,
    });
  } catch (error) {
    const failureMessage = extractFailureMessage(error);

    mergeWriteUpdateState({
      currentVersion,
      latestVersion: targetVersion,
      action: 'failed',
      updatedAt: null,
      lastError: failureMessage,
      skipReason: null,
    });

    throw new Error(`Auto-update install failed: ${failureMessage}`, { cause: error });
  } finally {
    releaseUpdateLockIfOwnedByCurrentProcess();
  }
}

function resolvePackageVersion(): string {
  const require = createRequire(import.meta.url);

  try {
    const pkg = require('../../package.json') as { version?: unknown };
    return typeof pkg.version === 'string' && pkg.version.trim().length > 0 ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}
