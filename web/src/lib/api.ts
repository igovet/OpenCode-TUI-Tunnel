import type { SessionInfo, SshConnection } from './types';

export async function listSessions(): Promise<SessionInfo[]> {
  const res = await fetch('/api/sessions');
  if (!res.ok) throw new Error('Failed to list sessions');
  return res.json() as Promise<SessionInfo[]>;
}

export async function getSession(id: string): Promise<SessionInfo | null> {
  const res = await fetch(`/api/sessions/${id}`);
  if (!res.ok) return null;
  return res.json();
}

export async function launchSession(
  cwd: string,
  cols: number,
  rows: number,
  sshConnectionId?: string,
): Promise<{ session: SessionInfo; streamUrl: string }> {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cwd, cols, rows, sshConnectionId }),
  });
  if (!res.ok) {
    let body: { error?: string } = {};
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    const err: Error & { statusCode?: number } = new Error(
      body.error ?? 'Failed to launch session',
    );
    err.statusCode = res.status;
    throw err;
  }
  return res.json();
}

// SSH connection CRUD
export async function listSshConnections(): Promise<SshConnection[]> {
  const res = await fetch('/api/ssh/connections');
  if (!res.ok) throw new Error('Failed to list SSH connections');
  const data = await res.json() as { connections: SshConnection[] };
  return data.connections ?? [];
}

export async function createSshConnection(body: {
  name: string;
  host: string;
  port?: number;
  username: string;
  authType: 'key' | 'agent';
  privateKeyPath?: string;
  passphrase?: string;
  opencodeProvider?: 'local' | 'server';
  opencodeCommand?: string;
}): Promise<SshConnection> {
  const res = await fetch('/api/ssh/connections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let errBody: { error?: string } = {};
    try {
      errBody = await res.json();
    } catch {
      /* ignore */
    }
    const err: Error & { statusCode?: number } = new Error(
      errBody.error ?? 'Failed to create SSH connection',
    );
    err.statusCode = res.status;
    throw err;
  }
  const data = await res.json() as { connection: SshConnection };
  return data.connection;
}

export async function updateSshConnection(
  id: string,
  body: Partial<{
    name: string;
    host: string;
    port?: number;
    username: string;
    authType: 'key' | 'agent';
    privateKeyPath?: string | null;
    passphrase?: string | null;
    opencodeProvider?: 'local' | 'server';
    opencodeCommand?: string | null;
  }>,
): Promise<SshConnection> {
  const res = await fetch(`/api/ssh/connections/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let errBody: { error?: string } = {};
    try {
      errBody = await res.json();
    } catch {
      /* ignore */
    }
    const err: Error & { statusCode?: number } = new Error(
      errBody.error ?? 'Failed to update SSH connection',
    );
    err.statusCode = res.status;
    throw err;
  }
  const data = await res.json() as { connection: SshConnection };
  return data.connection;
}

export async function deleteSshConnection(id: string): Promise<void> {
  const res = await fetch(`/api/ssh/connections/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    let errBody: { error?: string } = {};
    try {
      errBody = await res.json();
    } catch {
      /* ignore */
    }
    const err: Error & { statusCode?: number } = new Error(
      errBody.error ?? 'Failed to delete SSH connection',
    );
    err.statusCode = res.status;
    throw err;
  }
}

export async function testSshConnection(id: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`/api/ssh/connections/${id}/test`, { method: 'POST' });
  if (!res.ok) {
    let errBody: { error?: string } = {};
    try {
      errBody = await res.json();
    } catch {
      /* ignore */
    }
    return { success: false, error: errBody.error ?? 'Test failed' };
  }
  return res.json() as Promise<{ success: boolean; error?: string }>;
}

export async function checkSshfsAvailability(): Promise<{ available: boolean; path?: string; platform: string }> {
  const res = await fetch('/api/system/sshfs');
  if (!res.ok) throw new Error('Failed to check SSHFS availability');
  return res.json();
}

export async function terminateSession(id: string): Promise<void> {
  const ok = await deleteSession(id);
  if (!ok) throw new Error('Failed to terminate session');
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
  return res.ok;
}

// Path suggestions
export async function suggestPaths(q: string, sshConnectionId?: string): Promise<string[]> {
  if (!q) return [];
  const url = new URL(window.location.origin + '/api/fs/suggest');
  url.searchParams.set('q', q);
  if (sshConnectionId) {
    url.searchParams.set('sshConnectionId', sshConnectionId);
  }
  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = (await res.json()) as { suggestions: string[] };
  return data.suggestions || [];
}

// Project history
export async function getProjectHistory(): Promise<import('./types').ProjectHistoryRecord[]> {
  const res = await fetch('/api/projects/history');
  if (!res.ok) return [];
  const data = (await res.json()) as { history: import('./types').ProjectHistoryRecord[] };
  return data.history || [];
}

// tmux session discovery
export async function getTmuxSessions(): Promise<import('./types').TmuxDiscoverySession[]> {
  const res = await fetch('/api/tmux/sessions');
  if (!res.ok) return [];
  const data = (await res.json()) as { sessions: import('./types').TmuxDiscoverySession[] };
  return data.sessions || [];
}

// Attach to tmux session
export async function attachTmuxSession(
  name: string,
  cols?: number,
  rows?: number,
): Promise<{ sessionId: string; streamUrl: string } | null> {
  const res = await fetch(`/api/tmux/sessions/${encodeURIComponent(name)}/attach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cols, rows }),
  });
  if (!res.ok) return null;
  return res.json();
}
