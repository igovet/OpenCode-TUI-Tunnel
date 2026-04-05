<script lang="ts">
  import { workspace } from './lib/workspace';
  import SessionList from './pages/SessionList.svelte';
  import WorkspaceView from './pages/WorkspaceView.svelte';
  import SessionTabs from './components/SessionTabs.svelte';
  
  // Navigation between home and workspace
  let currentView: 'home' | 'workspace' = $state('home');
  
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
      {#if currentView === 'workspace'}
        <button class="btn icon-btn" onclick={goHome} title="New session">+</button>
      {/if}
    </div>
  </header>
  
  <main class="app-content">
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
  
  .app-content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
