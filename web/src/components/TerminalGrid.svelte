<script lang="ts">
  import TerminalPane from './TerminalPane.svelte';
  import { workspace } from '../lib/workspace';

  let containerWidth = $state(0);
  
  // Compute paneCount: < 900px → 1, 900-1600px → 2, > 1600px → 3
  let paneCount = $derived(
    containerWidth < 900 ? 1 : containerWidth > 1600 ? 3 : 2
  );

  let activeSessionId = $derived($workspace.activeTabId);
  let tabs = $derived($workspace.tabs);

  // Show the active tab + neighboring tabs (up to paneCount)
  let visiblePanes = $derived(() => {
    if (tabs.length === 0) return [];
    
    let activeIndex = tabs.findIndex(t => t.sessionId === activeSessionId);
    if (activeIndex === -1) activeIndex = 0;

    let start = Math.max(0, activeIndex - Math.floor(paneCount / 2));
    let end = start + paneCount;
    
    if (end > tabs.length) {
      end = tabs.length;
      start = Math.max(0, end - paneCount);
    }

    return tabs.slice(start, end);
  });
</script>

<div class="terminal-grid" bind:clientWidth={containerWidth} style="grid-template-columns: repeat({visiblePanes().length}, 1fr);">
  {#each visiblePanes() as pane (pane.sessionId)}
    <TerminalPane 
      sessionId={pane.sessionId} 
      isActive={pane.sessionId === activeSessionId} 
    />
  {/each}
</div>

<style>
  .terminal-grid {
    display: grid;
    width: 100%;
    height: 100%;
    min-height: 0;
    gap: 4px;
    background: var(--bg-primary, #0d1117);
    overflow: hidden;
    grid-auto-rows: minmax(0, 1fr);
  }

  :global(.terminal-grid > .terminal-pane) {
    min-height: 0;
    overflow: hidden;
  }
</style>
