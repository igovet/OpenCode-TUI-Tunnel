<script lang="ts">
  import type { SessionInfo } from '../lib/types'
  import Card from './ui/Card.svelte'
  import Icon from './ui/Icon.svelte'
  import StatusDot from './ui/StatusDot.svelte'
  import Badge from './ui/Badge.svelte'

  let { session, onConnect, onKill }: { session: SessionInfo, onConnect: (id: string) => void, onKill: (id: string) => void } = $props()

  function getBasename(path: string) {
    return path.split('/').pop() || path
  }

  function timeAgo(dateStr: string) {
    const ms = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(ms / 60000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  const statusBadgeVariant = $derived(
    session.status === 'running' ? 'success' :
    session.status === 'starting' ? 'warning' :
    (session.status === 'exited' || session.status === 'failed') ? 'danger' :
    'default'
  )
</script>

<Card
  variant="glass"
  padding="md"
  class={session.backend === 'ssh' ? 'ssh-card' : ''}
>
  {#snippet header()}
    <div class="title-row">
      <h3 class="session-title" title={session.cwd}>
        <span class="prompt"></span>{getBasename(session.cwd)}
      </h3>
      <div class="status-group">
        <StatusDot status={session.status} size="sm" />
        <Badge variant={statusBadgeVariant}>{session.status}</Badge>
      </div>
    </div>
  {/snippet}

  {#snippet children()}
    {#if session.backend === 'ssh' || (session.backend === 'tmux' && session.sshConnectionId)}
      <div class="meta provider-meta">
        {#if session.backend === 'ssh'}
          <span class="provider-badge server">
            <Icon name="globe" size={12} /> Server
          </span>
        {:else}
          <span class="provider-badge sshfs">
            <Icon name="folder" size={12} /> Local (SSHFS)
          </span>
        {/if}
        {#if session.source}
          <span class="ssh-badge" title={session.source}>
            <Icon name="globe" size={12} />
            {session.source}
          </span>
        {/if}
      </div>
    {/if}
    <div class="meta time-meta">
      <span class="meta-item">up {timeAgo(session.startedAt)}</span>
      <span class="meta-divider">|</span>
      <span class="meta-item">{session.clientCount} usr</span>
    </div>
  {/snippet}

  {#snippet footer()}
    <div class="actions">
      <button
        class="kill-btn"
        onclick={() => onKill(session.id)}
        disabled={session.status === 'exited' || session.status === 'failed'}
      >
        KILL
      </button>
      <button
        class="btn primary"
        onclick={() => onConnect(session.id)}
        disabled={session.status === 'exited' || session.status === 'failed'}
      >
        CONNECT
      </button>
    </div>
  {/snippet}
</Card>

<style>
  .title-row {
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    min-width: 0;
  }

  .session-title {
    margin: 0;
    font-size: var(--font-size-md);
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    font-weight: 600;
    flex: 1;
  }

  .status-group {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1-5, 0.375rem);
    flex-shrink: 0;
  }

  .meta {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    display: flex;
    gap: var(--space-2);
    align-items: center;
    font-family: var(--font-mono);
    flex-wrap: wrap;
    min-width: 0;
  }

  .provider-meta {
    gap: var(--space-2);
    row-gap: 4px;
  }

  .time-meta {
    gap: var(--space-2);
  }

  .meta-divider {
    color: var(--border-muted);
    flex-shrink: 0;
  }

  .ssh-badge {
    color: var(--accent-cyan);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    max-width: 100%;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .ssh-card {
    border-left: 3px solid var(--accent-cyan);
  }

  .provider-badge {
    font-size: var(--font-size-xs);
    padding: 1px 6px;
    border: 1px solid;
    font-weight: 600;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .provider-badge.server {
    color: var(--accent-cyan);
    border-color: var(--accent-cyan);
    background: color-mix(in srgb, var(--accent-cyan) 10%, transparent);
  }

  .provider-badge.sshfs {
    color: var(--accent-green);
    border-color: var(--accent-green);
    background: color-mix(in srgb, var(--accent-green) 10%, transparent);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  .kill-btn {
    background: transparent;
    border: 1px solid var(--accent-red);
    color: var(--accent-red);
    font-size: var(--font-size-xs);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm, 4px);
    cursor: pointer;
    letter-spacing: 1px;
    flex-shrink: 0;
    white-space: nowrap;
    transition: background var(--transition-fast, 100ms ease);
  }

  @media (min-width: 769px) {
    .kill-btn:hover {
      background: color-mix(in srgb, var(--accent-red) 12%, transparent);
    }
  }

  .kill-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn.primary {
    font-size: var(--font-size-xs);
    padding: var(--space-1) var(--space-3);
    letter-spacing: 1px;
    flex-shrink: 0;
    white-space: nowrap;
  }
</style>
