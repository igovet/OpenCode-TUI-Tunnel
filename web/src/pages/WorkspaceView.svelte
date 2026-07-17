<script lang="ts">
  import TerminalGrid from '../components/TerminalGrid.svelte';
  import MobileKeybar from '../components/MobileKeybar.svelte';
  import { activeTerminalRef } from '../lib/activeTerminal';
  import { observeMobileTouchViewport } from '../lib/device';
  import { getCurrentPushSubscription, subscribeToPushNotifications } from '../lib/notifications';
  import { getSettings, setSettings } from '../lib/settings';
  import { refreshAllManagersVisual } from '../lib/zoomStore.svelte';
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

  $effect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    void (async () => {
      const settings = getSettings();
      if (!settings.notificationsEnabled) {
        return;
      }

      const subscription = await getCurrentPushSubscription();
      if (subscription) {
        return;
      }

      const subscribed = await subscribeToPushNotifications();
      if (!subscribed) {
        setSettings({ ...settings, notificationsEnabled: false });
      }
    })();
  });

  let vpHeight = $state(typeof window !== 'undefined' ? (window.visualViewport?.height ?? window.innerHeight) : 800);
  $effect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const handler = () => {
      vpHeight = window.visualViewport!.height;
      requestAnimationFrame(() => {
        const terminal = get(activeTerminalRef);
        if (terminal) terminal.scheduleFit(50);
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

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshAllManagersVisual();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  });
</script>

<div class="workspace" style="height: {isMobile ? (vpHeight > 0 ? (vpHeight - headerHeight) + 'px' : '100%') : '100%'}; width: 100%; box-sizing: border-box; overflow: hidden; padding-bottom: {isMobile ? 'var(--mobile-keybar-height)' : '0'};">
  <!-- Visually-hidden heading serves as the screen-reader context label and
       the focus target for view-transition focus management (concept §5.1).
       tabindex is set programmatically by App.svelte's focus effect. -->
  <h2 class="sr-only" data-view-focus>Terminal workspace</h2>
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
    background: var(--bg-terminal);
  }
  .workspace-terminals {
    display: flex;
    flex-direction: column;
    flex: 1;
    width: 100%;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    background: var(--bg-terminal);
  }
</style>
