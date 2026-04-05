import { Command } from 'commander';

import { runForegroundServer } from '../../runtime/foreground-runner.js';
import { type RuntimeMode } from '../../runtime/process-state.js';
import { runApplyUpdateWorker } from '../../update/worker.js';
import { applySharedStartOptions, resolveStartOptions, type StartCommandOptions } from './start.js';

interface InternalRunServerOptions extends StartCommandOptions {
  mode: RuntimeMode;
  startupToken?: string;
}

function addSharedStartOptionsAndMode(command: Command): Command {
  return applySharedStartOptions(command)
    .requiredOption('--mode <mode>', 'Runtime mode (daemon|systemd|launchd)')
    .option('--startup-token <token>', 'Startup handshake token');
}

function validateRuntimeMode(rawMode: string): RuntimeMode {
  if (rawMode === 'daemon' || rawMode === 'systemd' || rawMode === 'launchd') {
    return rawMode;
  }

  throw new Error(`Invalid --mode value: ${rawMode}`);
}

export function registerInternalCommands(program: Command): void {
  const internal = program
    .command('internal', { hidden: true })
    .description('Internal maintenance commands');

  addSharedStartOptionsAndMode(
    internal.command('run-server', { hidden: true }).description('Run tunnel server in foreground'),
  ).action(async (opts: InternalRunServerOptions) => {
    const mode = validateRuntimeMode(opts.mode);
    const resolved = resolveStartOptions(opts);

    await runForegroundServer({
      config: resolved.config,
      mode,
      startupToken: opts.startupToken,
    });
  });

  internal
    .command('apply-update', { hidden: true })
    .description('Apply package auto-update')
    .requiredOption('--target-version <version>', 'Target semver to install')
    .action(async (opts: { targetVersion: string }) => {
      await runApplyUpdateWorker({
        targetVersion: opts.targetVersion,
      });
    });
}
