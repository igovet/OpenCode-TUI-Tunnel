<script lang="ts">
  import { workspace } from '../lib/workspace';
  import { get } from 'svelte/store';
  import { requestedWorkspacePage } from '../lib/workspacePage';
  import { workspaceMaxPanes, workspacePage } from '../lib/workspaceDisplay';
  import { deleteSession } from '../lib/api';
  import { refreshAllManagers } from '../lib/terminal';

  let { ongoHome, ongoWorkspace, currentView }: { ongoHome: () => void, ongoWorkspace: () => void, currentView: 'home' | 'workspace' } = $props();
  let closeModalSessionId = $state<string | null>(null);
  let closeKilling = $state(false);
  let tabsContainer: HTMLElement | null = $state(null);

  $effect(() => {
    if (!tabsContainer) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        tabsContainer!.scrollLeft += e.deltaY;
      }
    };
    tabsContainer.addEventListener('wheel', onWheel, { passive: false });
    return () => tabsContainer?.removeEventListener('wheel', onWheel);
  });

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
    closeModalSessionId = sessionId;
  }

  function doClose(sessionId: string) {
    workspace.closeTab(sessionId);
    if ($workspace.tabs.length === 0) {
      ongoHome();
    }
  }

  async function killAndClose() {
    if (!closeModalSessionId || closeKilling) return;

    const sessionId = closeModalSessionId;
    closeKilling = true;
    try {
      await deleteSession(sessionId);
      doClose(sessionId);
    } catch (error) {
      console.error(error);
    } finally {
      closeKilling = false;
      closeModalSessionId = null;
    }
  }

  function justClose() {
    if (!closeModalSessionId) return;
    const sessionId = closeModalSessionId;
    doClose(sessionId);
    closeModalSessionId = null;
  }
  
  function handleKeydown(e: KeyboardEvent, sessionId: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate(sessionId);
    }
  }

  let tabGroups = $derived.by(() => {
    const size = Math.max(1, $workspaceMaxPanes);
    const tabs = $workspace.tabs;

    if (tabs.length === 0) {
      return [] as Array<typeof tabs>;
    }

    const groups: Array<typeof tabs> = [];
    for (let i = 0; i < tabs.length; i += size) {
      groups.push(tabs.slice(i, i + size));
    }
    return groups;
  });
</script>

<div class="tabs-container" role="tablist" bind:this={tabsContainer}>
  {#each tabGroups as group, gi (gi)}
    <div
      class="tab-group"
      class:active={gi === $workspacePage}
    >
      {#each group as tab (tab.sessionId)}
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
                <path d="M6.5 6.5C6.5 5.67 7.17 5 8 5C8.83 5 9.5 5.67 9.5 6.5C9.5 7.33 8 8 8 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="8" cy="11" r="0.75" fill="currentColor"/>
              </svg>
            {:else if tab.attention === 'permission'}
              <svg class="attention-icon permission" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Permission requires attention">
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
  {/each}
</div>

{#if closeModalSessionId}
  <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="close-session-modal-title" onclick={() => !closeKilling && (closeModalSessionId = null)}>
    <div class="modal-box" onclick={(e) => e.stopPropagation()}>
      <p id="close-session-modal-title" class="modal-title">[ CLOSE TAB ]</p>
      <p class="modal-desc">How do you want to close this tab?</p>
      <div class="modal-actions">
        <button class="btn modal-cancel" onclick={() => closeModalSessionId = null} disabled={closeKilling}>
          CANCEL
        </button>
        <button class="btn modal-close-only" onclick={justClose} disabled={closeKilling}>
          CLOSE
        </button>
        <button class="btn modal-kill" onclick={killAndClose} disabled={closeKilling}>
          {closeKilling ? 'KILLING...' : 'KILL & CLOSE'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .tabs-container {
    display: flex;
    align-items: flex-end;
    gap: 1px;
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    min-width: 0;
    padding-top: 4px;
  }
  .tabs-container::-webkit-scrollbar { display: none; }

  .tab-group {
    display: flex;
    align-items: stretch;
    flex-shrink: 0;
    margin-right: 6px;
    position: relative;
    border-top: 4px solid rgba(148, 163, 184, 0.25);
    background: rgba(255, 255, 255, 0.02);
    transition: border-top-color 0.2s ease, background 0.2s ease;
  }

  .tab-group:last-child {
    margin-right: 0;
  }

  .tab-group.active {
    border-top-color: #3b82f6;
    background: rgba(59, 130, 246, 0.07);
  }

  .tab-group.active .tab.active {
    background: rgba(59, 130, 246, 0.15);
    color: var(--text-primary);
  }

  .tab-group:not(.active) .tab {
    color: var(--text-muted);
    opacity: 0.7;
  }

  .tab-group .tab + .tab {
    border-left: 1px solid rgba(255, 255, 255, 0.06);
  }

  .tab-group .tab.active {
    border-bottom: none;
  }
  
  .tab {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-3);
    height: 36px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    transition: color var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast);
    flex: 0 1 auto;
    min-width: 80px;
    max-width: 200px;
    width: auto;
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
    white-space: nowrap;
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
    border-radius: 0;
    line-height: 1;
    display: flex;
    align-items: center;
  }

  .tab-close:hover { background: var(--bg-overlay); color: var(--accent-red); }

  @media (max-width: 640px) {
    .tab {
      flex: 0 0 40vw;
      min-width: 0;
      max-width: 40vw;
      width: 40vw;
      padding: 0 var(--space-2);
      gap: var(--space-1);
    }

    .tab-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-box {
    background: var(--bg-elevated);
    border: 1px solid var(--border-default);
    border-radius: 0;
    padding: var(--space-4);
    min-width: 280px;
    max-width: 90vw;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .modal-title {
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    font-weight: 600;
    margin: 0;
  }

  .modal-desc {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    margin: 0;
  }

  .modal-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  .modal-cancel {
    background: transparent;
    border: 1px solid var(--border-default);
    color: var(--text-muted);
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 0;
    cursor: pointer;
  }

  .modal-close-only {
    background: transparent;
    border: 1px solid var(--border-default);
    color: var(--text-secondary);
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 0;
    cursor: pointer;
  }

  .modal-close-only:hover {
    background: var(--bg-overlay);
  }

  .modal-kill {
    background: #5a0000;
    border: 1px solid #aa3333;
    color: #ff8888;
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 0;
    cursor: pointer;
  }

  .modal-kill:hover {
    background: #7a0000;
  }

  .modal-kill:disabled,
  .modal-cancel:disabled,
  .modal-close-only:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
