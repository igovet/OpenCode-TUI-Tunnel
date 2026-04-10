<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { TerminalManager, refreshAllManagers } from '../lib/terminal';
  import { workspace, isTerminalTabEnded } from '../lib/workspace';
  import { activeTerminalWrite, activeTerminalRef } from '../lib/activeTerminal';
  import { zoomState, setZoom, registerManager } from '../lib/zoomStore.svelte';

  let { sessionId, isActive, showBorder = false } = $props<{ sessionId: string, isActive: boolean, showBorder?: boolean }>();

  let container: HTMLElement;
  let manager: TerminalManager | null = null;
  let terminalActive = $state(false);
  let unregisterManager: (() => void) | null = null;
  let containerReady = $state(false);

  let tab = $derived($workspace.tabs.find((t) => t.sessionId === sessionId));
  let tabEnded = $derived(tab ? isTerminalTabEnded(tab.status) : false);

  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  let ongoingResizeObserver: ResizeObserver | null = null;
  let zoomMenuOpen = $state(false);

  const ZOOM_PRESETS = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24];

  let lastObservedW = 0;
  let lastObservedH = 0;

  $effect(() => {
    if (!zoomMenuOpen) {
      return;
    }

    const onDocumentClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('.zoom-toolbar')) {
        return;
      }

      zoomMenuOpen = false;
    };

    document.addEventListener('click', onDocumentClick);
    return () => {
      document.removeEventListener('click', onDocumentClick);
    };
  });

  function toggleZoomMenu(event: Event) {
    event.stopPropagation();
    zoomMenuOpen = !zoomMenuOpen;
  }

  function selectZoom(event: Event, value: number) {
    event.stopPropagation();
    setZoom(value);
    zoomMenuOpen = false;
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

  onMount(() => {
    manager = new TerminalManager(container, 80, 24);

    unregisterManager = registerManager(manager);
    // NOTE: connect() is called AFTER open() — see initialRo below
    
    manager.onExit((code) => {
      workspace.updateTabStatus(sessionId, code === 0 ? 'exited' : 'failed');
    });

    let opened = false;
    const initialRo = new ResizeObserver((entries) => {
      const entry = entries[0];
      const { width, height } = entry.contentRect;
      if (!opened && width > 0 && height > 0) {
        opened = true;
        (async () => {
          // Step 1: mark container ready so Svelte removes placeholder + opacity becomes 1
          containerReady = true;
          console.log('[TerminalPane] containerReady set, waiting for tick...');

          // Step 2: wait for Svelte DOM flush before open/fit/connect
          await tick();
          console.log('[TerminalPane] tick done, calling open()...');

          if (!manager) return;
          await manager.open();
          console.log('[TerminalPane] open() done');

          try {
            // Brief delay to ensure xterm metrics/canvas settle before first fit.
            await new Promise((resolve) => setTimeout(resolve, 100));
            manager.fitAddon.fit();
            console.log('[TerminalPane] fit() done, cols:', manager.terminal.cols, 'rows:', manager.terminal.rows);
          } catch {
            // intentional
          }

          initialRo.disconnect();
          setupResizeObserver(container);

          // Step 3: connect AFTER terminal is open and rendered
          if (!tabEnded) {
            manager.connect(sessionId);
            console.log('[TerminalPane] connect() called for', sessionId);
          } else {
            manager.terminal.writeln('\r\n\x1b[33mSession ended\x1b[0m');
          }

          if (isActive) {
            if (!window.matchMedia('(pointer: coarse)').matches) {
              manager.terminal.focus();
            }
            activeTerminalWrite.set((data) => manager!.onData(data));
            activeTerminalRef.set(manager);
          }
        })();
      }
    });
    initialRo.observe(container);

    return () => {
      initialRo.disconnect();
      if (ongoingResizeObserver) {
        ongoingResizeObserver.disconnect();
      }
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  });

  onDestroy(() => {
    if (unregisterManager) {
      unregisterManager();
    }
    if (isActive) {
      activeTerminalWrite.set(null); activeTerminalRef.set(null);
    }
    if (manager) {
      manager.dispose();
      manager = null;
    }
    if (ongoingResizeObserver) {
      ongoingResizeObserver.disconnect();
    }
    if (resizeTimer) clearTimeout(resizeTimer);
  });

  function handleClick(event: MouseEvent) {
    if (event.target instanceof Element && event.target.closest('.zoom-toolbar')) {
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
    zoomMenuOpen = false;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div
  class="terminal-pane {showBorder ? 'show-border' : ''} {isActive && showBorder ? 'active' : ''}"
  onclick={handleClick}
  ontouchstart={(e) => e.stopPropagation()}
  ontouchmove={(e) => e.stopPropagation()}
  role="button"
  style="touch-action: none"
>
  {#if isActive}
    <div class="zoom-toolbar">
      <button class="zoom-trigger" onclick={toggleZoomMenu} aria-haspopup="menu" aria-expanded={zoomMenuOpen} aria-label="Terminal zoom presets">
        {zoomState.value}px ▾
      </button>
      {#if zoomMenuOpen}
        <div class="zoom-menu" role="menu" aria-label="Zoom level options">
          {#each ZOOM_PRESETS as size}
            <button
              class="zoom-option"
              class:selected={zoomState.value === size}
              role="menuitemradio"
              aria-checked={zoomState.value === size}
              onclick={(e) => selectZoom(e, size)}
            >
              {size}px
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
  {#if !containerReady}
    <div class="terminal-placeholder"></div>
  {/if}
  <div class="terminal-container" bind:this={container} style="opacity: {containerReady ? 1 : 0}"></div>
</div>

<style>

  .zoom-toolbar {
    position: absolute;
    top: 0;
    right: 16px;
    z-index: 10;
  }

  .zoom-trigger {
    font-size: 11px;
    padding: 2px 6px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-default);
    border-radius: 0;
    color: var(--text-secondary);
    cursor: pointer;
    font-family: var(--font-mono);
    white-space: nowrap;
  }

  .zoom-menu {
    position: absolute;
    top: calc(100% + 2px);
    right: 0;
    background: var(--bg-elevated);
    border: 1px solid var(--border-default);
    border-radius: 0;
    overflow: hidden;
    z-index: 100;
    min-width: 60px;
  }

  .zoom-option {
    display: block;
    width: 100%;
    text-align: right;
    padding: 3px 8px;
    font-size: 11px;
    font-family: var(--font-mono);
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .zoom-option:hover {
    background: var(--bg-overlay);
  }

  .zoom-option.selected {
    color: var(--accent-blue);
    background: var(--bg-overlay);
  }

  .terminal-pane {
    flex: 1;
    min-height: 0;
    min-width: 0;
    position: relative;
    border: 1px solid var(--border-default);
    border-top-width: 2px;
    border-top-color: transparent;
    height: 100%;
    width: 100%;
    overflow: hidden;
    padding: 0;
    margin: 0;
    box-sizing: border-box;
    opacity: 1;
    transition: opacity 0.2s ease, border-top-color 0.2s ease;
  }

  .terminal-placeholder {
    position: absolute;
    inset: 0;
  }

  .terminal-container {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: #0d1117;
    display: flex;
    align-items: center;
    justify-content: center;
    max-width: 100%;
  }

  :global(.terminal-pane .xterm-screen canvas) {
    image-rendering: pixelated;
    touch-action: pan-y;
    transform: translateZ(0) !important;
  }

  .terminal-pane.show-border:not(.active) {
    opacity: 0.5;
  }

  .terminal-pane.show-border.active {
    opacity: 1;
    border-top-color: var(--accent-blue);
  }

  :global(.terminal-pane .xterm-viewport) {
    width: 100% !important;
    background-color: #0d1117 !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    scrollbar-width: none !important; /* Firefox */
    overscroll-behavior: contain;
    touch-action: pan-y;
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
    font-variant-ligatures: none !important;
    font-feature-settings: "liga" 0, "calt" 0 !important;
  }

  :global(.terminal-pane .xterm-screen) {
    width: 100%;
    display: block;
    overflow: hidden !important;
  }

  @media (max-width: 768px) {
    button:hover,
    button:focus,
    button:focus-visible,
    .zoom-trigger:hover,
    .zoom-trigger:focus,
    .zoom-trigger:focus-visible,
    .zoom-option:hover,
    .zoom-option:focus,
    .zoom-option:focus-visible {
      outline: none;
      background: inherit;
      color: inherit;
      border-color: inherit;
      box-shadow: none;
    }
  }
</style>
