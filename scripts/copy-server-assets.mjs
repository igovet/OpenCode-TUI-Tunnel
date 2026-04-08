#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');

const assets = [
  {
    from: resolve(projectRoot, 'assets/opencode-tui-30fps.js'),
    to: resolve(projectRoot, 'dist/assets/opencode-tui-30fps.js'),
  },
  {
    from: resolve(projectRoot, 'assets/opencode-tui-notify.js'),
    to: resolve(projectRoot, 'dist/assets/opencode-tui-notify.js'),
  },
  {
    from: resolve(projectRoot, 'assets/opencode-tui-config.json'),
    to: resolve(projectRoot, 'dist/assets/opencode-tui-config.json'),
  },
];

for (const asset of assets) {
  if (!existsSync(asset.from)) {
    throw new Error(`Missing server asset: ${asset.from}`);
  }

  mkdirSync(dirname(asset.to), { recursive: true });
  copyFileSync(asset.from, asset.to);
}
