<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { TerminalManager } from '../lib/terminal';
  import { workspace } from '../lib/workspace';
  import { activeTerminalWrite, activeTerminalRef } from '../lib/activeTerminal';
  import { zoomState, setZoom, registerManager } from '../lib/zoomStore.svelte';

  let { sessionId, isActive } = $props<{ sessionId: string, isActive: boolean }>();

  let container: HTMLElement;
  let manager: TerminalManager | null = null;
  let terminalActive = $state(false);
  let unregisterManager: (() => void) | null = null;

  $effect(() => {
    if (isActive !== terminalActive) {
      terminalActive = isActive;
      if (isActive && manager) {
        manager.fitWhenReady();
        manager.terminal.focus();
        manager.terminal.refresh(0, manager.terminal.rows - 1);
        manager.fitAddon?.fit();
        activeTerminalWrite.set((data) => manager!.onData(data)); activeTerminalRef.set(manager);
      }
    }
  });

  onMount(() => {
    manager = new TerminalManager(container, 80, 24);
    unregisterManager = registerManager(manager);
    manager.connect(sessionId);
    manager.fitWhenReady();
    manager.onExit((code) => {
      workspace.updateTabStatus(sessionId, code === 0 ? 'exited' : 'failed');
    });

    if (isActive) {
      activeTerminalWrite.set((data) => manager!.onData(data)); activeTerminalRef.set(manager);
    }

    const resizeObserver = new ResizeObserver(() => {
      manager?.scheduleFit();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
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
  <div class="terminal-container" bind:this={container}></div>
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
  }

  .terminal-container {
    height: 100%;
    min-height: 0;
    min-width: 0;
    width: 100%;
    overflow: hidden;
  }

  :global(.terminal-pane .xterm-screen canvas) {
    image-rendering: auto;
    touch-action: pan-y;
  }

  .terminal-pane.active {
    border-color: var(--color-primary, #58a6ff);
  }

  :global(.terminal-pane .xterm) {
    height: 100%;
  }

  :global(.terminal-pane .xterm *) {
    box-sizing: content-box;
  }

  :global(.terminal-pane .xterm-rows) {
    overflow: hidden;
  }

  :global(.terminal-pane .xterm-rows > div) {
    overflow: hidden;
    margin: 0 !important;
    padding: 0 !important;
  }

  :global(.terminal-pane .xterm-viewport) {
    overflow-y: auto;
    overscroll-behavior: contain;
    touch-action: pan-y;
    -webkit-overflow-scrolling: touch;
  }
</style>
