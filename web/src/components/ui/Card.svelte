<!--
  Card.svelte — Glass surface primitive (2026 design language)

  A11y: when interactive and used as a button, caller must set
  role="button" + tabindex="0" + keyboard handlers via rest props.
  Example:
    <Card interactive role="button" tabindex="0" onclick={handleClick}>
      Click me
    </Card>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** Visual variant: 'glass' (backdrop-blur) or 'solid' (no blur) */
    variant?: 'glass' | 'solid';
    /** Padding scale: 'none' | 'sm' | 'md' | 'lg' */
    padding?: 'none' | 'sm' | 'md' | 'lg';
    /** Enables hover/active states for clickable cards */
    interactive?: boolean;
    /** HTML element tag (default 'div') */
    as?: string;
    /** ARIA role — set when interactive and used as a button */
    role?: string;
    /** Additional CSS classes forwarded to the root element */
    class?: string;
    children?: Snippet;
    header?: Snippet;
    footer?: Snippet;
    [key: string]: unknown;
  }

  const {
    variant = 'glass',
    padding = 'md',
    interactive = false,
    as: Tag = 'div',
    role,
    class: className = '',
    children,
    header,
    footer,
    ...rest
  }: Props = $props();

  const paddingClass = $derived(
    padding === 'none' ? '' :
    padding === 'sm'  ? 'card-padding-sm'  :
    padding === 'lg'  ? 'card-padding-lg'  :
                        'card-padding-md'
  );

  const interactiveClass = $derived(interactive ? 'card-interactive' : '');
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<svelte:element this={Tag}
  class="card {variant === 'solid' ? 'card-solid' : 'card-glass'} {paddingClass} {interactiveClass} {className}"
  {role}
  {...rest}
>
  {#if header}
    <div class="card-header">
      {@render header()}
    </div>
  {/if}

  {#if children}
    <div class="card-body">
      {@render children()}
    </div>
  {/if}

  {#if footer}
    <div class="card-footer">
      {@render footer()}
    </div>
  {/if}
</svelte:element>

<style>
  .card {
    border-radius: var(--radius-md, 6px);
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  /* ── Glass variant ── */
  .card-glass {
    background: color-mix(in srgb, var(--bg-elevated) 70%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--border-subtle);
    box-shadow:
      var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.32)),
      var(--shadow-inset, inset 0 1px 0 rgba(255, 255, 255, 0.04));
  }

  /* ── Solid variant ── */
  .card-solid {
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.32));
  }

  /* ── Padding scale ── */
  .card-padding-sm  { padding: var(--space-2, 0.5rem); }
  .card-padding-md  { padding: var(--space-4, 1rem); }
  .card-padding-lg  { padding: var(--space-6, 1.5rem); }
  /* 'none' → no padding class */

  /* ── Interactive states ── */
  .card-interactive {
    cursor: pointer;
    transition:
      border-color var(--transition-base, 150ms ease),
      box-shadow    var(--transition-moderate, 200ms ease),
      transform     var(--transition-moderate, 200ms ease);
  }

  @media (min-width: 769px) {
    .card-interactive:hover {
      border-color: var(--border-default);
      box-shadow:
        var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.48)),
        var(--shadow-inset, inset 0 1px 0 rgba(255, 255, 255, 0.04));
      transform: translateY(-1px);
    }
  }

  .card-interactive:active {
    transform: translateY(0);
    box-shadow:
      var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.32)),
      var(--shadow-inset, inset 0 1px 0 rgba(255, 255, 255, 0.04));
  }

  .card-interactive:focus-visible {
    border-color: var(--border-accent);
    box-shadow: 0 0 0 1px var(--border-accent);
  }

  /* ── Header / footer slots ── */
  .card-header {
    padding-bottom: var(--space-3, 0.75rem);
    border-bottom: 1px solid var(--border-muted);
    margin-bottom: var(--space-3, 0.75rem);
  }

  .card-footer {
    padding-top: var(--space-3, 0.75rem);
    border-top: 1px solid var(--border-muted);
    margin-top: var(--space-3, 0.75rem);
  }

  .card-body {
    flex: 1;
  }

  /* ── Reduced transparency fallback ── */
  @media (prefers-reduced-transparency: reduce) {
    .card-glass {
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      background: var(--bg-elevated);
    }
  }

  /* ── Reduced motion: disable hover-lift transform (§5.5) ── */
  @media (prefers-reduced-motion: reduce) {
    .card-interactive,
    .card-interactive:active {
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) and (min-width: 769px) {
    .card-interactive:hover {
      transform: none;
    }
  }

  /* ── Mobile: reduce blur to 8px ── */
  @media (max-width: 640px) {
    .card-glass {
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
  }
</style>
