export interface SessionInfo {
  id: string
  status: 'starting' | 'running' | 'exited' | 'failed' | 'interrupted'
  cwd: string
  startedAt: string
  tmuxName: string
  cols: number
  rows: number
  clientCount: number
}

// Path autocomplete
export interface PathSuggestion {
  display: string;    // e.g. "~/Projects/myapp"
  absolute: string;   // e.g. "/home/user/Projects/myapp"
}

// Project history
export interface ProjectHistoryRecord {
  path: string;
  last_used_at: string;
  session_count: number;
}

// tmux session discovery
export interface TmuxDiscoverySession {
  name: string;
  windows: number;
  attached: boolean;
  currentPath: string;
  isManaged: boolean;
}

// Workspace tabs
export interface WorkspaceTab {
  sessionId: string;
  title: string;      // short display title (basename of cwd)
  cwd: string;
  status: 'running' | 'starting' | 'exited' | 'failed' | 'interrupted';
  isActive: boolean;
}
