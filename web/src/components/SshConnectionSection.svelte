<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { SshConnection } from '$lib/types';
  import SshConnectionList from './SshConnectionList.svelte';
  import Card from './ui/Card.svelte';
  import Button from './ui/Button.svelte';
  import Icon from './ui/Icon.svelte';
  import Badge from './ui/Badge.svelte';

  interface Props {
    /** Bindable — collapsed by default */
    expanded?: boolean;
    /** SSH connections to display */
    connections: SshConnection[];
    /** Opens SshConnectionModal for new connection */
    onAdd: () => void;
    /** Opens modal for editing a connection */
    onEdit: (conn: SshConnection) => void;
    /** Tests a connection */
    onTest: (conn: SshConnection) => void;
    /** Deletes a connection */
    onDelete: (conn: SshConnection) => void;
    /** Refresh callback passed to the list */
    onRefresh: () => void;
    children?: Snippet;
    [key: string]: unknown;
  }

  let {
    expanded = false,
    connections,
    onAdd,
    onEdit,
    onTest,
    onDelete,
    onRefresh,
    children,
    ...rest
  }: Props = $props();

  const panelId = 'ssh-connections-panel';

  function toggle() {
    expanded = !expanded;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  }
  // svelte-ignore state_referenced_locally
  void [onTest, onDelete];
</script>

<div class="ssh-section" {...rest}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="section-header"
    class:section-header-expanded={expanded}
    role="button"
    tabindex="0"
    aria-expanded={expanded}
    aria-controls={panelId}
    onclick={toggle}
    onkeydown={handleKeydown}
  >
    <div class="header-left">
      <Icon
        name={expanded ? 'chevron-down' : 'chevron-right'}
        size={16}
        aria-hidden="true"
      />
      <span class="header-label">SSH Connections</span>
    </div>
    <Badge variant="default">{connections.length}</Badge>
  </div>

  {#if expanded}
    <div id={panelId} class="section-body" role="region" aria-label="SSH connections list">
      <Card variant="glass" padding="md">
        {#snippet children()}
          <SshConnectionList
            {connections}
            {onEdit}
            {onRefresh}
          />
        {/snippet}
      </Card>

      <div class="add-button-wrapper">
        <Button
          variant="ghost"
          class="add-button"
          onclick={onAdd}
          aria-label="Add new SSH connection"
        >
          {#snippet icon_src()}
            <Icon name="plus" size={14} aria-hidden="true" />
          {/snippet}
          New SSH connection
        </Button>
      </div>
    </div>
  {/if}
</div>

{#if children}
  {@render children()}
{/if}

<style>
  .ssh-section {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  /* ── Header row ── */
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-2);
    cursor: pointer;
    border-radius: var(--radius-sm);
    border-bottom: 1px solid var(--border-muted);
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast);
    user-select: none;
    -webkit-user-select: none;
  }

  @media (min-width: 769px) {
    .section-header:hover {
      background: var(--bg-overlay);
    }
  }

  .section-header:focus-visible {
    box-shadow: 0 0 0 1px var(--border-accent);
    border-color: var(--border-accent);
  }

  .section-header-expanded {
    border-bottom-color: var(--border-subtle);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .header-label {
    font-family: var(--font-ui);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-primary);
  }

  /* ── Body (expanded) ── */
  .section-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3) 0 0 0;
  }

  /* ── Add button ── */
  .add-button-wrapper {
    display: flex;
    width: 100%;
  }

  .add-button {
    width: 100%;
    justify-content: center;
  }
</style>
