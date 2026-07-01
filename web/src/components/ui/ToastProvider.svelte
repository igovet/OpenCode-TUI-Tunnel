<script lang="ts">
  /**
   * ToastProvider.svelte — Toast stack container.
   *
   * Renders the global toast stack fixed top-right.
   * Empty state: renders nothing (no container in DOM).
   *
   * A11y:
   *   - Container has `aria-live="polite"` and `aria-relevant="additions removals"`
   *   - Individual toasts have their own role/aria-live per type
   */
  import { getToasts } from '$lib/toastStore.svelte';
  import Toast from '$components/ui/Toast.svelte';

  const toasts = $derived(getToasts());
</script>

{#if toasts.length > 0}
  <div
    class="toast-stack"
    aria-live="polite"
    aria-relevant="additions removals"
    aria-atomic="false"
  >
    {#each toasts as t (t.id)}
      <Toast toast={t} />
    {/each}
  </div>
{/if}

<style>
  .toast-stack {
    position: fixed;
    top: var(--space-12);
    right: var(--space-4);
    z-index: var(--z-toast);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    pointer-events: none;
    max-width: 100vw;
    padding: 0;
  }

  @media (max-width: 640px) {
    .toast-stack {
      top: var(--space-4);
      right: var(--space-2);
      left: var(--space-2);
    }
  }
</style>
