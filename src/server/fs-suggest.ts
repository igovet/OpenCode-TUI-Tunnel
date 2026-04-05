import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

function isPartialMatch(needle: string, haystack: string): boolean {
  if (!needle) {
    return true;
  }

  let needleIndex = 0;
  for (let i = 0; i < haystack.length && needleIndex < needle.length; i += 1) {
    if (haystack[i] === needle[needleIndex]) {
      needleIndex += 1;
    }
  }

  return needleIndex === needle.length;
}

function getMatchRank(params: {
  query: string;
  segmentQuery: string;
  entryName: string;
  absolutePath: string;
  displayPath: string;
}): number | null {
  const query = params.query.toLowerCase();
  const segmentQuery = params.segmentQuery.toLowerCase();
  const entryName = params.entryName.toLowerCase();
  const absolutePath = params.absolutePath.toLowerCase();
  const displayPath = params.displayPath.toLowerCase();

  const hasSegment = segmentQuery.length > 0;
  const hasQuery = query.length > 0;

  // 1) Exact prefix matches first.
  if (
    (hasSegment && entryName.startsWith(segmentQuery)) ||
    (hasQuery && (absolutePath.startsWith(query) || displayPath.startsWith(query)))
  ) {
    return 0;
  }

  // 2) Substring matches.
  if (
    (hasSegment && entryName.includes(segmentQuery)) ||
    (hasQuery && (absolutePath.includes(query) || displayPath.includes(query)))
  ) {
    return 1;
  }

  // 3) Partial/fuzzy subsequence matches.
  if (
    (hasSegment && isPartialMatch(segmentQuery, entryName)) ||
    (hasQuery && (isPartialMatch(query, absolutePath) || isPartialMatch(query, displayPath)))
  ) {
    return 2;
  }

  return null;
}

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
      .map((entry) => {
        const base = path.join(targetDir, entry.name);
        const absolute = path.resolve(base);
        const display = toDisplayPath(absolute, homeDir);
        const rank = getMatchRank({
          query: expanded,
          segmentQuery: prefixPart,
          entryName: entry.name,
          absolutePath: absolute,
          displayPath: display,
        });

        if (rank === null) {
          return null;
        }

        return { display, rank };
      })
      .filter((match): match is { display: string; rank: number } => match !== null)
      .sort((a, b) => {
        if (a.rank !== b.rank) {
          return a.rank - b.rank;
        }

        const aPath = a.display;
        const bPath = b.display;

        const aHome = aPath.startsWith('~');
        const bHome = bPath.startsWith('~');
        if (aHome !== bHome) {
          return aHome ? -1 : 1;
        }
        return aPath.localeCompare(bPath);
      });

    return matches.slice(0, normalizedLimit).map((match) => match.display);
  } catch {
    return [];
  }
}
