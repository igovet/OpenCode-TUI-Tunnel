<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { SessionInfo, WorkspaceTab } from '../lib/types';
  import { listSessions, getProjectHistory, getTmuxSessions, attachTmuxSession, launchSession } from '../lib/api';
  import SessionCard from '../components/SessionCard.svelte';
  import PathAutocomplete from '../components/PathAutocomplete.svelte';

  let { onopenSession } = $props<{ onopenSession: (tab: WorkspaceTab) => void }>();

  let sessions = $state<SessionInfo[]>([]);
  let history = $state<import('../lib/types').ProjectHistoryRecord[]>([]);
  let tmuxSessions = $state<import('../lib/types').TmuxDiscoverySession[]>([]);
  let loading = $state(true);
  let interval: number;

  let launchCwd = $state('');

  interface ErrorModal { title: string; message: string; hint: string }
  let errorModal = $state<ErrorModal | null>(null);

  function showLimitError() {
    errorModal = {
      title: 'Session limit reached',
      message: 'Maximum number of concurrent sessions (8) is already running.',
      hint: 'Close one or more active sessions to free up a slot, or increase the maxConcurrent limit in your configuration file.'
    };
  }

  async function load() {
    try {
      const [sessRes, histRes, tmuxRes] = await Promise.all([
        listSessions(),
        getProjectHistory(),
        getTmuxSessions()
      ]);
      sessions = sessRes;
      history = histRes;
      tmuxSessions = tmuxRes.filter(t => !t.isManaged);
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    load();
    interval = window.setInterval(load, 3000);
  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
  });

  function getSavedTermDims(): { cols: number; rows: number } {
    try {
      const cols = parseInt(localStorage.getItem('termLastCols') ?? '');
      const rows = parseInt(localStorage.getItem('termLastRows') ?? '');
      if (cols > 20 && rows > 5) return { cols, rows };
    } catch {}
    return { cols: 220, rows: 50 }; // large default — better too big than too small for TUI
  }

  async function handleLaunch() {
    if (!launchCwd) return;
    try {
      const { cols, rows } = getSavedTermDims();
      const { session } = await launchSession(launchCwd, cols, rows);
      openSessionTab(session);
    } catch (e: unknown) {
      const err = e as Error & { statusCode?: number };
      if (err.statusCode === 409) {
        showLimitError();
      } else {
        console.error(e);
      }
    }
  }

  async function handleAttach(name: string) {
    try {
      const { cols, rows } = getSavedTermDims();
      const res = await attachTmuxSession(name, cols, rows);
      if (res) {
        // Find it in the newly listed sessions
        await load();
        const s = sessions.find(s => s.id === res.sessionId);
        if (s) openSessionTab(s);
      }
    } catch (e: unknown) {
      const err = e as Error & { statusCode?: number };
      if (err.statusCode === 409) {
        showLimitError();
      } else {
        console.error(e);
      }
    }
  }

  function openSessionTab(session: SessionInfo) {
    onopenSession({
      sessionId: session.id,
      title: session.cwd.split('/').pop() || session.id.slice(0, 8),
      cwd: session.cwd,
      status: session.status,
      isActive: true
    });
  }

</script>

