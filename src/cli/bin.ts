#!/usr/bin/env node

import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { Command } from 'commander';

import {
  ensureConfigDir,
  getConfigDir,
  getConfigPath,
  loadConfig,
  saveConfig,
  type AppConfig,
} from '../config/index.js';
import { getLiveProcessState } from '../runtime/process-state.js';
import { registerInternalCommands } from './commands/internal.js';
import { registerStartCommand } from './commands/start.js';
import { registerStatusCommand } from './commands/status.js';
import { registerAutostartCommand } from './commands/autostart.js';

const execFileAsync = promisify(execFile);
const program = new Command();
const RESET_COLOR = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const moduleDir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const packageJsonPath = join(moduleDir, '..', '..', 'package.json');
const packageJson = require(packageJsonPath) as { version?: unknown };
const cliVersion = typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';

interface SessionSummaryRow {
  id: string;
  status: string;
  cwd: string;
  started: string;
  clients: string;
}

function green(text: string): string {
  return `${GREEN}${text}${RESET_COLOR}`;
}

function red(text: string): string {
  return `${RED}${text}${RESET_COLOR}`;
}

function parseMajorNodeVersion(): number {
  const [major] = process.versions.node.split('.');
  return Number.parseInt(major, 10);
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

function resolvePackagedWebIndex(): string {
  return join(moduleDir, '..', '..', 'dist', 'web', 'index.html');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 1) {
    return '…';
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function formatDate(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function printSessionsTable(rows: SessionSummaryRow[]): void {
  const headers: SessionSummaryRow = {
    id: 'ID',
    status: 'Status',
    cwd: 'CWD',
    started: 'Started',
    clients: 'Clients',
  };

  const widths = {
    id: Math.max(headers.id.length, ...rows.map((row) => row.id.length)),
    status: Math.max(headers.status.length, ...rows.map((row) => row.status.length)),
    cwd: Math.max(headers.cwd.length, ...rows.map((row) => row.cwd.length)),
    started: Math.max(headers.started.length, ...rows.map((row) => row.started.length)),
    clients: Math.max(headers.clients.length, ...rows.map((row) => row.clients.length)),
  };

  const formatRow = (row: SessionSummaryRow): string =>
    [
      row.id.padEnd(widths.id),
      row.status.padEnd(widths.status),
      row.cwd.padEnd(widths.cwd),
      row.started.padEnd(widths.started),
      row.clients.padStart(widths.clients),
    ].join('  ');

  console.log(formatRow(headers));
  console.log(
    formatRow({
      id: '-'.repeat(widths.id),
      status: '-'.repeat(widths.status),
      cwd: '-'.repeat(widths.cwd),
      started: '-'.repeat(widths.started),
      clients: '-'.repeat(widths.clients),
    }),
  );

  for (const row of rows) {
    console.log(formatRow(row));
  }
}

function getConfigValueByPath(root: unknown, path: string): unknown {
  const segments = path.split('.').filter(Boolean);
  let cursor: unknown = root;

  for (const segment of segments) {
    if (!isRecord(cursor) || !(segment in cursor)) {
      return undefined;
    }

    cursor = cursor[segment];
  }

  return cursor;
}

function setConfigValueByPath(root: unknown, path: string, value: unknown): boolean {
  const segments = path.split('.').filter(Boolean);
  if (segments.length === 0) {
    return false;
  }

  let cursor = root;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];

    if (!isRecord(cursor) || !isRecord(cursor[segment])) {
      return false;
    }

    cursor = cursor[segment];
  }

  if (!isRecord(cursor)) {
    return false;
  }

  const leaf = segments[segments.length - 1];
  if (!(leaf in cursor)) {
    return false;
  }

  cursor[leaf] = value;
  return true;
}

function parseConfigValue(raw: string): string | number | boolean {
  const lowered = raw.toLowerCase();
  if (lowered === 'true') {
    return true;
  }

  if (lowered === 'false') {
    return false;
  }

  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return Number(raw);
  }

  return raw;
}

async function requestServerJson(
  pathname: string,
  method: 'GET' | 'DELETE' = 'GET',
): Promise<unknown> {
  const config = loadConfig();
  const runtime = getLiveProcessState({ cleanupStale: false });
  const baseUrl = runtime?.url ?? `http://${config.server.host}:${config.server.port}`;
  const targetUrl = `${baseUrl}${pathname}`;

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method,
      headers: {
        Accept: 'application/json',
      },
    });
  } catch {
    throw new Error(`Unable to reach tunnel server at ${baseUrl}. Is it running?`);
  }

  const rawBody = await response.text();
  let payload: unknown = null;
  if (rawBody.length > 0) {
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      payload = { error: rawBody };
    }
  }

  if (!response.ok) {
    const errorMessage =
      isRecord(payload) && typeof payload.error === 'string'
        ? payload.error
        : `Request to ${pathname} failed with HTTP ${response.status}`;
    throw new Error(errorMessage);
  }

  return payload;
}

function printDoctorResult(ok: boolean, message: string): void {
  const icon = ok ? green('✓') : red('✗');
  console.log(`  ${icon} ${message}`);
}

program
  .name('opencode-tui-tunnel')
  .description('Web terminal multiplexer for opencode TUI sessions')
  .version(cliVersion);

