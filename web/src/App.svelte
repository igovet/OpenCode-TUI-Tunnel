<script lang="ts">
  import { get } from 'svelte/store';
  import { requestedWorkspacePage } from './lib/workspacePage';
  import { workspace } from './lib/workspace';
  import { appView } from './lib/appView';
  import { getSession } from './lib/api';
  import {
    ACTIVATE_SESSION_EVENT,
    consumeRequestedSessionActivation,
    dispatchSessionActivation,
    isActivateSessionPayload,
    setupNotificationAudioUnlock,
  } from './lib/notifications';
  import SessionList from './pages/SessionList.svelte';
  import WorkspaceView from './pages/WorkspaceView.svelte';
  import SessionTabs from './components/SessionTabs.svelte';
  
  // Navigation between home and workspace
  let currentView: 'home' | 'workspace' = $state('home');

  $effect(() => {
    appView.set(currentView);
  });

  function goHome() { currentView = 'home'; }
  function goWorkspace() { if ($workspace.tabs.length > 0) currentView = 'workspace'; }
  
  // Auto-switch to workspace when a tab is opened
  $effect(() => {
    if ($workspace.tabs.length > 0 && $workspace.activeTabId) {
      currentView = 'workspace';
    }
  });
  
  // Auto-switch to home when all tabs are closed
  $effect(() => {
    if ($workspace.tabs.length === 0) {
      currentView = 'home';
    }
  });

  let headerHeight = $state(40);

  function openTabInWorkspace(sessionId: string): void {
    workspace.activateTab(sessionId);
    const tabIndex = get(workspace).tabs.findIndex((tab) => tab.sessionId === sessionId);
    if (tabIndex >= 0) {
      requestedWorkspacePage.set(tabIndex);
    }
    currentView = 'workspace';
  }

  async function activateRequestedSession(sessionId: string): Promise<void> {
    const existingTab = get(workspace).tabs.find((candidate) => candidate.sessionId === sessionId);

    if (!existingTab) {
      try {
        const session = await getSession(sessionId);
        if (!session) {
          return;
        }

        workspace.openTab({
          sessionId: session.id,
          title: session.cwd.split('/').pop() || session.id.slice(0, 8),
          cwd: session.cwd,
          status: session.status,
          attention: 'none',
        });
      } catch (error) {
        console.error('[notifications] Failed to open requested session', error);
        return;
      }
    }

    openTabInWorkspace(sessionId);
  }

  $effect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const messageHandler = (event: MessageEvent<unknown>) => {
      const payload = event.data;
      if (!isActivateSessionPayload(payload)) {
        return;
      }

      dispatchSessionActivation(payload.sessionId);
    };

    const activationHandler = (event: Event) => {
      const customEvent = event as CustomEvent<{ sessionId?: string }>;
      const sessionId = customEvent.detail?.sessionId;
      if (typeof sessionId !== 'string') {
        return;
      }

      void activateRequestedSession(sessionId);
    };

    window.addEventListener(ACTIVATE_SESSION_EVENT, activationHandler);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', messageHandler);
    }

    const pendingSessionId = consumeRequestedSessionActivation();
    if (pendingSessionId) {
      dispatchSessionActivation(pendingSessionId);
    }

    setupNotificationAudioUnlock();

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', messageHandler);
      }
      window.removeEventListener(ACTIVATE_SESSION_EVENT, activationHandler);
    };
  });
</script>

<div class="app-shell">
  <header class="app-header" class:workspace-mode={currentView === 'workspace'} bind:clientHeight={headerHeight}>
    {#if $workspace.tabs.length > 0}
      <SessionTabs ongoHome={goHome} ongoWorkspace={goWorkspace} {currentView} />
    {/if}
    
    <div class="header-actions">
      {#if currentView === 'workspace' && $workspace.activeTabId}
        <button class="new-session-btn" onclick={goHome} title="New session" aria-label="New session">+</button>
      {/if}
    </div>
  </header>
  
  <main class="app-content" data-view={currentView}>
    {#if currentView === 'home' || $workspace.tabs.length === 0}
      <SessionList onopenSession={(e) => {
        workspace.openTab(e);
        openTabInWorkspace(e.sessionId);
      }} />
    {:else}
      <WorkspaceView {headerHeight} />
    {/if}
  </main>
</div>

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    box-sizing: border-box;
    background: var(--bg-base);
    color: var(--text-primary);
    font-family: var(--font-mono);
    overflow: hidden;
  }
  
  .app-header {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 0 var(--space-3);
    padding-left: 0;
    padding-right: 0;
    height: 40px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-default);
    flex-shrink: 0;
    overflow: visible;
  }

  .app-header.workspace-mode {
    padding-left: 0;
  }

  .header-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .header-actions:empty {
    display: none;
  }

  .new-session-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    margin: 4px;
    padding: 0;
    background: var(--bg-overlay);
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    font-size: 1.2rem;
    font-family: var(--font-mono);
    transition: background 0.15s ease, color 0.15s ease;
    flex-shrink: 0;
  }

  .new-session-btn:hover {
    background: var(--bg-elevated);
    color: var(--accent-green);
  }
  
  .app-content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  
  .app-content[data-view="home"] {
    overflow-y: auto;
    overflow-x: hidden;
  }
  
  .app-content[data-view="workspace"] {
    overflow: hidden;
  }
</style>
