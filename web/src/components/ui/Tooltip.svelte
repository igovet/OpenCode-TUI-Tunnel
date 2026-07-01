<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** Tooltip content — string or snippet for rich content */
    content?: string | Snippet;
    /** Position relative to trigger */
    position?: 'top' | 'right' | 'bottom' | 'left';
    /** Children — the trigger element */
    children?: Snippet;
    [key: string]: unknown;
  }

  const {
    content,
    position = 'top',
    children,
    ...rest
  }: Props = $props();

  let visible = $state(false);
  let tooltipId = $state('');
  let triggerEl: HTMLElement | undefined = $state();

  const TOOLTIP_ID_BASE = 'ui-tooltip-';

  // ── Coarse-pointer guard ──
  // Tooltips are a desktop hover affordance. On touch devices (coarse
  // pointer, no hover) they must never appear — mobile has no hover and
  // focus-restoration after a modal close would otherwise show the tooltip
  // on the trigger element unintentionally.
  let isCoarsePointer = $state(false);

  $effect(() => {
    const mq = window.matchMedia('(hover: none) and (pointer: coarse)');
    isCoarsePointer = mq.matches;
    const handler = (e: MediaQueryListEvent) => (isCoarsePointer = e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  });

  $effect(() => {
    if (triggerEl) {
      tooltipId = TOOLTIP_ID_BASE + Math.random().toString(36).slice(2, 8);
    }
  });

  function show() {
    // Belt-and-suspenders coarse-pointer guard. The cached reactive
    // `isCoarsePointer` state is set by a $effect that runs after mount; a
    // focus event (e.g., Dialog focus-restoration after modal close) can fire
    // before that effect has evaluated, leaving isCoarsePointer stale-false.
    // Checking matchMedia directly at call time eliminates that timing window.
    if (isCoarsePointer) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: none) and (pointer: coarse)').matches
    ) {
      return;
    }
    visible = true;
  }

  function hide() {
    visible = false;
  }

  // If the reactive coarse-pointer state flips to true after a tooltip is
  // already visible (e.g., viewport/device-mode change while mounted), hide
  // immediately so no tooltip lingers on a touch device.
  $effect(() => {
    if (isCoarsePointer) {
      visible = false;
    }
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
  class="tooltip-wrapper"
  onmouseenter={show}
  onmouseleave={hide}
  onfocusin={show}
  onfocusout={hide}
  {...rest}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <span
    class="tooltip-trigger"
    bind:this={triggerEl}
    aria-describedby={visible ? tooltipId : undefined}
  >
    {@render children?.()}
  </span>

  {#if visible && content && !isCoarsePointer && !(typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches)}
    <span
      id={tooltipId}
      class="tooltip-popup tooltip-{position}"
      role="tooltip"
    >
      {#if typeof content === 'string'}
        {content}
      {:else}
        {@render content()}
      {/if}
    </span>
  {/if}
</span>

<style>
  .tooltip-wrapper {
    position: relative;
    display: inline-flex;
  }

  .tooltip-trigger {
    display: inline-flex;
  }

  .tooltip-popup {
    position: absolute;
    z-index: var(--z-tooltip, 500);
    padding: var(--space-1-5, 0.375rem) var(--space-2-5, 0.625rem);
    border-radius: var(--radius-sm, 4px);
    background: var(--bg-overlay);
    border: 1px solid var(--border-subtle);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--font-size-xs, 0.75rem);
    line-height: var(--line-height-tight, 1.25);
    white-space: nowrap;
    max-width: 200px;
    pointer-events: none;
    box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.24));
  }

  /* ── Position ── */

  .tooltip-top {
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
  }

  .tooltip-bottom {
    top: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
  }

  .tooltip-left {
    right: calc(100% + 6px);
    top: 50%;
    transform: translateY(-50%);
  }

  .tooltip-right {
    left: calc(100% + 6px);
    top: 50%;
    transform: translateY(-50%);
  }
</style>
