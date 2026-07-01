<script lang="ts">
  import Icon from '$components/ui/Icon.svelte';

  interface SelectOption {
    value: string;
    label: string;
  }

  interface Props {
    /** Bound value */
    value?: string;
    /** Options array — strings or {value, label} objects */
    options?: (string | SelectOption)[];
    /** Label text */
    label?: string;
    /** Disabled state */
    disabled?: boolean;
    /** Error message */
    error?: string;
    [key: string]: unknown;
  }

  let {
    value = $bindable(''),
    options = [],
    label,
    disabled = false,
    error,
    ...rest
  }: Props = $props();

  // Local copy for binding (workaround for Rolldown $bindable + bind:value issue)
  let localValue = $state(value);
  $effect(() => {
    if (localValue !== value) {
      value = localValue;
    }
  });
  $effect(() => {
    if (value !== localValue) {
      localValue = value;
    }
  });

  const errorId = $derived(error ? `select-error-${Math.random().toString(36).slice(2, 8)}` : undefined);
</script>

<div class="select-wrapper" class:select-disabled={disabled}>
  {#if label}
    <label class="select-label" for="select-field">{label}</label>
  {/if}

  <div class="select-container" class:select-error={!!error}>
    <select
      id="select-field"
      class="select-field"
      bind:value={localValue}
      {disabled}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={errorId}
      {...rest}
    >
      {#each options as opt}
        <option value={typeof opt === 'string' ? opt : opt.value}>
          {typeof opt === 'string' ? opt : opt.label}
        </option>
      {/each}
    </select>

    <span class="select-chevron" aria-hidden="true">
      <Icon name="chevron-down" size={16} />
    </span>
  </div>

  {#if error}
    <span class="select-error-text" id={errorId} role="alert">{error}</span>
  {/if}
</div>

<style>
  .select-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 0.25rem);
    width: 100%;
  }

  .select-label {
    font-family: var(--font-ui);
    font-size: var(--font-size-sm, 0.8125rem);
    font-weight: var(--font-weight-medium, 500);
    color: var(--text-secondary);
  }

  .select-container {
    position: relative;
    display: flex;
    align-items: center;
    height: 36px;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm, 4px);
    transition:
      border-color var(--transition-fast, 100ms ease-in-out),
      box-shadow var(--transition-fast, 100ms ease-in-out);
  }

  .select-container:focus-within {
    border-color: var(--border-default);
  }

  .select-error {
    border-color: var(--accent-red);
    border-left: 2px solid var(--accent-red);
  }

  .select-error.select-container:focus-within {
    border-color: var(--accent-red);
  }

  .select-field {
    flex: 1;
    height: 100%;
    padding: 0 var(--space-3, 0.75rem);
    padding-right: var(--space-8, 2rem);
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--font-size-sm, 0.8125rem);
    line-height: var(--line-height-normal, 1.5);
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    min-width: 0;
  }

  .select-field:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .select-field option {
    background: var(--bg-elevated);
    color: var(--text-primary);
  }

  .select-chevron {
    position: absolute;
    right: var(--space-3, 0.75rem);
    top: 50%;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    pointer-events: none;
    color: var(--text-muted);
  }

  .select-error-text {
    font-family: var(--font-ui);
    font-size: var(--font-size-xs, 0.75rem);
    color: var(--accent-red);
    line-height: var(--line-height-tight, 1.25);
  }

  .select-disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* ── Mobile height ── */

  @media (max-width: 640px) {
    .select-container {
      height: 40px;
    }
  }
</style>
