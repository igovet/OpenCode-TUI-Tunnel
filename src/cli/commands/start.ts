import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { Command } from 'commander';

import { loadConfig, type AppConfig } from '../../config/index.js';
import { spawnDaemonProcess } from '../../runtime/daemon-spawn.js';
import { getLiveProcessState } from '../../runtime/process-state.js';
import {
  createStartupHandshakeToken,
  removeStartupHandshake,
  waitForStartupHandshake,
} from '../../runtime/startup-handshake.js';

const execFileAsync = promisify(execFile);

export interface StartCommandOptions {
  host?: string;
  port?: string;
  open?: boolean;
}

interface StartResolution {
  config: AppConfig;
  startArgv: string[];
}

async function commandPath(command: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('which', [command]);
    const resolved = stdout.trim();
    return resolved.length > 0 ? resolved : null;
  } catch {
    return null;
  }
}

function parsePort(raw: string): number {
  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid --port value: ${raw}`);
  }

  return parsed;
}

function fallbackUrl(host: string, port: number): string {
  return `http://${host}:${port}`;
}

async function openBrowser(url: string): Promise<void> {
  if (process.platform === 'darwin') {
    await execFileAsync('open', [url]);
    return;
  }

  if (process.platform === 'win32') {
    await execFileAsync('cmd', ['/c', 'start', '', url]);
    return;
  }

  const linuxOpenCommand = await commandPath('xdg-open');
  if (!linuxOpenCommand) {
    throw new Error('xdg-open not found in PATH');
  }

  await execFileAsync(linuxOpenCommand, [url]);
}

function printStartSuccess(url: string, pid: number, existing: boolean): void {
  if (existing) {
    console.log('Service already running.');
  }

  console.log(`URL: ${url}`);
  console.log(`PID: ${pid}`);
}

export function applySharedStartOptions(command: Command): Command {
  return command
    .option('--host <host>', 'Listen host', undefined)
    .option('--port <port>', 'Listen port', undefined)
    .option('--no-open', 'Do not open browser');
}

export function resolveStartOptions(opts: StartCommandOptions): StartResolution {
  const config = loadConfig();
  const startArgv: string[] = [];

  if (opts.host !== undefined) {
    const host = opts.host.trim();

    if (host.length === 0) {
      throw new Error('Invalid --host value: host must not be empty');
    }

    config.server.host = host;
    startArgv.push('--host', host);
  }

  if (opts.port !== undefined) {
    const port = parsePort(opts.port);
    config.server.port = port;
    startArgv.push('--port', String(port));
  }

  if (opts.open === false) {
    config.server.openBrowserOnStart = false;
    startArgv.push('--no-open');
  }

  return {
    config,
    startArgv,
  };
}

export async function runStartCommand(opts: StartCommandOptions): Promise<void> {
  const { config, startArgv } = resolveStartOptions(opts);
  const existing = getLiveProcessState({ cleanupStale: true });

  if (existing) {
    const existingUrl = existing.url ?? fallbackUrl(config.server.host, config.server.port);
    printStartSuccess(existingUrl, existing.pid, true);

    if (config.server.openBrowserOnStart) {
      try {
        await openBrowser(existingUrl);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to open browser automatically (${reason}).`);
      }
    }

    return;
  }

  const handshake = createStartupHandshakeToken();

  try {
    spawnDaemonProcess({
      mode: 'daemon',
      startArgv,
      startupToken: handshake.token,
    });

    const ready = await waitForStartupHandshake(handshake.token, {
      timeoutMs: 5_000,
      pollIntervalMs: 100,
    });

    printStartSuccess(ready.url, ready.pid, false);

    if (config.server.openBrowserOnStart) {
      try {
        await openBrowser(ready.url);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to open browser automatically (${reason}).`);
      }
    }
  } finally {
    removeStartupHandshake(handshake.token);
  }
}

export function registerStartCommand(program: Command): void {
  applySharedStartOptions(
    program.command('start').description('Start the tunnel service in daemon mode'),
  ).action(async (opts: StartCommandOptions) => {
    await runStartCommand(opts);
  });
}
