import { execFile, type ExecFileException } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import type { AutostartAdapter, AutostartStatus, ServiceSpec } from './index.js';
import { renderLaunchdAgentPlist, validateServiceSpec } from './templates.js';

const execFileAsync = promisify(execFile);

export const LAUNCHD_LABEL = 'com.igovet.opencode-tui-tunnel';
const LAUNCHD_PLIST_FILE = `${LAUNCHD_LABEL}.plist`;

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

function isExecFileError(
  error: unknown,
): error is ExecFileException & { stdout?: string; stderr?: string } {
  return error instanceof Error && 'code' in error;
}

async function runLaunchctl(args: string[]): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync('launchctl', args);

    return {
      code: 0,
      stdout,
      stderr,
    };
  } catch (error) {
    if (isExecFileError(error)) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('launchctl not found; LaunchAgents are unavailable on this system.', {
          cause: error,
        });
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

function getLaunchAgentPath(): string {
  return join(homedir(), 'Library', 'LaunchAgents', LAUNCHD_PLIST_FILE);
}

function getGuiDomain(): string {
  const uid = process.getuid?.();

  if (!Number.isInteger(uid) || (uid as number) < 0) {
    throw new Error('Unable to resolve current macOS UID for launchctl GUI domain.');
  }

  return `gui/${uid}`;
}

function isAlreadyBootedOut(message: string): boolean {
  return /(service is not loaded|could not find service|no such process|not loaded)/i.test(message);
}

function formatLaunchctlFailure(action: string, result: ExecResult): Error {
  const detail = [result.stderr.trim(), result.stdout.trim()].find((part) => part.length > 0) ?? '';
  const suffix = detail.length > 0 ? `: ${detail}` : '';
  return new Error(`${action}${suffix}`);
}

export class LaunchdAgentAutostartAdapter implements AutostartAdapter {
  readonly mode = 'launchd' as const;
  readonly label = LAUNCHD_LABEL;
  readonly definitionPath = getLaunchAgentPath();

  isSupported(): boolean {
    return process.platform === 'darwin';
  }

  async apply(spec: ServiceSpec): Promise<void> {
    validateServiceSpec(spec);

    if (spec.mode !== 'launchd') {
      throw new Error(`Invalid autostart mode for launchd adapter: ${spec.mode}`);
    }

    const plistContent = renderLaunchdAgentPlist(spec);

    await this.disable();
    await mkdir(dirname(this.definitionPath), { recursive: true });
    await writeFile(this.definitionPath, plistContent, { encoding: 'utf8', mode: 0o644 });

    const bootstrapResult = await runLaunchctl(['bootstrap', getGuiDomain(), this.definitionPath]);
    if (bootstrapResult.code !== 0) {
      throw formatLaunchctlFailure(`Failed to bootstrap ${this.label}`, bootstrapResult);
    }
  }

  async disable(): Promise<void> {
    const bootoutResult = await runLaunchctl(['bootout', `${getGuiDomain()}/${this.label}`]);

    if (bootoutResult.code !== 0) {
      const combined = `${bootoutResult.stderr}\n${bootoutResult.stdout}`;
      if (!isAlreadyBootedOut(combined)) {
        throw formatLaunchctlFailure(`Failed to boot out ${this.label}`, bootoutResult);
      }
    }

    await rm(this.definitionPath, { force: true });
  }

  async status(): Promise<AutostartStatus> {
    const printResult = await runLaunchctl(['print', `${getGuiDomain()}/${this.label}`]);
    const loaded = printResult.code === 0;

    return {
      enabled: existsSync(this.definitionPath),
      loaded,
      definitionPath: this.definitionPath,
      label: this.label,
    };
  }
}
