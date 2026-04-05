<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { TerminalManager } from '../lib/terminal';
  import { workspace } from '../lib/workspace';
  import { activeTerminalWrite } from '../lib/activeTerminal';

  let { sessionId, isActive } = $props<{ sessionId: string, isActive: boolean }>();

  let container: HTMLElement;
  let manager: TerminalManager | null = null;
  let terminalActive = $state(false);

  $effect(() => {
    if (isActive !== terminalActive) {
      terminalActive = isActive;
      if (isActive && manager) {
        manager.fit();
        activeTerminalWrite.set((data) => manager!.onData(data));
      }
    }
  });

  onMount(() => {
    manager = new TerminalManager(container, 80, 24);
    manager.connect(sessionId);
    manager.onExit((code) => {
      workspace.updateTabStatus(sessionId, code === 0 ? 'exited' : 'failed');
    });

    if (isActive) {
      setTimeout(() => manager?.fit(), 50);
      activeTerminalWrite.set((data) => manager!.onData(data));
    }

    const resizeObserver = new ResizeObserver(() => {
      manager?.fit();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  });

  onDestroy(() => {
    if (isActive) {
      activeTerminalWrite.set(null);
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
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div
  class="terminal-pane {isActive ? 'active' : ''}"
  onclick={handleClick}
  role="button"
>
  <div class="terminal-container" bind:this={container}></div>
</div>

<style>
  .terminal-pane {
    flex: 1;
    min-height: 0;
    min-width: 0;
    position: relative;
    border: 1px solid transparent;
    height: 100%;
    width: 100%;
  }

  .terminal-container {
    height: 100%;
    min-height: 0;
    min-width: 0;
    width: 100%;
  }

  .terminal-pane.active {
    border-color: var(--color-primary, #58a6ff);
  }

  :global(.terminal-pane .xterm) {
    height: 100%;
  }

  :global(.xterm-viewport) {
    overflow-y: scroll !important;
    overscroll-behavior: contain;
  }
</style>