registerStartCommand(program);
registerStatusCommand(program);
registerInternalCommands(program);
registerAutostartCommand(program);

program
  .command('sessions')
  .description('Manage running sessions')
  .addCommand(
    new Command('list')
      .description('List running sessions')
      .option('--json', 'Print raw JSON')
      .action(async (opts: { json?: boolean }) => {
        const payload = await requestServerJson('/api/sessions', 'GET');

        if (opts.json) {
          console.log(JSON.stringify(payload));
          return;
        }

        if (!Array.isArray(payload) || payload.length === 0) {
          console.log('No running sessions.');
          return;
        }

        const rows = payload.map((session): SessionSummaryRow => {
          if (!isRecord(session)) {
            return {
              id: 'unknown',
              status: 'unknown',
              cwd: '-',
              started: '-',
              clients: '0',
            };
          }

          const id = typeof session.id === 'string' ? session.id.slice(0, 8) : 'unknown';
          const status = typeof session.status === 'string' ? session.status : 'unknown';
          const cwd = typeof session.cwd === 'string' ? truncate(session.cwd, 60) : '-';
          const started = formatDate(session.startedAt);
          const clients =
            typeof session.clientCount === 'number' && Number.isFinite(session.clientCount)
              ? String(session.clientCount)
              : '0';

          return {
            id,
            status,
            cwd,
            started,
            clients,
          };
        });

        printSessionsTable(rows);
      }),
  )
  .addCommand(
    new Command('kill')
      .description('Terminate a running session')
      .argument('<id>', 'Session ID')
      .action(async (id: string) => {
        await requestServerJson(`/api/sessions/${encodeURIComponent(id)}`, 'DELETE');
        console.log(`Session ${id} terminated.`);
      }),
  );

program
  .command('config')
  .description('Read or update configuration')
  .addCommand(
    new Command('get')
      .description('Get full config or a specific key')
      .argument('[key]', 'Optional dot-notation key')
      .action((key?: string) => {
        const config = loadConfig();

        if (!key) {
          console.log(JSON.stringify(config, null, 2));
          return;
        }

        const value = getConfigValueByPath(config, key);
        if (value === undefined) {
          throw new Error(`Config key not found: ${key}`);
        }

        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          console.log(String(value));
          return;
        }

        console.log(JSON.stringify(value, null, 2));
      }),
  )
  .addCommand(
    new Command('set')
      .description('Set a config key to a new value')
      .argument('<key>', 'Dot-notation config key')
      .argument('<value>', 'Value to store')
      .action((key: string, value: string) => {
        const parsedValue = parseConfigValue(value);
        const current = loadConfig();
        const updated = JSON.parse(JSON.stringify(current)) as AppConfig;

        if (!setConfigValueByPath(updated, key, parsedValue)) {
          throw new Error(`Config key not found or not writable: ${key}`);
        }

        saveConfig(updated);
        console.log(`Updated ${key} = ${JSON.stringify(parsedValue)}`);
      }),
  )
  .addCommand(
    new Command('path').description('Print config file path').action(() => {
      console.log(getConfigPath());
    }),
  );

program
  .command('doctor')
  .description('Run environment diagnostics')
  .action(async () => {
    const checks: Array<{ ok: boolean; message: string }> = [];

    const nodeMajor = parseMajorNodeVersion();
    checks.push({
      ok: nodeMajor >= 20,
      message: `Node.js v${process.versions.node} (required: >=20)`,
    });

    const tmuxInfo = await (async (): Promise<{ ok: boolean; detail: string }> => {
      try {
        const { stdout } = await execFileAsync('tmux', ['-V']);
        const detail = stdout.trim().replace(/^tmux\s*/i, '');
        return { ok: true, detail: detail.length > 0 ? detail : 'available' };
      } catch {
        return { ok: false, detail: 'not found' };
      }
    })();

    checks.push({
      ok: tmuxInfo.ok,
      message: `tmux ${tmuxInfo.detail}`,
    });

    const opencodePath = await commandPath('opencode');
    checks.push({
      ok: opencodePath !== null,
      message:
        opencodePath !== null ? `opencode found at ${opencodePath}` : 'opencode not found in PATH',
    });

    const configDir = getConfigDir();
    let configWritable: boolean;
    try {
      ensureConfigDir();
      await access(configDir, constants.W_OK);
      const probePath = join(configDir, '.doctor-write-probe');
      writeFileSync(probePath, 'ok', 'utf8');
      unlinkSync(probePath);
      configWritable = true;
    } catch {
      configWritable = false;
    }

    checks.push({
      ok: configWritable,
      message: `Config dir: ${configDir} (${configWritable ? 'writable' : 'not writable'})`,
    });

    const webIndexPath = resolvePackagedWebIndex();
    const webExists = existsSync(webIndexPath);
    checks.push({
      ok: webExists,
      message: webExists
        ? 'dist/web/index.html found'
        : 'dist/web/index.html not found — run npm run build first',
    });

    for (const check of checks) {
      printDoctorResult(check.ok, check.message);
    }

    if (checks.some((check) => !check.ok)) {
      process.exitCode = 1;
    }
  });

program.parseAsync().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
