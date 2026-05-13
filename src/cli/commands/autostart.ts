import { Command } from 'commander';

import { buildServiceSpec, createAutostartAdapter } from '../../autostart/index.js';
import { resolveCliEntryPathFromProcess } from '../../runtime/install-context.js';
import { applySharedStartOptions, resolveStartOptions, type StartCommandOptions } from './start.js';

function resolveEnvironment(): Record<string, string> {
  const pathEnv = process.env.PATH;

  if (typeof pathEnv !== 'string' || pathEnv.trim().length === 0) {
    throw new Error('Cannot enable autostart: PATH is empty in current shell environment.');
  }

  // Capture full environment, filtering out undefined values
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  return env;
}

async function runAutostartOn(opts: StartCommandOptions): Promise<void> {
  const adapter = createAutostartAdapter();

  if (!adapter.isSupported()) {
    throw new Error(`Autostart is not supported on platform: ${process.platform}`);
  }

  const resolved = resolveStartOptions(opts);
  const serviceSpec = buildServiceSpec({
    mode: adapter.mode,
    cliPath: resolveCliEntryPathFromProcess(),
    startArgv: resolved.startArgv,
    environment: resolveEnvironment(),
  });

  await adapter.apply(serviceSpec);

  console.log(
    [
      `Autostart enabled (${adapter.mode}).`,
      `Label: ${adapter.label}`,
      `Definition: ${adapter.definitionPath}`,
    ].join('\n'),
  );
}

async function runAutostartOff(): Promise<void> {
  const adapter = createAutostartAdapter();

  if (!adapter.isSupported()) {
    throw new Error(`Autostart is not supported on platform: ${process.platform}`);
  }

  await adapter.disable();

  console.log(
    [
      `Autostart disabled (${adapter.mode}).`,
      `Label: ${adapter.label}`,
      `Definition removed: ${adapter.definitionPath}`,
    ].join('\n'),
  );
}

export function registerAutostartCommand(program: Command): void {
  const autostart = program
    .command('autostart')
    .description('Manage autostart service registration');

  applySharedStartOptions(
    autostart.command('on').description('Enable autostart and start service immediately'),
  ).action(async (opts: StartCommandOptions) => {
    await runAutostartOn(opts);
  });

  autostart
    .command('off')
    .description('Disable autostart and remove managed service')
    .action(async () => {
      await runAutostartOff();
    });
}
