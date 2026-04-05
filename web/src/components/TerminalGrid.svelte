<script lang="ts">
  import TerminalPane from './TerminalPane.svelte';
  import { workspace } from '../lib/workspace';

  let containerWidth = $state(0);
  
  let activeSessionId = $derived($workspace.activeTabId);
  let tabs = $derived($workspace.tabs);

  // Compute paneCount: < 900px → 1, 900-1600px → 2, > 1600px → 3
  let maxPanes = $derived(
    containerWidth < 900 ? 1 : 
    containerWidth > 1600 ? 3 : 2
  );

  let paneCount = $derived(Math.min(maxPanes, Math.max(1, tabs.length)));

  let workspacePage = $state(0);
  
  let totalPages = $derived(Math.ceil(tabs.length / maxPanes) || 1);

  // Ensure page is within bounds when tabs length changes
  $effect(() => {
    if (workspacePage >= totalPages) {
      workspacePage = Math.max(0, totalPages - 1);
    }
  });

  let visiblePanes = $derived(
    containerWidth < 900
      ? tabs.filter(t => t.sessionId === activeSessionId)
      : tabs.slice(workspacePage * maxPanes, (workspacePage + 1) * maxPanes)
  );

  function handleKeydown(e: KeyboardEvent) {
    if (containerWidth < 900) return;
    if (e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
      if (e.key >= '1' && e.key <= '9') {
        const pageIdx = parseInt(e.key) - 1;
        if (pageIdx < totalPages) {
          workspacePage = pageIdx;
          e.preventDefault();
        }
      } else if (e.key === 'ArrowLeft') {
        if (workspacePage > 0) {
          workspacePage--;
          e.preventDefault();
        }
      } else if (e.key === 'ArrowRight') {
        if (workspacePage < totalPages - 1) {
          workspacePage++;
          e.preventDefault();
        }
      }
    }
  }

  function getSessionsForPage(pageIndex: number) {
    return tabs.slice(pageIndex * maxPanes, (pageIndex + 1) * maxPanes);
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="terminal-grid-container">
  {#if totalPages > 1 && containerWidth >= 900}
    <div class="workspace-strip">
      {#each Array(totalPages) as _, i}
        <button 
          class="workspace-slot" 
          class:active={i === workspacePage}
          onclick={() => workspacePage = i}
        >
          <span class="page-num">{i + 1}</span>
          <div class="dots">
            {#each getSessionsForPage(i) as session}
              <div class="dot {session.status}" class:active-session={session.sessionId === activeSessionId}></div>
            {/each}
          </div>
        </button>
      {/each}
      <kbd style="opacity: 0.45; font-size: 11px; margin-left: 8px;">Alt + &larr; / &rarr;</kbd>
    </div>
  {/if}

  <div class="terminal-grid" bind:clientWidth={containerWidth}>
    {#each visiblePanes as pane (pane.sessionId)}
      <div class="pane-wrapper">
        <TerminalPane 
          sessionId={pane.sessionId} 
          isActive={pane.sessionId === activeSessionId} 
        />
      </div>
    {/each}
  </div>
</div>

<style>
  .terminal-grid-container {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--bg-primary, #0d1117);
  }

  .workspace-strip {
    display: flex;
    justify-content: center;
    gap: 8px;
    padding: 4px 8px;
    background: var(--bg-elevated, #161b22);
    border-bottom: 1px solid var(--border-default, #30363d);
    align-items: center;
    overflow-x: auto;
  }

  .workspace-slot {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    background: var(--bg-overlay, #21262d);
    border: 1px solid transparent;
    border-radius: 12px;
    cursor: pointer;
    color: var(--text-muted, #8b949e);
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    transition: all 0.2s ease;
  }

  .workspace-slot:hover {
    background: var(--bg-overlay-hover, #30363d);
  }

  .workspace-slot.active {
    background: var(--bg-primary, #0d1117);
    border-color: var(--color-primary, #58a6ff);
    color: var(--text-primary, #c9d1d9);
  }

  .page-num {
    font-weight: bold;
  }

  .dots {
    display: flex;
    gap: 3px;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-muted, #8b949e);
    opacity: 0.5;
  }

  .dot.active-session {
    box-shadow: 0 0 0 1px var(--color-primary, #58a6ff);
    opacity: 1;
  }

  .dot.running { background: var(--accent-green, #2ea043); opacity: 0.8; }
  .dot.failed, .dot.interrupted { background: var(--accent-red, #f85149); opacity: 0.8; }
  .dot.running.active-session { opacity: 1; }
  .dot.failed.active-session, .dot.interrupted.active-session { opacity: 1; }

  .terminal-grid {
    display: flex;
    width: 100%;
    flex: 1;
    min-height: 0;
    gap: 4px;
    overflow: hidden;
  }

  .pane-wrapper {
    flex: 1;
    min-width: min(100%, 400px);
    min-height: 0;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  :global(.terminal-grid > .pane-wrapper > .terminal-pane) {
    flex: 1;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }
</style>