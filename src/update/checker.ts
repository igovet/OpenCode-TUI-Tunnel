import { createRequire } from 'node:module';

const REGISTRY_HOST = 'registry.npmjs.org';
const PACKAGE_NAME = '@igovet/opencode-tui-tunnel';
const LATEST_ENDPOINT = `https://${REGISTRY_HOST}/${PACKAGE_NAME}/latest`;

interface SemverApi {
  valid(value: string): string | null;
  gt(a: string, b: string): boolean;
}

function loadSemver(): SemverApi {
  const require = createRequire(import.meta.url);
  return require('semver') as SemverApi;
}

const semver = loadSemver();

export interface UpdateCheckResult {
  checkedAt: string;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
}

function normalizeSemver(value: string): string {
  const normalized = semver.valid(value);

  if (!normalized) {
    throw new Error(`Invalid semver value: ${value}`);
  }

  return normalized;
}

function assertHttpsRegistryUrl(url: URL): void {
  if (url.protocol !== 'https:') {
    throw new Error('Update check refused: registry URL must be HTTPS.');
  }

  if (url.host !== REGISTRY_HOST) {
    throw new Error(`Update check refused: unexpected registry host ${url.host}.`);
  }
}

export async function checkLatestVersion(input: {
  currentVersion: string;
  timeoutMs: number;
}): Promise<UpdateCheckResult> {
  const checkedAt = new Date().toISOString();
  const currentVersion = normalizeSemver(input.currentVersion);
  const targetUrl = new URL(LATEST_ENDPOINT);
  assertHttpsRegistryUrl(targetUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, input.timeoutMs);

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Registry responded with HTTP ${response.status}.`);
    }

    const body = (await response.json()) as { version?: unknown };
    if (typeof body.version !== 'string') {
      throw new Error('Registry response is missing latest version field.');
    }

    const latestVersion = normalizeSemver(body.version);

    return {
      checkedAt,
      currentVersion,
      latestVersion,
      updateAvailable: semver.gt(latestVersion, currentVersion),
    };
  } finally {
    clearTimeout(timeout);
  }
}
