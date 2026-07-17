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

## Changelog Maintenance

`CHANGELOG.md` at the project root documents all notable changes per release version using GitHub `<details>`/`<summary>` accordion blocks.

### When to update CHANGELOG.md

Update `CHANGELOG.md` when any of the following are implemented or fixed:

- New user-facing features (UI, UX, behavior)
- Bug fixes affecting end users
- Infrastructure changes that affect reliability or security (e.g., PID file race conditions, push notification fixes)
- Breaking changes or configuration changes

Minor changes (refactors, internal cleanup, documentation-only) do not require changelog entries.

### Format

Each version uses a `<details>`/`<summary>` accordion block:

```markdown
<details open>
<summary><strong>vX.Y.Z</strong> — YYYY-MM-DD</summary>

### Category Title

- Change description

</details>
```

Suggested categories: `🎯 Features`, `🔧 Bug Fixes`, `🎨 UI/UX`, `📡 Infrastructure`, `⚠️ Breaking Changes`.

### Who updates it

- **technical-writer** agent: responsible for changelog updates at version release time
- **During implementation**: backend-developer, frontend-developer, full-stack-developer agents should note changelog-worthy changes in their result files (in a `## Changelog Notes` section)
- **Orchestrator**: when closing a task, delegate a changelog update to technical-writer if the task introduced user-facing changes

### Adding a new version

When starting a new version cycle:

1. Add a new `<details open>` block at the top (before the previous version)
2. Change the previous version's `<details open>` to `<details>` (collapsed)
3. Fill in the date when the version is released

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
- UI primitive directory: `web/src/components/ui/` — 12 shared primitives (see below)
- Design-token system: `web/src/styles/theme.css` — 2026 palette (colors, typography, spacing, radius, shadows, motion, z-index)
- Vite aliases: `$lib` → `web/src/lib`, `$components` → `web/src/components`
- Key UI files:
  - `web/src/pages/SessionList.svelte` — dashboard (launch, tmux discovery, active sessions, recent projects rail)
  - `web/src/pages/WorkspaceView.svelte` — workspace shell (SessionTabs + TerminalGrid)
  - `web/src/components/TerminalGrid.svelte` — multi-terminal grid with draggable splitters, pagination indicator
  - `web/src/components/TerminalPane.svelte` — single pane with chrome header (title, status dot, SSH badge, zoom dropdown), xterm container
  - `web/src/components/SessionTabs.svelte` — glass pill tab bar with attention glow, icon-based close
  - `web/src/components/SshConnectionModal.svelte` — Dialog-based SSH connection create/edit, segment controls for auth/provider
  - `web/src/components/SettingsModal.svelte` — Dialog-based multi-section settings (Notifications/Appearance/Terminal/Keyboard)
  - `web/src/components/SshConnectionList.svelte` — glass card list with keyboard nav
  - `web/src/components/PathAutocomplete.svelte` — path input with ARIA combobox autocomplete
  - `web/src/components/InstallBanner.svelte` — PWA install CTA banner (SessionList mount point)
  - `web/src/components/MobileKeybar.svelte` — floating glass mobile keybar
  - `web/src/components/ToastProvider.svelte` — global toast portal (mounted in App.svelte)
- Removed legacy files: `web/src/components/LaunchForm.svelte`, `web/src/pages/Terminal.svelte`

### Design System (2026)

Visual language defined in `web/src/styles/theme.css` using CSS custom properties:

- **Dark dev-tool premium** palette: `--bg-base` `#05060a` (deep), `--bg-surface` `#0a0d12`, `--bg-elevated` `#11141b`, `--bg-overlay` `#181c26`, `--bg-terminal` `#080808`
- **Glassmorphism contract**: every glass surface uses `backdrop-filter: blur(12-20px)` + 1px `rgba(255,255,255,0.06)` border + inset top highlight. Applied to cards, panes, modals, toasts, dropdowns, keybar.
- **Typography**: Geist (UI/headings) + JetBrains Mono (terminal), loaded via `index.html` preconnect/preload (not CSS `@import`)
- **Zero hardcoded hex policy**: all component styles reference `var(--*)` tokens. The only acceptable hex literals are (1) `theme.css :root` definitions, (2) comments, (3) `terminal.ts` xterm ITheme JS literal (xterm API requires literal hex).

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
- Icon generator (`scripts/generate-icons.mjs`) creates all 4 icon variants: `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`, plus `apple-touch-icon.png`. The T logomark uses blue→cyan→green gradient on dark background.
- UI text hardcodes max session wording as `(8)`; may drift from config.
- **2 dead DB tables:** `app_state` and `reconnect_tokens` are created but never read/written.
- **1 dead config key:** `basePath` in `AppConfig` is defined but never consumed.
- **Passphrase migration is transparent:** `ssh_connections.passphrase` (plaintext, legacy) is migrated to `encrypted_passphrase` (AES-256-GCM) on first read — the first read after migration is a write operation.
- **SSHFS has no passphrase support:** only key-based auth works for SSHFS mounts.
- **Rate limiter is in-memory only:** SSH test rate limiter (5/min/IP) resets on server restart.
- **Zero test coverage:** no unit/integration tests exist for any feature. Only `test/cli-smoke.test.ts` (CLI help/version) and `test/e2e/basic.test.ts` (Playwright homepage load).

## CI/CD Facts (current workflow)

- CI uses Node 24.
- Release workflow runs on every push to `main` and on `workflow_dispatch`.
- `determine-release` currently forces release path (`should_release=true`).
- Release job deletes existing release/tag for current version before recreating.
- npm publish step skips only if version already exists on npm.
- `.github/documents/NPM_PUBLISHING_GUIDE.md` is stale vs current workflow.

## Runtime Requirements

- Node.js: `>=22.12.0`
- Required tools: `tmux`, `opencode`
- Native build support needed for modules like `better-sqlite3` and `node-pty`

## codebase-memory Project Name

When using `codebase-memory_*` tools, this project is named `home-igovet-.config-opencode`.
