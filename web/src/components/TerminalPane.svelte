<script lang="ts">
  import { tick } from 'svelte';
  import { get } from 'svelte/store';
  import type { TerminalManager } from '../lib/terminal';
  import { workspace, isTerminalTabEnded } from '../lib/workspace';
  import { activeTerminalWrite, activeTerminalRef } from '../lib/activeTerminal';
  import { registerManager } from '../lib/zoomStore.svelte';
  import Icon from './ui/Icon.svelte';
  import StatusDot from './ui/StatusDot.svelte';
  import Tooltip from './ui/Tooltip.svelte';

  let {
    sessionId,
    isActive,
    showBorder = false,
    showChrome = true,
    sleep = false,
  } = $props<{
    sessionId: string;
    isActive: boolean;
    showBorder?: boolean;
    showChrome?: boolean;
    sleep?: boolean;
  }>();

  let container: HTMLElement;
  let manager = $state<TerminalManager | null>(null);
  let containerReady = $state(false);
  let connectionStatus = $state<'connected' | 'disconnected'>('disconnected');
  let prevSleep = $state(false);

  let tab = $derived($workspace.tabs.find((t) => t.sessionId === sessionId));
  let tabEnded = $derived(tab ? isTerminalTabEnded(tab.status) : false);

  let showConnectionStatus = $derived(
    containerReady && !tabEnded && connectionStatus === 'disconnected',
  );
  let connectionStatusText = $derived(
    manager?.getConnectionStatus() === 'disconnected' && manager?.hasEstablishedConnection()
      ? 'Connection lost'
      : 'Connection...',
  );

  let isSshTab = $derived(tab?.backend === 'ssh');
  let paneTitle = $derived(
    tab?.title || (tab?.cwd ? basename(tab.cwd) : '') || sessionId.slice(0, 8),
  );
  let paneCwd = $derived(tab?.cwd ?? '');
  let attentionKind = $derived(
    tab?.attention && tab.attention !== 'none' ? tab.attention : null,
  );
  // Screen-reader label for the xterm application region. xterm.js renders its
  // output to a canvas and is not natively accessible, so an enclosing
  // role="application" with a descriptive aria-label gives screen-reader users
  // context about what the pane contains (concept §5.3).
  let paneStatusText = $derived(tab?.status ?? 'unknown');
  let terminalAriaLabel = $derived(
    `Terminal session: ${paneCwd || paneTitle}, status ${paneStatusText}`,
  );

  // Overlay removed — the terminal is blank/black when disconnected, which is sufficient.

  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  let ongoingResizeObserver: ResizeObserver | null = null;

  let lastObservedW = 0;
  let lastObservedH = 0;

  function basename(path: string): string {
    return path.split('/').pop() || path;
  }

  function setupResizeObserver(el: HTMLElement) {
    ongoingResizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width === lastObservedW && height === lastObservedH) return;
      lastObservedW = width;
      lastObservedH = height;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (manager) {
          manager.fit();
        }
      }, 50);
    });
    ongoingResizeObserver.observe(el);
  }

  $effect(() => {
    if (!manager || !containerReady) return;
    if (isActive) {
      activeTerminalWrite.set((data) => manager.onData(data));
      activeTerminalRef.set(manager);
    }
  });

  $effect(() => {
    if (!container) {
      return;
    }

    let disposed = false;
    let localManager: TerminalManager | null = null;
    let unregisterManager: (() => void) | null = null;
    let initialRo: ResizeObserver | null = null;

    (async () => {
      // Wait for fonts to load before creating terminal
      // JetBrains Mono must be available for correct char measurement
      await document.fonts.ready;

      const { TerminalManager: TM } = await import('../lib/terminal');
      if (disposed) return;

      localManager = new TM(container, 80, 24);
      manager = localManager;

      unregisterManager = registerManager(localManager);
      localManager.onExit((code) => {
        workspace.updateTabStatus(sessionId, code === 0 ? 'exited' : 'failed');
      });

      let opened = false;
      initialRo = new ResizeObserver((entries) => {
        const entry = entries[0];
        const { width, height } = entry.contentRect;
        if (!opened && width > 0 && height > 0) {
          opened = true;
          (async () => {
            containerReady = true;
            await tick();

            if (disposed) {
              return;
            }

            await localManager!.open();

            if (disposed) {
              return;
            }

            try {
              await new Promise((resolve) => setTimeout(resolve, 100));
              if (disposed) return;
              localManager!.fit();
            } catch {
              // intentional
            }

            if (disposed) return;
            initialRo!.disconnect();
            if (container) {
              setupResizeObserver(container);
            }

            const activeTab = get(workspace).tabs.find((candidate) => candidate.sessionId === sessionId);
            const isEnded = activeTab ? isTerminalTabEnded(activeTab.status) : false;

            if (!isEnded) {
              localManager!.connect(sessionId);
            } else {
              localManager!.terminal.writeln('\r\n\x1b[33mSession ended\x1b[0m');
            }

          })();
        }
      });

      initialRo.observe(container);
    })();

    return () => {
      disposed = true;
      if (initialRo) {
        initialRo.disconnect();
      }

      if (ongoingResizeObserver) {
        ongoingResizeObserver.disconnect();
        ongoingResizeObserver = null;
      }

      if (resizeTimer) {
        clearTimeout(resizeTimer);
        resizeTimer = null;
      }

      if (unregisterManager) {
        unregisterManager();
      }

      if (localManager) {
        if (get(activeTerminalRef) === localManager) {
          activeTerminalWrite.set(null);
          activeTerminalRef.set(null);
        }

        localManager.dispose();
        if (manager === localManager) {
          manager = null;
        }
      }
      containerReady = false;
    };
  });

  $effect(() => {
    if (!manager) return;
    return manager.onConnectionStatusChange((status) => {
      // Ignore brief disconnect during reconnect cycle.
      // When waking from sleep, connect() closes old WS (fires 'disconnected')
      // then opens new WS (fires 'connected'). We don't want to show the
      // overlay during this brief transition.
      if (status === 'disconnected' && connectionStatus === 'connected') {
        return;
      }
      connectionStatus = status === 'connected' ? 'connected' : 'disconnected';
    });
  });

  // Connection status listener effect removed — no overlay to drive.

  $effect(() => {
    if (!manager || !containerReady) return;

    // Only act when sleep state actually changes — not on every reactive re-run
    // (e.g., when workspace.tabs changes on tab click)
    if (sleep === prevSleep) return;
    prevSleep = sleep;

    if (sleep) {
      // Disconnect when going to sleep
      manager.disconnect();
    } else if (!tabEnded) {
      // Only connect if the terminal was ALREADY opened before sleep.
      // The first-time open/fit/connect (display:none → visible) is handled
      // by the initial ResizeObserver callback in the main setup effect.
      // Connecting before the canvas is created causes DPI to be measured at 1x,
      // resulting in crispy/fuzzy fonts even after a subsequent fit().
        if (manager.isConnectedOnce && manager.ws?.readyState !== WebSocket.OPEN) {
        // Immediately mark as connected to prevent overlay flash.
        // connect() will close the old WS (firing 'disconnected') then open
        // a new one (firing 'connected'). By setting 'connected' first, the
        // guard in onConnectionStatusChange ignores the brief 'disconnected'.
        connectionStatus = 'connected';
        manager.connect(sessionId, true);
      }
    }
  });

  function handleClick(event: MouseEvent) {
    if (event.target instanceof Element && event.target.closest('.pane-chrome')) {
      return;
    }

    if (!isActive) {
      workspace.activateTab(sessionId);
    }
    // Only focus (and open virtual keyboard) on non-touch/desktop devices
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    if (!isTouch) {
      manager?.terminal.focus();
    }
  }
