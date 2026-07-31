# Changelog

All notable changes to this project are documented here.

---

<details open>
<summary><strong>v0.3.5</strong> — 2026-07-31</summary>

### 🎯 Features

- Standalone badge now visible in dashboard's Open Sessions section for v2 sessions
- Standalone mode flag persisted in database (survives server restart)

### 🔧 Bug Fixes

- Fixed standaloneByDefault setting not saving in SettingsModal — Toggle component now properly dispatches change events
- Fixed LaunchBar standalone toggle being overwritten by settings sync effect
- Fixed per-project standalone overrides not persisting across page reloads (now saved to localStorage)
- Fixed dead sessions causing browser hangs from infinite WebSocket reconnect loop (added max retry limit, close code 1000/1001 handling, proper `exited` flag in error/status handlers)
- Fixed WebGL terminals not re-rendering after tab drag, page switch, and sleep/wake cycles (added `fitAllManagersVisual()`, `tick()`-based DOM update waits, terminal.clear() on reconnect)
- Fixed terminals not reconnecting after page switch — `disconnect()` and `reconnectIfDisconnected()` no longer reset `hasConnectedOnce`
- Fixed native module build failure on Linux — `node-pty` and `better-sqlite3` now rebuild correctly

### 🎨 UI/UX

- "Connection lost" overlay now shows after max reconnect attempts (distinct from initial "Connection...")
- Terminal buffer clears on reconnect to remove stale "Session ended" messages

</details>

<details>
<summary><strong>v0.3.4</strong> — 2026-07-18</summary>

### 🔧 Bug Fixes

- Fixed standalone badge showing on new sessions when standalone was never explicitly enabled — changed `standaloneByDefault` default from `true` to `false` in settings
- Standalone badge no longer shows for v1 sessions — badge condition now checks `standaloneEnabled` prop, which is only true when opencode v2 is selected
- WebSocket reconnect now works during session initialization — if the connection drops before the server sends the `'ready'` message, the client retries up to 5 times with exponential backoff instead of immediately showing "Session ended"

### 📡 Infrastructure

- Added WebSocket auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, 16s) and max 5 retries — replaces old infinite immediate reconnect
- Added `'reconnecting'` status emit during backoff
- After 5 retries exhausted, shows "Session died (connection lost)" in yellow terminal text

</details>

<details>
<summary><strong>v0.3.3</strong> — 2026-07-17</summary>

### 🎯 Features

- Added opencode v2 (beta) support with configurable version selection (v1/v2)
- Added `opencodeVersion` config option (`'v1'` / `'v2'`, default `'v1'`)
- Added standalone mode support for opencode v2 sessions (`opencode2 --standalone`)
- Added Normal/Standalone toggle in LaunchBar when opencode v2 is selected
- Per-project standalone toggle in Projects section — each project can be launched in Normal or Standalone mode independently
- Added "Standalone" badge on session cards for standalone sessions
- Created V2-compatible TUI plugins (notify, 30fps) using `@opencode-ai/plugin/v2` API
- V2 plugins auto-deploy to `.opencode/plugins/` when launching V2 sessions
- Doctor command now checks for both `opencode` and `opencode2` in PATH
- Moved opencode version switcher from dashboard header to Settings → OpenCode section
- Added `standaloneByDefault` setting in Settings → OpenCode — when enabled, all new sessions launch in standalone mode by default

### 🔧 Bug Fixes

