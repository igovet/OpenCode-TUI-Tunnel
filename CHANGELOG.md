# Changelog

All notable changes to this project are documented here.

---

<details open>
<summary><strong>v0.2.1</strong> — 2026-05-29</summary>

### 🎯 Features

- **Remote tmux session discovery and attach** — SSH tab now shows all running tmux sessions on the remote server, not just ones launched by this app. Users can attach to any existing tmux session directly from the "REMOTE TMUX DISCOVERY" panel.

### 🔧 Bug Fixes

- **Clipboard copy in SSH mode (multi-part fix).** Fixed text selection and copying in SSH sessions through three coordinated changes:

  - **Backend:** Server now unconditionally strips xterm mouse tracking sequences (`\x1b[?1003h`/`\x1b[?1003l`) for ALL sessions (local and SSH) to fix xterm.js selection returning 0 with DECSET 1003. Native browser text selection and copy work for all session types; TUI hover effects are disabled.

  - **Frontend:** Replaced `terminal.hasSelection()` with `terminal.getSelection()` in copy handlers. When xterm.js mouse tracking mode (DECSET 1003) is active, `hasSelection()` incorrectly returns `false` even when text is selected, causing the copy handler to skip writing to clipboard.

  - **Frontend (final fix):** Replaced the deprecated `document.execCommand('copy')` in the keyboard copy handler with `navigator.clipboard.writeText()`. The fix also removes `event.preventDefault()` to allow the native copy event to fire, enabling the existing `handleCopyEvent` synchronous fallback via `clipboardData.setData()`.

  - **Copy-on-select:** Added `navigator.clipboard.writeText()` to the `onSelectionChange` handler in `TerminalManager`. Mouse-selected text in SSH TUI sessions is now immediately copied to the browser's local clipboard, bypassing the limitation where xterm.js mouse tracking mode (DECSET 1003) defers copy to the remote host program.

  - **Clipboard copy robustness (final fix):** Complete rewrite of clipboard handling with a robust three-strategy cascading fallback system (`clipboardData.setData()` → `document.execCommand('copy')` with hidden textarea → `navigator.clipboard.writeText()`). Added `mouseup` listener for copy-on-select to avoid flooding the clipboard API during drag selection. Replaced `onSelectionChange` clipboard write with `mouseup` for stronger, more stable user gesture context. Added debug logging to help diagnose clipboard issues in production.

  - **SSH tmux session name quoting:** Fixed proper quoting and escaping for tmux session names in `attachRemotePty`. Session names containing spaces, `$`, backticks, or other shell metacharacters are now safely passed to tmux by wrapping in double quotes and escaping embedded double quotes.

  - **Remote tmux auto-refresh removed:** Removed 15-second auto-refresh interval for remote tmux session discovery. Users must now manually click the reload button (↻) to refresh remote tmux sessions.

### 🎨 UI/UX

- **TMUX_DISCOVERY panel repositioned** to the left column (main-col) in the SSH tab, appearing after the launch panel. Panel renamed from `[ REMOTE TMUX SESSIONS ]` to `[ TMUX_DISCOVERY ]` for consistency.
- **Remote session polling** now uses a dedicated 15-second interval (vs. 3 seconds for local sessions) to reduce server load.
- **All SSH connections** now display their tmux sessions simultaneously, grouped by connection name.
- **Reload button** (↻) added to TMUX_DISCOVERY panel for manual session refresh.

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
