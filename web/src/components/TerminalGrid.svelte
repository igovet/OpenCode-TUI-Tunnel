<script lang="ts">
  import TerminalPane from './TerminalPane.svelte';
  import { workspace } from '../lib/workspace';
  import { requestedWorkspacePage } from '../lib/workspacePage';
  import { workspacePage, workspaceTotalPages, workspaceMaxPanes } from '../lib/workspaceDisplay';

  let containerWidth = $state(0);
  
  let activeSessionId = $derived($workspace.activeTabId);
  let tabs = $derived($workspace.tabs);

  // Compute paneCount: < 900px → 1, 900-1600px → 2, > 1600px → 3
  let maxPanes = $derived(
    containerWidth < 900 ? 1 : 
    containerWidth > 1600 ? 3 : 2
  );

  let totalPages = $derived(Math.ceil(tabs.length / maxPanes) || 1);

  $effect(() => {
    workspaceMaxPanes.set(maxPanes);
  });

  $effect(() => {
    workspaceTotalPages.set(totalPages);
  });

  // Ensure page is within bounds when tabs length changes
  $effect(() => {
    if ($workspacePage >= totalPages) {
      workspacePage.set(Math.max(0, totalPages - 1));
    }
  });

  $effect(() => {
    const tabIdx = $requestedWorkspacePage;
    if (tabIdx !== null) {
      const targetPage = Math.floor(tabIdx / maxPanes);
      if (targetPage !== $workspacePage && targetPage < totalPages) {
        workspacePage.set(targetPage);
      }
      requestedWorkspacePage.set(null); // consume
    }
  });

  let visiblePanes = $derived(
    containerWidth < 900
      ? tabs.filter(t => t.sessionId === activeSessionId)
      : tabs.slice($workspacePage * maxPanes, ($workspacePage + 1) * maxPanes)
  );

  function activateFirstTabOnPage(newPage: number) {
    const firstTabIdx = newPage * maxPanes;
    if (firstTabIdx < tabs.length) {
      workspace.activateTab(tabs[firstTabIdx].sessionId);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (containerWidth < 900) return;
    if (e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
      if (e.key >= '1' && e.key <= '9') {
        const pageIdx = parseInt(e.key) - 1;
        if (pageIdx < totalPages) {
          workspacePage.set(pageIdx);
          activateFirstTabOnPage(pageIdx);
          e.preventDefault();
        }
      } else if (e.key === 'ArrowLeft') {
        if ($workspacePage > 0) {
          const newPage = $workspacePage - 1;
          workspacePage.set(newPage);
          activateFirstTabOnPage(newPage);
          e.preventDefault();
        }
      } else if (e.key === 'ArrowRight') {
        if ($workspacePage < totalPages - 1) {
          const newPage = $workspacePage + 1;
          workspacePage.set(newPage);
          activateFirstTabOnPage(newPage);
          e.preventDefault();
        }
      }
    }
  }

</script>

<svelte:window onkeydown={handleKeydown} />

<div class="terminal-grid-container">
  <div class="terminal-grid" bind:clientWidth={containerWidth}>
    {#each visiblePanes as pane (pane.sessionId)}
      <div class="pane-wrapper">
        <TerminalPane 
          sessionId={pane.sessionId} 
          isActive={pane.sessionId === activeSessionId} 
          showBorder={tabs.length > 1 && maxPanes > 1}
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
    min-width: 0;
    background: var(--bg-primary, #0d1117);
  }

  .terminal-grid {
    display: flex;
    width: 100%;
    flex: 1;
    min-height: 0;
    min-width: 0;
    gap: 0;
    overflow: hidden;
  }

  .pane-wrapper {
    flex: 1;
    min-width: 0;
    min-height: 0;
    height: 100%;
    width: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 0;
    margin: 0;
    box-sizing: border-box;
  }

  :global(.terminal-grid > .pane-wrapper > .terminal-pane) {
    flex: 1;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }
</style>