</script>

<!-- The pane is a group landmark for screen readers: it owns a chrome header
     and an xterm application region. The onclick activates the pane but the
     element is not a true button, so role="group" with a descriptive label is
     the correct semantic (concept §5.3). The svelte-ignore directives suppress
     the interactive-element checks that apply because a group landmark hosts a
     click-to-activate handler (pointer + touch) for pane focus management. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="terminal-pane"
  onclick={handleClick}
  ontouchstart={(e) => e.stopPropagation()}
  ontouchmove={(e) => e.stopPropagation()}
  role="group"
  aria-label={`Terminal pane: ${paneTitle}`}
  style="touch-action: none"
>
  {#if showChrome}
    <div
      class="pane-chrome"
      class:active={isActive && showBorder}
      aria-label={`Pane: ${paneTitle}`}
    >
      <div class="chrome-left">
        {#if attentionKind}
          {#if attentionKind === 'question'}
            <Icon name="info" size={14} class="attention-icon" aria-label="Question requires attention" />
          {:else}
            <Icon name="key" size={14} class="attention-icon" aria-label="Permission requires attention" />
          {/if}
        {:else if tab}
          <StatusDot status={tab.status} size="sm" />
        {/if}
        <span class="pane-title" title={paneCwd}>{paneTitle}</span>
      </div>

      <div class="chrome-right">
        {#if isSshTab}
          <Tooltip content="SSH remote session" position="bottom">
            <span class="ssh-badge"><Icon name="globe" size={12} />SSH</span>
          </Tooltip>
        {/if}
      </div>
    </div>
  {/if}

  <div class="pane-body">
    {#if !containerReady}
      <div class="terminal-placeholder"></div>
    {/if}

    <div
      class="terminal-container"
      bind:this={container}
      style="opacity: {containerReady ? 1 : 0}"
      role="application"
      aria-label={terminalAriaLabel}
    ></div>

    {#if showConnectionStatus}
      <div class="connection-status" class:connection-lost={connectionStatusText === 'Connection lost'} aria-live="polite">
        <span class="connection-status-text">{connectionStatusText}</span>
        {#if connectionStatusText === 'Connection lost'}
          <span class="connection-status-sub">The session is no longer available. Close this tab or try again later.</span>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .terminal-pane {
    flex: 1;
    min-height: 0;
    min-width: 0;
    position: relative;
    display: flex;
    flex-direction: column;
    border: none;
    height: 100%;
    width: 100%;
    overflow: hidden;
    outline: none;
    padding: 0;
    margin: 0;
    box-sizing: border-box;
    transition: none;
    background: var(--bg-terminal);
  }

  /* ── Pane chrome (slim header) ── */
  .pane-chrome {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2, 8px);
    height: 28px;
    flex: 0 0 28px;
    padding: 0 8px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-subtle);
    font-family: var(--font-ui);
    color: var(--text-secondary);
    user-select: none;
    z-index: 10;
    position: relative;
    transition: opacity var(--transition-base), background var(--transition-base), box-shadow var(--transition-base);
  }

  .chrome-left {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .pane-title {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 240px;
  }

  .chrome-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  :global(.attention-icon) {
    color: var(--accent-yellow);
    flex-shrink: 0;
    animation: attention-pulse 1.15s ease-in-out infinite;
  }

  @keyframes attention-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.45; }
  }

  .ssh-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-family: var(--font-mono);
    padding: 1px 6px;
    background: color-mix(in srgb, var(--accent-cyan) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent-cyan) 50%, transparent);
    border-radius: var(--radius-sm);
    color: var(--accent-cyan);
    white-space: nowrap;
    pointer-events: none;
    user-select: none;
    letter-spacing: 0.04em;
  }

  /* ── Terminal body ── */
  .pane-body {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    background: var(--bg-terminal);
  }

  .terminal-placeholder {
    position: absolute;
    inset: 0;
  }

  .terminal-container {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: var(--bg-terminal);
    display: block;
    width: 100%;
    height: 100%;
  }

  /* ── Active pane chrome accent (multi-pane mode) ──
     In multi-pane mode (showBorder=true), the active pane's chrome header
     gets a subtle blue tint, an accent bottom border, and the title in
     accent-blue so the user can visually identify the focused terminal. */
  .pane-chrome.active {
    background: color-mix(in srgb, var(--accent-blue) 10%, var(--bg-surface));
    border-bottom: 2px solid color-mix(in srgb, var(--accent-blue) 55%, transparent);
  }

  .pane-chrome.active .pane-title {
    color: var(--accent-blue);
  }

  /* ── Scrollbar styling for xterm viewport ── */
  :global(.xterm-viewport) {
    scrollbar-width: thin !important;
  }

  :global(.xterm-viewport::-webkit-scrollbar) {
    width: 6px !important;
  }

  :global(.xterm-viewport::-webkit-scrollbar-track) {
    background: transparent !important;
  }

  :global(.xterm-viewport::-webkit-scrollbar-thumb) {
    background: var(--border-subtle) !important;
    border-radius: 3px !important;
  }

  :global(.xterm-viewport::-webkit-scrollbar-thumb:hover) {
    background: var(--text-muted) !important;
  }

  :global(.xterm-screen) {
    margin-right: 0 !important;
  }

  .connection-status {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9;
    pointer-events: none;
    background: var(--bg-terminal);
    color: var(--text-secondary);
  }

  .connection-status-text {
    font-family: var(--font-mono);
    font-size: 24px;
    font-weight: 700;
    letter-spacing: 4px;
    text-transform: uppercase;
    opacity: 0.6;
    image-rendering: pixelated;
    animation: connection-pulse 1.5s ease-in-out infinite;
  }

  .connection-status.connection-lost {
    background: var(--bg-overlay, #181c26);
    border: 1px solid rgba(255, 80, 80, 0.3);
    border-radius: 8px;
    padding: 16px;
    text-align: center;
  }
  .connection-status-sub {
    display: block;
    font-size: 0.85em;
    opacity: 0.7;
    margin-top: 4px;
  }

  @keyframes connection-pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 0.3; }
  }

</style>