- Removed `configPathV1`/`configPathV2` settings — `OPENCODE_CONFIG` env var is not supported by opencode v2, config path customization removed entirely
- Fixed tab page switching: off-page terminal panes now sleep (disconnect) to save resources, on-page panes wake (connect) on page switch
- Fixed tab click within same page no longer causes unnecessary WebSocket reconnection
- Fixed PWA mobile reconnect: replaced exponential-backoff reconnect with immediate fresh connect when app is restored from minimized state
- Fixed desktop connection overlay not showing during fast WebSocket connections
- Fixed terminal flicker/jump during connection — overlay now stays until xterm.js has fully rendered content at final size
- Removed "Reconnection..." text — always shows "Connection..." since we always do a fresh connect
- Made connection overlay text big and pixelated in terminal style with pulsing animation
- Fixed terminal flicker/reconnect when clicking tabs within the same page — removed `refreshAllManagers()` calls from tab click handlers in SessionTabs, TerminalPane, and TerminalGrid
- Fixed main setup effect re-running on tab activation — extracted `isActive` logic to a separate effect so manager is not disposed on tab switch
- Fixed sleep effect re-running on unrelated state changes — added `prevSleep` guard to only act on actual sleep/wake transitions

### 🎨 UI/UX

- Dashboard header now shows opencode version (v1/v2) with beta/stable labels
- Expandable install instructions in dashboard header (compact info button)
- Standalone mode toggle in LaunchBar (visible only for V2)
- "Standalone" warning badge on session rows
- Per-project standalone toggle switch in Projects section (visible when opencode v2 is selected)
- Connection overlay now shows big pixelated "CONNECTION..." text (24px monospace, uppercase, pulsing)
- Connection overlay stays visible until terminal finishes rendering at final size (500ms debounce after last write, 3s fallback)
- Added "Standalone by default" toggle in Settings → OpenCode section
- Session rows now display in two-line layout on mobile (title on top, controls on bottom)

### 📡 Infrastructure

- Updated `POST /api/sessions` to accept optional `opencodeVersion` and `standalone` fields
- Updated build script to bundle V2 plugins to `dist/assets/opencode2-plugins/`
- All terminal panes now stay mounted in DOM across page switches (off-page panes hidden via CSS, not destroyed)
- Switched from Canvas renderer (`@xterm/addon-canvas`) to WebGL renderer (`@xterm/addon-webgl`) as primary renderer for GPU-accelerated rendering with solid box-drawing lines
- Removed dead CanvasAddon DPI resize trick (cols+1 resize workaround) from TerminalPane — WebGL handles DPR correctly natively
- Removed DOM renderer CSS rules (`.xterm-rows`, `.xterm-row`) from xterm-global.css — these elements only exist in the DOM renderer fallback
- Removed `configPathV1`/`configPathV2` from backend config, session launch, and API

### 📚 Documentation

- Added opencode v2 installation section to README
- Updated install instructions with correct npm package names (`opencode-ai` for v1, `@opencode-ai/cli@next` for v2)

</details>

<details>
<summary><strong>v0.3.2</strong> — 2026-07-12</summary>

### 🎯 Features

- Switched from WebGL renderer to Canvas renderer (`@xterm/addon-canvas`) for reliable terminal rendering
- Added font-loading guard (`document.fonts.ready`) to prevent rendering artifacts from fallback fonts
- Added service worker cache versioning for proper cache invalidation on rebuild

### 🔧 Bug Fixes

- Fixed GPU rendering freezes when switching between or closing terminal sessions
- Fixed rendering corruption on page load caused by premature WebGL atlas initialization
- Fixed ResizeObserver crash when terminal pane is disposed during async initialization
- Fixed page-switch freeze caused by CanvasAddon dispose order race condition
- Fixed `scrollToBottom()` crash on partially-disposed terminals during page switch
- Fixed terminal font measurement mismatch (textarea used `monospace` instead of `JetBrains Mono`)
- Fixed `refreshAllManagers()` destroying WebGL texture atlases for all terminals during initialization
- Fixed daemon serving stale build from global npm package instead of local project

</details>

<details>
<summary><strong>v0.3.1</strong> — 2026-07-09</summary>

### 🎯 Features

- **Dynamic xterm.js import** — xterm.js core is now dynamically imported, reducing the main JavaScript bundle from 532 KB to 164 KB (69% reduction). The xterm core (~368 KB) is loaded only when a terminal pane is first mounted.
- **Baseline test infrastructure** — Added CLI smoke test (`--help`, `--version`, `doctor`) using Node.js built-in `node:test`, and Playwright e2e configuration.
- **Reduced default scrollback** — Default scrollback buffer reduced from 3000 to 1000 lines for better memory efficiency.

