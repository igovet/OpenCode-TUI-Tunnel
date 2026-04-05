<script lang="ts">
  import type { SessionInfo } from '../lib/types'
  import StatusBadge from './StatusBadge.svelte'
  
  let { session, onConnect }: { session: SessionInfo, onConnect: (id: string) => void } = $props()
  
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

<div class="card">
  <div class="header">
    <div class="title-row">
      <h3 title={session.cwd}>{getBasename(session.cwd)}</h3>
      <StatusBadge status={session.status} />
    </div>
    <div class="meta">
      <span>Started {timeAgo(session.startedAt)}</span>
      <span>•</span>
      <span>{session.clientCount} client{session.clientCount === 1 ? '' : 's'}</span>
    </div>
  </div>
  
  <div class="actions">
    <button class="primary" onclick={() => onConnect(session.id)} disabled={session.status === 'exited' || session.status === 'failed'}>
      Connect
    </button>
  </div>
</div>

<style>
  .card {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  
  .header {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  
  h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #e6edf3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .meta {
    font-size: 0.85rem;
    color: #8b949e;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  
  .actions {
    display: flex;
    justify-content: flex-end;
  }
  
  button.primary {
    background: #238636;
    color: #ffffff;
    border: 1px solid rgba(240,246,252,0.1);
    padding: 5px 16px;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  button.primary:hover:not(:disabled) {
    background: #2ea043;
  }
  
  button.primary:disabled {
    background: #21262d;
    color: #8b949e;
    cursor: not-allowed;
  }
</style>
