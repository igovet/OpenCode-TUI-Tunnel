<script lang="ts">
  import { tick } from 'svelte';
  import { get } from 'svelte/store';
  import {
    TerminalManager,
    refreshAllManagers,
    type TerminalConnectionStatus,
  } from '../lib/terminal';
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
  } = $props<{
    sessionId: string;
    isActive: boolean;
    showBorder?: boolean;
    showChrome?: boolean;
  }>();

  let container: HTMLElement;
  let manager = $state<TerminalManager | null>(null);
  let terminalActive = $state(false);
  let containerReady = $state(false);
  let connectionStatus = $state<TerminalConnectionStatus>('disconnected');

  let tab = $derived($workspace.tabs.find((t) => t.sessionId === sessionId));
  let tabEnded = $derived(tab ? isTerminalTabEnded(tab.status) : false);
  let showConnectionStatus = $derived(
    containerReady &&
      !tabEnded &&
      (connectionStatus === 'disconnected' || connectionStatus === 'reconnecting'),
  );
  let connectionStatusText = $derived(
    connectionStatus === 'reconnecting' ? 'Reconnection...' : 'Connection...',
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
          manager.fitAddon.fit();
        }
      }, 50);
    });
    ongoingResizeObserver.observe(el);
  }

  $effect(() => {
    if (isActive !== terminalActive) {
      terminalActive = isActive;
      if (isActive && manager && containerReady) {
        manager.fitWhenReady();
        if (!window.matchMedia('(pointer: coarse)').matches) {
          manager.terminal.focus();
        }
        activeTerminalWrite.set((data) => manager!.onData(data)); activeTerminalRef.set(manager);
        // Refresh ALL visible terminals when a pane becomes active
        // (intra-window switch does not fire window blur/focus events)
        refreshAllManagers();
      } else if (!isActive && manager) {
        // Also refresh when losing active status
        refreshAllManagers();
      }
    }
  });

  $effect(() => {
    if (!container) {
      return;
    }

    let disposed = false;
    const localManager = new TerminalManager(container, 80, 24);
    manager = localManager;

    const unregisterManager = registerManager(localManager);
    localManager.onExit((code) => {
      workspace.updateTabStatus(sessionId, code === 0 ? 'exited' : 'failed');
    });

    let opened = false;
    const initialRo = new ResizeObserver((entries) => {
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

          await localManager.open();

          if (disposed) {
            return;
          }

          try {
            await new Promise((resolve) => setTimeout(resolve, 100));
            localManager.fitAddon.fit();
          } catch {
            // intentional
          }

          initialRo.disconnect();
          setupResizeObserver(container);

          const activeTab = get(workspace).tabs.find((candidate) => candidate.sessionId === sessionId);
          const isEnded = activeTab ? isTerminalTabEnded(activeTab.status) : false;

          if (!isEnded) {
            localManager.connect(sessionId);
          } else {
            localManager.terminal.writeln('\r\n\x1b[33mSession ended\x1b[0m');
          }

          if (isActive) {
            if (!window.matchMedia('(pointer: coarse)').matches) {
              localManager.terminal.focus();
            }
            activeTerminalWrite.set((data) => localManager.onData(data));
            activeTerminalRef.set(localManager);
            refreshAllManagers();
          }
        })();
      }
    });

    initialRo.observe(container);

    return () => {
      disposed = true;
      initialRo.disconnect();

      if (ongoingResizeObserver) {
        ongoingResizeObserver.disconnect();
        ongoingResizeObserver = null;
      }

      if (resizeTimer) {
        clearTimeout(resizeTimer);
        resizeTimer = null;
      }

      unregisterManager();

      if (get(activeTerminalRef) === localManager) {
        activeTerminalWrite.set(null);
        activeTerminalRef.set(null);
      }

      localManager.dispose();
      if (manager === localManager) {
        manager = null;
      }
      containerReady = false;
      connectionStatus = 'disconnected';
    };
  });

  $effect(() => {
    if (!manager) {
      connectionStatus = 'disconnected';
      return;
    }

    return manager.onConnectionStatusChange((status) => {
      connectionStatus = status;
    });
  });

  function handleClick(event: MouseEvent) {
    if (event.target instanceof Element && event.target.closest('.pane-chrome')) {
      return;
    }

    if (!isActive) {
      workspace.activateTab(sessionId);
      refreshAllManagers();
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
    {#if showConnectionStatus}
      <div class="connection-status" aria-live="polite">{connectionStatusText}</div>
    {/if}
    <div
      class="terminal-container"
      bind:this={container}
      style="opacity: {containerReady ? 1 : 0}"
      role="application"
      aria-label={terminalAriaLabel}
    ></div>
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
    font-size: 12px;
    line-height: 1;
    background: color-mix(in srgb, var(--bg-terminal) 55%, transparent);
    color: var(--text-secondary);
    font-family: var(--font-mono);
  }

  /* ── xterm overrides ── */
  :global(.terminal-pane .xterm-screen canvas) {
    image-rendering: pixelated;
    touch-action: none;
    transform: translateZ(0) !important;
  }

  :global(.terminal-pane .xterm-viewport) {
    width: 100% !important;
    background-color: var(--bg-terminal) !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    scrollbar-width: none !important; /* Firefox */
    overscroll-behavior: contain;
    touch-action: none;
    -webkit-overflow-scrolling: touch;
  }

  :global(.terminal-pane .xterm-viewport::-webkit-scrollbar) {
    display: none !important;
    width: 0 !important;
  }

  :global(.xterm-rows),
  :global(.xterm-row) {
    line-height: normal !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  :global(.terminal-pane .xterm) {
    width: 100%;
    height: 100%;
    font-variant-ligatures: none !important;
    font-feature-settings: "liga" 0, "calt" 0 !important;
    padding: 0;
    margin: 0;
  }

  /* ── xterm 6 internal layout: stretch to fill the pane ──
     xterm sizes `.xterm-scrollable-element` / `.xterm-screen` to an integer
     number of character rows×cols, leaving a residual empty strip on the
     bottom (row-quantization remainder) and on the right (col-quantization
     remainder). The render canvas only paints the quantized region, so the
     leftover strip shows the container background. Because xterm's theme
      background (#080808) equals `--bg-terminal`, stretching these internal
     containers to `100%` makes the residual strip blend seamlessly — the
     visible "gap" disappears while xterm keeps rendering text to the
     quantized cell grid. `!important` overrides xterm's runtime inline
     `width`/`height` on `.xterm-screen`. The render canvases themselves are
     NOT stretched (their CSS width stays at the cell-grid width set inline
     by xterm) to keep glyphs crisp — the residual right strip is filled by
     the opaque `.xterm-screen` background which is the same terminal bg. */
  :global(.terminal-pane .xterm-scrollable-element) {
    width: 100% !important;
    height: 100% !important;
  }

  :global(.terminal-pane .xterm-screen) {
    width: 100% !important;
    height: 100% !important;
    background-color: var(--bg-terminal) !important;
    display: block;
    overflow: hidden !important;
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

</style>