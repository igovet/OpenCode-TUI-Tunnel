<script lang="ts">
  import { workspace } from '../lib/workspace';
  import { get } from 'svelte/store';
  import { requestedWorkspacePage } from '../lib/workspacePage';
  import { refreshAllManagers } from '../lib/terminal';

  let { ongoHome, ongoWorkspace, currentView }: { ongoHome: () => void, ongoWorkspace: () => void, currentView: 'home' | 'workspace' } = $props();

  function activate(sessionId: string) {
    workspace.activateTab(sessionId);
    ongoWorkspace();

    const ws = get(workspace);
    const tabIndex = ws.tabs.findIndex(t => t.sessionId === sessionId);
    if (tabIndex >= 0) {
      requestedWorkspacePage.set(tabIndex);
    }
    
    // Refresh terminals after tab switch to ensure correct rendering
    refreshAllManagers();
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
      class:active={tab.sessionId === $workspace.activeTabId && currentView === 'workspace'}
      role="tab"
      tabindex="0"
      aria-selected={tab.sessionId === $workspace.activeTabId && currentView === 'workspace'}
      onclick={() => activate(tab.sessionId)}
      onkeydown={(e) => handleKeydown(e, tab.sessionId)}
    >
      <div class="tab-icon-container">
        {#if tab.attention === 'question'}
          <svg class="attention-icon question" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Question requires attention">
            <!-- Question mark only, no circle -->
            <path d="M6.5 6.5C6.5 5.67 7.17 5 8 5C8.83 5 9.5 5.67 9.5 6.5C9.5 7.33 8 8 8 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="8" cy="11" r="0.75" fill="currentColor"/>
          </svg>
        {:else if tab.attention === 'permission'}
          <svg class="attention-icon permission" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Permission requires attention">
            <!-- Lock icon -->
            <rect x="3" y="7.5" width="10" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M5.5 7.5V5.5C5.5 4.12 6.62 3 8 3C9.38 3 10.5 4.12 10.5 5.5V7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <circle cx="8" cy="11" r="1" fill="currentColor"/>
          </svg>
        {:else}
          <span class="status-dot {tab.status}" aria-label="Running"></span>
        {/if}
      </div>
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
    transition: color var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast);
    min-width: 100px;
    max-width: 200px;
  }
  .tab:hover,
  .tab.active {
    color: var(--text-secondary);
    background: var(--bg-elevated);
  }
  .tab.active {
    color: var(--text-primary);
    border-bottom-color: var(--accent-blue);
  }
  
  .tab-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: left;
  }

  /* Reserve fixed space for tab icon to prevent layout shift */
  .tab-icon-container {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* Status dot for running/idle state */
  .status-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    background-color: var(--text-muted);
  }
  .status-dot.running {
    background-color: #22c55e;
  }
  .status-dot.idle,
  .status-dot.stopped {
    background-color: var(--text-muted);
  }

  /* Animated SVG attention icons */
  .attention-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    animation: attention-pulse 1.15s ease-in-out infinite;
    transform-origin: center;
  }

  .attention-icon.question {
    color: #ef4444;
    filter: drop-shadow(0 0 4px rgba(239, 68, 68, 0.5));
  }

  .attention-icon.permission {
    color: #f59e0b;
    filter: drop-shadow(0 0 4px rgba(245, 158, 11, 0.5));
  }

  @keyframes attention-pulse {
    0% {
      transform: scale(1);
      opacity: 0.75;
    }
    50% {
      transform: scale(1.15);
      opacity: 1;
    }
    100% {
      transform: scale(1);
      opacity: 0.75;
    }
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

  @media (max-width: 768px) {
    button:hover,
    button:focus,
    button:focus-visible,
    .tab:hover,
    .tab:focus,
    .tab:focus-visible,
    .tab-close:hover,
    .tab-close:focus,
    .tab-close:focus-visible {
      outline: none;
      background: inherit;
      color: inherit;
      border-color: inherit;
      box-shadow: none;
    }
  }
</style>
