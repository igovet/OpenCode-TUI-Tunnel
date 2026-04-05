import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';

import { getInstallContext } from './install-context.js';
import { ensureRuntimeDirectories, type RuntimeMode } from './process-state.js';

export interface DaemonSpawnOptions {
  mode: RuntimeMode;
  startArgv: string[];
  startupToken?: string;
}

export interface DaemonSpawnResult {
  pid: number;
}

export function spawnDaemonProcess(options: DaemonSpawnOptions): DaemonSpawnResult {
  const runtimePaths = ensureRuntimeDirectories();
  const installContext = getInstallContext();

  const argv = [installContext.cliEntryPath, 'internal', 'run-server', '--mode', options.mode];

  if (typeof options.startupToken === 'string' && options.startupToken.trim().length > 0) {
    argv.push('--startup-token', options.startupToken);
  }

  argv.push(...options.startArgv);

  const logFd = openSync(runtimePaths.daemonLogPath, 'a', 0o600);

  const child = spawn(installContext.nodeExecutablePath, argv, {
    cwd: installContext.workingDirectory,
    env: installContext.environment,
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });

  closeSync(logFd);

  if (!child.pid || child.pid <= 0) {
    throw new Error('Failed to spawn daemon process (missing child PID)');
  }

  child.unref();

  return {
    pid: child.pid,
  };
}
