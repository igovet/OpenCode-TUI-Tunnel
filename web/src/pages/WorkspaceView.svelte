<script lang="ts">
  import TerminalGrid from '../components/TerminalGrid.svelte';
  import MobileKeybar from '../components/MobileKeybar.svelte';
  import { activeTerminalRef } from '../lib/activeTerminal';
  import { observeMobileTouchViewport } from '../lib/device';
  import { terminalManagers } from '../lib/zoomStore.svelte';
  import { get } from 'svelte/store';
  
  let { headerHeight = 40 } = $props<{ headerHeight?: number }>();

  // Reactive active tab
  // Show keybar only on compact coarse-pointer viewports.
  let isMobile = $state(false);
  
  $effect(() => {
    if (typeof window === 'undefined') return;
    return observeMobileTouchViewport(window, (nextIsMobile) => {
      isMobile = nextIsMobile;
    });
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

  $effect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const reconnectActiveTerminal = () => {
      const activeTerminal = get(activeTerminalRef);
      activeTerminal?.reconnectIfDisconnected();
      for (const manager of terminalManagers) {
        if (manager !== activeTerminal) {
          manager.reconnectIfDisconnected();
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        reconnectActiveTerminal();
      }
    };

    const handlePageShow = () => {
      reconnectActiveTerminal();
    };

    const handleFocus = () => {
      reconnectActiveTerminal();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleFocus);
    };
  });
</script>

<div class="workspace" style="height: {isMobile ? (vpHeight > 0 ? (vpHeight - headerHeight) + 'px' : '100%') : '100%'}; width: 100%; box-sizing: border-box; overflow: hidden; padding-bottom: {isMobile ? '44px' : '0'};">
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
    width: 100%;
    overflow: hidden;
  }
  .workspace-terminals {
    display: flex;
    flex-direction: column;
    flex: 1;
    width: 100%;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }
</style>
