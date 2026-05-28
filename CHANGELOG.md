# Changelog

All notable changes to this project are documented here.

---

<details open>
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
