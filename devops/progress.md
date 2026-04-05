## Build Execution Report

### Command Run

- `npm run build`

### Build Output (verbatim)

```text
> @igovet/opencode-tui-tunnel@0.1.0 build
> npm run build:server && npm run build:web


> @igovet/opencode-tui-tunnel@0.1.0 build:server
> tsup

CLI Building entry: {"cli/bin":"src/cli/bin.ts","server/index":"src/server/index.ts"}
CLI Using tsconfig: tsconfig.json
CLI tsup v8.5.1
CLI Using tsup config: /home/igovet/Web_Projects/OpenCode-TUI-Tunnel/tsup.config.ts
CLI Target: node20
ESM Build start
ESM dist/server/index.js     31.01 KB
ESM dist/cli/bin.js          98.81 KB
ESM dist/server/index.js.map 63.53 KB
ESM dist/cli/bin.js.map      193.52 KB
ESM ⚡️ Build success in 22ms

> @igovet/opencode-tui-tunnel@0.1.0 build:web
> vite build --config web/vite.config.ts

vite v6.4.1 building for production...
transforming...
✓ 144 modules transformed.
rendering chunks...
computing gzip size...
../dist/web/index.html                   0.84 kB │ gzip:   0.38 kB
../dist/web/assets/index-BgHKhQLj.css   22.04 kB │ gzip:   5.50 kB
../dist/web/assets/index-hSDUK2re.js   450.70 kB │ gzip: 120.27 kB
✓ built in 869ms
```

### Errors / Warnings

- Errors: **None**
- Warnings: **None emitted by build tools**

### Final Status

- ✅ **Build completed successfully** for both:
  - `npm run build:server` (tsup)
  - `npm run build:web` (Vite)

### CI/CD and Deployment Impact

- No CI/CD configuration changes made.
- No deployment configuration changes made.

### Validation Notes

- Build exited successfully with all target artifacts produced under `dist/`.

### Operational Risks

- No immediate operational risk observed from this validation run.
