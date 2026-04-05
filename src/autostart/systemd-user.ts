import { execFile, type ExecFileException } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import type { AutostartAdapter, AutostartStatus, ServiceSpec } from './index.js';
import { renderSystemdUserUnit, validateServiceSpec } from './templates.js';

const execFileAsync = promisify(execFile);

export const SYSTEMD_USER_LABEL = 'opencode-tui-tunnel';
const SYSTEMD_USER_UNIT_FILE = `${SYSTEMD_USER_LABEL}.service`;

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

function getSystemdUnitPath(): string {
  return join(homedir(), '.config', 'systemd', 'user', SYSTEMD_USER_UNIT_FILE);
}

function isExecFileError(
  error: unknown,
): error is ExecFileException & { stdout?: string; stderr?: string } {
  return error instanceof Error && 'code' in error;
}

async function runSystemctlUser(args: string[]): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync('systemctl', ['--user', ...args]);

    return {
      code: 0,
      stdout,
      stderr,
    };
  } catch (error) {
    if (isExecFileError(error)) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(
          'systemctl not found; systemd user services are unavailable on this system.',
        );
      }

      return {
        code: typeof error.code === 'number' ? error.code : 1,
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? error.message,
      };
    }

    throw error;
  }
}

function isMissingSystemdUnitMessage(message: string): boolean {
  return /(not loaded|no such file|not found|does not exist)/i.test(message);
}

function formatSystemctlFailure(action: string, result: ExecResult): Error {
  const detail = [result.stderr.trim(), result.stdout.trim()].find((part) => part.length > 0) ?? '';
  const suffix = detail.length > 0 ? `: ${detail}` : '';
  return new Error(`${action}${suffix}`);
}

export class SystemdUserAutostartAdapter implements AutostartAdapter {
  readonly mode = 'systemd' as const;
  readonly label = SYSTEMD_USER_LABEL;
  readonly definitionPath = getSystemdUnitPath();

  isSupported(): boolean {
    return process.platform === 'linux';
  }

  async apply(spec: ServiceSpec): Promise<void> {
    validateServiceSpec(spec);

    if (spec.mode !== 'systemd') {
      throw new Error(`Invalid autostart mode for systemd adapter: ${spec.mode}`);
    }

    const unitContent = renderSystemdUserUnit(spec);

    await this.disable();
    await mkdir(dirname(this.definitionPath), { recursive: true });
    await writeFile(this.definitionPath, unitContent, { encoding: 'utf8', mode: 0o644 });

    const reloadResult = await runSystemctlUser(['daemon-reload']);
    if (reloadResult.code !== 0) {
      throw formatSystemctlFailure('Failed to reload systemd user daemon', reloadResult);
    }

    const enableResult = await runSystemctlUser(['enable', '--now', this.label]);
    if (enableResult.code !== 0) {
      throw formatSystemctlFailure(`Failed to enable/start ${this.label}`, enableResult);
    }
  }

  async disable(): Promise<void> {
    const disableResult = await runSystemctlUser(['disable', '--now', this.label]);

    if (disableResult.code !== 0) {
      const combined = `${disableResult.stderr}\n${disableResult.stdout}`;
      if (!isMissingSystemdUnitMessage(combined)) {
        throw formatSystemctlFailure(`Failed to disable/stop ${this.label}`, disableResult);
      }
    }

    await rm(this.definitionPath, { force: true });

    const reloadResult = await runSystemctlUser(['daemon-reload']);
    if (reloadResult.code !== 0) {
      throw formatSystemctlFailure('Failed to reload systemd user daemon', reloadResult);
    }
  }

  async status(): Promise<AutostartStatus> {
    const enabledResult = await runSystemctlUser(['is-enabled', this.label]);
    const loadedResult = await runSystemctlUser(['is-active', this.label]);

    const unitExists = existsSync(this.definitionPath);

    return {
      enabled:
        enabledResult.code === 0 || (unitExists && enabledResult.stdout.trim() === 'enabled'),
      loaded: loadedResult.code === 0 || loadedResult.stdout.trim() === 'active',
      definitionPath: this.definitionPath,
      label: this.label,
    };
  }
}
