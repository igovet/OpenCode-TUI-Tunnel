<script lang="ts">
  import { workspace } from '../lib/workspace';
  import { deleteSession } from '../lib/api';
  
  let { ongoHome, ongoWorkspace }: { ongoHome: () => void, ongoWorkspace: () => void } = $props();
  let killingSessionIds = $state(new Set<string>());
  
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

  async function killSession(e: Event, sessionId: string) {
    e.stopPropagation();
    if (killingSessionIds.has(sessionId)) return;

    killingSessionIds.add(sessionId);
    killingSessionIds = new Set(killingSessionIds);

    try {
      await deleteSession(sessionId);
      workspace.closeTab(sessionId);
      if ($workspace.tabs.length === 0) {
        ongoHome();
      }
    } catch (error) {
      console.error(error);
    } finally {
      killingSessionIds.delete(sessionId);
      killingSessionIds = new Set(killingSessionIds);
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
      <span class="tab-status" title={`Session status: ${tab.status}`}>{tab.status}</span>
      <button
        class="tab-kill"
        onclick={(e) => killSession(e, tab.sessionId)}
        aria-label="Kill session"
        title="Kill session"
        disabled={killingSessionIds.has(tab.sessionId)}
      >
        {killingSessionIds.has(tab.sessionId) ? '…' : '⚡'}
      </button>
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
    max-width: 180px;
  }
  .tab:hover { color: var(--text-secondary); background: var(--bg-elevated); }
  .tab.active { color: var(--text-primary); border-bottom-color: var(--accent-blue); }
  
  .tab-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: left;
  }

  .tab-status {
    font-size: 0.62rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
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

  .tab-kill {
    background: none;
    border: none;
    color: #f0883e;
    border-radius: 2px;
    height: 20px;
    min-width: 20px;
    padding: 0 2px;
    font-size: 0.85rem;
    line-height: 1;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--transition-fast), background var(--transition-fast), color var(--transition-fast);
  }

  .tab:hover .tab-kill,
  .tab.active .tab-kill,
  .tab-kill:focus-visible {
    opacity: 1;
    pointer-events: auto;
  }

  .tab-kill:hover:not(:disabled) {
    background: var(--bg-overlay);
    color: var(--accent-red);
  }

  .tab-kill:disabled {
    opacity: 0.8;
    cursor: wait;
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

    .tab-status {
      display: none;
    }

    .tab-kill {
      opacity: 1;
      pointer-events: auto;
      min-width: 24px;
      height: 24px;
      font-size: 0.95rem;
    }
  }

  @media (hover: none), (pointer: coarse) {
    .tab-kill {
      opacity: 1;
      pointer-events: auto;
    }
  }
</style>
