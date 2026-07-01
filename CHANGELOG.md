# Changelog

All notable changes to this project are documented here.

---

<details open>
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
