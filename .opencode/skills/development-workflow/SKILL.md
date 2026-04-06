---
name: development-workflow
description: Build, dev-server, and verification workflow for OpenCode-TUI-Tunnel changes
---

## Use This Skill

Put this line at the top of your prompt:

`@development-workflow`

Then describe the change you need to make.

## Build Sequence and Why It Matters

Use repository scripts from `package.json` as the source of truth.

```bash
npm run build
```

`npm run build` runs:

1. `npm run build:server` (`tsup`)
2. `npm run build:web` (`vite build --config web/vite.config.ts`)

Important repo quirk:

- `tsup.config.ts` sets `clean: false`, so rebuilding server output does **not** wipe `dist/web`.

Use focused builds when possible:

- Backend-only work: `npm run build:server`
- Frontend-only work: `npm run build:web`
- Cross-cutting changes: `npm run build`

## Development Server Setup

Primary local workflows:

```bash
# Full local development (server + web)
npm run dev

# Server pipeline only (prebuild + watch)
npm run dev:server

# Frontend dev server only
npm run dev:web
```

Behavior to remember:

- `dev:server` performs one-time `build:web` + `build:server`, then watches server build + starts server.
- Vite proxies `/api` and WebSocket traffic to `http://127.0.0.1:4096`.
- Backend default bind is `127.0.0.1:4096`.
- Vite uses its default port behavior (commonly `5173` if free).

## Verification Strategy (No Test Suite)

This repository currently has no dedicated test suite. Prefer build/lint verification:

```bash
npm run build:server
npm run build:web
npm run lint
```

CI runs `npm test --if-present`, which is currently a no-op.

## Runtime Sanity Check

After build, verify runtime prerequisites and packaged assets:

```bash
node dist/cli/bin.js doctor
# or, if installed globally:
opencode-tui-tunnel doctor
```

`doctor` checks include:

- Node major version (>=20)
- `tmux` availability
- `opencode` command in `PATH`
- config directory writability
- `dist/web/index.html` presence

## Common Pitfalls

1. **Assuming tests catch regressions**
   - They currently do not. Always run build + lint and do targeted runtime checks.

2. **Breaking frontend availability during server iterations**
   - Keep `tsup clean: false` behavior in mind. If you alter build tooling, ensure `dist/web` is preserved as expected.

3. **Port/proxy mismatch confusion**
   - Frontend requests rely on Vite `/api` + WS proxy to backend at `127.0.0.1:4096`.

4. **Missing required binaries**
   - `tmux` and `opencode` must exist in runtime environment for real usage.

5. **Assuming static assets are generated dynamically**
   - PWA artifacts are static files in `web/public`.
