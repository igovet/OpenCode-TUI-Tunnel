import { homedir } from 'node:os';

import { LaunchdAgentAutostartAdapter, LAUNCHD_LABEL } from './launchd-agent.js';
import { SystemdUserAutostartAdapter, SYSTEMD_USER_LABEL } from './systemd-user.js';

export type AutostartMode = 'systemd' | 'launchd';

export interface ServiceSpec {
  label: string;
  cliPath: string;
  mode: AutostartMode;
  workingDirectory: string;
  environment: Record<string, string>;
  startArgv: string[];
}

export interface AutostartStatus {
  enabled: boolean;
  loaded: boolean;
  definitionPath: string;
  label: string;
}

export interface AutostartAdapter {
  readonly mode: AutostartMode;
  readonly label: string;
  readonly definitionPath: string;
  isSupported(): boolean;
  apply(spec: ServiceSpec): Promise<void>;
  disable(): Promise<void>;
  status(): Promise<AutostartStatus>;
}

export function buildServiceSpec(input: {
  mode: AutostartMode;
  cliPath: string;
  startArgv: string[];
  pathEnv: string;
}): ServiceSpec {
  const label = input.mode === 'systemd' ? SYSTEMD_USER_LABEL : LAUNCHD_LABEL;

  return {
    label,
    cliPath: input.cliPath,
    mode: input.mode,
    workingDirectory: homedir(),
    environment: {
      PATH: input.pathEnv,
    },
    startArgv: [...input.startArgv],
  };
}

export function createAutostartAdapter(): AutostartAdapter {
  if (process.platform === 'linux') {
    return new SystemdUserAutostartAdapter();
  }

  if (process.platform === 'darwin') {
    return new LaunchdAgentAutostartAdapter();
  }

  throw new Error(`Autostart is not supported on platform: ${process.platform}`);
}
