import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

function toDisplayPath(absolutePath: string, homeDir: string): string {
  const normalizedHome = path.resolve(homeDir);
  const normalizedPath = path.resolve(absolutePath);

  if (normalizedPath === normalizedHome) {
    return '~';
  }

  if (normalizedPath.startsWith(`${normalizedHome}${path.sep}`)) {
    return `~${normalizedPath.slice(normalizedHome.length)}`;
  }

  return normalizedPath;
}

function expandHome(input: string, homeDir: string): string {
  if (input === '~') {
    return homeDir;
  }

  if (input.startsWith('~/')) {
    return path.join(homeDir, input.slice(2));
  }

  return input;
}

export function suggestPaths(partial: string, limit = 5): string[] {
  const homeDir = os.homedir();
  const trimmed = partial.trim();
  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 5;
  const listHomeDirsOnly = trimmed.length === 0 || trimmed === '~' || trimmed === '/';

  try {
    const effective =
      trimmed.length === 0 || trimmed === '~' || trimmed === '/' ? `${homeDir}/` : trimmed;
    const expanded = expandHome(effective, homeDir);

    const slashIndex = expanded.lastIndexOf('/');
    const dirPart = slashIndex >= 0 ? expanded.slice(0, slashIndex + 1) : '';
    const prefixPart = slashIndex >= 0 ? expanded.slice(slashIndex + 1) : expanded;

    const targetDir = dirPart.length > 0 ? dirPart : homeDir;
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });

    const matches = entries
      .filter((entry) => !listHomeDirsOnly || entry.isDirectory())
      .filter((entry) => entry.name.startsWith(prefixPart))
      .map((entry) => {
        const base = path.join(targetDir, entry.name);
        const absolute = entry.isDirectory() ? `${base}/` : base;
        return toDisplayPath(absolute, homeDir);
      })
      .sort((a, b) => {
        const aHome = a.startsWith('~');
        const bHome = b.startsWith('~');
        if (aHome !== bHome) {
          return aHome ? -1 : 1;
        }
        return a.localeCompare(b);
      });

    return matches.slice(0, normalizedLimit);
  } catch {
    return [];
  }
}
