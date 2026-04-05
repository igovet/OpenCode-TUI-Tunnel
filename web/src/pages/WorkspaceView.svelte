<script lang="ts">
  import { workspace } from '../lib/workspace';
  import TerminalGrid from '../components/TerminalGrid.svelte';
  import MobileKeybar from '../components/MobileKeybar.svelte';
  import { activeTerminalWrite, activeTerminalRef } from '../lib/activeTerminal';
  import { get } from 'svelte/store';
  
  let { headerHeight = 40 } = $props<{ headerHeight?: number }>();

  // Reactive active tab
  let activeTab = $derived($workspace.tabs.find(t => t.sessionId === $workspace.activeTabId));
  
  // Hide keybar on desktop (viewport >= 900px or when pointer: fine / non-coarse pointer)
  let isMobile = $state(true);
  
  $effect(() => {
    const checkMobile = () => {
      // isMobile if width < 900 AND it's a coarse pointer device
      // Actually, if it's fine pointer, hide it. If it's >= 900px, hide it.
      const isDesktopWidth = window.innerWidth >= 900;
      const isFinePointer = window.matchMedia('(pointer: fine)').matches;
      isMobile = !(isDesktopWidth || isFinePointer);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  });

  let vpHeight = $state(typeof window !== 'undefined' ? (window.visualViewport?.height ?? window.innerHeight) : 800);
  $effect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const handler = () => {
      vpHeight = window.visualViewport!.height;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const terminal = get(activeTerminalRef);
          if (terminal) terminal.scheduleFit(0);
        });
      });
    };
    window.visualViewport.addEventListener('resize', handler);
    handler();
    return () => window.visualViewport?.removeEventListener('resize', handler);
  });
</script>

<div class="workspace" style="height: {isMobile ? (vpHeight > 0 ? (vpHeight - headerHeight) + 'px' : '100%') : '100%'}; box-sizing: border-box; overflow: hidden; padding-bottom: {isMobile ? '44px' : '0'};">
  <div class="workspace-terminals">
    <TerminalGrid />
  </div>
  {#if isMobile}
    <MobileKeybar />
  {/if}
</div>

<style>
  .workspace {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
  .workspace-terminals {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
