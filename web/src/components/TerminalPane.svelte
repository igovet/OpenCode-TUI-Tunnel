<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { TerminalManager } from '../lib/terminal';
  import { workspace, isTerminalTabEnded } from '../lib/workspace';
  import { activeTerminalWrite, activeTerminalRef } from '../lib/activeTerminal';
  import { zoomState, setZoom, registerManager } from '../lib/zoomStore.svelte';

  let { sessionId, isActive } = $props<{ sessionId: string, isActive: boolean }>();

  let container: HTMLElement;
  let manager: TerminalManager | null = null;
  let terminalActive = $state(false);
  let unregisterManager: (() => void) | null = null;
  let containerReady = $state(false);

  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  let ongoingResizeObserver: ResizeObserver | null = null;

  let tab = $derived($workspace.tabs.find((t) => t.sessionId === sessionId));
  let tabEnded = $derived(tab ? isTerminalTabEnded(tab.status) : false);

  function setupResizeObserver(el: HTMLElement) {
    ongoingResizeObserver = new ResizeObserver(() => {
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
        manager.terminal.focus();
        activeTerminalWrite.set((data) => manager!.onData(data)); activeTerminalRef.set(manager);
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
          } catch (_) {}

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
            manager.terminal.focus();
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

  function handleClick() {
    if (!isActive) {
      workspace.activateTab(sessionId);
    }
    manager?.terminal.focus();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div
  class="terminal-pane {isActive ? 'active' : ''}"
  onclick={handleClick}
  ontouchstart={(e) => e.stopPropagation()}
  ontouchmove={(e) => e.stopPropagation()}
  role="button"
  style="touch-action: none"
>
  {#if isActive}
    <div class="zoom-toolbar">
      <button onclick={() => setZoom(zoomState.value - 1)}>-</button>
      <span>{zoomState.value}px</span>
      <button onclick={() => setZoom(zoomState.value + 1)}>+</button>
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
    display: flex;
    align-items: center;
    gap: 8px;
    background: #161b22;
    padding: 2px 8px;
    border: 1px solid #30363d;
    border-top: none;
    border-bottom-left-radius: 4px;
    border-bottom-right-radius: 4px;
    font-family: monospace;
    font-size: 11px;
    color: #8b949e;
    opacity: 0.5;
    transition: opacity 0.2s;
  }

  .zoom-toolbar:hover {
    opacity: 1;
  }

  .zoom-toolbar button {
    background: none;
    border: none;
    color: #e6edf3;
    cursor: pointer;
    padding: 0 4px;
    font-family: monospace;
    font-size: 12px;
  }

  .zoom-toolbar button:hover {
    color: #58a6ff;
  }

  .terminal-pane {
    flex: 1;
    min-height: 0;
    min-width: 0;
    position: relative;
    border: 1px solid transparent;
    height: 100%;
    width: 100%;
    overflow: hidden;
    padding: 0;
    margin: 0;
    box-sizing: border-box;
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
  }

  :global(.terminal-pane .xterm-screen canvas) {
    image-rendering: auto;
    touch-action: pan-y;
    transform: none !important;
  }

  .terminal-pane.active {
    border-color: var(--color-primary, #58a6ff);
  }

  :global(.terminal-pane .xterm-viewport) {
    width: 100% !important;
    background-color: #0d1117 !important;
    overflow-y: hidden !important;
    scrollbar-width: none !important; /* Firefox */
    overscroll-behavior: contain;
    touch-action: pan-y;
    -webkit-overflow-scrolling: touch;
  }

  :global(.terminal-pane .xterm-viewport::-webkit-scrollbar) {
    display: none !important;
    width: 0 !important;
  }
</style>
