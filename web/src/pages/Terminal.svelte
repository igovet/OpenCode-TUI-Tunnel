<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { TerminalManager } from '../lib/terminal'
  import { getSession, terminateSession } from '../lib/api'
  import type { SessionInfo } from '../lib/types'
  import MobileKeybar from '../components/MobileKeybar.svelte'
  
  let { sessionId, onBack }: { sessionId: string, onBack: () => void } = $props()
  
  let terminalContainer: HTMLElement
  let manager: TerminalManager | null = null
  let session = $state<SessionInfo | null>(null)
  let exitCode = $state<number | null>(null)
  
  async function load() {
    session = await getSession(sessionId)
  }
  
  function handleResize() {
    if (manager) manager.fit()
  }
  
  onMount(() => {
    load()
    
    manager = new TerminalManager(terminalContainer, 80, 24)
    manager.connect(sessionId)
    manager.onExit((code) => {
      exitCode = code
    })
    
    // Fit initially and on resize
    setTimeout(handleResize, 50)
    window.addEventListener('resize', handleResize)
  })
  
  onDestroy(() => {
    window.removeEventListener('resize', handleResize)
    if (manager) manager.dispose()
  })
  
  async function killSession() {
    if (confirm('Are you sure you want to terminate this session?')) {
      await terminateSession(sessionId)
      onBack()
    }
  }
</script>

<div class="terminal-page">
  <div class="top-bar">
    <div class="left">
      <button class="back" onclick={onBack}>← Back</button>
      <span class="cwd" title={session?.cwd || ''}>
        {session?.cwd ? session.cwd.split('/').pop() : 'Loading...'}
      </span>
      {#if exitCode !== null}
        <span class="status-badge exited">Exited ({exitCode})</span>
      {:else if session?.status}
        <span class="status-badge running">{session.status}</span>
      {/if}
    </div>
    
    <div class="right">
      <button class="kill" onclick={killSession} disabled={exitCode !== null}>Kill</button>
    </div>
  </div>
  
  <div class="terminal-wrapper" bind:this={terminalContainer}>
    {#if exitCode !== null}
      <div class="overlay">
        <h2>Session exited (code {exitCode})</h2>
        <button onclick={onBack}>Return to List</button>
      </div>
    {/if}
  </div>
  
  <MobileKeybar write={(k) => manager?.onData(k)} />
</div>

<style>
  .terminal-page {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #0d1117;
    color: #e6edf3;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  }
  
  .top-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    background: #161b22;
    border-bottom: 1px solid #30363d;
    height: 48px;
    box-sizing: border-box;
  }
  
  .left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  button {
    background: transparent;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 4px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
  }
  
  button:hover:not(:disabled) {
    background: #30363d;
  }
  
  .kill {
    color: #f85149;
    border-color: rgba(248, 81, 73, 0.4);
  }
  
  .kill:hover:not(:disabled) {
    background: rgba(248, 81, 73, 0.1);
  }
  
  .kill:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .cwd {
    font-weight: 600;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .status-badge {
    font-size: 0.75rem;
    padding: 2px 6px;
    border-radius: 12px;
    text-transform: uppercase;
    font-weight: bold;
  }
  
  .running { color: #3fb950; background: rgba(63, 185, 80, 0.2); }
  .exited { color: #f85149; background: rgba(248, 81, 73, 0.2); }
  
  .terminal-wrapper {
    flex: 1;
    position: relative;
    overflow: hidden;
    padding: 8px;
    background: #0d1117;
  }
  
  :global(.xterm-viewport) {
    background-color: transparent !important;
  }
  
  .overlay {
    position: absolute;
    inset: 0;
    background: rgba(13, 17, 23, 0.8);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 10;
    gap: 16px;
  }
  
  .overlay h2 {
    color: #f85149;
    margin: 0;
  }
  
  .overlay button {
    background: #238636;
    color: white;
    border: none;
    padding: 8px 16px;
  }
</style>
