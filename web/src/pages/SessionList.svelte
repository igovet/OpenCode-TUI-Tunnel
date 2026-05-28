<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { SessionInfo, WorkspaceTab, SshConnection } from '../lib/types';
  import {
    listSessions,
    getProjectHistory,
    getTmuxSessions,
    attachTmuxSession,
    launchSession,
    deleteSession,
    listSshConnections,
    checkSshfsAvailability,
  } from '../lib/api';
  import { workspace } from '../lib/workspace';
  import SessionCard from '../components/SessionCard.svelte';
  import PathAutocomplete from '../components/PathAutocomplete.svelte';
  import SettingsModal from '../components/SettingsModal.svelte';
  import SshConnectionModal from '../components/SshConnectionModal.svelte';
  import SshConnectionList from '../components/SshConnectionList.svelte';

  let { onopenSession } = $props<{ onopenSession: (tab: WorkspaceTab) => void }>();

  let sessions = $state<SessionInfo[]>([]);
  let history = $state<import('../lib/types').ProjectHistoryRecord[]>([]);
  let tmuxSessions = $state<import('../lib/types').TmuxDiscoverySession[]>([]);
  let sshConnections = $state<SshConnection[]>([]);
  let interval: number;

  let activeTab = $state<'local' | 'ssh'>('local');
  let launchCwd = $state('');
  let selectedSshConnectionId = $state('');

  interface ErrorModal { title: string; message: string; hint: string }
  let errorModal = $state<ErrorModal | null>(null);
  let settingsOpen = $state(false);
  let killTarget = $state<string | null>(null);
  let killing = $state(false);

  let sshModalOpen = $state(false);
  let sshModalConnection = $state<SshConnection | undefined>(undefined);

  // SSHFS availability check
  let sshfsStatus = $state<{ available: boolean; path?: string; platform: string } | null>(null);
  let sshfsChecking = $state(false);

  let localSessions = $derived(sessions.filter(s => !s.sshConnectionId));
  let sshSessions = $derived(sessions.filter(s => s.sshConnectionId));

  function showLimitError() {
    errorModal = {
      title: 'Session limit reached',
      message: 'Maximum number of concurrent sessions (8) is already running.',
      hint: 'Close one or more active sessions to free up a slot, or increase the maxConcurrent limit in your configuration file.'
    };
  }

  async function load() {
    try {
      const [sessRes, histRes, tmuxRes, sshRes] = await Promise.all([
        listSessions(),
        getProjectHistory(),
        getTmuxSessions(),
        listSshConnections()
      ]);
      sessions = sessRes;
      history = histRes;
      tmuxSessions = tmuxRes.filter(t => !t.isManaged);
      sshConnections = sshRes;
    } catch (e) {
      console.error(e);
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
    } catch {
      // intentional
    }
    return { cols: 220, rows: 50 };
  }

  async function doLaunch(cwd: string, sshId?: string) {
    const { cols, rows } = getSavedTermDims();
    const { session } = await launchSession(cwd, cols, rows, sshId);
    openSessionTab(session);
    await load();
  }

  async function handleLaunch() {
    if (!launchCwd) return;
    try {
      const sshId = activeTab === 'ssh' ? selectedSshConnectionId || undefined : undefined;
      await doLaunch(launchCwd, sshId);
      launchCwd = '';
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
    const sshConn = session.sshConnectionId
      ? sshConnections.find((c) => c.id === session.sshConnectionId)
      : undefined;
    onopenSession({
      sessionId: session.id,
      title: session.cwd.split('/').pop() || session.id.slice(0, 8),
      cwd: session.cwd,
      status: session.status,
      isActive: true,
      backend: session.backend,
      sshConnectionId: session.sshConnectionId,
      source: sshConn ? sshConn.name : undefined,
    });
  }

  const killTargetSession = $derived(killTarget ? sessions.find((session) => session.id === killTarget) ?? null : null);

  async function confirmKill() {
    if (!killTarget || killing) return;
    const targetId = killTarget;
    killing = true;
    try {
      await deleteSession(targetId);
      if ($workspace.tabs.some((tab) => tab.sessionId === targetId)) {
        workspace.closeTab(targetId);
      }
      killTarget = null;
      await load();
    } catch (error) {
      console.error(error);
    } finally {
      killing = false;
    }
  }

  async function handleHistoryLaunch(proj: import('../lib/types').ProjectHistoryRecord) {
    let sshId: string | undefined = undefined;
    if (proj.source && proj.source !== 'local') {
      // Try to find matching SSH connection
      const matchingConn = sshConnections.find(c => c.name === proj.source);
      if (matchingConn) {
        sshId = matchingConn.id;
      } else {
        console.warn(`SSH connection "${proj.source}" no longer exists, launching locally`);
      }
    }
    try {
      await doLaunch(proj.path, sshId);
    } catch (e: unknown) {
      const err = e as Error & { statusCode?: number };
      if (err.statusCode === 409) {
        showLimitError();
      } else {
        console.error('Failed to launch from history:', e);
      }
    }
  }

  function openSshModal(conn?: SshConnection) {
    sshModalConnection = conn;
    sshModalOpen = true;
  }

  function closeSshModal() {
    sshModalOpen = false;
    sshModalConnection = undefined;
  }

  function onSshSaved() {
    load();
  }

  // Check SSHFS availability when SSH tab becomes active
  async function checkSshfs() {
    if (sshfsChecking) return;
    sshfsChecking = true;
    try {
      sshfsStatus = await checkSshfsAvailability();
    } catch (e) {
      console.error('Failed to check SSHFS availability:', e);
      sshfsStatus = { available: false, platform: 'unknown' };
    } finally {
      sshfsChecking = false;
    }
  }

  $effect(() => {
    if (activeTab === 'ssh') {
      checkSshfs();
    }
  });

  function getSshfsInstallInstructions(platform: string): string {
    switch (platform) {
      case 'linux':
        return 'Linux (Debian/Ubuntu): sudo apt install sshfs\nLinux (RHEL/Fedora): sudo yum install fuse-sshfs';
      case 'darwin':
        return 'macOS: brew install macfuse && brew install sshfs';
      default:
        return 'Install sshfs for your platform to use Local (SSHFS) mode.';
    }
  }
</script>

<div class="dashboard">
  <header class="dash-header">
    <h1><span class="prompt"></span>WORKSTATION DASHBOARD</h1>
    <button class="btn btn-settings" onclick={() => settingsOpen = true} aria-label="Open settings">
      <svg class="icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="btn-text">SETTINGS</span>
    </button>
  </header>

  <!-- Environment Tabs -->
  <div class="env-tabs" role="tablist" aria-label="Environment">
    <button
      class="env-tab"
      class:active={activeTab === 'local'}
      onclick={() => activeTab = 'local'}
      role="tab"
      aria-selected={activeTab === 'local'}
      aria-controls="local-panel"
      id="local-tab"
    >
      <span class="env-icon">💻</span> LOCAL
    </button>
    <button
      class="env-tab"
      class:active={activeTab === 'ssh'}
      onclick={() => activeTab = 'ssh'}
      role="tab"
      aria-selected={activeTab === 'ssh'}
      aria-controls="ssh-panel"
      id="ssh-tab"
    >
      <span class="env-icon">🌐</span> SSH
    </button>
  </div>

  <main class="dash-grid">
    <div class="dash-col main-col">
      {#if activeTab === 'local'}
        <!-- Local Tab Content -->
        <section class="panel launch-panel">
          <h2 class="panel-title">[ LAUNCH ]</h2>
          <div class="panel-content">
            <p class="panel-desc">Start a new isolated terminal session in the specified directory.</p>
            <div class="launch-form">
              <PathAutocomplete
                value={launchCwd}
                onchange={(v: string) => launchCwd = v}
                onselect={(v: string) => { launchCwd = v; }}
              />
              <button class="btn primary launch-btn" onclick={handleLaunch}>EXECUTE</button>
            </div>
          </div>
        </section>

        {#if localSessions.length > 0}
          <section class="panel">
            <h2 class="panel-title">[ ACTIVE_SESSIONS ]</h2>
            <div class="panel-content grid-cards">
              {#each localSessions as session (session.id)}
                <SessionCard
                  {session}
                  onConnect={() => openSessionTab(session)}
                  onKill={(id: string) => killTarget = id}
                />
              {/each}
            </div>
          </section>
        {/if}
      {:else}
        <!-- SSH Tab Content -->
        <section class="panel launch-panel ssh-launch-panel">
          <h2 class="panel-title">[ LAUNCH_REMOTE ]</h2>
          <div class="panel-content">
            <p class="panel-desc">Launch a terminal session on a remote server via SSH.</p>
            <div class="launch-form ssh-launch-form">
              <select
                class="ssh-select"
                bind:value={selectedSshConnectionId}
                aria-label="SSH connection"
              >
                <option value="">Select connection...</option>
                {#each sshConnections as conn (conn.id)}
                  <option value={conn.id}>
                    {conn.name} ({conn.username}@{conn.host}) — {conn.opencodeProvider === 'local' ? 'Local' : 'Server'}
                  </option>
                {/each}
              </select>
              <PathAutocomplete
                value={launchCwd}
                onchange={(v: string) => launchCwd = v}
                onselect={(v: string) => { launchCwd = v; }}
                sshConnectionId={activeTab === 'ssh' ? selectedSshConnectionId || undefined : undefined}
              />
              <button
                class="btn primary launch-btn"
                onclick={handleLaunch}
                disabled={!selectedSshConnectionId}
              >
                EXECUTE
              </button>
            </div>
            <button class="btn manage-conn-btn" onclick={() => openSshModal()}>
              + NEW CONNECTION
            </button>
          </div>
        </section>

        {#if sshfsStatus && !sshfsStatus.available}
          <section class="panel sshfs-banner-panel">
            <div class="panel-content">
              <div class="sshfs-banner" role="alert">
                <div class="sshfs-banner-header">
                  <span class="sshfs-banner-icon">⚠️</span>
                  <span class="sshfs-banner-title">SSHFS is not installed on this machine.</span>
                </div>
                <p class="sshfs-banner-text">
                  Local (SSHFS) mode will not be available.
                </p>
                <div class="sshfs-banner-instructions">
                  <p class="sshfs-banner-subtitle">Install instructions:</p>
                  <pre class="sshfs-install-cmd">{getSshfsInstallInstructions(sshfsStatus.platform)}</pre>
                </div>
              </div>
            </div>
          </section>
        {/if}

        {#if sshSessions.length > 0}
          <section class="panel">
            <h2 class="panel-title">[ ACTIVE_SSH_SESSIONS ]</h2>
            <div class="panel-content grid-cards">
              {#each sshSessions as session (session.id)}
                <SessionCard
                  {session}
                  onConnect={() => openSessionTab(session)}
                  onKill={(id: string) => killTarget = id}
                />
              {/each}
            </div>
          </section>
        {/if}

        <section class="panel">
          <h2 class="panel-title">[ SAVED_CONNECTIONS ]</h2>
          <div class="panel-content">
            <SshConnectionList
              connections={sshConnections}
              onEdit={(conn) => openSshModal(conn)}
              onRefresh={load}
            />
            <button class="btn manage-conn-btn bottom" onclick={() => openSshModal()}>
              + NEW CONNECTION
            </button>
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
              <div class="list-item history-item">
                <span class="path-text" title={proj.path}>{proj.path}</span>
                <div class="history-actions">
                  {#if proj.source && proj.source !== 'local'}
                    <span class="source-badge ssh-source">{proj.source}</span>
                  {:else}
                    <span class="source-badge local-source">local</span>
                  {/if}
                  <button class="btn btn-small init-btn" onclick={async () => await handleHistoryLaunch(proj)}>INIT</button>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if activeTab === 'local' && tmuxSessions.length > 0}
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

  {#if killTarget}
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="kill-modal-title" onclick={() => !killing && (killTarget = null)}>
      <div class="modal-box kill-modal" onclick={(e) => e.stopPropagation()}>
        <h2 id="kill-modal-title" class="modal-title">[ KILL SESSION? ]</h2>
        <p class="modal-message">This will terminate the process.</p>
        {#if killTargetSession}
          <p class="modal-hint" title={killTargetSession.cwd}>{killTargetSession.cwd}</p>
        {/if}
        <div class="kill-actions">
          <button class="btn modal-cancel" onclick={() => killTarget = null} disabled={killing}>CANCEL</button>
          <button class="btn modal-kill" onclick={confirmKill} disabled={killing}>KILL</button>
        </div>
      </div>
    </div>
  {/if}

  <SettingsModal open={settingsOpen} onClose={() => settingsOpen = false} />

  <SshConnectionModal
    open={sshModalOpen}
    connection={sshModalConnection}
    onClose={closeSshModal}
    onSaved={onSshSaved}
  />
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
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--border-accent);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .btn-settings {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: 0;
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    font-weight: 600;
    letter-spacing: 1px;
    cursor: pointer;
    border: 1px solid var(--border-default);
    background: var(--bg-elevated);
    color: var(--text-muted);
    transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .btn-settings .icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .btn-settings:hover {
    border-color: var(--accent-blue);
    color: var(--accent-blue);
    background: rgba(88, 166, 255, 0.1);
  }

  @media (max-width: 768px) {
    .btn-settings .btn-text {
      display: none;
    }
  }

  h1 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: 1px;
    text-shadow: 0 0 10px rgba(88, 166, 255, 0.3);
  }

  /* Environment Tabs */
  .env-tabs {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-6);
    border-bottom: 1px solid var(--border-default);
  }

  .env-tab {
    padding: var(--space-2) var(--space-4);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    font-weight: 600;
    letter-spacing: 1px;
    cursor: pointer;
    transition: color var(--transition-fast), border-color var(--transition-fast);
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .env-tab:hover {
    color: var(--text-secondary);
  }

  .env-tab.active {
    color: var(--accent-blue);
    border-bottom-color: var(--accent-blue);
  }

  .env-icon {
    font-size: var(--font-size-sm);
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
    border-radius: 0;
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

  .ssh-launch-panel {
    border-color: var(--accent-cyan);
  }
  .ssh-launch-panel .panel-title {
    background: rgba(34, 211, 238, 0.1);
    color: var(--accent-cyan);
    border-bottom-color: var(--accent-cyan);
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

  .ssh-launch-form {
    flex-wrap: wrap;
  }

  .ssh-select {
    background: var(--bg-base);
    border: 1px solid var(--border-default);
    color: var(--text-primary);
    padding: var(--space-2) var(--space-3);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    border-radius: 0;
    outline: none;
    min-width: 200px;
    flex-shrink: 0;
  }

  .ssh-select:focus {
    border-color: var(--accent-cyan);
  }

  .ssh-select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .manage-conn-btn {
    margin-top: var(--space-3);
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: 1px solid var(--border-default);
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    letter-spacing: 1px;
    cursor: pointer;
    border-radius: 0;
  }

  .manage-conn-btn:hover {
    border-color: var(--accent-cyan);
    color: var(--accent-cyan);
  }

  .manage-conn-btn.bottom {
    margin-top: var(--space-4);
    width: 100%;
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
    border-radius: 0;
    transition: border-color var(--transition-fast);
    min-width: 0;
  }

  .list-item:hover {
    border-color: var(--border-default);
    background: var(--bg-elevated);
  }

  .history-item {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
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
    direction: rtl;
    text-align: left;
  }

  .source-badge {
    font-size: var(--font-size-xs);
    padding: 1px 6px;
    font-family: var(--font-mono);
    border: 1px solid;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .history-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .local-source {
    color: var(--text-muted);
    border-color: var(--border-muted);
    background: var(--bg-base);
  }

  .ssh-source {
    color: var(--accent-cyan);
    border-color: var(--accent-cyan);
    background: rgba(34, 211, 238, 0.1);
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

  .init-btn {
    padding: 2px var(--space-2);
    background: var(--bg-elevated);
    border: 1px solid var(--accent-green);
    color: var(--accent-green);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    font-weight: 600;
    letter-spacing: 1px;
    cursor: pointer;
    border-radius: 3px;
    transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
    flex-shrink: 0;
  }

  .init-btn:hover {
    background: rgba(63, 185, 80, 0.15);
    border-color: var(--accent-green);
    color: var(--accent-green);
  }

  @media (max-width: 640px) {
    .dashboard {
      padding: var(--space-3) var(--space-3);
    }

    .launch-form {
      flex-direction: column;
      align-items: stretch;
    }

    .ssh-launch-form {
      flex-direction: column;
    }

    .ssh-select {
      width: 100%;
      min-width: auto;
    }

    .launch-btn {
      width: 100%;
      justify-content: center;
    }

    .grid-cards {
      grid-template-columns: 1fr;
    }

    .history-actions {
      flex-wrap: wrap;
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
    border-radius: 0;
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

  .kill-modal {
    border-color: var(--border-default);
    max-width: 420px;
  }

  .kill-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  .modal-cancel {
    background: transparent;
    border: 1px solid var(--border-default);
    color: var(--text-muted);
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 0;
    cursor: pointer;
  }

  .modal-kill {
    background: #5a0000;
    border: 1px solid #aa3333;
    color: #ff8888;
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 0;
    cursor: pointer;
  }

  .modal-kill:hover {
    background: #7a0000;
  }

  .modal-cancel:disabled,
  .modal-kill:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* SSHFS availability banner */
  .sshfs-banner-panel {
    border-color: var(--accent-yellow, #d29922);
  }

  .sshfs-banner {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .sshfs-banner-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .sshfs-banner-icon {
    font-size: var(--font-size-md);
  }

  .sshfs-banner-title {
    font-weight: 600;
    color: var(--accent-yellow, #d29922);
    font-size: var(--font-size-sm);
  }

  .sshfs-banner-text {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
  }

  .sshfs-banner-instructions {
    background: var(--bg-base);
    border: 1px solid var(--border-muted);
    padding: var(--space-3);
    margin-top: var(--space-1);
  }

  .sshfs-banner-subtitle {
    margin: 0 0 var(--space-2) 0;
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .sshfs-install-cmd {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    line-height: 1.6;
    white-space: pre-wrap;
  }

  @media (max-width: 768px) {
    button:hover,
    button:focus,
    button:focus-visible,
    .btn:hover,
    .btn:focus,
    .btn:focus-visible,
    .btn-settings:hover,
    .btn-settings:focus,
    .btn-settings:focus-visible,
    .list-item:hover,
    .env-tab:hover,
    .manage-conn-btn:hover {
      outline: none;
      background: inherit;
      color: inherit;
      border-color: inherit;
      box-shadow: none;
    }
  }
</style>