### 🔧 Bug Fixes

- **Removed Ctrl+→/Ctrl+← shortcuts** — These keyboard shortcuts interfered with built-in terminal cursor word-jump functions.
- **Fixed ESLint crash** — Resolved `@typescript-eslint` incompatibility with TypeScript 7 by downgrading to TypeScript 5.9.3.
- **Fixed `pruneOldSessions` column name** — Corrected column reference from `created_at` to `started_at`.
- **Added pruning interval cleanup** — `stopServer()` now properly cleans up the session pruning interval.

### 🎨 UI/UX

- **All Svelte a11y warnings resolved** — 10 warnings across 7 components eliminated.
- **All lightningcss `:global` warnings eliminated** — xterm CSS extracted to a separate file to remove `:global` warnings.
- **Escape key dialog dismissal** — Added keyboard handler to dialog overlay for Escape key dismissal.
- **Explicit Svelte config** — Created `web/svelte.config.js` to eliminate "no Svelte config found" message.

### 📡 Infrastructure

- **Bumped minimum Node.js** — Minimum Node.js version updated from `>=20.0.0` to `>=22.12.0`.
- **Dependency updates** — Updated all dependencies to latest versions (32 packages: commander@15, concurrently@10, sharp@0.35, @types/node@26, typescript@5.9, and 14 minor bumps).
- **Removed unused `sharp` dependency** — `sharp` was never imported by any source file.
- **Vite chunk size warning** — Added `chunkSizeWarningLimit: 600` to Vite config to accommodate xterm bundle size.
- **Session and event pruning** — Exited sessions older than 24h are automatically deleted.
- **WebSocket backpressure buffer** — Added 64KB ring buffer to prevent data loss during WebSocket backpressure.
- **SSH rate-limiter cleanup** — Added Map cleanup to prevent unbounded memory growth.
- **Sessions Map cleanup fix** — Fixed sessions Map cleanup on session termination.

</details>

<details>
<summary><strong>v0.3.0</strong> — 2026-07-01</summary>

### 🎯 Features

- **Multi-terminal grid with draggable splitters** — `TerminalGrid.svelte` now supports resizable panes via Pointer Events (`setPointerCapture`/`releasePointerCapture`), sum-preserving redistribute with 15% floor. Active pane focus moves with `Ctrl/Cmd+ArrowLeft/Right`.
- **Full 2026 design system** — "dark dev-tool premium" visual language with deep `--bg-base` `#05060a`, glassmorphism surfaces (`backdrop-filter: blur(12-20px)` + 1px border), Geist (UI) + JetBrains Mono (terminal) typography, and soft radius contrast (4px/6px/8px on cards, 0px on terminal panes).
- **12 reusable UI primitives** — `Button` (4 variants), `Card` (glass/solid), `Dialog` (focus-trap), `Icon` (curated SVG), `Input`, `Select`, `Toggle`, `Tooltip`, `Badge`, `StatusDot`, `Toast`, `ToastProvider` — all using `var(--*)` tokens with zero hardcoded hex.
- **Global toast notification system** — `ToastProvider.svelte` mounted globally in `App.svelte`, driven by `toastStore.svelte.ts`. Auto-dismiss 5s, pause on hover, swipe on mobile, `aria-live="polite"`/`role="status"`.
- **PWA install CTA banner** — `InstallBanner.svelte` on `SessionList` consumes the stashed `beforeinstallprompt` event. Shows glass Card with "Install" button; iOS variant displays "Add to Home Screen" instructions. Dismissal persisted in localStorage.
- **PWA update toast with reload action** — Service Worker `updatefound` now surfaces a sticky `info`-type toast with "Reload" action calling `window.location.reload()`.
- **API error → toast bridge** — every API function in `web/src/lib/api.ts` that throws on non-ok now fires a fire-and-forget error toast. Callers with inline error UI can wrap calls in `withSilentApiErrors(() => ...)` to suppress duplicates.
- **Multi-section Settings** — `SettingsModal.svelte` expanded to 4 sections (Notifications, Appearance, Terminal, Keyboard) on a left nav rail with `Dialog` focus-trap. New settings fields: `reduceMotion`, `uiFontSize`, `terminalFontSize`, `scrollback`.
- **SshConnectionModal on Dialog primitive** — redesigned with `Dialog` (focus-trap, return-focus, Escape/Backdrop close), segment controls for auth-type (Key/Agent) and provider (Server/Local), `Badge` test-status pill, and zero hardcoded hex.

