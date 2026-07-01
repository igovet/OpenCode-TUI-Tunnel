<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { SessionInfo, WorkspaceTab, SshConnection, ProjectHistoryRecord, TmuxDiscoverySession } from '../lib/types';
  import {
    listSessions,
    getProjectHistory,
    deleteProjectHistory,
    getTmuxSessions,
    attachTmuxSession,
    launchSession,
    deleteSession,
    getSession,
    listSshConnections,
    getRemoteTmuxSessions,
    attachRemoteTmuxSession,
  } from '../lib/api';
  import { get } from 'svelte/store';
  import { workspace } from '../lib/workspace';
  import { showToast } from '$lib/toastStore.svelte';

  // NEW structural components (Phase A foundation)
  import SessionRow from '../components/SessionRow.svelte';
  import FilterChipGroup, { type FilterOption } from '../components/FilterChipGroup.svelte';
  import LaunchBar from '../components/LaunchBar.svelte';
  import SshConnectionSection from '../components/SshConnectionSection.svelte';
  import EmptyState from '../components/EmptyState.svelte';

  // Reused primitives / existing functional components
  import SettingsModal from '../components/SettingsModal.svelte';
  import SshConnectionModal from '../components/SshConnectionModal.svelte';
  import Button from '../components/ui/Button.svelte';
  import Icon from '../components/ui/Icon.svelte';
  import Badge from '../components/ui/Badge.svelte';
  import Dialog from '../components/ui/Dialog.svelte';
  import InstallBanner from '../components/InstallBanner.svelte';

  // ── Props (unchanged contract with App.svelte) ──
  let { onopenSession } = $props<{ onopenSession: (tab: WorkspaceTab) => void }>();

  // ── Core reactive state (PRESERVED from the original file) ──
  let sessions = $state<SessionInfo[]>([]);
  let history = $state<ProjectHistoryRecord[]>([]);
  let tmuxSessions = $state<TmuxDiscoverySession[]>([]);
  let remoteTmuxSessions = $state<Map<string, TmuxDiscoverySession[]>>(new Map());
  let remoteTmuxLoading = $state(false);
  let sshConnections = $state<SshConnection[]>([]);
  let interval: number;

  // ── LaunchBar state ──
  let launchCwd = $state('');
  let backendId = $state<string>('local');

  // ── Filter chips state ──
  let sessionFilter = $state<string>('all');

  // ── SSH section / modals state ──
  let sshSectionExpanded = $state(false);
  let settingsOpen = $state(false);
  let sshModalOpen = $state(false);
  let sshModalConnection = $state<SshConnection | undefined>(undefined);

  // ── Kill confirmation dialog state (kept as Dialog per spec) ──
  let killTarget = $state<string | null>(null);
  let killing = $state(false);

  // ── Remove-from-recent confirmation dialog state ──
  // The X button on a `recent` SessionRow must go through a confirm Dialog
  // before the project-history entry is deleted.
  let removeTarget = $state<UnifiedSessionItem | null>(null);

  // Reference to the LaunchBar section element — used by EmptyState CTA to
  // focus the PathAutocomplete input inside it.
  let launchSectionEl: HTMLElement | null = null;

  // ───────────────────────────────────────────────────────────────
  // Unified-session-item model (mt-b.2 data merge)
  // ───────────────────────────────────────────────────────────────
  interface UnifiedSessionItem {
    kind: 'active' | 'discovered' | 'recent';
    title: string;
    path: string;
    backend: 'local' | 'ssh' | 'discovered';
    status?: string;
    lastUsedAt?: string | number | Date;
    sessionId?: string;
    // Carried through for handlers:
    sshConnectionId?: string;
    tmuxName?: string;
  }

  /**
   * Merge active sessions, discovered tmux sessions, and recent-but-inactive
   * projects into a single deduplicated, sorted list.
   *
   * Sort order: active/running first, then recent-inactive by lastUsedAt desc,
   * then discovered tmux. Dedup key: a running session takes precedence over a
   * recent project with the same (cwd, sshConnectionName|local) tuple.
   */
  const unifiedItems = $derived.by<UnifiedSessionItem[]>(() => {
    const usedKeys = new Set<string>();
    const items: UnifiedSessionItem[] = [];

    // 1) Active sessions (local + SSH).
    for (const s of sessions) {
      const key = dedupKey(s.cwd, s.sshConnectionId);
      usedKeys.add(key);
      const conn = s.sshConnectionId
        ? sshConnections.find((c) => c.id === s.sshConnectionId)
        : undefined;
      items.push({
        kind: 'active',
        title: s.cwd.split('/').pop() || s.id.slice(0, 8),
        path: s.cwd,
        backend: s.sshConnectionId ? 'ssh' : 'local',
        status: s.status,
        lastUsedAt: s.startedAt,
        sessionId: s.id,
        sshConnectionId: s.sshConnectionId,
        tmuxName: s.tmuxName,
      });
      void conn;
    }

    // 2) Recent history items — ALWAYS show (even if an active session
    //    exists for the same path) so the user can launch another session
    //    for the same project. Previously recents were filtered out when an
    //    active session had the same dedup key, which prevented re-activation.
    for (const proj of history) {
      const sshConn = proj.source && proj.source !== 'local'
        ? sshConnections.find((c) => c.name === proj.source)
        : undefined;
      const key = dedupKey(proj.path, sshConn?.id);
      usedKeys.add(key);
      items.push({
        kind: 'recent',
        title: proj.path.split('/').pop() || proj.path,
        path: proj.path,
        backend: proj.source && proj.source !== 'local' ? 'ssh' : 'local',
        lastUsedAt: proj.last_used_at,
        sshConnectionId: sshConn?.id,
      });
    }

    // 3) Discovered local tmux sessions.
    for (const ts of tmuxSessions) {
      items.push({
        kind: 'discovered',
        title: ts.name,
        path: ts.currentPath || ts.name,
        backend: 'discovered',
        lastUsedAt: Date.now(),
        tmuxName: ts.name,
      });
    }

    // 4) Discovered remote tmux sessions (per SSH connection).
    for (const [connId, list] of remoteTmuxSessions) {
      for (const ts of list) {
        items.push({
          kind: 'discovered',
          title: ts.name,
          path: ts.currentPath || ts.name,
          backend: 'discovered',
          status: ts.attached ? 'attached' : undefined,
          lastUsedAt: Date.now(),
          sshConnectionId: connId,
          tmuxName: ts.name,
        });
      }
    }

    // Sort: active (running first) → recent-inactive by lastUsedAt desc → discovered.
    const rank: Record<UnifiedSessionItem['kind'], number> = { active: 0, recent: 1, discovered: 2 };
    items.sort((a, b) => {
      const ra = rank[a.kind];
      const rb = rank[b.kind];
      if (ra !== rb) return ra - rb;
      // Within active: running before other statuses.
      if (a.kind === 'active' && b.kind === 'active') {
        const ar = a.status === 'running' ? 0 : 1;
        const br = b.status === 'running' ? 0 : 1;
        if (ar !== br) return ar - br;
      }
      const ta = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
      const tb = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
      return tb - ta;
    });

    return items;
  });

  function dedupKey(cwd: string, sshConnectionId?: string): string {
    return `${cwd}::${sshConnectionId ?? 'local'}`;
  }

  // ── Filtered views for the split sections ──
  // ONE shared filter chip group filters BOTH sections.
  function matchesFilter(i: UnifiedSessionItem): boolean {
    switch (sessionFilter) {
      case 'local':
        return i.backend === 'local';
      case 'ssh':
        return i.backend === 'ssh';
      case 'active':
        return i.kind === 'active';
      case 'discovered':
        return i.kind === 'discovered';
      default:
        return true;
    }
  }

  // Sessions section: active + discovered (available sessions to join).
  const sessionItems = $derived.by<UnifiedSessionItem[]>(() => {
    return unifiedItems
      .filter((i) => i.kind === 'active' || i.kind === 'discovered')
      .filter(matchesFilter);
  });

  // Projects section: recent only (where the user launches new sessions).
  const projectItems = $derived.by<UnifiedSessionItem[]>(() => {
    return unifiedItems.filter((i) => i.kind === 'recent').filter(matchesFilter);
  });

  const filterOptions = $derived.by<FilterOption[]>(() => {
    let localCount = 0, sshCount = 0, activeCount = 0, discoveredCount = 0;
    for (const i of unifiedItems) {
      if (i.kind === 'active') activeCount++;
      else if (i.kind === 'discovered') discoveredCount++;
      if (i.backend === 'local') localCount++;
      else if (i.backend === 'ssh') sshCount++;
    }
    return [
      { value: 'all', label: 'All', count: unifiedItems.length },
      { value: 'local', label: 'Local', count: localCount },
      { value: 'ssh', label: 'SSH', count: sshCount },
      { value: 'active', label: 'Active', count: activeCount },
      { value: 'discovered', label: 'Discovered', count: discoveredCount },
    ];
  });

  // ───────────────────────────────────────────────────────────────
  // Data loading (PRESERVED behavior)
  // ───────────────────────────────────────────────────────────────
  async function load() {
    try {
      const [sessRes, histRes, tmuxRes, sshRes] = await Promise.all([
        listSessions(),
        getProjectHistory(),
        getTmuxSessions(),
        listSshConnections(),
      ]);
      sessions = sessRes;
      history = histRes;
      tmuxSessions = tmuxRes.filter((t) => !t.isManaged);
      sshConnections = sshRes;
      // If the currently-selected backend no longer exists, reset to local.
      if (backendId !== 'local' && !sshConnections.some((c) => c.id === backendId)) {
        backendId = 'local';
      }
    } catch (e) {
      showToast({ message: 'Failed to load dashboard data', type: 'error', duration: 6000 });
      console.error(e);
    }
  }

  async function loadRemoteTmuxSessions() {
    if (sshConnections.length === 0) return;
    remoteTmuxLoading = true;
    try {
      const results = await Promise.all(
        sshConnections.map((conn) => getRemoteTmuxSessions(conn.id)),
      );
      const newMap = new Map<string, TmuxDiscoverySession[]>();
      sshConnections.forEach((conn, idx) => {
        newMap.set(conn.id, results[idx].filter((t) => !t.isManaged));
      });
      remoteTmuxSessions = newMap;
    } catch (e) {
      console.error('Failed to load remote tmux sessions:', e);
    } finally {
      remoteTmuxLoading = false;
    }
  }

  onMount(() => {
    load();
    loadRemoteTmuxSessions();
    interval = window.setInterval(load, 3000);
  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
  });

  // ───────────────────────────────────────────────────────────────
  // Terminal dimensions helper (PRESERVED)
  // ───────────────────────────────────────────────────────────────
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

  // ───────────────────────────────────────────────────────────────
  // Interactions — launch, resume, open, attach, kill (mt-d.1/d.2/d.3)
  // ───────────────────────────────────────────────────────────────

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

  // Shared launch primitive (preserves the 409 → toast / generic → toast behavior).
  async function doLaunch(cwd: string, sshId?: string): Promise<void> {
    const { cols, rows } = getSavedTermDims();
    const { session } = await launchSession(cwd, cols, rows, sshId);
    openSessionTab(session);
    await load();
  }

  function handleLaunchError(e: unknown) {
    const err = e as Error & { statusCode?: number };
    if (err.statusCode === 409) {
      showToast({
        message: 'Session limit reached (8). Close a session or raise the maxConcurrent limit.',
        type: 'warning',
        duration: 6000,
      });
    } else {
      const msg = err.message ?? 'Failed to launch session';
      showToast({ message: msg, type: 'error', duration: 6000 });
    }
  }

  // LaunchBar onLaunch handler — replaces the old handleLaunch.
  async function onLaunchBarLaunch(cwd: string, backend: string) {
    if (!cwd) return;
    const sshId = backend === 'local' ? undefined : backend;
    try {
      await doLaunch(cwd, sshId);
      launchCwd = '';
      backendId = 'local';
    } catch (e) {
      handleLaunchError(e);
    }
  }

  // SessionRow onResume (recent) — mt-d.1.
  // If an active session already exists for this path+backend, activate its tab;
  // otherwise launch a fresh one.
  // SessionRow onResume (recent) — ALWAYS launches a fresh session, even if
  // an active session already exists for the same path+backend. The user
  // wants multiple concurrent sessions per project. Only the "Open" button on
  // an active session row activates the existing session.
  async function resumeProject(item: UnifiedSessionItem) {
    try {
      await doLaunch(item.path, item.sshConnectionId);
    } catch (e) {
      handleLaunchError(e);
    }
  }

  // SessionRow onOpen (active) — mt-d.2.
  function openActive(item: UnifiedSessionItem) {
    if (!item.sessionId) return;
    const s = sessions.find((x) => x.id === item.sessionId);
    if (s) {
      const existingTab = get(workspace).tabs.find((t) => t.sessionId === s.id);
      if (existingTab) {
        workspace.activateTab(s.id);
      } else {
        openSessionTab(s);
      }
    }
  }

  // SessionRow onAttach (discovered) — mt-d.2.
  async function attachDiscovered(item: UnifiedSessionItem) {
    if (!item.tmuxName) return;
    try {
      const { cols, rows } = getSavedTermDims();
      const res = item.sshConnectionId
        ? await attachRemoteTmuxSession(item.sshConnectionId, item.tmuxName, cols, rows)
        : await attachTmuxSession(item.tmuxName, cols, rows);
      if (res) {
        await load();
        const s = sessions.find((x) => x.id === res.sessionId);
        if (s) openSessionTab(s);
      }
    } catch (e) {
      handleLaunchError(e);
    }
  }

  // SessionRow onResume (recent) — reuses the same logic as resumeProject.
  async function resumeRecent(item: UnifiedSessionItem) {
    await resumeProject(item);
  }

  // SessionRow onRemove (recent) — opens a confirmation Dialog. The actual
  // deletion happens in confirmRemove() below, only after the user confirms.
  // mt-d.1 hide/remove capability.
  function deleteRecent(item: UnifiedSessionItem) {
    removeTarget = item;
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    const item = removeTarget;
    removeTarget = null;
    try {
      await deleteProjectHistory(item.path);
      await load();
      showToast({ message: 'Removed from recent projects', type: 'info', duration: 3000 });
    } catch (e) {
      const err = e as Error & { statusCode?: number };
      const msg = err.message ?? 'Failed to remove project history entry';
      showToast({ message: msg, type: 'error', duration: 6000 });
    }
  }

  // ── Kill confirmation (kept as Dialog) ──
  const killTargetSession = $derived(
    killTarget ? sessions.find((session) => session.id === killTarget) ?? null : null,
  );

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
      showToast({ message: 'Session terminated', type: 'info', duration: 3000 });
    } catch (error) {
      console.error(error);
      showToast({ message: 'Failed to terminate session', type: 'error', duration: 6000 });
    } finally {
      killing = false;
    }
  }

  // Row kill action (exposed via context-menu style action on active rows).
  function requestKill(item: UnifiedSessionItem) {
    if (item.sessionId) killTarget = item.sessionId;
  }

  // ── SSH connection modal ──
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
    loadRemoteTmuxSessions();
  }

  // SshConnectionSection callbacks.
  function onSshTest(_conn: SshConnection) {
    // SshConnectionList handles its own test UI/badges; this is a passthrough
    // hook for future toast-on-failure enhancement.
  }

  function onSshDelete(_conn: SshConnection) {
    // Deletion is handled inside SshConnectionList with its own confirm flow;
    // refresh after a tick so counts stay in sync.
    window.setTimeout(() => load(), 100);
  }

  // ── EmptyState CTA: focus the LaunchBar path input ──
  function focusLaunchBar() {
    const target = launchSectionEl?.querySelector<HTMLInputElement>(
      'input[type="text"], input:not([type])',
    );
    if (target) {
      target.focus();
    } else {
      requestAnimationFrame(() => {
        launchSectionEl?.querySelector<HTMLInputElement>('input')?.focus();
      });
    }
  }
