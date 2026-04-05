import type { SessionInfo } from './types';

export async function listSessions(): Promise<SessionInfo[]> {
  const res = await fetch('/api/sessions');
  if (!res.ok) throw new Error('Failed to list sessions');
  return res.json();
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
): Promise<{ session: SessionInfo; streamUrl: string }> {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cwd, cols, rows }),
  });
  if (!res.ok) throw new Error('Failed to launch session');
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
export async function suggestPaths(q: string): Promise<string[]> {
  if (!q) return [];
  const url = new URL(window.location.origin + '/api/fs/suggest');
  url.searchParams.set('q', q);
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
