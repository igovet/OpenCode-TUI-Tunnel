<!--
  Dialog.svelte — Modal dialog primitive with focus-trap (2026 design language)

  A11y:
  - role="dialog", aria-modal="true", aria-labelledby on title
  - Focus trap: Tab/Shift+Tab cycles within the dialog
  - Return focus to trigger element on close
  - Escape key closes (configurable via closeOnEscape)
  - Backdrop click closes (configurable via closeOnBackdrop)
  - Respects prefers-reduced-motion

  Usage:
    <Dialog bind:open={showDialog} title="Confirm" size="sm" onClose={() => showDialog = false}>
      {#snippet children()}
        <p>Are you sure?</p>
      {/snippet}
      {#snippet footer()}
        <Button variant="danger" onclick={() => showDialog = false}>Delete</Button>
        <Button onclick={() => showDialog = false}>Cancel</Button>
      {/snippet}
    </Dialog>

  Focus-trap limitation:
    Uses querySelectorAll for focusable elements — does NOT penetrate Shadow DOM.
    If the dialog contains an xterm.js instance (which uses Shadow DOM for its canvas),
    Tab will still be trapped at the dialog level, but focusable elements inside
    the xterm Shadow DOM are not individually managed. This is acceptable because
    xterm's own focus management handles its internal keyboard navigation.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  interface Props {
    /** Whether the dialog is open (bindable) */
    open?: boolean;
    /** Dialog title — string renders as <h2>, snippet renders inline */
    title?: string | Snippet;
    /** Body content */
    children?: Snippet;
    /** Footer content (action buttons, typically Button components) */
    footer?: Snippet;
    /** Size preset: sm (420px), md (520px), lg (640px) */
    size?: 'sm' | 'md' | 'lg';
    /** Close on Escape key press */
    closeOnEscape?: boolean;
    /** Close on backdrop (overlay) click */
    closeOnBackdrop?: boolean;
    /** ID for aria-labelledby (auto-generated default: 'dialog-title') */
    labelledby?: string;
    /** ID for aria-describedby */
    describedby?: string;
    /** Callback when dialog requests close (parent sets open=false) */
    onClose?: () => void;
    /** Rest props spread onto the dialog surface element */
    [key: string]: unknown;
  }

  let {
    open = false,
    title,
    children,
    footer,
    size = 'md',
    closeOnEscape = true,
    closeOnBackdrop = true,
    labelledby = 'dialog-title',
    describedby,
    onClose,
    ...rest
  }: Props = $props();

  let dialogRef: HTMLDivElement | undefined = $state();
  let previouslyFocused: HTMLElement | null = null;
  let handleEl: HTMLDivElement | undefined = $state();

  const titleId = $derived(labelledby || 'dialog-title');

  // ── Drag-to-dismiss (mobile bottom-sheet gesture) ──
  // The grab handle is only visible on ≤768px (CSS media query). The
  // pointer logic below is inert on desktop because the handle has no
  // size there. Drag down past DISMISS_THRESHOLD → onClose; else snap back.
  let dragOffset = $state(0);
  let dragStartY = 0;
  let dragging = false;
  const DISMISS_THRESHOLD = 100; // px

  function onHandlePointerDown(e: PointerEvent) {
    // Only start drag on touch / coarse pointers — mouse drag on desktop
    // is not expected (handle is hidden there anyway).
    if (e.pointerType === 'mouse') return;
    dragging = true;
    dragStartY = e.clientY;
    dragOffset = 0;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* pointer capture is optional; gesture still works without it */
    }
    e.preventDefault();
  }

  function onHandlePointerMove(e: PointerEvent) {
    if (!dragging) return;
    const delta = e.clientY - dragStartY;
    // Only allow dragging DOWN (positive delta); clamp negative to 0.
    dragOffset = Math.max(0, delta);
  }

  function onHandlePointerUp(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* pointer capture may not be held; safe to ignore */
    }
    const offset = dragOffset;
    if (offset > DISMISS_THRESHOLD) {
      onClose?.();
      // Optimistically reset; the {#if open} block will unmount the surface.
      dragOffset = 0;
      dragStartY = 0;
      return;
    }
    // Snap back: clear the drag transform so the surface returns to its
    // CSS-defined position. Setting the same value (0) is a no-op, so only
    // assign when the value actually changed.
    if (dragOffset !== 0) dragOffset = 0;
    dragStartY = 0;
  }

  // CSS selector for all focusable elements
  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'textarea:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    'details summary',
    'iframe',
    'object',
    'embed',
    'area[href]',
    'audio[controls]',
    'video[controls]',
  ].join(', ');

  function getFocusableElements(): HTMLElement[] {
    if (!dialogRef) return [];
    return Array.from(
      dialogRef.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter((el) => {
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && closeOnEscape) {
      e.stopPropagation();
      onClose?.();
      return;
    }

    if (e.key === 'Tab') {
      const focusable = getFocusableElements();
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || (active && !focusable.includes(active))) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || (active && !focusable.includes(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose?.();
    }
  }

  // Focus management lifecycle:
  //   On open: save current focus, focus first element in dialog
  //   On close (or unmount): return focus to previously focused element
  $effect(() => {
    if (open) {
      previouslyFocused = document.activeElement as HTMLElement | null;

      requestAnimationFrame(() => {
        const focusable = getFocusableElements();
        if (focusable.length > 0) {
          focusable[0].focus();
        } else if (dialogRef) {
          dialogRef.focus();
        }
      });
    }

    return () => {
      if (previouslyFocused) {
        previouslyFocused.focus();
        previouslyFocused = null;
      }
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="dialog-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    aria-describedby={describedby}
    onclick={handleBackdropClick}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="dialog-surface dialog-{size}"
      bind:this={dialogRef}
      tabindex="-1"
      style={dragOffset ? `transform: translateY(${dragOffset}px); transition: none; animation: none;` : ''}
      {...rest}
    >
      <!-- Mobile bottom-sheet grab handle — doubles as the drag-to-dismiss
           affordance. Only visible on ≤768px via CSS. Dragging down past the
           threshold dismisses the sheet; otherwise it snaps back. -->
      <div
        class="dialog-grab-handle"
        role="button"
        tabindex="-1"
        aria-label="Drag down to close"
        bind:this={handleEl}
        onpointerdown={onHandlePointerDown}
        onpointermove={onHandlePointerMove}
        onpointerup={onHandlePointerUp}
        onpointercancel={onHandlePointerUp}
        style="touch-action: none;"
      ></div>

      <!-- Header -->
      <div class="dialog-header">
        {#if title}
          {#if typeof title === 'string'}
            <h2 id={titleId} class="dialog-title">{title}</h2>
          {:else}
            <div id={titleId} class="dialog-title">{@render title()}</div>
          {/if}
        {/if}

        <button
          class="dialog-close-btn"
          onclick={() => onClose?.()}
          aria-label="Close dialog"
          type="button"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      <!-- Body -->
      {#if children}
        <div class="dialog-body">
          {@render children()}
        </div>
      {/if}

      <!-- Footer -->
      {#if footer}
        <div class="dialog-footer">
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* ── Overlay ── */
  .dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 300);
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    animation: overlay-fade-in var(--duration-slow, 300ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)) forwards;
  }

  /* ── Surface (glass card) ── */
  .dialog-surface {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-height: 85vh;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md, 6px);
    box-shadow:
      var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.48)),
      var(--shadow-inset, inset 0 1px 0 rgba(255, 255, 255, 0.04));
    animation: dialog-enter var(--duration-slow, 300ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)) forwards;
  }

  /* ── Size presets ── */
  .dialog-sm {
    max-width: 420px;
  }

  .dialog-md {
    max-width: 520px;
  }

  .dialog-lg {
    max-width: 640px;
  }

  /* ── Header ── */
  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3, 0.75rem);
    padding: var(--space-4, 1rem) var(--space-5, 1.25rem);
    border-bottom: 1px solid var(--border-muted);
    flex-shrink: 0;
  }

  .dialog-title {
    font-family: var(--font-ui);
    font-size: var(--font-size-lg, 1.125rem);
    font-weight: var(--font-weight-semibold, 600);
    color: var(--text-primary);
    line-height: var(--line-height-tight, 1.25);
    margin: 0;
  }

  .dialog-close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm, 4px);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    flex-shrink: 0;
    transition:
      background-color var(--transition-fast, 100ms ease),
      color var(--transition-fast, 100ms ease);
  }

  @media (min-width: 769px) {
    .dialog-close-btn:hover {
      background: var(--bg-overlay);
      color: var(--text-primary);
    }
  }

  .dialog-close-btn:active {
    background: var(--bg-elevated);
  }

  .dialog-close-btn:focus-visible {
    box-shadow: 0 0 0 1px var(--border-accent);
    border-color: var(--border-accent);
  }

  /* ── Body ── */
  .dialog-body {
    padding: var(--space-5, 1.25rem);
    overflow-y: auto;
    flex: 1;
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--font-size-base, 0.875rem);
    line-height: var(--line-height-normal, 1.5);
  }

  /* ── Footer ── */
  .dialog-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-3, 0.75rem);
    padding: var(--space-4, 1rem) var(--space-5, 1.25rem);
    border-top: 1px solid var(--border-muted);
    flex-shrink: 0;
  }

  /* ── Grab handle (mobile bottom-sheet affordance) ── */
  .dialog-grab-handle {
    display: none; /* shown only on mobile via the bottom-sheet media query */
  }

  /* ── Animations ── */
  @keyframes overlay-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes dialog-enter {
    from {
      opacity: 0;
      transform: scale(0.98);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* Slide-up keyframe for mobile bottom-sheet entry. */
  @keyframes dialog-sheet-enter {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  /* ── Reduced motion ── */
  @media (prefers-reduced-motion: reduce) {
    .dialog-overlay,
    .dialog-surface {
      animation: none;
    }
  }

  /* ── Desktop (>768px): centered modal is the default above; no change. ── */

  /* ── Mobile (≤768px): native bottom-sheet, edge-to-edge, slide-up ──
     The overlay becomes a flex container anchored to the bottom; the
     panel sits at the very bottom of the screen, full width, with only
     the top corners rounded. A grab-handle bar is shown centered at the
     top as the native bottom-sheet affordance. Slide-up on open (200ms
     --ease-out); respects prefers-reduced-motion (instant). ── */
  @media (max-width: 768px) {
    .dialog-overlay {
      align-items: flex-end;
      padding: 0;
    }

    .dialog-surface {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      width: 100%;
      max-width: 100%;
      max-height: 85vh;
      margin: 0;
      border-radius: var(--radius-lg, 8px) var(--radius-lg, 8px) 0 0;
      /* Slide up from the bottom on open. */
      animation: dialog-sheet-enter var(--duration-moderate, 200ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)) forwards;
    }

    /* All size presets become edge-to-edge on mobile. */
    .dialog-sm,
    .dialog-md,
    .dialog-lg {
      max-width: 100%;
    }

    /* Show the native-style grab handle bar at the top of the sheet. */
    .dialog-grab-handle {
      display: block;
      width: 36px;
      height: 4px;
      border-radius: var(--radius-sm, 4px);
      background: var(--border-default);
      margin: var(--space-2, 0.5rem) auto 0 auto;
      flex-shrink: 0;
    }

    /* The header should not crowd the grab handle; trim its top padding a
       touch so the title sits just under the handle. */
    .dialog-header {
      padding-top: var(--space-2, 0.5rem);
    }

    /* Footer buttons get left/right edge-to-edge spacing on mobile and
       stretch to be comfortably tappable. */
    .dialog-footer {
      padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
      /* iOS safe-area inset so action buttons stay reachable above the
         home indicator on edge-to-edge sheets. */
      padding-bottom: calc(var(--space-3, 0.75rem) + env(safe-area-inset-bottom, 0));
    }
  }

  /* ── Reduced motion on mobile: instant (no slide) ── */
  @media (max-width: 768px) and (prefers-reduced-motion: reduce) {
    .dialog-surface {
      animation: none;
    }
  }
</style>