</script>

<div class="dashboard">
  <!-- ────────────────────────────────────────────────────
       HEADER — thin app bar: logo+title left, SSH icon + settings right
       ──────────────────────────────────────────────────── -->
  <header class="dash-header" aria-label="Dashboard header">
    <div class="header-title">
      <span class="header-logo" aria-hidden="true">
        <Icon name="terminal" size={20} />
      </span>
      <h1 class="header-name" data-view-focus>OpenCode TUI Tunnel</h1>
    </div>
    <div class="header-actions">
      <Button
        variant="ghost"
        size="md"
        icon
        aria-label="Open settings"
        onclick={() => settingsOpen = true}
      >
        <Icon name="settings" size={20} />
      </Button>
    </div>
  </header>

  <div class="install-banner-slot">
    <InstallBanner />
  </div>

  <!-- Single-column full-width flow. No two-column grid. -->
  <main class="dash-flow">

    <!-- ────────────────────────────────────────────────
         §1 LaunchBar — compact command bar (primary entry point)
         ──────────────────────────────────────────────── -->
    <section class="launch-section" aria-label="New session" bind:this={launchSectionEl}>
      <LaunchBar
        bind:cwd={launchCwd}
        bind:backendId={backendId}
        {sshConnections}
        onLaunch={onLaunchBarLaunch}
        disabled={false}
      />
    </section>

    <!-- ────────────────────────────────────────────────
         §2 Filter chips (shared across both sections below)
         ──────────────────────────────────────────────── -->
    <div class="sessions-heading-row">
      <FilterChipGroup
        options={filterOptions}
        bind:value={sessionFilter}
      />
    </div>

    <!-- ────────────────────────────────────────────────
         §3 SESSIONS — active + discovered (available to join)
         ──────────────────────────────────────────────── -->
    <section class="sessions-section" aria-label="Sessions">
      <div class="section-heading">
        <span class="section-heading-icon" aria-hidden="true"><Icon name="terminal" size={16} /></span>
        <h2 class="section-heading-text">Sessions</h2>
        {#if sessionItems.length > 0}
          <Badge variant="default">{sessionItems.length}</Badge>
        {/if}
      </div>

      {#if sessionItems.length === 0}
        <EmptyState
          icon="terminal"
          title="No active sessions"
          description={unifiedItems.length === 0
            ? 'Launch a new session above or resume a recent project to get started.'
            : 'No sessions match this filter.'}
          cta={unifiedItems.length === 0 ? { label: 'Start a session', onclick: focusLaunchBar } : undefined}
        />
      {:else}
        <div class="session-list" role="list" aria-label="Sessions list">
          {#each sessionItems as item (item.kind + '::' + (item.sessionId ?? item.tmuxName ?? item.path) + '::' + (item.sshConnectionId ?? 'local'))}
            <SessionRow
              {item}
              onOpen={openActive}
              onAttach={attachDiscovered}
              onResume={resumeRecent}
              onRemove={deleteRecent}
              onKill={requestKill}
            />
          {/each}
        </div>
      {/if}

      {#if remoteTmuxLoading}
        <p class="loading-hint"><span class="spinner-inline" aria-hidden="true"></span> Loading remote tmux sessions…</p>
      {/if}
    </section>

    <!-- ────────────────────────────────────────────────
         §4 PROJECTS — recent projects (launch new sessions from here)
         ──────────────────────────────────────────────── -->
    <section class="sessions-section projects-section" aria-label="Recent projects">
      <div class="section-heading">
        <span class="section-heading-icon" aria-hidden="true"><Icon name="folder" size={16} /></span>
        <h2 class="section-heading-text">Projects</h2>
        {#if projectItems.length > 0}
          <Badge variant="default">{projectItems.length}</Badge>
        {/if}
      </div>

      {#if projectItems.length === 0}
        <EmptyState
          icon="folder"
          title="No recent projects"
          description={unifiedItems.length === 0
            ? 'Launch a session above and it will appear here for quick re-launch.'
            : 'No projects match this filter.'}
        />
      {:else}
        <div class="session-list" role="list" aria-label="Projects list">
          {#each projectItems as item (item.kind + '::' + (item.sessionId ?? item.tmuxName ?? item.path) + '::' + (item.sshConnectionId ?? 'local'))}
            <SessionRow
              {item}
              onOpen={openActive}
              onAttach={attachDiscovered}
              onResume={resumeRecent}
              onRemove={deleteRecent}
              onKill={requestKill}
            />
          {/each}
        </div>
      {/if}
    </section>

    <!-- ────────────────────────────────────────────────
         §3 SSH Connections — on-demand collapsible section
         ──────────────────────────────────────────────── -->
    {#if unifiedItems.length > 0}
    <section class="ssh-section-wrap" aria-label="SSH connections management">
      <SshConnectionSection
        bind:expanded={sshSectionExpanded}
        connections={sshConnections}
        onAdd={() => openSshModal()}
        onEdit={(conn) => openSshModal(conn)}
        onTest={onSshTest}
        onDelete={onSshDelete}
        onRefresh={load}
      />
    </section>
    {/if}

  </main>

  <!-- ────────────────────────────────────────────────────
       Kill confirmation Dialog (preserved)
       ──────────────────────────────────────────────────── -->
  {#if killTarget}
    <Dialog
      open={true}
      title="Kill Session?"
      size="sm"
      closeOnBackdrop={!killing}
      closeOnEscape={!killing}
      onClose={() => { if (!killing) killTarget = null; }}
    >
      {#snippet children()}
        <div class="dialog-kill-body">
          <div class="dialog-kill-icon"><Icon name="warning" size={24} aria-hidden="true" /></div>
          <p class="dialog-message">This will terminate the process.</p>
          {#if killTargetSession}
            <p class="dialog-hint" title={killTargetSession.cwd}>{killTargetSession.cwd}</p>
          {/if}
        </div>
      {/snippet}
      {#snippet footer()}
        <Button variant="secondary" size="md" onclick={() => killTarget = null} disabled={killing}>Cancel</Button>
        <Button variant="danger" size="md" onclick={confirmKill} disabled={killing} loading={killing}>Kill</Button>
      {/snippet}
    </Dialog>
  {/if}

  <!-- ────────────────────────────────────────────────────
       Remove-from-recent confirmation Dialog
       ──────────────────────────────────────────────────── -->
  {#if removeTarget}
    <Dialog
      open={true}
      title="Remove Project?"
      size="sm"
      closeOnBackdrop={true}
      closeOnEscape={true}
      onClose={() => { removeTarget = null; }}
    >
      {#snippet children()}
        <div class="dialog-remove-body">
          <p class="dialog-message">Remove this project from recent?</p>
          {#if removeTarget.path}
            <p class="dialog-hint" title={removeTarget.path}>{removeTarget.path}</p>
          {/if}
        </div>
      {/snippet}
      {#snippet footer()}
        <Button variant="secondary" size="md" onclick={() => { removeTarget = null; }}>Cancel</Button>
        <Button variant="danger" size="md" onclick={confirmRemove}>Remove</Button>
      {/snippet}
    </Dialog>
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
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: var(--space-6);
    font-family: var(--font-ui);
    box-sizing: border-box;
    /* overflow-x: clip prevents horizontal scroll WITHOUT forcing overflow-y
       to compute to `auto` (which `overflow-x: hidden` does per CSS spec). This
       keeps the dashboard as a non-scroll flex child so the parent
       .app-content scrolls naturally — no double/nested scroll containers on
       narrow phones. */
    overflow-x: clip;
    overflow-y: visible;
  }

  /* ── Header ── */
  .dash-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-5);
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--border-subtle);
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .header-logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--accent-green);
    filter: drop-shadow(0 0 8px color-mix(in srgb, var(--accent-green) 40%, transparent));
    flex-shrink: 0;
  }

  .header-name {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
    letter-spacing: -0.01em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  /* ── Install banner slot ── */
  .install-banner-slot {
    margin-bottom: var(--space-5);
  }

  /* ── Single-column flow ── */
  .dash-flow {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    flex: 1;
  }

  /* ── Section heading shared style ── */
  .section-heading {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  .section-heading-icon {
    display: inline-flex;
    align-items: center;
    color: var(--text-secondary);
  }

  .section-heading-text {
    margin: 0;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--text-secondary);
    letter-spacing: 0.02em;
  }

  /* ── §1 Launch section ── */
  .launch-section {
    width: 100%;
  }

  /* ── §2 Sessions section ── */
  .sessions-section {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .sessions-section.empty-state-active {
    /* Keep the empty state in its normal position (compact, at the top of
       the sessions section). Center it horizontally so the empty-state
       text/card is not left-aligned. */
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  /* The EmptyState component renders a Card (width:100%) with a
     .empty-state-inner (max-width:320px). When the sessions section is
     wider than the card's inner content, the inner block sits left-aligned
     inside the card-body. These rules center the empty-state card and its
     inner content within the sessions section. */
  .sessions-section :global(.empty-state) {
    justify-content: center;
  }
  .sessions-section :global(.empty-state .card-body) {
    display: flex;
    justify-content: center;
  }

  .sessions-heading-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
    margin-bottom: var(--space-4);
    touch-action: pan-x pan-y;
    overflow-x: auto;
  }

  .session-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .loading-hint {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: var(--space-3) 0 0 0;
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    font-style: italic;
  }

  .spinner-inline {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid var(--border-subtle);
    border-top-color: var(--text-secondary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── §3 SSH section wrapper ── */
  .ssh-section-wrap {
    width: 100%;
    border-top: 1px solid var(--border-muted);
    padding-top: var(--space-4);
  }

  /* ── Kill dialog (preserved styles) ── */
  .dialog-kill-body {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .dialog-kill-icon {
    display: inline-flex;
    color: var(--accent-red);
  }

  .dialog-message {
    margin: 0;
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    line-height: var(--line-height-normal);
  }

  .dialog-hint {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    line-height: var(--line-height-normal);
    border-left: 2px solid var(--border-default);
    padding-left: var(--space-3);
    font-family: var(--font-mono);
    word-break: break-all;
  }

  /* ── Remove-from-recent dialog (shares .dialog-message/.dialog-hint) ── */
  .dialog-remove-body {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
  }

  /* ── Responsive ── */
  @media (max-width: 640px) {
    .dashboard {
      padding: var(--space-3);
      /* On mobile the dashboard must be fully scrollable vertically — no
         fixed-height clipping. Content flows naturally and the parent
         .app-content[data-view='home'] scrolls. overflow-x: clip (not hidden)
         prevents horizontal scroll without forcing overflow-y to auto. */
      overflow-x: clip;
      overflow-y: visible;
      -webkit-overflow-scrolling: touch;
    }

    .dash-header {
      gap: var(--space-2);
      margin-bottom: var(--space-3);
      padding-bottom: var(--space-3);
    }

    .dash-flow {
      gap: var(--space-4);
    }

    .install-banner-slot {
      margin-bottom: var(--space-3);
    }

    .sessions-heading-row {
      flex-direction: column;
      align-items: flex-start;
      flex-wrap: nowrap;
      gap: var(--space-2);
    }

    /* Session rows: drop the path/status-text columns on very narrow
       screens so a row fits the viewport width without horizontal
       clipping. Title + badge + action remain. */
    .session-list :global(.session-row) {
      gap: var(--space-2);
    }
  }

  /* Extra-narrow phones (≤400px): hide the path and status-text segments
     of session rows so each row is a single line that fits the viewport. */
  @media (max-width: 400px) {
    .session-list :global(.session-row .path),
    .session-list :global(.session-row .status-text) {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner-inline {
      animation: none;
      opacity: 0.5;
    }
  }
</style>