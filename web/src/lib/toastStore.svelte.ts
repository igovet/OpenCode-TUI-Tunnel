/**
 * Toast/Notification store — runes-based global toast state.
 *
 * Usage:
 *   import { showToast, dismissToast, clearToasts, getToasts } from '$lib/toastStore.svelte';
 *
 *   showToast({ message: 'Session started', type: 'success' });
 *   showToast({ message: 'Connection failed', type: 'error', duration: 0 }); // sticky
 *   showToast({ message: 'Update ready', type: 'info', action: { label: 'Reload', callback: () => location.reload() } });
 */

export interface ToastAction {
  label: string;
  callback: () => void;
}

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  /** Duration in ms. 0 = sticky (no auto-dismiss). Default: 4000. */
  duration: number;
  /** Optional icon name override. Falls back to type-based default. */
  icon?: string;
  /** Optional action button (e.g. "Reload", "Retry"). */
  action?: ToastAction;
}

export interface ShowToastOptions {
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
  icon?: string;
  action?: ToastAction;
}

// ── Internal state ──

let nextId = 1;

let toasts: Toast[] = $state([]);

// ── Timer registry for auto-dismiss ──

const timers = new Map<string, ReturnType<typeof setTimeout>>();

// ── Public API ──

/**
 * Show a toast notification.
 * Returns the toast id (useful for programmatic dismiss).
 */
export function showToast(opts: ShowToastOptions): string {
  const id = `toast-${nextId++}`;
  const toast: Toast = {
    id,
    message: opts.message,
    type: opts.type ?? 'info',
    duration: opts.duration ?? 4000,
    icon: opts.icon,
    action: opts.action,
  };

  toasts = [...toasts, toast];

  // Auto-dismiss unless sticky
  if (toast.duration > 0) {
    timers.set(
      id,
      setTimeout(() => {
        dismissToast(id);
      }, toast.duration),
    );
  }

  return id;
}

/**
 * Dismiss a specific toast by id.
 */
export function dismissToast(id: string): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }

  toasts = toasts.filter((t) => t.id !== id);
}

/**
 * Dismiss all toasts immediately.
 */
export function clearToasts(): void {
  for (const [id, timer] of timers) {
    clearTimeout(timer);
    timers.delete(id);
  }
  toasts = [];
}

/**
 * Pause auto-dismiss for a toast (e.g. on hover).
 */
export function pauseToast(id: string): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

/**
 * Resume auto-dismiss for a toast (e.g. on hover leave).
 */
export function resumeToast(id: string, remainingMs: number): void {
  // Don't re-set if already dismissed or sticky
  const toast = toasts.find((t) => t.id === id);
  if (!toast || toast.duration === 0) return;

  timers.set(
    id,
    setTimeout(() => {
      dismissToast(id);
    }, remainingMs),
  );
}

/**
 * Get the reactive toasts array. Components should call this
 * in a reactive context (e.g. $state or $derived) to track changes.
 */
export function getToasts(): Toast[] {
  return toasts;
}
