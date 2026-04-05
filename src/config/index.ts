import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_VERSION = 1;

export interface AppConfig {
  configVersion: number;
  server: {
    host: string;
    port: number;
    openBrowserOnStart: boolean;
    basePath: string;
  };
  paths: {
    allowedRoots: string[];
    defaultCwd: string;
  };
  opencode: {
    command: string;
    defaultArgs: string[];
  };
  sessions: {
    backend: 'tmux';
    maxConcurrent: number;
    defaultCols: number;
    defaultRows: number;
    scrollbackLines: number;
    reconnectTokenTtlSeconds: number;
    retainExitedSessionHours: number;
  };
  security: {
    listenMode: 'localhost' | 'network';
    requireSessionToken: boolean;
  };
  ui: {
    theme: 'system' | 'dark' | 'light';
    mobileKeybar: boolean;
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeDefaults<T>(defaults: T, incoming: unknown): T {
  if (Array.isArray(defaults)) {
    return (Array.isArray(incoming) ? incoming : defaults) as T;
  }

  if (isObject(defaults)) {
    const source = isObject(incoming) ? incoming : {};
    const merged: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(defaults)) {
      merged[key] = mergeDefaults(value, source[key]);
    }

    return merged as T;
  }

  if (incoming === undefined) {
    return defaults;
  }

  if (defaults === null) {
    return incoming as T;
  }

  return typeof defaults === typeof incoming ? (incoming as T) : defaults;
}

export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

export function getDefaultConfig(): AppConfig {
  return {
    configVersion: CONFIG_VERSION,
    server: {
      host: '127.0.0.1',
      port: 4096,
      openBrowserOnStart: true,
      basePath: '/',
    },
    paths: {
      allowedRoots: ['~/'],
      defaultCwd: '~/',
    },
    opencode: {
      command: 'opencode',
      defaultArgs: [],
    },
    sessions: {
      backend: 'tmux',
      maxConcurrent: 8,
      defaultCols: 120,
      defaultRows: 30,
      scrollbackLines: 5000,
      reconnectTokenTtlSeconds: 86400,
      retainExitedSessionHours: 24,
    },
    security: {
      listenMode: 'localhost',
      requireSessionToken: false,
    },
    ui: {
      theme: 'system',
      mobileKeybar: true,
    },
  };
}

export function getConfigDir(): string {
  return join(homedir(), '.config', 'opencode-tui-tunnel');
}

export function ensureConfigDir(): void {
  const configDir = getConfigDir();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
}

export function loadConfig(): AppConfig {
  ensureConfigDir();

  const defaults = getDefaultConfig();
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return defaults;
  }

  try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    return mergeDefaults(defaults, parsed);
  } catch {
    return defaults;
  }
}

export function saveConfig(cfg: AppConfig): void {
  ensureConfigDir();

  const configPath = getConfigPath();
  const normalized = mergeDefaults(getDefaultConfig(), cfg);

  writeFileSync(configPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
}
