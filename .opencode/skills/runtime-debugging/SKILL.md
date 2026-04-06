---
name: runtime-debugging
description: Diagnose runtime, autostart, PATH, and terminal-stream issues in OpenCode-TUI-Tunnel
---

## Use This Skill

Put this line at the top of your prompt:

`@runtime-debugging`

Then describe the runtime symptom (startup failure, dead session stream, autostart issue, update skip, etc.).

## Runtime State Map (Outside Repo)

OpenCode-TUI-Tunnel stores runtime files under:

`~/.config/opencode-tui-tunnel/`

Key files:

- `config.json` — user config
- `sessions.db` — SQLite session/history DB
- `runtime.json` — structured runtime record (pid/url/mode/version)
- `server.pid` — PID fallback record
- `logs/daemon.log` — daemon stdout/stderr log

## First-Line Debug Commands

```bash
opencode-tui-tunnel status
opencode-tui-tunnel doctor
opencode-tui-tunnel config path
opencode-tui-tunnel sessions list --json
```

When `status` reports stopped unexpectedly, inspect `runtime.json`, `server.pid`, and `logs/daemon.log`.

## PATH and Autostart Pitfalls

Two PATH behaviors are easy to miss:

1. `autostart on` captures the **current shell PATH** and writes it into the service definition.
2. tmux adapter appends common system directories (`/usr/local/bin`, `/usr/bin`, etc.) before invoking `tmux`.

If commands work in your shell but fail under autostart service, re-run:

```bash
opencode-tui-tunnel autostart off
opencode-tui-tunnel autostart on
```

from a shell where PATH is correct.

## Platform-Specific Autostart

Supported platforms:

- Linux: user `systemd` service
- macOS: user `LaunchAgent`

Not supported: Windows.

Reference service definitions:

- Linux: `~/.config/systemd/user/opencode-tui-tunnel.service`
- macOS: `~/Library/LaunchAgents/com.igovet.opencode-tui-tunnel.plist`

Useful platform checks:

```bash
# Linux
systemctl --user status opencode-tui-tunnel
journalctl --user -u opencode-tui-tunnel --since "1 hour ago"

# macOS
launchctl print "gui/$(id -u)/com.igovet.opencode-tui-tunnel"
```

## Auto-Update Limitations

Auto-update is only supported when install context is writable **global npm**.

Common skip contexts:

- `npx` execution
- local repository/dev execution
- npm global prefix not writable

Update worker performs:

```bash
npm install -g @igovet/opencode-tui-tunnel@<target-version>
```

If update appears skipped, inspect current install mode before debugging network issues.

## Terminal Stream Quirks

Server-side stream handling intentionally:

- strips `\x1b[?1003h` / `\x1b[?1003l` from PTY output (reduces xterm hover flicker)
- applies WebSocket backpressure control
- may drop stale PTY frames while socket buffer drains

Implication: some “missing output” reports are often transient backpressure behavior, not process death.

## Debugging Playbook

1. Run `doctor` and `status`.
2. Confirm runtime files exist and PID is alive.
3. Check `daemon.log` for startup errors.
4. Verify `tmux` and `opencode` are available in effective PATH.
5. Validate autostart mode/platform assumptions.
6. For stream issues, correlate client reconnect behavior with server stream logs and backpressure conditions.