### 🎨 UI/UX

- **SessionList dashboard glass redesign** — header with logo mark + title, pill env-tabs (LOCAL/SSH), glass Card hero launch panel, adaptive session-card grid (`minmax(280px, 1fr)`), glass recent-projects rail.
- **SessionCard glass restyle** — migrated to `Card` (glass variant) + `StatusDot` + `Badge` primitives; emoji replaced with SVG icons; zero hardcoded hex.
- **SessionTabs glass pill tabs** — active tab shows gradient top-border + `Badge` attention glow; inactive tabs use ghost style; icon-based close button.
- **TerminalPane chrome redesign** — slim 28px header overlay with pane title, status dot / attention icon, SSH `Badge`, and zoom glass dropdown. Active pane gets gradient top-bar + blue glow ring; inactive pane chrome dims to 72% while xterm canvas stays full opacity.
- **TerminalGrid glass restyle** — glass-bordered container, accent-blue splitter hover/drag affordance, visible pagination indicator (dots + arrows + page counter).
- **SshConnectionList glass restyle** — glass Card per connection with `Icon` actions, keyboard navigation (roving tabindex), zero hardcoded hex.
- **PathAutocomplete glass restyle** — glass dropdown with loading spinner; ARIA combobox semantics added for screen-reader support.
- **MobileKeybar tokenized** — glass surface with `color-mix` instead of raw `rgba`, 44px touch targets, reduced-transparency and reduced-motion fallbacks.
- **Accessibility pass** — skip-link as first focusable element in `App.svelte`; focus-trap in all Dialog-based modals; `Ctrl/Cmd+Arrow` capture-phase keyboard nav in TerminalGrid; `--text-muted` raised to `#787f90` for WCAG AA 4.5:1 on dark surfaces; global `prefers-reduced-motion: reduce` rule resets hover/active transforms.

### 🔧 Bug Fixes

- **Filter chips and hero recent-project cards now render correctly** — `web/src/pages/SessionList.svelte` fixed `$derived<T>(() => {...})` → `$derived.by<T>(() => {...})` for `filterOptions` and `heroProjects` (incorrect Svelte 5 syntax returned function object instead of array).
- **"Open" button on running sessions now switches to workspace** — `openActive` in `web/src/pages/SessionList.svelte` now creates a workspace tab when none exists (was calling `activateTab` only, which requires an existing tab).
- **Active tab accent line moved to bottom** — `web/src/components/SessionTabs.svelte` changed `box-shadow` inset y-offset from `-2px` (top) to `2px` (bottom) per concept spec §2.2.

### 📡 Infrastructure

- **`theme.css` 2026 token system** — complete rewrite with backgrounds, borders, text, accents, gradients, glows, shadows, font sizes/weights/line-heights, spacing (0.125–3rem), radius, motion durations/easings, breakpoints, and z-index layers.
- **Font loading migrated** — Google Fonts (Geist + JetBrains Mono) moved from blocking CSS `@import` in `theme.css` to non-blocking `<link rel="preconnect">` + `<link rel="preload">` + `<link rel="stylesheet">` in `web/index.html`.
- **Manifest `theme_color` reconciled** — manifest `theme_color` and `<meta name="theme-color">` unified to `#05060a` (2026 base).
- **Icon set regenerated** — `scripts/generate-icons.mjs` now draws a T logomark with blue→cyan→green gradient on dark background; all 4 PNG sizes + `apple-touch-icon.png` regenerated; `favicon.svg` and `logo.svg` updated to match.

