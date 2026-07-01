<script lang="ts">
  interface Props {
    label: string;
    count?: number;
    active?: boolean;
    tabindex?: number;
    onclick?: () => void;
    onkeydown?: (e: KeyboardEvent) => void;
  }

  const {
    label,
    count,
    active = false,
    tabindex = 0,
    onclick,
    onkeydown,
  }: Props = $props();
</script>

<button
  class="chip"
  class:chip--active={active}
  role="radio"
  aria-checked={active}
  tabindex={tabindex}
  onclick={onclick}
  onkeydown={onkeydown}
  type="button"
>
  <span class="chip-label">{label}</span>
  {#if count !== undefined}
    <span class="chip-count">({count})</span>
  {/if}
</button>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1-5, 0.375rem);
    padding: var(--space-1-5, 0.375rem) var(--space-3, 0.75rem);
    border-radius: var(--radius-lg, 8px);
    border: 1px solid var(--border-subtle);
    background: transparent;
    color: var(--text-secondary);
    font-family: var(--font-ui);
    font-size: var(--font-size-sm, 0.8125rem);
    font-weight: var(--font-weight-medium, 500);
    line-height: 1;
    cursor: pointer;
    white-space: nowrap;
    user-select: none;
    -webkit-user-select: none;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast);
  }

  @media (min-width: 769px) {
    .chip:hover:not(:disabled) {
      border-color: var(--border-default);
      color: var(--text-primary);
    }
  }

  .chip:focus-visible {
    box-shadow: 0 0 0 1px var(--border-accent);
    border-color: var(--border-accent);
  }

  .chip--active {
    background: var(--bg-overlay);
    border-color: var(--border-accent);
    color: var(--text-primary);
  }

  @media (min-width: 769px) {
    .chip--active:hover:not(:disabled) {
      border-color: var(--border-accent);
    }
  }

  .chip-label {
    display: inline-flex;
    align-items: center;
  }

  .chip-count {
    color: var(--text-muted);
    font-size: var(--font-size-xs, 0.75rem);
  }
</style>
