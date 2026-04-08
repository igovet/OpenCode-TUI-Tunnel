import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

import { loadConfig } from '../src/config/index.js';

const config = loadConfig();
const apiHost = process.env.OPENCODE_HOST ?? config.server.host;
const apiPort = process.env.OPENCODE_PORT ?? String(config.server.port);

export default defineConfig({
  root: 'web',
  plugins: [svelte()],
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
  },
});
