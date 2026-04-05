<script lang="ts">
  import { workspace } from './lib/workspace';
  import { deleteSession } from './lib/api';
  import SessionList from './pages/SessionList.svelte';
  import WorkspaceView from './pages/WorkspaceView.svelte';
  import SessionTabs from './components/SessionTabs.svelte';
  
  // Navigation between home and workspace
  let currentView: 'home' | 'workspace' = $state('home');
  
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
</script>

<div class="app-shell">
  <header class="app-header">
    <button class="app-logo" onclick={goHome} class:active={currentView === 'home'}>
      <span class="logo-text">&gt;_</span>
      <span class="logo-name">OCT</span>
    </button>
    
    {#if $workspace.tabs.length > 0}
      <SessionTabs ongoHome={goHome} ongoWorkspace={goWorkspace} />
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
      <SessionList onopenSession={(e) => workspace.openTab(e)} />
    {:else}
      <WorkspaceView />
    {/if}
  </main>
</div>

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
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
    transition: color var(--transition-fast);
  }
  .app-logo:hover, .app-logo.active { color: var(--accent-green); }
  .logo-text { color: var(--accent-green); font-weight: 700; }
  .logo-name { color: var(--text-secondary); }
  
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
