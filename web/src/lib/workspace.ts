import { writable } from 'svelte/store';

export interface WorkspaceTab {
  sessionId: string;
  title: string;
  cwd: string;
  status: 'running' | 'starting' | 'exited' | 'failed' | 'interrupted';
}

function createWorkspaceStore() {
  const { subscribe, update, set } = writable<{
    tabs: WorkspaceTab[];
    activeTabId: string | null;
  }>({ tabs: [], activeTabId: null });

  return {
    subscribe,
    openTab(session: WorkspaceTab) {
      update((state) => {
        const existing = state.tabs.find((t) => t.sessionId === session.sessionId);
        if (existing) {
          return { ...state, activeTabId: session.sessionId };
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
