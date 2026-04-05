<script lang="ts">
  import type { SessionInfo } from '../lib/types'
  let { status }: { status: SessionInfo['status'] | 'attached' } = $props()
</script>

<div class="badge-container">
  <span class="status-dot {status}"></span>
  <span class="badge-text">{status}</span>
</div>

<style>
  .badge-container {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: 12px;
    background: var(--bg-surface, #161b22);
    border: 1px solid var(--border-default, #30363d);
  }

  .badge-text {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--text-secondary, #8b949e);
  }
</style>