<div class="dashboard">
  <header class="dash-header">
    <h1><span class="prompt"></span>WORKSTATION DASHBOARD</h1>
  </header>

  <main class="dash-grid">
    <div class="dash-col main-col">
      <section class="panel launch-panel">
        <h2 class="panel-title">[ LAUNCH ]</h2>
        <div class="panel-content">
          <p class="panel-desc">Start a new isolated terminal session in the specified directory.</p>
          <div class="launch-form">
            <PathAutocomplete 
              value={launchCwd} 
              onchange={(v) => launchCwd = v} 
              onselect={(v) => { launchCwd = v; }}
            />
            <button class="btn primary launch-btn" onclick={handleLaunch}>EXECUTE</button>
          </div>
        </div>
      </section>

      {#if sessions.length > 0}
        <section class="panel">
          <h2 class="panel-title">&gt; ACTIVE_SESSIONS</h2>
          <div class="panel-content grid-cards">
            {#each sessions as session (session.id)}
              <SessionCard {session} onConnect={(id) => openSessionTab(session)} />
            {/each}
          </div>
        </section>
      {/if}
    </div>

    <div class="dash-col side-col">
      {#if history.length > 0}
        <section class="panel">
          <h2 class="panel-title">[ RECENT_PROJECTS ]</h2>
          <div class="panel-content list-compact">
            {#each history as proj}
              <div class="list-item">
                <span class="path-text" title={proj.path}>{proj.path}</span>
                <button class="btn btn-small" onclick={() => { launchCwd = proj.path; handleLaunch(); }}>INIT</button>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if tmuxSessions.length > 0}
        <section class="panel">
          <h2 class="panel-title">[ TMUX_DISCOVERY ]</h2>
          <div class="panel-content list-compact">
            {#each tmuxSessions as ts}
              <div class="list-item">
                <span class="tmux-name">{ts.name} <span class="dim">({ts.windows}w)</span></span>
                <button class="btn btn-small" onclick={() => handleAttach(ts.name)}>ATTACH</button>
              </div>
            {/each}
          </div>
        </section>
      {/if}
    </div>
  </main>

  {#if errorModal}
    <div class="modal-overlay" onclick={() => errorModal = null} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-box" onclick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <span class="modal-icon">⚠</span>
          <h2 id="modal-title" class="modal-title">{errorModal.title}</h2>
        </div>
        <p class="modal-message">{errorModal.message}</p>
        <p class="modal-hint">{errorModal.hint}</p>
        <button class="btn primary modal-close" onclick={() => errorModal = null}>DISMISS</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .dashboard {
    width: 100%;
    padding: var(--space-4) var(--space-6);
    font-family: var(--font-mono);
    box-sizing: border-box;
    overflow-x: hidden;
  }
  
  .dash-header {
    margin-bottom: var(--space-6);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--border-accent);
  }

  h1 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: 1px;
    text-shadow: 0 0 10px rgba(88, 166, 255, 0.3);
  }

  .dash-grid {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: var(--space-6);
    align-items: start;
  }

  .dash-col {
    min-width: 0;
  }

  @media (max-width: 900px) {
    .dash-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .panel {
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    overflow: hidden;
    margin-bottom: var(--space-6);
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  }

  .panel-title {
    font-size: var(--font-size-sm);
    margin: 0;
    padding: var(--space-2) var(--space-4);
    background: var(--bg-elevated);
    color: var(--accent-blue);
    border-bottom: 1px solid var(--border-default);
    letter-spacing: 0.05em;
  }

  .panel-content {
    padding: var(--space-4);
  }

  .launch-panel {
    border-color: var(--accent-green);
    overflow: visible;
  }
  .launch-panel .panel-title {
    background: rgba(63, 185, 80, 0.1);
    color: var(--accent-green);
    border-bottom-color: var(--accent-green);
  }

  .panel-desc {
    color: var(--text-secondary);
    margin-bottom: var(--space-4);
    font-size: var(--font-size-sm);
  }

  .launch-form {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    width: 100%;
    box-sizing: border-box;
  }

  .launch-btn {
    font-weight: 700;
    letter-spacing: 1px;
  }

  .grid-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
    gap: var(--space-4);
  }

  .list-compact {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .list-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--bg-base);
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-sm);
    transition: border-color var(--transition-fast);
    min-width: 0;
  }
  
  .list-item:hover {
    border-color: var(--border-default);
    background: var(--bg-elevated);
  }

  .path-text {
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .tmux-name {
    font-size: var(--font-size-sm);
    color: var(--accent-cyan);
    font-weight: 600;
  }
  .dim {
    color: var(--text-muted);
    font-weight: 400;
  }

  .btn-small {
    padding: 2px 8px;
    font-size: var(--font-size-xs);
  }

  @media (max-width: 640px) {
    .dashboard {
      padding: var(--space-3) var(--space-3);
    }
    
    .launch-form {
      flex-direction: column;
      align-items: stretch;
    }
    
    .launch-btn {
      width: 100%;
      justify-content: center;
    }
    
    .grid-cards {
      grid-template-columns: 1fr;
    }
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: var(--space-4);
  }

  .modal-box {
    background: var(--bg-surface);
    border: 1px solid var(--accent-red, #f85149);
    border-radius: var(--radius-md);
    padding: var(--space-6);
    max-width: 480px;
    width: 100%;
    box-sizing: border-box;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .modal-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .modal-icon {
    font-size: 1.5rem;
    color: var(--accent-red, #f85149);
    line-height: 1;
  }

  .modal-title {
    margin: 0;
    font-size: var(--font-size-md, 1rem);
    font-weight: 700;
    color: var(--accent-red, #f85149);
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .modal-message {
    margin: 0;
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }

  .modal-hint {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    line-height: 1.5;
    border-left: 2px solid var(--border-accent, #30363d);
    padding-left: var(--space-3);
  }

  .modal-close {
    align-self: flex-end;
    font-weight: 700;
    letter-spacing: 1px;
  }
</style>
