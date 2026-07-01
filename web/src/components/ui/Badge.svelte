<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** Visual variant: default | accent | success | warning | danger */
    variant?: 'default' | 'accent' | 'success' | 'warning' | 'danger';
    /** Prepend a status dot indicator */
    dot?: boolean;
    /** Dot status when dot=true (defaults to variant mapping) */
    dotStatus?: 'running' | 'starting' | 'exited' | 'failed' | 'interrupted' | 'attached';
    children?: Snippet;
    [key: string]: unknown;
  }

  const {
    variant = 'default',
    dot = false,
    dotStatus,
    children,
    ...rest
  }: Props = $props();
</script>

<span class="badge badge-{variant}" role="status" {...rest}>
  {#if dot}
    <span class="badge-dot badge-dot-{dotStatus ?? 'running'}" aria-hidden="true"></span>
  {/if}
  {#if children}
    <span class="badge-label">{@render children()}</span>
  {/if}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1-5, 0.375rem);
    padding: 1px var(--space-2, 0.5rem);
    border-radius: var(--radius-sm, 4px);
    font-family: var(--font-ui);
    font-size: var(--font-size-xs, 0.75rem);
    font-weight: var(--font-weight-medium, 500);
    line-height: var(--line-height-tight, 1.25);
    white-space: nowrap;
    user-select: none;
    -webkit-user-select: none;
  }

  .badge-label {
    display: inline-flex;
    align-items: center;
  }

  /* ── Variants ── */

  .badge-default {
    background: var(--bg-overlay);
    color: var(--text-secondary);
    border: 1px solid var(--border-muted);
  }

  .badge-accent {
    background: color-mix(in srgb, var(--accent-blue) 12%, transparent);
    color: var(--accent-blue);
    border: 1px solid color-mix(in srgb, var(--accent-blue) 30%, transparent);
  }

  .badge-success {
    background: color-mix(in srgb, var(--accent-green) 12%, transparent);
    color: var(--accent-green);
    border: 1px solid color-mix(in srgb, var(--accent-green) 30%, transparent);
  }

  .badge-warning {
    background: color-mix(in srgb, var(--accent-yellow) 12%, transparent);
    color: var(--accent-yellow);
    border: 1px solid color-mix(in srgb, var(--accent-yellow) 30%, transparent);
  }

  .badge-danger {
    background: color-mix(in srgb, var(--accent-red) 12%, transparent);
    color: var(--accent-red);
    border: 1px solid color-mix(in srgb, var(--accent-red) 30%, transparent);
  }

  /* ── Dot indicator ── */

  .badge-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .badge-dot-running    { background: var(--accent-green); }
  .badge-dot-starting   { background: var(--accent-yellow); }
  .badge-dot-exited,
  .badge-dot-failed     { background: var(--accent-red); }
  .badge-dot-interrupted { background: var(--text-muted); }
  .badge-dot-attached   { background: var(--accent-cyan); }
</style>
