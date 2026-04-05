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

  async function handleLaunch() {
    if (!launchCwd) return;
    try {
      const { session } = await launchSession(launchCwd, 80, 24);
      openSessionTab(session);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleAttach(name: string) {
    try {
      const res = await attachTmuxSession(name, 80, 24);
      if (res) {
        // Find it in the newly listed sessions
        await load();
        const s = sessions.find(s => s.id === res.sessionId);
        if (s) openSessionTab(s);
      }
    } catch (e) {
      console.error(e);
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
  <header>
    <h1>OpenCode TUI Tunnel</h1>
  </header>

  <main>
    <section class="launch-section">
      <h2>Launch New Session</h2>
      <div class="launch-form">
        <PathAutocomplete 
          value={launchCwd} 
          onchange={(v) => launchCwd = v} 
          onselect={(v) => { launchCwd = v; handleLaunch(); }}
        />
        <button class="primary" onclick={handleLaunch}>Launch</button>
      </div>
    </section>

    {#if sessions.length > 0}
      <section>
        <h2>Running Sessions</h2>
        <div class="grid">
          {#each sessions as session (session.id)}
            <SessionCard {session} onConnect={(id) => openSessionTab(session)} />
          {/each}
        </div>
      </section>
    {/if}

    {#if history.length > 0}
      <section>
        <h2>Recent Projects</h2>
        <div class="list">
          {#each history as proj}
            <div class="list-item">
              <span>{proj.path}</span>
              <button onclick={() => { launchCwd = proj.path; handleLaunch(); }}>Launch</button>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    {#if tmuxSessions.length > 0}
      <section>
        <h2>Tmux Sessions</h2>
        <div class="list">
          {#each tmuxSessions as ts}
            <div class="list-item">
              <span>{ts.name} ({ts.windows} windows)</span>
              <button onclick={() => handleAttach(ts.name)}>Attach</button>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  </main>
</div>

<style>
  .dashboard {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px;
    font-family: var(--font-sans, -apple-system, sans-serif);
  }
  
  header {
    margin-bottom: 32px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border-default, #30363d);
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  section {
    margin-bottom: 32px;
  }

  h2 {
    font-size: 1.2rem;
    margin-bottom: 16px;
    color: var(--text-secondary, #8b949e);
  }

  .launch-form {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  button.primary {
    background: var(--btn-primary-bg, #238636);
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
  }

  button.primary:hover {
    background: var(--btn-primary-hover, #2ea043);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 16px;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .list-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: var(--bg-surface, #161b22);
    border: 1px solid var(--border-default, #30363d);
    border-radius: 6px;
  }

  .list-item button {
    background: transparent;
    border: 1px solid var(--border-default, #30363d);
    color: var(--text-primary, #e6edf3);
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
  }

  .list-item button:hover {
    background: var(--bg-tertiary, #21262d);
  }
</style>