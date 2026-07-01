<script lang="ts">
  import StatusDot from '$components/ui/StatusDot.svelte';
  import Badge from '$components/ui/Badge.svelte';
  import Button from '$components/ui/Button.svelte';
  import Icon from '$components/ui/Icon.svelte';

  /**
   * Unified session item representing an active session, a discovered tmux
   * session, or a recent-but-inactive project.
   */
  interface UnifiedSessionItem {
    kind: 'active' | 'discovered' | 'recent';
    title: string;
    path: string;
    backend: 'local' | 'ssh' | 'discovered';
    status?: string;
    lastUsedAt?: string | number | Date;
    sessionId?: string;
  }

  interface Props {
    item: UnifiedSessionItem;
    onOpen?: (item: UnifiedSessionItem) => void;
    onAttach?: (item: UnifiedSessionItem) => void;
    onResume?: (item: UnifiedSessionItem) => void;
    /**
     * Hide/remove callback — fired by the inline X button for `recent` and
     * `discovered` items. Removes the item from the unified list display
     * (for recent items: deletes the project-history entry).
     */
    onRemove?: (item: UnifiedSessionItem) => void;
    /**
     * Kill/terminate callback — fired by the inline X button for `active`
     * items. Terminates the running session.
     */
    onKill?: (item: UnifiedSessionItem) => void;
    [key: string]: unknown;
  }

  const {
    item,
    onOpen,
    onAttach,
    onResume,
    onRemove,
    onKill,
    ...rest
  }: Props = $props();

  /** Map item.status to StatusDot-compatible status value. */
  const dotStatus = $derived(
    item.kind === 'active' && item.status
      ? (['running', 'starting', 'exited', 'failed', 'interrupted', 'attached'].includes(item.status)
          ? (item.status as 'running' | 'starting' | 'exited' | 'failed' | 'interrupted' | 'attached')
          : 'running')
      : 'running'
  );

  /** Human-readable relative time from a timestamp. */
  function relativeTime(ts: string | number | Date): string {
    const now = Date.now();
    const then = new Date(ts).getTime();
    const diffMs = now - then;
    if (diffMs < 0) return 'just now';
    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;
    return `${Math.floor(days / 30)}mo`;
  }

  const timeLabel = $derived(
    item.lastUsedAt ? relativeTime(item.lastUsedAt) : null
  );

  /** Status text segment: e.g. "running • 3m", "idle • 2h", "discovered". */
  const statusLabel = $derived.by(() => {
    const parts: string[] = [];
    if (item.status) parts.push(item.status);
    if (timeLabel) parts.push(`• ${timeLabel}`);
    return parts.join(' ') || '';
  });

  /** Backend badge variant. */
  const badgeVariant = $derived(
    item.backend === 'ssh' ? 'accent' as const
    : item.backend === 'discovered' ? 'default' as const
    : 'default' as const
  );

  /** Backend badge label. */
  const badgeLabel = $derived(
    item.backend === 'ssh' ? 'SSH'
    : item.backend === 'discovered' ? 'discovered'
    : 'local'
  );

  /** Action button config per kind. */
  const actionConfig = $derived.by(() => {
    switch (item.kind) {
      case 'active':
        return { label: 'Open', icon: 'chevron-right' as const, handler: onOpen };
      case 'discovered':
        return { label: 'Attach', icon: 'plug' as const, handler: onAttach };
      case 'recent':
        return { label: 'Run', icon: 'power' as const, handler: onResume };
    }
  });

  /** Inline X button config: shown for `recent` (hide/remove) and `active`
   *  (kill); not shown for `discovered` (those are attached ad-hoc, not
   *  hideable from this list). */
  const removeConfig = $derived.by(() => {
    if (item.kind === 'recent') return { icon: 'close' as const, label: 'Remove from recent', handler: onRemove };
    if (item.kind === 'active') return { icon: 'close' as const, label: 'Kill session', handler: onKill };
    return null;
  });

  /** Primary action for the row kind (Open / Run / Attach). */
  function primaryAction() {
    actionConfig?.handler?.(item);
  }

  /** Row body click — fires the primary action. */
  function handleRowClick() {
    primaryAction();
  }

  /** Row body keydown — Enter/Space fire the primary action. */
  function handleRowKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      primaryAction();
    }
  }

  function handleAction(e: MouseEvent) {
    e.stopPropagation();
    primaryAction();
  }

  function handleRemove(e: MouseEvent) {
    e.stopPropagation();
    removeConfig?.handler?.(item);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="session-row"
  role="button"
  tabindex="0"
  aria-label={actionConfig?.label ? `${actionConfig.label} ${item.title}` : item.title}
  onclick={handleRowClick}
  onkeydown={handleRowKeydown}
  {...rest}
>
  <!-- Status icon (far left) -->
  <span class="status-area">
    {#if item.kind === 'active'}
      <StatusDot status={dotStatus} size="sm" />
    {:else if item.kind === 'discovered'}
      <Icon name="terminal" size={14} class="status-icon-discovered" aria-hidden="true" />
    {:else}
      <span class="status-dot-recent" aria-hidden="true"></span>
    {/if}
  </span>

  <!-- Title -->
  <span class="title" title={item.title}>{item.title}</span>

  <!-- Path -->
  <span class="path" title={item.path}>{item.path}</span>

  <!-- Backend badge -->
  <Badge variant={badgeVariant}>
    {badgeLabel}
  </Badge>

  <!-- Status text + relative time -->
  <span class="status-text">{statusLabel}</span>

  <!-- Inline action area: [primary] [X] side by side at the right edge -->
  <div class="row-actions">
    <Button
      variant="ghost"
      size="sm"
      onclick={handleAction}
      aria-label={actionConfig?.label}
    >
      {#snippet icon_src()}
        <Icon name={actionConfig?.icon ?? 'chevron-right'} size={14} />
      {/snippet}
      {actionConfig?.label}
    </Button>

    {#if removeConfig}
      <Button
        variant="ghost"
        size="sm"
        icon
        class="row-remove-btn"
        aria-label={removeConfig.label}
        title={removeConfig.label}
        onclick={handleRemove}
      >
        <Icon name={removeConfig.icon} size={14} />
      </Button>
    {/if}
  </div>
</div>

<style>
  .session-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-md, var(--space-4));
    border-radius: var(--radius-md);
    background: var(--bg-surface);
    border: 1px solid var(--border-muted);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast);
    min-height: 44px;
  }

  @media (min-width: 769px) {
    .session-row:hover {
      background: var(--bg-elevated);
      border-color: var(--border-default);
    }
  }

  .session-row:focus-visible {
    background: var(--bg-elevated);
    border-color: var(--border-accent);
    box-shadow: 0 0 0 1px var(--border-accent);
  }

  /* ── Status area ── */

  .status-area {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 20px;
    height: 20px;
  }

  .status-icon-discovered {
    color: var(--text-muted);
  }

  .status-dot-recent {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-muted);
    flex-shrink: 0;
  }

  /* ── Title ── */

  .title {
    font-size: var(--font-size-base);
    color: var(--text-primary);
    font-weight: var(--font-weight-medium);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 0 1 auto;
    min-width: 0;
  }

  /* ── Path ── */

  .path {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1 1 auto;
    min-width: 0;
  }

  /* ── Status text ── */

  .status-text {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* ── Inline action area: [primary] [X] on the right edge ── */

  .row-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
    margin-left: auto;
  }

  .row-remove-btn {
    color: var(--text-muted);
  }

  @media (min-width: 769px) {
    .row-remove-btn:hover {
      color: var(--accent-red);
    }
  }

  /* Coarse-pointer hover/focus suppression handled globally by theme.css */

  /* ── Narrow phones (≤640px): tighten padding & gaps so every row fits the
        viewport width without horizontal clipping. Title becomes shrinkable
        (flex: 0 1 auto + min-width: 0) so it truncates before overflowing. ── */
  @media (max-width: 640px) {
    .session-row {
      padding: var(--space-2) var(--space-3);
      gap: var(--space-2);
    }
    .title {
      max-width: 45vw;
    }
    .row-actions {
      gap: var(--space-1);
    }
  }

  /* ── Mobile (≤768px) or coarse-pointer: hide path so session title fits
        on narrow phone viewports. Path is secondary info; title is primary. ── */
  @media (max-width: 768px) {
    .path {
      display: none;
    }
  }

  /* ── Ultra-narrow phones (≤340px): hide the backend badge so a row is
        title + status-dot + action buttons only — guaranteed to fit even a
        320px viewport with a long title. At 360px+ the badge (local/SSH) stays
        visible because rows fit comfortably there. ── */
  @media (max-width: 340px) {
    .session-row {
      padding: var(--space-2);
      gap: var(--space-1-5, var(--space-1));
      min-height: 40px;
    }
    .title {
      max-width: 50vw;
    }
    /* Hide the backend badge (local/SSH/discovered) and status text on the
       narrowest screens to keep each row a single line that fits. */
    .session-row :global(.badge),
    .status-text {
      display: none;
    }
  }

  /* Focus suppression on touch — handled globally by theme.css */
</style>
