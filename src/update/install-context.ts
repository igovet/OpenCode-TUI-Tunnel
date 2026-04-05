import { constants as fsConstants, realpathSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const execFileAsync = promisify(execFile);

const PACKAGE_NAME = '@igovet/opencode-tui-tunnel';

export type UpdateInstallContextKind = 'global-npm' | 'npx' | 'local-dev' | 'unsupported';

export interface UpdateInstallContext {
  kind: UpdateInstallContextKind;
  supported: boolean;
  reason: string;
  npmAvailable: boolean;
  globalPrefixPath: string | null;
  globalNodeModulesPath: string | null;
  packageRootPath: string | null;
  cliEntryPath: string;
}

interface NpmGlobalPaths {
  globalPrefixPath: string;
  globalNodeModulesPath: string;
}

function normalizePathLike(value: string): string {
  return resolve(value);
}

function normalizeCliEntryPath(value: string): string {
  const normalized = normalizePathLike(value);

  try {
    return realpathSync(normalized);
  } catch {
    return normalized;
  }
}

function pathContains(root: string, candidate: string): boolean {
  const normalizedRoot = normalizePathLike(root);
  const normalizedCandidate = normalizePathLike(candidate);

  if (normalizedCandidate === normalizedRoot) {
    return true;
  }

  return normalizedCandidate.startsWith(`${normalizedRoot}${sep}`);
}

function isLikelyNpxInvocation(environment: NodeJS.ProcessEnv): boolean {
  const npmExecPath = environment.npm_execpath;
  const npmCommand = environment.npm_command;
  const npmLifecycleScript = environment.npm_lifecycle_script;

  if (typeof npmExecPath === 'string' && /npx-cli\.js$/i.test(npmExecPath)) {
    return true;
  }

  if (typeof npmCommand === 'string' && (npmCommand === 'exec' || npmCommand === 'dlx')) {
    return true;
  }

  if (typeof npmLifecycleScript === 'string' && /\bnpx\b/.test(npmLifecycleScript)) {
    return true;
  }

  return false;
}

function isLikelyNpxCliPath(cliEntryPath: string): boolean {
  return /(?:^|[\\/])_npx(?:[\\/]|$)/.test(cliEntryPath);
}

function readNearestPackageName(startPath: string): {
  packageName: string | null;
  packageRootPath: string | null;
} {
  const require = createRequire(import.meta.url);
  let cursor = dirname(startPath);
  let searching = true;

  while (searching) {
    const candidate = resolve(cursor, 'package.json');

    try {
      const pkg = require(candidate) as { name?: unknown };

      return {
        packageName: typeof pkg.name === 'string' ? pkg.name : null,
        packageRootPath: cursor,
      };
    } catch {
      // continue walking
    }

    const parent = dirname(cursor);
    if (parent === cursor) {
      searching = false;
      continue;
    }

    cursor = parent;
  }

  return {
    packageName: null,
    packageRootPath: null,
  };
}

async function resolveNpmGlobalPaths(): Promise<NpmGlobalPaths | null> {
  try {
    const [prefixResult, rootResult] = await Promise.all([
      execFileAsync('npm', ['prefix', '-g'], { timeout: 1200 }),
      execFileAsync('npm', ['root', '-g'], { timeout: 1200 }),
    ]);

    const globalPrefixPath = prefixResult.stdout.trim();
    const globalNodeModulesPath = rootResult.stdout.trim();

    if (globalPrefixPath.length === 0 || globalNodeModulesPath.length === 0) {
      return null;
    }

    return {
      globalPrefixPath: normalizePathLike(globalPrefixPath),
      globalNodeModulesPath: normalizePathLike(globalNodeModulesPath),
    };
  } catch {
    return null;
  }
}

async function hasWritableGlobalPrefix(prefixPath: string): Promise<boolean> {
  try {
    await access(prefixPath, fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function detectUpdateInstallContext(input?: {
  cliEntryPath?: string;
  environment?: NodeJS.ProcessEnv;
}): Promise<UpdateInstallContext> {
  const cliEntryPath = normalizeCliEntryPath(input?.cliEntryPath ?? process.argv[1] ?? '');
  const environment = input?.environment ?? process.env;

  if (isLikelyNpxInvocation(environment) || isLikelyNpxCliPath(cliEntryPath)) {
    return {
      kind: 'npx',
      supported: false,
      reason: 'Auto-update skipped: npx execution context is unsupported.',
      npmAvailable: true,
      globalPrefixPath: null,
      globalNodeModulesPath: null,
      packageRootPath: null,
      cliEntryPath,
    };
  }

  const npmGlobalPaths = await resolveNpmGlobalPaths();
  if (!npmGlobalPaths) {
    return {
      kind: 'unsupported',
      supported: false,
      reason:
        'Auto-update skipped: npm is unavailable or global prefix/root could not be resolved.',
      npmAvailable: false,
      globalPrefixPath: null,
      globalNodeModulesPath: null,
      packageRootPath: null,
      cliEntryPath,
    };
  }

  const nearestPackage = readNearestPackageName(cliEntryPath);
  if (nearestPackage.packageName !== PACKAGE_NAME || nearestPackage.packageRootPath === null) {
    return {
      kind: 'unsupported',
      supported: false,
      reason: 'Auto-update skipped: unable to resolve package root for current CLI invocation.',
      npmAvailable: true,
      globalPrefixPath: npmGlobalPaths.globalPrefixPath,
      globalNodeModulesPath: npmGlobalPaths.globalNodeModulesPath,
      packageRootPath: nearestPackage.packageRootPath,
      cliEntryPath,
    };
  }

  const packageRootPath = normalizePathLike(nearestPackage.packageRootPath);
  const expectedGlobalPackageRoot = resolve(npmGlobalPaths.globalNodeModulesPath, PACKAGE_NAME);

  if (!pathContains(expectedGlobalPackageRoot, packageRootPath)) {
    return {
      kind: 'local-dev',
      supported: false,
      reason: 'Auto-update skipped: local development/repository execution context is unsupported.',
      npmAvailable: true,
      globalPrefixPath: npmGlobalPaths.globalPrefixPath,
      globalNodeModulesPath: npmGlobalPaths.globalNodeModulesPath,
      packageRootPath,
      cliEntryPath,
    };
  }

  const writablePrefix = await hasWritableGlobalPrefix(npmGlobalPaths.globalPrefixPath);
  if (!writablePrefix) {
    return {
      kind: 'unsupported',
      supported: false,
      reason: 'Auto-update skipped: npm global prefix is not writable for current user.',
      npmAvailable: true,
      globalPrefixPath: npmGlobalPaths.globalPrefixPath,
      globalNodeModulesPath: npmGlobalPaths.globalNodeModulesPath,
      packageRootPath,
      cliEntryPath,
    };
  }

  return {
    kind: 'global-npm',
    supported: true,
    reason: 'Auto-update supported: global npm installation detected.',
    npmAvailable: true,
    globalPrefixPath: npmGlobalPaths.globalPrefixPath,
    globalNodeModulesPath: npmGlobalPaths.globalNodeModulesPath,
    packageRootPath,
    cliEntryPath,
  };
}
