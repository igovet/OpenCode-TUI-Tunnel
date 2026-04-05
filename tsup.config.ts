import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'cli/bin': 'src/cli/bin.ts',
    'server/index': 'src/server/index.ts',
  },
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  // Keep dist/web assets intact when server is rebuilt after web build.
  clean: false,
  sourcemap: true,
  splitting: false,
});
