import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadConfig } from '../src/config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const apiHost = process.env.OPENCODE_HOST ?? config.server.host;
const apiPort = process.env.OPENCODE_PORT ?? String(config.server.port);

export default defineConfig({
  root: 'web',
  plugins: [svelte()],
  resolve: {
    alias: {
      '$lib': path.resolve(__dirname, 'src', 'lib'),
      '$components': path.resolve(__dirname, 'src', 'components'),
    },
  },
  base: '/',
  server: {
    proxy: {
      '/api': {
        target: `http://${apiHost}:${apiPort}`,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
  },
});