### ⚠️ Breaking Changes

- **Legacy `LaunchForm.svelte` and `Terminal.svelte` removed** — both were unreferenced by active routing (`App.svelte` uses `SessionList`/`WorkspaceView` only). No functional impact.
- **Hardcoded hex policy enforced** — zero ad-hoc hex literals in active component styles. All colors/spacing/typography must reference `var(--*)` tokens from `theme.css :root`. Acceptable hex categories: (1) `theme.css` definitions, (2) comments, (3) `terminal.ts` xterm ITheme JS literal.

</details>

<details>
<summary><strong>v0.2.2</strong> — 2026-05-30</summary>

### 🔧 Bug Fixes

- **Desktop environment variables in tmux sessions** — tmux adapter now passes DESKTOP_SESSION, XDG_CURRENT_DESKTOP, XDG_SESSION_TYPE, DISPLAY, WAYLAND_DISPLAY, and SSH_CONNECTION to spawned sessions for proper clipboard and GUI integration

### 🔧 Bug Fixes (continued from v0.2.1)

- **UTF-8 encoding fix in OSC 52 clipboard handler** — clipboard copy operations now correctly handle UTF-8 text encoding

### 🎯 Features

- **Project history delete button** — Users can now remove individual entries from the Recent Projects list by clicking the × button next to each entry
- **Recent projects 2-week filtering** — The Recent Projects panel now only shows projects used within the last 14 days, keeping the list relevant and uncluttered

### 🎨 UI/UX

- **Tmux session discovery reordering** — [TMUX_DISCOVERY] section now appears before [ACTIVE_SESSIONS] in the local tab for better workflow

### 📡 Infrastructure

- **Tmux session database association check** — Local tmux session discovery now correctly filters based on database association rather than `oct-*` prefix. Sessions with DB records in any status (including exited) are no longer shown as discoverable local sessions

</details>

<details>
<summary><strong>v0.2.1</strong> — 2026-05-29</summary>

### 🎯 Features

- **Remote tmux session discovery and attach** — SSH tab now shows all running tmux sessions on the remote server, not just ones launched by this app. Users can attach to any existing tmux session directly from the "REMOTE TMUX DISCOVERY" panel.
- **Added `@xterm/addon-clipboard` for OSC 52 clipboard support** — copy operations in opencode TUI now work correctly

### 🔧 Bug Fixes

- **Clipboard copy in SSH mode (multi-part fix).** Fixed text selection and copying in SSH sessions through three coordinated changes:
  - **Backend:** Server now unconditionally strips xterm mouse tracking sequences (`\x1b[?1003h`/`\x1b[?1003l`) for ALL sessions (local and SSH) to fix xterm.js selection returning 0 with DECSET 1003. Native browser text selection and copy work for all session types; TUI hover effects are disabled.

  - **Frontend:** Replaced `terminal.hasSelection()` with `terminal.getSelection()` in copy handlers. When xterm.js mouse tracking mode (DECSET 1003) is active, `hasSelection()` incorrectly returns `false` even when text is selected, causing the copy handler to skip writing to clipboard.

  - **Frontend (final fix):** Replaced the deprecated `document.execCommand('copy')` in the keyboard copy handler with `navigator.clipboard.writeText()`. The fix also removes `event.preventDefault()` to allow the native copy event to fire, enabling the existing `handleCopyEvent` synchronous fallback via `clipboardData.setData()`.

  - **Copy-on-select:** Added `navigator.clipboard.writeText()` to the `onSelectionChange` handler in `TerminalManager`. Mouse-selected text in SSH TUI sessions is now immediately copied to the browser's local clipboard, bypassing the limitation where xterm.js mouse tracking mode (DECSET 1003) defers copy to the remote host program.

  - **Clipboard copy robustness (final fix):** Complete rewrite of clipboard handling with a robust three-strategy cascading fallback system (`clipboardData.setData()` → `document.execCommand('copy')` with hidden textarea → `navigator.clipboard.writeText()`). Added `mouseup` listener for copy-on-select to avoid flooding the clipboard API during drag selection. Replaced `onSelectionChange` clipboard write with `mouseup` for stronger, more stable user gesture context. Added debug logging to help diagnose clipboard issues in production.

  - **SSH tmux session name quoting:** Fixed proper quoting and escaping for tmux session names in `attachRemotePty`. Session names containing spaces, `$`, backticks, or other shell metacharacters are now safely passed to tmux by wrapping in double quotes and escaping embedded double quotes.

  - **Remote tmux auto-refresh removed:** Removed 15-second auto-refresh interval for remote tmux session discovery. Users must now manually click the reload button (↻) to refresh remote tmux sessions.

  - **Mouse tracking sequence stripping removed:** Removed server-side mouse tracking sequence stripping that was breaking mouse event forwarding in opencode TUI. The server was only partially stripping mouse sequences (`\x1b[?1003h`), leaving others (`\x1b[?1000h`, `\x1b[?1002h`, `\x1b[?1006h`) that put xterm.js into an inconsistent mouse mode state.

