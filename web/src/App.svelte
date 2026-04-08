<script lang="ts">
  import { get } from 'svelte/store';
  import { requestedWorkspacePage } from './lib/workspacePage';
  import { workspace } from './lib/workspace';
  import { appView } from './lib/appView';
  import { deleteSession, getSession } from './lib/api';
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
  let showWorkspaceLogo = $state(false);

  $effect(() => {
    appView.set(currentView);
  });

  $effect(() => {
    if (currentView === 'workspace') {
      showWorkspaceLogo = true;
    } else {
      showWorkspaceLogo = false;
    }
  });
  
  let confirmKill = $state(false);
  let killing = $state(false);

  $effect(() => {
    if (confirmKill) {
      const t = setTimeout(() => { confirmKill = false; }, 5000);
      return () => clearTimeout(t);
    }
  });

  async function handleKillActive(e: Event) {
    e.preventDefault();
    if (!$workspace.activeTabId) return;
    if (!confirmKill) {
      confirmKill = true;
      return;
    }
    
    const sessionId = $workspace.activeTabId;
    killing = true;
    try {
      await deleteSession(sessionId);
      workspace.closeTab(sessionId);
      if ($workspace.tabs.length === 0) {
        goHome();
      }
    } catch (error) {
      console.error(error);
    } finally {
      killing = false;
      confirmKill = false;
    }
  }

  function cancelKill(e: Event) {
    e.preventDefault();
    confirmKill = false;
  }
  
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
  <header class="app-header" bind:clientHeight={headerHeight}>
    <button class="app-logo" onclick={goHome} class:active={currentView === 'home'} class:workspace={showWorkspaceLogo}>
      <span class="logo-text">
        <span class="logo-arrow" class:workspace={showWorkspaceLogo}>&gt;</span>
        <span class="logo-underscore" class:workspace={showWorkspaceLogo}>_</span>
      </span>
      <span class="logo-name" class:workspace={showWorkspaceLogo}>
        {#each ['O', 'C', 'T'] as letter}
          <span class="logo-letter" class:hidden={showWorkspaceLogo}>{letter}</span>
        {/each}
      </span>
    </button>
    
    {#if $workspace.tabs.length > 0}
      <SessionTabs ongoHome={goHome} ongoWorkspace={goWorkspace} {currentView} />
    {/if}
    
    <div class="header-actions">
      {#if currentView === 'workspace' && $workspace.activeTabId}
        {#if confirmKill}
          <div class="kill-confirm">
            <span class="kill-text">Confirm kill?</span>
            <button class="btn kill-yes" onpointerdown={handleKillActive} disabled={killing}>Yes, kill</button>
            <button class="btn kill-cancel" onpointerdown={cancelKill} disabled={killing}>Cancel</button>
          </div>
        {:else}
          <button class="btn kill-btn" onpointerdown={handleKillActive}>Kill</button>
        {/if}
        <button class="btn icon-btn" onclick={goHome} title="New session">+</button>
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
    gap: var(--space-2);
    padding: 0 var(--space-3);
    height: 40px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-default);
    flex-shrink: 0;
    overflow: hidden;
  }
  
  .app-logo {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    flex-shrink: 0;
    width: auto;
    transition: color var(--transition-fast), width 0.3s ease, gap 0.3s ease;
  }
  .app-logo.workspace {
    gap: 0;
  }
  .app-logo:hover, .app-logo.active { color: var(--accent-green); }
  
  .logo-text {
    display: inline-flex;
    align-items: baseline;
    color: var(--accent-green);
    font-weight: 700;
  }
  
  .logo-arrow {
    display: inline-block;
    transition: transform 0.3s ease;
  }
  
  .logo-arrow.workspace {
    transform: rotate(-90deg);
  }
  
  .logo-underscore {
    display: inline-block;
    transition: margin-left 0.3s ease, transform 0.3s ease;
  }
  
  .logo-underscore.workspace {
    margin-left: -7px;
  }
  
  .logo-name {
    display: inline-flex;
    color: var(--text-secondary);
    transition: max-width 0.3s ease, margin 0.3s ease, padding 0.3s ease;
    max-width: 100px;
    overflow: hidden;
  }
  
  .logo-name.workspace {
    max-width: 0;
    margin: 0;
    padding: 0;
  }
  
  .logo-letter {
    display: inline-block;
    transition: opacity 0.2s ease, transform 0.2s ease;
    max-width: 1em;
    overflow: hidden;
  }

  /* Fade out (workspace) - right to left */
  .logo-letter:nth-child(3) { transition-delay: 0ms; }   /* T */
  .logo-letter:nth-child(2) { transition-delay: 100ms; } /* C */
  .logo-letter:nth-child(1) { transition-delay: 200ms; } /* O */

  /* Fade in (home) - left to right */
  .logo-letter:not(.hidden):nth-child(1) { transition-delay: 0ms; }   /* O */
  .logo-letter:not(.hidden):nth-child(2) { transition-delay: 100ms; } /* C */
  .logo-letter:not(.hidden):nth-child(3) { transition-delay: 200ms; } /* T */

  .logo-letter.hidden {
    opacity: 0;
    transform: scale(0.8);
  }
  
  .header-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }
  
  .icon-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
  }

  .kill-confirm {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  
  .kill-text {
    font-size: 11px;
    color: var(--text-muted);
    margin-right: 4px;
  }
  
  .kill-btn {
    background: transparent;
    border: 1px solid #553333;
    color: #aa5555;
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
  }
  .kill-btn:hover {
    background: #3a1111;
  }
  
  .kill-yes {
    background: #5a0000;
    border: 1px solid #aa3333;
    color: #ff8888;
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
  }
  .kill-yes:hover {
    background: #7a0000;
  }
  .kill-yes:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .kill-cancel {
    background: #2a2a2a;
    border: 1px solid #555;
    color: #aaa;
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
  }
  .kill-cancel:hover {
    background: #3a3a3a;
  }
  .kill-cancel:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
