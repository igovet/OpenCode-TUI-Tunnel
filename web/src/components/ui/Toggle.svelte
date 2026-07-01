<script lang="ts">
  interface Props {
    /** Bound checked state */
    checked?: boolean;
    /** Label text */
    label?: string;
    /** Disabled state */
    disabled?: boolean;
    [key: string]: unknown;
  }

  let {
    checked = false,
    label,
    disabled = false,
    ...rest
  }: Props = $props();

  function toggle() {
    if (!disabled) {
      checked = !checked;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggle();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="toggle-wrapper"
  class:toggle-disabled={disabled}
  {...rest}
>
  {#if label}
    <span class="toggle-label">{label}</span>
  {/if}

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <button
    class="toggle-track"
    class:toggle-on={checked}
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onclick={toggle}
    onkeydown={handleKeydown}
    type="button"
  >
    <span class="toggle-thumb"></span>
  </button>
</div>

<style>
  .toggle-wrapper {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3, 0.75rem);
  }

  .toggle-label {
    font-family: var(--font-ui);
    font-size: var(--font-size-sm, 0.8125rem);
    color: var(--text-primary);
    line-height: var(--line-height-normal, 1.5);
  }

  .toggle-track {
    position: relative;
    display: inline-flex;
    align-items: center;
    width: 44px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 999px;
    background: var(--bg-overlay);
    cursor: pointer;
    transition: background var(--transition-base, 150ms ease-in-out);
    flex-shrink: 0;
  }

  .toggle-track:focus-visible {
    box-shadow: 0 0 0 1px var(--border-accent);
    border-color: var(--border-accent);
  }

  .toggle-on {
    background: var(--accent-green);
  }

  .toggle-thumb {
    display: block;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--text-primary);
    box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.24));
    transition: transform var(--transition-base, 150ms ease-in-out);
    transform: translateX(3px);
  }

  .toggle-on .toggle-thumb {
    transform: translateX(23px);
  }

  .toggle-disabled {
    opacity: 0.45;
  }

  .toggle-track:disabled {
    cursor: not-allowed;
  }
</style>
