<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** Bound value */
    value?: string;
    /** Input label */
    label?: string;
    /** Placeholder text */
    placeholder?: string;
    /** Input type */
    type?: 'text' | 'password' | 'email' | 'url' | 'number' | 'tel' | 'search';
    /** Error message (sets aria-invalid + aria-describedby) */
    error?: string;
    /** Disabled state */
    disabled?: boolean;
    /** Leading icon snippet */
    icon?: Snippet;
    children?: Snippet;
    [key: string]: unknown;
  }

  let {
    value = $bindable(''),
    label,
    placeholder = '',
    type = 'text',
    error,
    disabled = false,
    icon,
    children,
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

  const errorId = $derived(error ? `input-error-${Math.random().toString(36).slice(2, 8)}` : undefined);
</script>

<div class="input-wrapper" class:input-disabled={disabled}>
  {#if label}
    <label class="input-label" for="input-field">{label}</label>
  {/if}

  <div class="input-container" class:input-error={!!error}>
    {#if icon}
      <span class="input-icon" aria-hidden="true">{@render icon()}</span>
    {/if}

    <input
      id="input-field"
      class="input-field"
      class:input-has-icon={!!icon}
      type={type}
      bind:value={localValue}
      {placeholder}
      {disabled}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={errorId}
      {...rest}
    />

    {#if children}
      <span class="input-suffix" aria-hidden="true">{@render children()}</span>
    {/if}
  </div>

  {#if error}
    <span class="input-error-text" id={errorId} role="alert">{error}</span>
  {/if}
</div>

<style>
  .input-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 0.25rem);
    width: 100%;
  }

  .input-label {
    font-family: var(--font-ui);
    font-size: var(--font-size-sm, 0.8125rem);
    font-weight: var(--font-weight-medium, 500);
    color: var(--text-secondary);
  }

  .input-container {
    display: flex;
    align-items: center;
    gap: var(--space-2, 0.5rem);
    height: 36px;
    padding: 0 var(--space-3, 0.75rem);
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm, 4px);
    transition:
      border-color var(--transition-fast, 100ms ease-in-out),
      box-shadow var(--transition-fast, 100ms ease-in-out);
  }

  .input-container:focus-within {
    border-color: var(--border-default);
  }

  .input-error .input-container:focus-within {
    border-color: var(--accent-red);
  }

  .input-error {
    border-color: var(--accent-red);
    border-left: 2px solid var(--accent-red);
  }

  .input-field {
    flex: 1;
    height: 100%;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--font-size-sm, 0.8125rem);
    line-height: var(--line-height-normal, 1.5);
    min-width: 0;
  }

  .input-field::placeholder {
    color: var(--text-muted);
  }

  .input-field:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .input-has-icon {
    padding-left: 0;
  }

  .input-icon {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .input-suffix {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
  }

  .input-error-text {
    font-family: var(--font-ui);
    font-size: var(--font-size-xs, 0.75rem);
    color: var(--accent-red);
    line-height: var(--line-height-tight, 1.25);
  }

  .input-disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* ── Mobile height ── */

  @media (max-width: 640px) {
    .input-container {
      height: 40px;
    }
  }
</style>