### 🎨 UI/UX

- **TMUX_DISCOVERY panel repositioned** to the left column (main-col) in the SSH tab, appearing after the launch panel. Panel renamed from `[ REMOTE TMUX SESSIONS ]` to `[ TMUX_DISCOVERY ]` for consistency.
- **Remote session polling** now uses a dedicated 15-second interval (vs. 3 seconds for local sessions) to reduce server load.
- **All SSH connections** now display their tmux sessions simultaneously, grouped by connection name.
- **Reload button** (↻) added to TMUX_DISCOVERY panel for manual session refresh.

- **Touch scrolling on mobile devices:** Fixed touch scrolling from mobile devices not working in terminal by changing WheelEvent dispatch target to xterm viewport and CSS `touch-action` from `pan-y` to `none`.

</details>

<details>
<summary><strong>v0.2.0</strong> — 2026-05-28</summary>

### 🎯 Features

- **SSH remote connection support** — manage and launch terminal sessions on remote servers via SSH
- **Environment switcher** on main page (Local / SSH tabs)
- **SSH key-based and agent-based authentication** for remote connections
- **Visual distinction** for SSH sessions in session list and workspace tabs
- **Project history** now shows source (local or SSH connection)

### 📡 Infrastructure

- New `ssh2` dependency for SSH connectivity
- Database schema extended with `ssh_connections` table

### 🔒 Security

- **SSH key passphrases now encrypted at rest** using AES-256-GCM with machine-specific key
- **Rate limiting** on SSH connection test endpoint (5 requests/minute per IP)

### 🔧 Bug Fixes

- **Workspace tabs now correctly persist SSH context** across page reloads

### Features

- SSHFS support — mount remote directories locally and run opencode against them
- Per-SSH-connection opencode provider switcher (Server / Local via SSHFS)
- Custom opencode command per SSH connection for server mode (e.g., `npx opencode`)
- SSHFS availability detection with platform-aware English install instructions
- Doctor command now checks for sshfs availability
- Mount lifecycle hardening — stale mount cleanup on startup, active mount cleanup on shutdown

### UI

- Provider mode toggle in SSH connection modal (Server / Local SSHFS)
- SSHFS availability banner with install instructions on SSH tab
- Provider mode badges on session cards ("🌐 Server" / "📁 Local (SSHFS)")

### Bug Fixes

- `GET /api/ssh/connections` now returns camelCase property names (consistent with other endpoints)

</details>

<details>
<summary><strong>v0.1.9</strong> — 2026-05-13</summary>

### 🔧 Bug Fixes

