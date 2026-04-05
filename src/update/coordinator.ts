import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

import type { AppConfig } from '../config/index.js';
import { resolveCliEntryPathFromProcess } from '../runtime/install-context.js';
import { checkLatestVersion } from './checker.js';
import { detectUpdateInstallContext } from './install-context.js';
import { transferUpdateLockOwnership, tryAcquireUpdateLock } from './lock.js';
import { mergeWriteUpdateState } from './state.js';

const PACKAGE_NAME = '@igovet/opencode-tui-tunnel';
const MAX_CHECK_TIMEOUT_MS = 10_000;
const MIN_CHECK_TIMEOUT_MS = 200;

function resolvePackageVersion(): string {
  const require = createRequire(import.meta.url);

  try {
    const pkg = require('../../package.json') as { version?: unknown };
    return typeof pkg.version === 'string' && pkg.version.trim().length > 0 ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function normalizeCheckTimeoutMs(rawTimeoutMs: number): number {
  if (!Number.isFinite(rawTimeoutMs)) {
    return 1200;
  }

  const normalized = Math.floor(rawTimeoutMs);

  if (normalized < MIN_CHECK_TIMEOUT_MS) {
    return MIN_CHECK_TIMEOUT_MS;
  }

  if (normalized > MAX_CHECK_TIMEOUT_MS) {
    return MAX_CHECK_TIMEOUT_MS;
  }

  return normalized;
}

function runWorkerDetached(args: string[]): number {
  const child = spawn(process.execPath, args, {
    windowsHide: true,
    detached: true,
    stdio: 'ignore',
    env: process.env,
    shell: false,
  });

  if (!child.pid || child.pid <= 0) {
    throw new Error('Failed to start update worker process (missing PID).');
  }

  child.unref();

  return child.pid;
}

export class UpdateCoordinator {
  private static inFlight = false;

  static scheduleIfNeeded(config: AppConfig): void {
    if (UpdateCoordinator.inFlight) {
      return;
    }

    if (!config.updates.checkOnStart) {
      return;
    }

    UpdateCoordinator.inFlight = true;

    void UpdateCoordinator.run(config)
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[update] ${message}`);
      })
      .finally(() => {
        UpdateCoordinator.inFlight = false;
      });
  }

  private static async run(config: AppConfig): Promise<void> {
    const currentVersion = resolvePackageVersion();
    const checkStartedAt = new Date().toISOString();

    mergeWriteUpdateState({
      currentVersion,
      checkedAt: checkStartedAt,
      action: 'checking',
      lastError: null,
      skipReason: null,
    });

    const installContext = await detectUpdateInstallContext({
      cliEntryPath: resolveCliEntryPathFromProcess(),
      environment: process.env,
    });

    if (!installContext.supported) {
      mergeWriteUpdateState({
        currentVersion,
        checkedAt: checkStartedAt,
        action: 'skipped',
        skipReason: installContext.reason,
        lastError: null,
      });

      console.log(`[update] ${installContext.reason}`);
      return;
    }

    const checkTimeoutMs = normalizeCheckTimeoutMs(config.updates.checkTimeoutMs);

    let checkResult: Awaited<ReturnType<typeof checkLatestVersion>>;
    try {
      checkResult = await checkLatestVersion({
        currentVersion,
        timeoutMs: checkTimeoutMs,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      mergeWriteUpdateState({
        currentVersion,
        checkedAt: checkStartedAt,
        action: 'failed',
        lastError: message,
        skipReason: null,
      });

      console.warn(`[update] check failed: ${message}`);
      return;
    }

    if (!checkResult.latestVersion || !checkResult.updateAvailable) {
      mergeWriteUpdateState({
        currentVersion,
        checkedAt: checkResult.checkedAt,
        latestVersion: checkResult.latestVersion,
        action: 'up-to-date',
        lastError: null,
        skipReason: null,
      });

      console.log('[update] already up-to-date.');
      return;
    }

    if (!config.updates.autoApply) {
      mergeWriteUpdateState({
        currentVersion,
        checkedAt: checkResult.checkedAt,
        latestVersion: checkResult.latestVersion,
        action: 'skipped',
        skipReason: 'Auto-update skipped: autoApply is disabled by configuration.',
        lastError: null,
      });

      console.log('[update] new version detected but autoApply is disabled.');
      return;
    }

    const lock = tryAcquireUpdateLock();
    if (!lock.acquired) {
      const reason = lock.reason ?? 'another update worker is running';

      mergeWriteUpdateState({
        currentVersion,
        checkedAt: checkResult.checkedAt,
        latestVersion: checkResult.latestVersion,
        action: 'skipped',
        skipReason: `Auto-update skipped: ${reason}.`,
        lastError: null,
      });

      console.log(`[update] skipped: ${reason}.`);
      return;
    }

    try {
      const cliEntryPath = resolveCliEntryPathFromProcess();

      const workerArgs = [
        cliEntryPath,
        'internal',
        'apply-update',
        '--target-version',
        checkResult.latestVersion,
      ];

      const workerPid = runWorkerDetached(workerArgs);
      transferUpdateLockOwnership(workerPid);

      mergeWriteUpdateState({
        currentVersion,
        checkedAt: checkResult.checkedAt,
        latestVersion: checkResult.latestVersion,
        action: 'update-scheduled',
        lastError: null,
        skipReason: null,
      });

      console.log(
        `[update] scheduled ${PACKAGE_NAME}@${checkResult.latestVersion}; applies on next restart.`,
      );
    } catch (error) {
      lock.release();

      const message = error instanceof Error ? error.message : String(error);
      mergeWriteUpdateState({
        currentVersion,
        checkedAt: checkResult.checkedAt,
        latestVersion: checkResult.latestVersion,
        action: 'failed',
        lastError: message,
        skipReason: null,
      });

      console.warn(`[update] failed to schedule update worker: ${message}`);
    }
  }
}
