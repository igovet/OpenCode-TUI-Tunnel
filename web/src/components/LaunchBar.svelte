<script lang="ts">
  import Card from '$components/ui/Card.svelte';
  import Button from '$components/ui/Button.svelte';
  import Icon from '$components/ui/Icon.svelte';
  import Select from '$components/ui/Select.svelte';
  import PathAutocomplete from '$components/PathAutocomplete.svelte';

  interface SshConnection {
    id: string;
    name: string;
  }

  let {
    cwd = $bindable(''),
    backendId = $bindable('local'),
    sshConnections = [],
    onLaunch,
    disabled = false,
    opencodeVersion,
    standalone = $bindable(false),
  }: {
    cwd: string;
    backendId: string;
    sshConnections: SshConnection[];
    onLaunch: (cwd: string, backendId: string) => void;
    disabled?: boolean;
    opencodeVersion?: 'v1' | 'v2';
    standalone?: boolean;
  } = $props();

  const selectOptions = $derived([
    'local',
    ...sshConnections.map(c => ({ value: c.id, label: c.name })),
  ]);

  const sshConnectionId = $derived(
    backendId === 'local' ? undefined : backendId,
  );

  function handlePathChange(val: string) {
    cwd = val;
  }

  function handlePathSelect(val: string) {
    cwd = val;
  }

  function handleRun() {
    if (cwd && !disabled) {
      onLaunch(cwd, backendId);
    }
  }

  function toggleStandalone() {
    standalone = !standalone;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && cwd && !disabled) {
      handleRun();
    }
  }
</script>

<Card variant="glass" padding="sm">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="launch-bar" onkeydown={handleKeyDown}>
    <div class="path-wrapper">
      <PathAutocomplete
        value={cwd}
        onchange={handlePathChange}
        onselect={handlePathSelect}
        {sshConnectionId}
      />
    </div>

    <div class="action-row">
      <div class="backend-selector">
        <Select
          bind:value={backendId}
          options={selectOptions}
          disabled={disabled}
          aria-label="Backend"
        />
      </div>

      {#if opencodeVersion === 'v2'}
        <button
          type="button"
          class="standalone-toggle"
          class:active={standalone}
          onclick={toggleStandalone}
          aria-checked={standalone}
          role="switch"
          aria-label="Standalone mode"
          title={standalone ? 'Standalone: on' : 'Standalone: off'}
        >
          <span class="standalone-track">
            <span class="standalone-thumb"></span>
          </span>
          <span class="standalone-label">Standalone</span>
        </button>
      {/if}

      <Button
        variant="primary"
        size="md"
        disabled={!cwd || disabled}
        onclick={handleRun}
        aria-label="Run session"
      >
        <Icon name="power" size={14} />
        Run
      </Button>
    </div>
  </div>
</Card>

<style>
  .launch-bar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .path-wrapper {
    flex: 1;
    min-width: 0;
  }

  .backend-selector {
    flex-shrink: 0;
    width: auto;
    min-width: 100px;
  }

  /* Action row holds the backend selector + Run button. On desktop it is
     an inline flex row that sits beside the path input; on mobile (below)
     it becomes a full-width row under the path input. */
  .action-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-shrink: 0;
  }

  .standalone-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    border: none;
    background: transparent;
    cursor: pointer;
    padding: 0;
    color: var(--text-muted);
    transition: color 0.15s ease;
  }

  .standalone-toggle:hover {
    color: var(--text-secondary);
  }

  .standalone-toggle:focus-visible {
    outline: 2px solid var(--border-accent);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  .standalone-toggle.active {
    color: var(--text-accent);
  }

  .standalone-track {
    width: 36px;
    height: 20px;
    border-radius: 10px;
    background: var(--bg-input);
    border: 1px solid var(--border-default);
    position: relative;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease;
    flex-shrink: 0;
  }

  .standalone-toggle.active .standalone-track {
    background: var(--accent-blue);
    border-color: var(--accent-blue);
  }

  .standalone-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--text-primary);
    transition: transform 0.15s ease;
  }

  .standalone-toggle.active .standalone-thumb {
    transform: translateX(16px);
  }

  .standalone-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    white-space: nowrap;
  }

  /* ── Mobile: stack vertically so the path input spans full width and
        the backend select + Run button sit on a row below it. Prevents
        horizontal overflow on phones (≤640px). ── */
  @media (max-width: 640px) {
    .launch-bar {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-2);
    }

    .path-wrapper {
      width: 100%;
      flex: none;
    }

    .action-row {
      align-items: stretch;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .backend-selector {
      min-width: 0;
      flex: 1;
    }

    .standalone-toggle {
      flex: 1;
      justify-content: center;
    }
  }
</style>
