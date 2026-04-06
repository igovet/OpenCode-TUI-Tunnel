import { writable } from 'svelte/store';

export interface WorkspaceTab {
  sessionId: string;
  title: string;
  cwd: string;
  status: 'running' | 'starting' | 'exited' | 'failed' | 'interrupted';
}

export function isTerminalTabEnded(status: WorkspaceTab['status']): boolean {
  return status === 'exited' || status === 'failed' || status === 'interrupted';
}

const STORAGE_KEY = 'opencode-tui-workspace';

function loadFromStorage(): { tabs: WorkspaceTab[]; activeTabId: string | null } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && Array.isArray(parsed.tabs)) {
        return { tabs: parsed.tabs, activeTabId: parsed.activeTabId || null };
      }
    }
  } catch {
    // intentional
  }
  return { tabs: [], activeTabId: null };
}

function saveToStorage(state: { tabs: WorkspaceTab[]; activeTabId: string | null }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // intentional
  }
}

function createWorkspaceStore() {
  const { subscribe, update: _update } = writable<{
    tabs: WorkspaceTab[];
    activeTabId: string | null;
  }>(loadFromStorage());

  function update(
    fn: (state: { tabs: WorkspaceTab[]; activeTabId: string | null }) => {
      tabs: WorkspaceTab[];
      activeTabId: string | null;
    },
  ) {
    _update((state) => {
      const newState = fn(state);
      saveToStorage(newState);
      return newState;
    });
  }

  return {
    subscribe,
    openTab(session: WorkspaceTab) {
      update((state) => {
        const existing = state.tabs.find((t) => t.sessionId === session.sessionId);
        if (existing) {
          return {
            ...state,
            tabs: state.tabs.map((tab) =>
              tab.sessionId === session.sessionId ? { ...tab, ...session } : tab,
            ),
            activeTabId: session.sessionId,
          };
        }
        return {
          tabs: [...state.tabs, session],
          activeTabId: session.sessionId,
        };
      });
    },
    closeTab(sessionId: string) {
      update((state) => {
        const tabs = state.tabs.filter((t) => t.sessionId !== sessionId);
        let activeTabId = state.activeTabId;
        if (activeTabId === sessionId) {
          activeTabId = tabs.length > 0 ? tabs[tabs.length - 1].sessionId : null;
        }
        return { tabs, activeTabId };
      });
    },
    activateTab(sessionId: string) {
      update((state) => ({ ...state, activeTabId: sessionId }));
    },
    swapToFront(sessionId: string) {
      update((state) => {
        const index = state.tabs.findIndex((t) => t.sessionId === sessionId);
        if (index > 0) {
          const newTabs = [...state.tabs];
          const [tab] = newTabs.splice(index, 1);
          newTabs.unshift(tab);
          return { ...state, tabs: newTabs, activeTabId: sessionId };
        }
        return { ...state, activeTabId: sessionId };
      });
    },
    updateTabStatus(sessionId: string, status: WorkspaceTab['status']) {
      update((state) => ({
        ...state,
        tabs: state.tabs.map((t) => (t.sessionId === sessionId ? { ...t, status } : t)),
      }));
    },
    get isWorkspaceActive() {
      let val = false;
      subscribe((s) => {
        val = s.tabs.length > 0;
      })();
      return val;
    },
  };
}

export const workspace = createWorkspaceStore();
