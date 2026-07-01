<script lang="ts">
  /**
   * Toast.svelte — Single toast notification.
   *
   * A11y:
   *   - `role="status"` for info/success (polite announcement)
   *   - `role="alert"` for warning/error (immediate announcement)
   *   - `aria-live="polite"` for info/success, `aria-live="assertive"` for warning/error
   */
  import type { Toast } from '$lib/toastStore.svelte';
  import { dismissToast, pauseToast, resumeToast } from '$lib/toastStore.svelte';
  import Icon from '$components/ui/Icon.svelte';
  import Button from '$components/ui/Button.svelte';

  interface Props {
    toast: Toast;
  }

  const { toast }: Props = $props();

  // ── Icon mapping by type ──
  const typeIcon = $derived(
    toast.icon
      ? toast.icon
      : toast.type === 'success'
        ? 'check-circle'
        : toast.type === 'error'
          ? 'alert-circle'
          : toast.type === 'warning'
            ? 'warning'
            : 'info',
  );

  // ── Accent color per type ──
  const accentVar = $derived(
    toast.type === 'success'
      ? 'var(--accent-green)'
      : toast.type === 'error'
        ? 'var(--accent-red)'
        : toast.type === 'warning'
          ? 'var(--accent-yellow)'
          : 'var(--accent-blue)',
  );

  // ── A11y roles ──
  const liveRegion = $derived(
    toast.type === 'error' || toast.type === 'warning' ? 'assertive' : 'polite',
  );
  const roleAttr = $derived(
    toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status',
  );

  // ── Hover pause/resume ──
  let hoverStart = 0;

  function handleMouseEnter(): void {
    if (toast.duration > 0) {
      hoverStart = Date.now();
      pauseToast(toast.id);
    }
  }

  function handleMouseLeave(): void {
    if (toast.duration > 0 && hoverStart > 0) {
      const elapsed = Date.now() - hoverStart;
      const remaining = Math.max(0, toast.duration - elapsed);
      resumeToast(toast.id, remaining);
      hoverStart = 0;
    }
  }

  function handleDismiss(): void {
    dismissToast(toast.id);
  }

  function handleAction(): void {
    toast.action?.callback();
    dismissToast(toast.id);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="toast toast-{toast.type}"
  role={roleAttr}
  aria-live={liveRegion}
  aria-atomic="true"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
>
  <!-- Left accent stripe -->
  <div class="toast-accent" style="background: {accentVar}"></div>

  <!-- Icon -->
  <div class="toast-icon" style="color: {accentVar}">
    <Icon name={typeIcon} size={18} aria-hidden="true" />
  </div>

  <!-- Content -->
  <div class="toast-body">
    <p class="toast-message">{toast.message}</p>
    {#if toast.action}
      <Button
        variant="ghost"
        size="sm"
        onclick={handleAction}
        aria-label={toast.action.label}
      >
        {toast.action.label}
      </Button>
    {/if}
  </div>

  <!-- Close button -->
  <button
    class="toast-close"
    onclick={handleDismiss}
    aria-label="Dismiss notification"
    type="button"
  >
    <Icon name="close" size={14} aria-hidden="true" />
  </button>
</div>

<style>
  .toast {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    width: 320px;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--bg-elevated) 80%, transparent);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--border-subtle);
    box-shadow:
      var(--shadow-lg),
      var(--shadow-inset);
    position: relative;
    overflow: hidden;
    pointer-events: auto;
    /* Slide-in + fade animation */
    animation: toast-enter var(--duration-slow) var(--ease-out) forwards;
  }

  /* ── Left accent stripe ── */
  .toast-accent {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    border-radius: var(--radius-md) 0 0 var(--radius-md);
  }

  /* ── Icon ── */
  .toast-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding-top: 1px;
  }

  /* ── Body ── */
  .toast-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1-5);
  }

  .toast-message {
    font-family: var(--font-ui);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-primary);
    line-height: var(--line-height-normal);
    word-wrap: break-word;
  }

  /* ── Close button ── */
  .toast-close {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition:
      color var(--transition-fast),
      background var(--transition-fast);
    padding: 0;
    margin-top: 1px;
  }

  @media (min-width: 769px) {
    .toast-close:hover {
      color: var(--text-primary);
      background: var(--bg-overlay);
    }
  }

  .toast-close:focus-visible {
    box-shadow: 0 0 0 1px var(--border-accent);
    border-color: var(--border-accent);
  }

  /* ── Entrance animation ── */
  @keyframes toast-enter {
    from {
      opacity: 0;
      transform: translateX(24px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  /* ── Reduced motion ── */
  @media (prefers-reduced-motion: reduce) {
    .toast {
      animation: none;
      opacity: 1;
      transform: none;
    }
  }
</style>