- **Terminal kill/close error handling**: When closing or killing a terminal tab, if the tmux session has already crashed or doesn't exist, the operation now gracefully handles the error instead of throwing. Tabs can be closed even for broken/crashed terminals.
- **Autostart clipboard fix**: The `autostart` command now captures the full user environment (DISPLAY, WAYLAND_DISPLAY, XDG_SESSION_TYPE, etc.) instead of only PATH. This fixes clipboard (copy/paste) functionality in opencode when launched via autostart.
- **Security and robustness hardening**: Service file permissions changed from 644 to 600 (owner-only) to protect environment variables in the service definition. Error logging added to terminal kill catch blocks. Newline escaping added to systemd environment values.

</details>

<details>
<summary><strong>v0.1.8</strong> — 2026-04-13</summary>

### 🎯 Adaptive Mobile Keybar (complete rebuild)

- Redesigned mobile keybar with 10-button layout: keyboard toggle (⌨), newline (↵), Ctrl+ dropdown, arrow pad, Home, End, Tab, Esc, Paste, Enter
- Ctrl+ submenu: expands inline in the scroll area; buttons: Back ←, Ctrl (awaits key), Ctrl+P, Ctrl+X, Ctrl+C
- Arrow pad: floating overlay above the keybar, persists until toggled off by pressing the arrows button again
- Ctrl+X: sends `\x18` immediately and opens keyboard
- All 18 interactive controls have 30ms haptic feedback
- Keyboard state sync: `visualViewport` as authoritative source + textarea focus/blur as provisional re-sync
- Mobile detection: shared `device.ts` with `isMobileTouchViewport()` / `observeMobileTouchViewport()`
- Ctrl character capture via `TerminalManager` input transform (works with iOS soft keyboard)
- Home/End: send terminal escape sequences (`\x1b[H` / `\x1b[F`)

### 🔄 Auto-scroll

- Terminal auto-scrolls to latest output after send/reply (`pinnedToBottom` mechanism)
- Scroll-to-bottom pin releases when user manually scrolls up
- Works on both mobile and desktop
- Keyboard open/close no longer disrupts scroll position

### 📡 PWA Background & Push Notifications

- WebSocket reconnects instantly on app foreground (visibilitychange / pageshow / focus)
- Connection status overlay in terminal pane ("Connection..." / "Reconnection...")
- VAPID Web Push notifications: server auto-generates keys on startup, no configuration needed
- Generated VAPID keys are stored in app config with restrictive file permissions (`0600`)
- Added push subscription API routes: `GET /api/push/vapid-public-key`, `POST /api/push/subscribe`, `DELETE /api/push/unsubscribe`
- Push subscriptions stored in SQLite; stale subscriptions auto-cleaned
- Settings toggle now derives state from actual push subscription (not just localStorage flag)
- Auto-subscribe on app open: if notifications are enabled in settings but subscription is missing, re-subscribes automatically
- Push titles now include project context (derived from session/project workdir basename when not explicitly provided)
- Push is suppressed when the same session already has active WebSocket viewers
- Notifications dispatched for: permission requests, questions, dialog completion

### 🔧 Bug Fixes

- **PID file race condition**: concurrent server starts no longer delete each other's PID/runtime files (`clearRuntimeStateFiles()` is now ownership-aware)
- **PWA tab mismatch**: after app reopen, terminal tab bar now correctly shows the active session tab (fixed `workspacePage` sync with `activeTabId`)
- **Mobile Enter behavior**: pressing Enter on the soft keyboard now closes the mobile keyboard while preserving Enter delivery to the terminal
- **Keyboard toggle regression**: fixed active-terminal registration after async `open()` in TerminalPane (post-task-065 regression)
- **Push subscription state**: notifications toggle no longer defaults to "enabled" without a real subscription; derived from actual `pushManager.getSubscription()`

### 🎨 Mobile UI

- Keyboard toggle (⌨) and newline (↵) buttons are left-pinned with distinct original color themes (blue/green)
- Command buttons section is horizontally scrollable with scroll-activated gradient fades on both edges
- Restored original button visual style from pre-rebuild

</details>

<details>
<summary><strong>v0.1.7</strong> and earlier</summary>

See git history for previous changes.

</details>
