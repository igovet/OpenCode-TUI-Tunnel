<script lang="ts">
  import type { SessionInfo } from '../lib/types'
  import StatusBadge from './StatusBadge.svelte'
  
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
</script>

<div class="card terminal-card" class:ssh-card={session.backend === 'ssh'}>
  <div class="header">
    <div class="title-row">
      <h3 title={session.cwd} class="session-title"><span class="prompt"></span>{getBasename(session.cwd)}</h3>
      <StatusBadge status={session.status} />
    </div>
    {#if session.backend === 'ssh' || (session.backend === 'tmux' && session.sshConnectionId)}
      <div class="meta provider-meta">
        {#if session.backend === 'ssh'}
          <span class="provider-badge server">🌐 Server</span>
        {:else}
          <span class="provider-badge sshfs">📁 Local (SSHFS)</span>
        {/if}
        {#if session.source}
          <span class="ssh-badge" title={session.source}>
            <span class="ssh-icon">🌐</span>
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
  </div>

  <div class="actions">
    <button class="btn kill-btn" onclick={() => onKill(session.id)} disabled={session.status === 'exited' || session.status === 'failed'}>
      KILL
    </button>
    <button class="btn primary" onclick={() => onConnect(session.id)} disabled={session.status === 'exited' || session.status === 'failed'}>
      CONNECT
    </button>
  </div>
</div>

<style>
  .terminal-card {
    background: var(--bg-elevated);
    border: 1px solid var(--border-default);
    border-radius: 0;
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    transition: all var(--transition-fast);
    box-shadow: inset 0 0 10px rgba(0,0,0,0.2);
    overflow: hidden;
  }
  
  .terminal-card:hover {
    border-color: var(--accent-blue);
    background: var(--bg-overlay);
    box-shadow: inset 0 0 10px rgba(88, 166, 255, 0.05);
  }
  
  .header {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  
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

  .title-row :global(.badge-container) {
    max-width: 100%;
    min-width: 0;
  }

  .title-row :global(.badge-text) {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex: 1;
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
  }

  .ssh-icon {
    margin-right: 4px;
    flex-shrink: 0;
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
  }

  .provider-badge.server {
    color: var(--accent-cyan);
    border-color: var(--accent-cyan);
    background: rgba(34, 211, 238, 0.1);
  }

  .provider-badge.sshfs {
    color: var(--accent-green);
    border-color: var(--accent-green);
    background: rgba(63, 185, 80, 0.1);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    justify-content: flex-end;
    margin-top: var(--space-1);
  }

  .kill-btn {
    background: transparent;
    border: 1px solid #553333;
    color: #aa5555;
    font-size: var(--font-size-xs);
    padding: var(--space-1) var(--space-3);
    border-radius: 0;
    cursor: pointer;
    letter-spacing: 1px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .kill-btn:hover {
    background: #3a1111;
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
