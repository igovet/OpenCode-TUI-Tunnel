import { createRequire } from 'node:module';

import type { AppConfig } from '../config/index.js';
import { startServer, stopServer } from '../server/index.js';
import { UpdateCoordinator } from '../update/coordinator.js';
import {
  clearRuntimeStateFiles,
  writePidFile,
  writeRuntimeRecord,
  type RuntimeMode,
} from './process-state.js';
import { writeStartupError, writeStartupReady } from './startup-handshake.js';

export interface ForegroundRunnerOptions {
  config: AppConfig;
  mode: RuntimeMode;
  startupToken?: string;
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

function normalizeUrl(address: string, host: string, port: number): string {
  const fallback = `http://${host}:${port}`;

  try {
    const parsed = new URL(address);

    if (parsed.hostname === '0.0.0.0' || parsed.hostname === '::' || parsed.hostname === '[::]') {
      parsed.hostname = host === '0.0.0.0' ? '127.0.0.1' : host;
    }

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return fallback;
  }
}

async function runStartup(): Promise<void> {
  // noop placeholder for future async startup tasks
}

export async function runForegroundServer(options: ForegroundRunnerOptions): Promise<void> {
  const { config, mode, startupToken } = options;

  try {
    await runStartup();

    const { address } = await startServer(config);
    const url = normalizeUrl(address, config.server.host, config.server.port);

    writePidFile(process.pid);
    writeRuntimeRecord({
      schemaVersion: 1,
      pid: process.pid,
      url,
      address,
      host: config.server.host,
      port: config.server.port,
      mode,
      startedAt: new Date().toISOString(),
      version: resolvePackageVersion(),
    });

    if (startupToken) {
      writeStartupReady(startupToken, {
        pid: process.pid,
        url,
      });
    }

    UpdateCoordinator.scheduleIfNeeded(config);
  } catch (error) {
    clearRuntimeStateFiles();
    try {
      await stopServer();
    } catch {
      // best-effort rollback for startup failures
    }

    if (startupToken) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        writeStartupError(startupToken, message);
      } catch {
        // best-effort handshake failure reporting
      }
    }

    throw error;
  }

  const shutdown = async (): Promise<void> => {
    clearRuntimeStateFiles();
    await stopServer();
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void shutdown()
        .then(() => {
          process.exit(0);
        })
        .catch((error) => {
          console.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        });
    });
  }

  process.once('uncaughtException', (error) => {
    void shutdown().finally(() => {
      console.error(error);
      process.exit(1);
    });
  });

  process.once('unhandledRejection', (reason) => {
    void shutdown().finally(() => {
      console.error(reason);
      process.exit(1);
    });
  });
}
