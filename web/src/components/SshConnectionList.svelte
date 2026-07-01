<script lang="ts">
  import type { SshConnection } from '../lib/types';
  import { deleteSshConnection, testSshConnection } from '../lib/api';
  import Card from './ui/Card.svelte';
  import Icon from './ui/Icon.svelte';
  import Badge from './ui/Badge.svelte';

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

  // ── Keyboard navigation: roving tabindex model ──
  //
  // Only one card has tabindex="0" at a time (focusedIndex).
  // ArrowUp / ArrowDown move focus between cards.
  // Enter triggers EDIT on the focused card.
  // Delete / Backspace triggers delete (with confirmation handled by parent).
  //
  // This closes a confirmed a11y gap: the connection list previously had
  // no keyboard navigation at all (explorer-frontend-ssh-settings.md §8.2).
  let focusedIndex = $state(0);
  let cardEls: HTMLElement[] = [];

  $effect(() => {
    // Keep card element array in sync with connections length
    cardEls.length = connections.length;
  });

  $effect(() => {
    // Clamp focusedIndex when connections shrink (e.g. after delete)
    if (focusedIndex >= connections.length && connections.length > 0) {
      focusedIndex = connections.length - 1;
    }
  });

  function focusCard(index: number) {
    focusedIndex = index;
    const el = cardEls[index];
    if (el) el.focus();
  }

  function handleKeydown(e: KeyboardEvent, index: number) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusCard(Math.min(index + 1, connections.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusCard(Math.max(index - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        onEdit(connections[index]);
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        handleDelete(connections[index]);
        break;
    }
  }

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
  <Card variant="glass" padding="lg">
    {#snippet children()}
      <div class="empty-state">
        <Icon name="plug" size={48} aria-hidden="true" />
        <p class="empty-title">No SSH connections configured.</p>
        <p class="empty-hint">Click "New Connection" to add one.</p>
      </div>
    {/snippet}
  </Card>
{:else}
  <div class="connection-list" role="list" aria-label="SSH connections">
    {#each connections as conn, i (conn.id)}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
      <div
        class="card-focus-wrapper"
        role="listitem"
        tabindex={focusedIndex === i ? 0 : -1}
        aria-label={`${conn.name} — ${conn.username}@${conn.host}:${conn.port}`}
        bind:this={cardEls[i]}
        onkeydown={(e) => handleKeydown(e, i)}
      >
        <Card variant="glass" interactive>
          {#snippet header()}
            <div class="conn-header">
              <span class="conn-name">{conn.name}</span>
              <div class="conn-badges">
                <Badge variant={conn.authType === 'key' ? 'accent' : 'default'}>
                  <Icon name={conn.authType === 'key' ? 'key' : 'robot'} size={12} aria-hidden="true" />
                  {conn.authType === 'key' ? 'Key' : 'Agent'}
                </Badge>
                <Badge variant={conn.opencodeProvider === 'server' ? 'accent' : 'default'}>
                  <Icon name={conn.opencodeProvider === 'server' ? 'globe' : 'folder'} size={12} aria-hidden="true" />
                  {conn.opencodeProvider === 'server' ? 'Server' : 'Local'}
                </Badge>
              </div>
            </div>
          {/snippet}
          {#snippet children()}
            <div class="conn-details">
              <span class="conn-host">{conn.username}@{conn.host}:{conn.port}</span>
              {#if conn.privateKeyPath}
                <span class="conn-key-path">Key: {conn.privateKeyPath}</span>
              {/if}
            </div>
          {/snippet}
          {#snippet footer()}
            <div class="conn-footer">
              <div class="conn-footer-left">
                {#if testResults[conn.id]}
                  <Badge variant={testResults[conn.id].success ? 'success' : 'danger'}>
                    {testResults[conn.id].message}
                  </Badge>
                {/if}
              </div>
              <div class="conn-actions">
                <button
                  class="icon-btn"
                  onclick={() => handleTest(conn)}
                  disabled={testingId === conn.id || deletingId === conn.id}
                  aria-label="Test connection"
                  title="Test connection"
                >
                  {#if testingId === conn.id}
                    <span class="spinner" aria-hidden="true"></span>
                  {:else}
                    <Icon name="refresh" size={14} aria-hidden="true" />
                  {/if}
                </button>
                <button
                  class="icon-btn"
                  onclick={() => onEdit(conn)}
                  disabled={testingId === conn.id || deletingId === conn.id}
                  aria-label="Edit connection"
                  title="Edit connection"
                >
                  <Icon name="settings" size={14} aria-hidden="true" />
                </button>
                <button
                  class="icon-btn icon-btn-danger"
                  onclick={() => handleDelete(conn)}
                  disabled={testingId === conn.id || deletingId === conn.id}
                  aria-label="Delete connection"
                  title="Delete connection"
                >
                  {#if deletingId === conn.id}
                    <span class="spinner" aria-hidden="true"></span>
                  {:else}
                    <Icon name="close" size={14} aria-hidden="true" />
                  {/if}
                </button>
              </div>
            </div>
          {/snippet}
        </Card>
      </div>
    {/each}
  </div>
{/if}

<style>
  .connection-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .card-focus-wrapper {
    /* relied on global :focus-visible suppression */
  }

  .card-focus-wrapper:focus-visible > :global(.card) {
    box-shadow: 0 0 0 1px var(--border-accent);
    border-color: var(--border-accent);
  }

  /* ── Empty state ── */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-2);
  }

  .empty-title {
    font-size: var(--font-size-md);
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-weight: var(--font-weight-medium);
    margin: 0;
  }

  .empty-hint {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    font-family: var(--font-ui);
    margin: 0;
  }

  /* ── Card header ── */
  .conn-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
  }

  .conn-name {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
    font-family: var(--font-mono);
  }

  .conn-badges {
    display: flex;
    gap: var(--space-1-5);
    flex-shrink: 0;
  }

  /* ── Card body ── */
  .conn-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .conn-host {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .conn-key-path {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    font-family: var(--font-mono);
  }

  /* ── Card footer ── */
  .conn-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
  }

  .conn-footer-left {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .conn-actions {
    display: flex;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  /* ── Icon buttons ── */
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-subtle);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      color var(--transition-fast),
      border-color var(--transition-fast);
    padding: 0;
  }

  @media (min-width: 769px) {
    .icon-btn:hover:not(:disabled) {
      background: var(--bg-overlay);
      color: var(--text-primary);
      border-color: var(--border-default);
    }
  }

  .icon-btn:focus-visible {
    box-shadow: 0 0 0 1px var(--border-accent);
    border-color: var(--border-accent);
  }

  .icon-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  @media (min-width: 769px) {
    .icon-btn-danger:hover:not(:disabled) {
      color: var(--accent-red);
      border-color: var(--accent-red);
      background: color-mix(in srgb, var(--accent-red) 10%, transparent);
    }
  }

  /* ── Spinner ── */
  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--border-subtle);
    border-top-color: var(--text-secondary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
      opacity: 0.5;
    }
  }

  /* ── Mobile: larger touch targets ── */
  @media (max-width: 768px) {
    .icon-btn {
      width: 36px;
      height: 36px;
    }
  }
</style>
