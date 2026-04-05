import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'cli/bin': 'src/cli/bin.ts',
    'server/index': 'src/server/index.ts',
  },
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
});
