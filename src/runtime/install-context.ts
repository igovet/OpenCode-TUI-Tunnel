import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export interface InstallContext {
  nodeExecutablePath: string;
  cliEntryPath: string;
  workingDirectory: string;
  environment: NodeJS.ProcessEnv;
}

function resolveFallbackCliEntryPath(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return resolve(join(moduleDir, '..', 'cli', 'bin.js'));
}

export function resolveCliEntryPathFromProcess(): string {
  const argvEntry = process.argv[1];

  if (typeof argvEntry === 'string' && argvEntry.trim().length > 0) {
    return resolve(argvEntry);
  }

  return resolveFallbackCliEntryPath();
}

export function getInstallContext(): InstallContext {
  return {
    nodeExecutablePath: process.execPath,
    cliEntryPath: resolveCliEntryPathFromProcess(),
    workingDirectory: process.cwd(),
    environment: { ...process.env },
  };
}
