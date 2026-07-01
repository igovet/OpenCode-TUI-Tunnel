<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md'
    loading?: boolean
    disabled?: boolean
    icon?: boolean
    type?: 'button' | 'submit'
    icon_src?: Snippet
    children?: Snippet
    onclick?: (e: MouseEvent) => void
    'aria-label'?: string
    title?: string
    class?: string
    [key: string]: unknown
  }

  let {
    variant = 'secondary',
    size = 'md',
    loading = false,
    disabled = false,
    icon = false,
    type = 'button',
    icon_src,
    children,
    onclick,
    'aria-label': ariaLabel,
    title,
    class: className = '',
    ...rest
  }: Props = $props()

  const isDisabled = $derived(disabled || loading)
</script>

<button
  {type}
  class="btn btn-{variant} btn-{size} {className}"
  class:icon-only={icon}
  disabled={isDisabled}
  aria-disabled={isDisabled ? 'true' : undefined}
  aria-busy={loading ? 'true' : undefined}
  aria-label={ariaLabel}
  {title}
  onclick={onclick}
  {...rest}
>
  {#if loading}
    <span class="spinner" aria-hidden="true"></span>
  {:else if icon_src}
    <span class="icon-leading" aria-hidden="true">{@render icon_src()}</span>
  {/if}

  {#if !icon || children}
    <span class="label">{@render children?.()}</span>
  {/if}
</button>

<style>
  .btn {
    /* Layout */
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    /* Typography */
    font-family: var(--font-ui);
    font-weight: var(--font-weight-medium);
    white-space: nowrap;
    /* Surface */
    border: 1px solid transparent;
    cursor: pointer;
    /* Radius */
    border-radius: var(--radius-sm);
    /* Motion */
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast),
      box-shadow var(--transition-fast),
      opacity var(--transition-fast),
      transform var(--transition-fast);
    /* Prevent text selection on rapid clicks */
    user-select: none;
    -webkit-user-select: none;
  }

  /* ── Sizes ── */

  .btn-sm {
    font-size: var(--font-size-sm);
    padding: var(--space-1) var(--space-3);
    min-height: 28px;
  }

  .btn-md {
    font-size: var(--font-size-base);
    padding: 0 var(--space-4);
    height: 36px;
  }

  /* ── Icon-only adjustments ── */

  .icon-only.btn-sm {
    padding: var(--space-1);
    min-height: 28px;
    min-width: 28px;
  }

  .icon-only.btn-md {
    padding: 0;
    height: 36px;
    width: 36px;
  }

  /* ── Primary ── */

  .btn-primary {
    background: var(--accent-green);
    color: var(--text-on-accent);
    border-color: var(--accent-green);
    font-weight: var(--font-weight-semibold);
    box-shadow: var(--shadow-sm);
  }

  @media (min-width: 769px) {
    .btn-primary:hover:not(:disabled) {
      background: color-mix(in srgb, var(--accent-green) 85%, white);
      border-color: color-mix(in srgb, var(--accent-green) 85%, white);
      box-shadow: var(--glow-green);
    }
  }

  .btn-primary:active:not(:disabled) {
    background: color-mix(in srgb, var(--accent-green) 90%, black);
    transform: scale(0.98);
  }

  /* ── Secondary ── */

  .btn-secondary {
    background: var(--bg-surface);
    color: var(--text-primary);
    border-color: var(--border-default);
  }

  @media (min-width: 769px) {
    .btn-secondary:hover:not(:disabled) {
      background: var(--bg-overlay);
      border-color: color-mix(in srgb, var(--border-default) 70%, white);
    }
  }

  .btn-secondary:active:not(:disabled) {
    background: var(--bg-elevated);
    transform: scale(0.98);
  }

  /* ── Ghost ── */

  .btn-ghost {
    background: transparent;
    color: var(--text-secondary);
    border-color: transparent;
  }

  @media (min-width: 769px) {
    .btn-ghost:hover:not(:disabled) {
      background: var(--bg-overlay);
      color: var(--text-primary);
    }
  }

  .btn-ghost:active:not(:disabled) {
    background: var(--bg-elevated);
    transform: scale(0.98);
  }

  /* ── Danger ── */

  .btn-danger {
    background: var(--bg-surface);
    color: var(--accent-red);
    border-color: var(--accent-red);
  }

  @media (min-width: 769px) {
    .btn-danger:hover:not(:disabled) {
      background: color-mix(in srgb, var(--accent-red) 10%, transparent);
      border-color: var(--accent-red);
    }
  }

  .btn-danger:active:not(:disabled) {
    background: color-mix(in srgb, var(--accent-red) 15%, transparent);
    transform: scale(0.98);
  }

  /* ── Focus-visible ── */

  .btn:focus-visible {
    box-shadow: 0 0 0 1px var(--border-accent);
    border-color: var(--border-accent);
  }

  /* ── Disabled ── */

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ── Spinner (loading) ── */

  .spinner {
    display: inline-block;
    width: 1em;
    height: 1em;
    border: 1.5px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ── Icon leading ── */

  .icon-leading {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    /* Size icon to match text line-height so they vertically align */
    width: 1em;
    height: 1em;
  }

  .icon-leading :global(svg) {
    width: 100%;
    height: 100%;
  }

  /* ── Label content wrapper ──
     When an <Icon> is passed as children (common in SessionList),
     the svg sits inline next to the text inside .label. We centre
     the icon on the text's vertical centre via inline-flex + the
     svg line-height:0 fix (prevents the default inline svg from
     being lifted by the strut/line-box of the text run). */

  .label {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    line-height: 1;
  }

  .label :global(svg) {
    display: block;
    flex-shrink: 0;
    line-height: 0;
  }

  /* ── Reduced motion ── */

  @media (prefers-reduced-motion: reduce) {
    .btn {
      transition: opacity var(--transition-fast);
    }

    .spinner {
      animation-duration: 1s;
    }
  }
</style>
