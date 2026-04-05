<script lang="ts">
  import { workspace } from '../lib/workspace';
  
  let { ongoHome, ongoWorkspace }: { ongoHome: () => void, ongoWorkspace: () => void } = $props();
  
  function activate(sessionId: string) {
    workspace.activateTab(sessionId);
    ongoWorkspace();
  }
  
  function close(e: Event, sessionId: string) {
    e.stopPropagation();
    workspace.closeTab(sessionId);
    if ($workspace.tabs.length === 0) {
      ongoHome();
    }
  }
  
  function handleKeydown(e: KeyboardEvent, sessionId: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate(sessionId);
    }
  }
</script>

<div class="tabs-container" role="tablist">
  {#each $workspace.tabs as tab (tab.sessionId)}
    <div 
      class="tab" 
      class:active={tab.sessionId === $workspace.activeTabId}
      role="tab"
      tabindex="0"
      aria-selected={tab.sessionId === $workspace.activeTabId}
      onclick={() => activate(tab.sessionId)}
      onkeydown={(e) => handleKeydown(e, tab.sessionId)}
    >
      <span class="status-dot {tab.status}"></span>
      <span class="tab-title">{tab.title || tab.cwd.split('/').pop() || tab.sessionId.slice(0, 8)}</span>
      <button class="tab-close" onclick={(e) => close(e, tab.sessionId)} aria-label="Close tab">×</button>
    </div>
  {/each}
</div>

<style>
  .tabs-container {
    display: flex;
    align-items: stretch;
    gap: 1px;
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    min-width: 0;
  }
  .tabs-container::-webkit-scrollbar { display: none; }
  
  .tab {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-3);
    height: 40px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    white-space: nowrap;
    transition: color var(--transition-fast), border-color var(--transition-fast);
    min-width: 100px;
    max-width: 200px;
  }
  .tab:hover { color: var(--text-secondary); background: var(--bg-elevated); }
  .tab.active { color: var(--text-primary); border-bottom-color: var(--accent-blue); }
  
  .tab-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: left;
  }

  .tab-close {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    font-size: 1rem;
    padding: 0 2px;
    border-radius: 2px;
    line-height: 1;
    display: flex;
    align-items: center;
  }

  .tab-close:hover { background: var(--bg-overlay); color: var(--accent-red); }

  @media (max-width: 640px) {
    .tab {
      flex: 0 1 140px;
      min-width: 82px;
      max-width: 140px;
      padding: 0 var(--space-2);
      gap: var(--space-1);
    }
  }
</style>
