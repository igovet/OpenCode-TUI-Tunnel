<script lang="ts">
  import type { SshConnection } from '../lib/types';
  import { deleteSshConnection, testSshConnection } from '../lib/api';

  let {
    connections,
    onEdit,
    onRefresh,
  } = $props<{
    connections: SshConnection[];
    onEdit: (conn: SshConnection) => void;
    onRefresh: () => void;
  }>();

  let deletingId = $state<string | null>(null);
  let testingId = $state<string | null>(null);
  let testResults = $state<Record<string, { success: boolean; message: string }>>({});

  async function handleDelete(conn: SshConnection) {
    if (deletingId) return;
    deletingId = conn.id;
    try {
      await deleteSshConnection(conn.id);
      onRefresh();
    } catch (e: unknown) {
      const err = e as Error & { statusCode?: number };
      testResults = {
        ...testResults,
        [conn.id]: { success: false, message: err.message ?? 'Delete failed' },
      };
    } finally {
      deletingId = null;
    }
  }

  async function handleTest(conn: SshConnection) {
    if (testingId) return;
    testingId = conn.id;
    try {
      const result = await testSshConnection(conn.id);
      testResults = {
        ...testResults,
        [conn.id]: {
          success: result.success,
          message: result.success ? 'Connection OK' : (result.error ?? 'Failed'),
        },
      };
    } catch (e: unknown) {
      const err = e as Error & { statusCode?: number };
      testResults = {
        ...testResults,
        [conn.id]: { success: false, message: err.message ?? 'Test failed' },
      };
    } finally {
      testingId = null;
    }
  }
</script>

{#if connections.length === 0}
  <div class="empty-state">
    <span class="empty-icon">🔌</span>
    <p>No SSH connections configured.</p>
    <p class="empty-hint">Click "New Connection" to add one.</p>
  </div>
{:else}
  <div class="connection-list">
    {#each connections as conn (conn.id)}
      <div class="connection-card">
        <div class="connection-main">
          <div class="connection-header">
            <span class="connection-name">{conn.name}</span>
            <span class="connection-auth">{conn.authType === 'key' ? '🔑' : '🤖'}</span>
          </div>
          <div class="connection-details">
            <span class="detail">{conn.username}@{conn.host}:{conn.port}</span>
            {#if conn.privateKeyPath}
              <span class="detail key-path">Key: {conn.privateKeyPath}</span>
            {/if}
          </div>
        </div>

        {#if testResults[conn.id]}
          <div class="test-badge" class:ok={testResults[conn.id].success} class:err={!testResults[conn.id].success}>
            {testResults[conn.id].message}
          </div>
        {/if}

        <div class="connection-actions">
          <button
            class="btn action-btn test-btn"
            onclick={() => handleTest(conn)}
            disabled={testingId === conn.id || deletingId === conn.id}
          >
            {testingId === conn.id ? '...' : 'TEST'}
          </button>
          <button
            class="btn action-btn edit-btn"
            onclick={() => onEdit(conn)}
            disabled={testingId === conn.id || deletingId === conn.id}
          >
            EDIT
          </button>
          <button
            class="btn action-btn delete-btn"
            onclick={() => handleDelete(conn)}
            disabled={testingId === conn.id || deletingId === conn.id}
          >
            {deletingId === conn.id ? '...' : 'DEL'}
          </button>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .empty-state {
    text-align: center;
    padding: var(--space-8);
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .empty-icon {
    font-size: 2rem;
    display: block;
    margin-bottom: var(--space-3);
  }

  .empty-hint {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }

  .connection-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .connection-card {
    background: var(--bg-elevated);
    border: 1px solid var(--border-default);
    border-radius: 0;
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    transition: border-color var(--transition-fast);
  }

  .connection-card:hover {
    border-color: var(--border-default);
    background: var(--bg-overlay);
  }

  .connection-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .connection-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .connection-name {
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--text-primary);
    font-family: var(--font-mono);
  }

  .connection-auth {
    font-size: var(--font-size-sm);
  }

  .connection-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .detail {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .key-path {
    color: var(--text-secondary);
  }

  .test-badge {
    font-size: var(--font-size-xs);
    padding: 2px 6px;
    font-family: var(--font-mono);
    border: 1px solid;
    display: inline-block;
    width: fit-content;
  }

  .test-badge.ok {
    color: var(--accent-green);
    border-color: var(--accent-green);
    background: rgba(63, 185, 80, 0.1);
  }

  .test-badge.err {
    color: var(--accent-red);
    border-color: var(--accent-red);
    background: rgba(248, 81, 73, 0.1);
  }

  .connection-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  .action-btn {
    font-size: var(--font-size-xs);
    padding: var(--space-1) var(--space-3);
    border-radius: 0;
    cursor: pointer;
    font-family: var(--font-mono);
    letter-spacing: 1px;
    background: transparent;
    border: 1px solid var(--border-default);
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .action-btn:hover:not(:disabled) {
    border-color: var(--accent-blue);
    color: var(--accent-blue);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .test-btn:hover:not(:disabled) {
    border-color: var(--accent-cyan);
    color: var(--accent-cyan);
  }

  .delete-btn:hover:not(:disabled) {
    border-color: var(--accent-red);
    color: var(--accent-red);
  }

  @media (max-width: 768px) {
    button:hover,
    button:focus,
    button:focus-visible,
    .action-btn:hover,
    .action-btn:focus,
    .action-btn:focus-visible {
      outline: none;
      background: inherit;
      color: inherit;
      border-color: inherit;
      box-shadow: none;
    }
  }
</style>
