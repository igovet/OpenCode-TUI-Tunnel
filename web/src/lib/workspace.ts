import { writable } from 'svelte/store';

export interface WorkspaceTab {
  sessionId: string;
  title: string;
  cwd: string;
  status: 'running' | 'starting' | 'exited' | 'failed' | 'interrupted';
  attention?: 'question' | 'permission' | 'none';
  permissionId?: string;
  questionId?: string;
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
        const tabs = parsed.tabs
          .filter((tab) => tab && typeof tab === 'object')
          .map((tab) => {
            const record = tab as Record<string, unknown>;
            const attentionRaw = record.attention;
            const attention =
              attentionRaw === 'question' ||
              attentionRaw === 'permission' ||
              attentionRaw === 'none'
                ? attentionRaw
                : 'none';

            return {
              sessionId: typeof record.sessionId === 'string' ? record.sessionId : '',
              title: typeof record.title === 'string' ? record.title : '',
              cwd: typeof record.cwd === 'string' ? record.cwd : '',
              status:
                record.status === 'starting' ||
                record.status === 'running' ||
                record.status === 'exited' ||
                record.status === 'failed' ||
                record.status === 'interrupted'
                  ? record.status
                  : 'running',
              attention,
              permissionId:
                typeof record.permissionId === 'string' ? record.permissionId : undefined,
              questionId: typeof record.questionId === 'string' ? record.questionId : undefined,
            } satisfies WorkspaceTab;
          })
          .filter((tab) => tab.sessionId.length > 0);

        return {
          tabs,
          activeTabId: typeof parsed.activeTabId === 'string' ? parsed.activeTabId : null,
        };
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
              tab.sessionId === session.sessionId
                ? {
                    ...tab,
                    ...session,
                    attention: session.attention ?? tab.attention ?? 'none',
                    permissionId: session.permissionId ?? tab.permissionId,
                    questionId: session.questionId ?? tab.questionId,
                  }
                : tab,
            ),
            activeTabId: session.sessionId,
          };
        }
        return {
          tabs: [...state.tabs, { ...session, attention: session.attention ?? 'none' }],
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
      update((state) => ({
        ...state,
        activeTabId: sessionId,
        tabs: state.tabs.map((tab) =>
          tab.sessionId === sessionId
            ? { ...tab, attention: 'none', permissionId: undefined, questionId: undefined }
            : tab,
        ),
      }));
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
    updateTabAttention(sessionId: string, reason: WorkspaceTab['attention'] = 'none', id?: string) {
      update((state) => ({
        ...state,
        tabs: state.tabs.map((tab) => {
          if (tab.sessionId !== sessionId) {
            return tab;
          }

          if (reason === 'question') {
            return {
              ...tab,
              attention: 'question',
              questionId: typeof id === 'string' ? id : tab.questionId,
              permissionId: undefined,
            };
          }

          if (reason === 'permission') {
            return {
              ...tab,
              attention: 'permission',
              permissionId: typeof id === 'string' ? id : tab.permissionId,
              questionId: undefined,
            };
          }

          return {
            ...tab,
            attention: 'none',
            permissionId: undefined,
            questionId: undefined,
          };
        }),
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
