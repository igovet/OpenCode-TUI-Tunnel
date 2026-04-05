# opencode-tui-tunnel

Access your `opencode` TUI sessions from any browser — desktop or mobile.

## Requirements

- Node.js >= 20
- tmux
- opencode

## Installation

```bash
npm install -g opencode-tui-tunnel
```

Or run directly:

```bash
npx opencode-tui-tunnel start
```

## Usage

### Start the server

```bash
opencode-tui-tunnel start
# Opens http://127.0.0.1:3000 in your browser
```

### CLI commands

```
opencode-tui-tunnel start [--host] [--port] [--no-open]
opencode-tui-tunnel status
opencode-tui-tunnel sessions list [--json]
opencode-tui-tunnel sessions kill <id>
opencode-tui-tunnel config get [key]
opencode-tui-tunnel config set <key> <value>
opencode-tui-tunnel config path
opencode-tui-tunnel doctor
```

## How it works

Sessions are managed by tmux — sessions survive browser refreshes and server restarts.
The web UI shows all active `opencode` sessions. Click to connect, or launch new sessions
in any project directory.

## Mobile support

Full mobile terminal support with custom key bar (Esc, Tab, Ctrl, arrows, etc.).

## Configuration

Config is stored at `~/.config/opencode-tui-tunnel/config.json`.

Key settings:
- `server.port` — default: 3000
- `paths.allowedRoots` — directories where new sessions can be launched
- `sessions.maxConcurrent` — max concurrent sessions (default: 8)
