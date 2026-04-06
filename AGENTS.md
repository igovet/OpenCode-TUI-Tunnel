# AGENTS.md

## Project Snapshot

- Single-package TypeScript repo for a browser-accessible tunnel to `opencode` TUI sessions.
- Backend: Node.js ESM, Fastify 5, `better-sqlite3`, `node-pty`, tmux CLI.
- Frontend: Svelte 5 (runes), Vite 8, xterm 6.
- npm publish includes `dist/` only (not `src/` or `web/`).

## Commands (source of truth: `package.json`)

- Install: `npm ci` (CI) or `npm install`
- Build all: `npm run build` (`build:server && build:web`)
- Build server: `npm run build:server`
- Build web: `npm run build:web`
- Dev all: `npm run dev`
- Dev server pipeline: `npm run dev:server`
- Dev web: `npm run dev:web`
- Lint: `npm run lint`
- Format: `npm run format`
- Generate icons: `npm run generate-icons`

## Build/Dev Workflow Quirks

- `tsup.config.ts` uses `clean: false` so server rebuilds do not wipe `dist/web`.
- `dev:server` does one-time web+server builds, then watches both.
- Vite dev server proxies `/api` and WebSocket traffic to `http://127.0.0.1:4096`.
- Backend default bind: `127.0.0.1:4096`.
- Vite uses default port behavior (typically `5173` unless occupied).

## Testing Reality

- No test suite exists (no `*.test.*` / `*.spec.*`, no Jest/Vitest/Playwright config).
- CI runs `npm test --if-present`; currently this is a no-op.
- Use focused verification:
  - `npm run build:server` for backend changes
  - `npm run build:web` for frontend changes
  - `npm run lint` for repo-wide checks
- Runtime sanity check after build:
  - `node dist/cli/bin.js doctor`
  - or `opencode-tui-tunnel doctor`

## Architecture Map

- CLI entry: `src/cli/bin.ts` (published bin: `opencode-tui-tunnel`)
- Server entry: `src/server/index.ts` (Fastify + WS + SPA/static serving)
- Session orchestration: `src/session/index.ts` (`SessionSupervisor`, tmux-backed)
- Frontend entry: `web/src/main.ts` → `App.svelte`
- Key UI files:
  - `web/src/pages/SessionList.svelte` (launch/list)
  - `web/src/pages/WorkspaceView.svelte` + `web/src/components/TerminalPane.svelte`

## Runtime State (outside repo)

- Config: `~/.config/opencode-tui-tunnel/config.json`
- Database: `~/.config/opencode-tui-tunnel/sessions.db`
- Runtime record: `~/.config/opencode-tui-tunnel/runtime.json`
- PID file: `~/.config/opencode-tui-tunnel/server.pid`
- Logs: `~/.config/opencode-tui-tunnel/logs/daemon.log`

## Platform-Specific Behavior

- Autostart support: Linux (systemd user) and macOS (LaunchAgent) only.
- Linux service file: `~/.config/systemd/user/opencode-tui-tunnel.service`
- macOS agent file: `~/Library/LaunchAgents/com.igovet.opencode-tui-tunnel.plist`
- Auto-update works only for writable global npm installs; skipped for `npx` and local-dev.

## High-Signal Gotchas

- Frontend uses Svelte 5 runes (`$state`, `$effect`, `$props`, `$derived`), not legacy syntax.
- Service/PATH behavior matters: autostart captures current PATH; tmux adapter appends common system dirs.
- Server strips `\x1b[?1003h` / `\x1b[?1003l` to reduce xterm hover flicker.
- PWA files are static (`web/public/manifest.webmanifest`, `web/public/sw.js`), not plugin-generated.
- Icon generator does **not** create `icon-maskable-192.png` (still referenced by manifest).
- UI text hardcodes max session wording as `(8)`; may drift from config.

## CI/CD Facts (current workflow)

- CI uses Node 24.
- Release workflow runs on every push to `main` and on `workflow_dispatch`.
- `determine-release` currently forces release path (`should_release=true`).
- Release job deletes existing release/tag for current version before recreating.
- npm publish step skips only if version already exists on npm.
- `.github/documents/NPM_PUBLISHING_GUIDE.md` is stale vs current workflow.

## Runtime Requirements

- Node.js: `>=20.0.0`
- Required tools: `tmux`, `opencode`
- Native build support needed for modules like `better-sqlite3` and `node-pty`
