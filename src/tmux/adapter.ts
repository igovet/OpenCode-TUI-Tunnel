import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { spawn, type IPty } from 'node-pty';

const execFileAsync = promisify(execFile);

const TMUX_FALLBACK_PATH_SEGMENTS = [
  '/usr/local/sbin',
  '/usr/local/bin',
  '/usr/sbin',
  '/usr/bin',
  '/sbin',
  '/bin',
] as const;

function getTmuxExecEnv(): NodeJS.ProcessEnv {
  const currentPath = process.env.PATH ?? '';
  const segments = currentPath.split(':').filter((segment) => segment.length > 0);

  for (const segment of TMUX_FALLBACK_PATH_SEGMENTS) {
    if (!segments.includes(segment)) {
      segments.push(segment);
    }
  }

  return {
    ...process.env,
    PATH: segments.join(':'),
  };
}

async function execTmux(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('tmux', args, { env: getTmuxExecEnv() });
}

export interface TmuxSession {
  name: string;
  created: string;
  windows: number;
  attached: number;
  id: string;
}

export interface TmuxSessionInfo {
  name: string;
  windows: number;
  attached: boolean;
  currentPath: string;
  isManaged: boolean;
}

export interface TmuxPtyHandle {
  onData(cb: (data: Buffer) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  close(): void;
}

class TmuxPtyHandleImpl implements TmuxPtyHandle {
  private readonly pty: IPty;

  public constructor(pty: IPty) {
    this.pty = pty;
  }

  public onData(cb: (data: Buffer) => void): void {
    this.pty.onData((data) => {
      cb(Buffer.from(data, 'utf8'));
    });
  }

  public write(data: string): void {
    this.pty.write(data);
  }

  public resize(cols: number, rows: number): void {
    this.pty.resize(cols, rows);
  }

  public close(): void {
    this.pty.kill();
  }
}

function parseTmuxSessionsOutput(stdout: string): TmuxSession[] {
  return stdout
    .trim()
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [name, created, windows, attached, id] = line.split('\t');

      return {
        name,
        created,
        windows: Number.parseInt(windows, 10),
        attached: Number.parseInt(attached, 10),
        id,
      } satisfies TmuxSession;
    });
}

function parseTmuxSessionInfoLine(line: string): TmuxSessionInfo | null {
  const firstColon = line.indexOf(':');
  if (firstColon < 0) {
    return null;
  }

  const secondColon = line.indexOf(':', firstColon + 1);
  if (secondColon < 0) {
    return null;
  }

  const thirdColon = line.indexOf(':', secondColon + 1);
  if (thirdColon < 0) {
    return null;
  }

  const name = line.slice(0, firstColon);
  const windowsRaw = line.slice(firstColon + 1, secondColon);
  const attachedRaw = line.slice(secondColon + 1, thirdColon);
  const currentPath = line.slice(thirdColon + 1);
  const windows = Number.parseInt(windowsRaw, 10);
  const attached = Number.parseInt(attachedRaw, 10);

  if (!Number.isFinite(windows) || !Number.isFinite(attached)) {
    return null;
  }

  return {
    name,
    windows,
    attached: attached > 0,
    currentPath,
    isManaged: name.startsWith('oct-'),
  };
}

export async function listTunnelSessions(): Promise<TmuxSession[]> {
  try {
    const { stdout } = await execTmux([
      'list-sessions',
      '-F',
      '#{session_name}\t#{session_created}\t#{session_windows}\t#{session_attached}\t#{session_id}',
    ]);

    return parseTmuxSessionsOutput(stdout).filter((session) => session.name.startsWith('oct-'));
  } catch {
    return [];
  }
}

export async function listAllTmuxSessions(): Promise<TmuxSessionInfo[]> {
  try {
    const { stdout } = await execTmux([
      'list-sessions',
      '-F',
      '#{session_name}:#{session_windows}:#{session_attached}:#{pane_current_path}',
    ]);

    return stdout
      .trim()
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => parseTmuxSessionInfoLine(line))
      .filter((session): session is TmuxSessionInfo => session !== null);
  } catch {
    return [];
  }
}

export async function createSession(name: string, cwd: string): Promise<void> {
  await execTmux(['new-session', '-d', '-s', name, '-c', cwd]);
}

export async function sendCommand(sessionName: string, command: string): Promise<void> {
  await execTmux(['send-keys', '-t', sessionName, command, 'Enter']);
}

export async function killSession(sessionName: string): Promise<void> {
  await execTmux(['kill-session', '-t', sessionName]);
}

export async function checkTmuxAvailable(): Promise<boolean> {
  try {
    await execTmux(['-V']);
    return true;
  } catch {
    return false;
  }
}

export function attachPty(sessionName: string, cols: number, rows: number): TmuxPtyHandle {
  const pty = spawn('tmux', ['attach-session', '-t', sessionName], {
    cols,
    rows,
    name: 'xterm-256color',
    cwd: process.cwd(),
    env: getTmuxExecEnv(),
  });

  return new TmuxPtyHandleImpl(pty);
}

export async function attachToTmuxSession(
  sessionName: string,
  cols?: number,
  rows?: number,
): Promise<TmuxPtyHandle> {
  return attachPty(sessionName, cols || 120, rows || 30);
}
