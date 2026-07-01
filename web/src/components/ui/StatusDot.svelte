<script lang="ts">
  interface Props {
    /** Status variant matching theme.css .status-dot classes */
    status: 'running' | 'starting' | 'exited' | 'failed' | 'interrupted' | 'attached';
    /** Size: sm (6px) | md (8px) */
    size?: 'sm' | 'md';
    [key: string]: unknown;
  }

  const {
    status,
    size = 'md',
    ...rest
  }: Props = $props();
</script>

<span
  class="status-dot status-{status} size-{size}"
  class:pulse={status === 'running' || status === 'starting'}
  role="img"
  aria-label="Status: {status}"
  {...rest}
></span>

<style>
  .status-dot {
    display: inline-block;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .size-sm {
    width: 6px;
    height: 6px;
  }

  .size-md {
    width: 8px;
    height: 8px;
  }

  /* ── Status colors ── */

  .status-running {
    background: var(--accent-green);
    box-shadow: 0 0 6px var(--accent-green);
  }

  .status-starting {
    background: var(--accent-yellow);
  }

  .status-exited,
  .status-failed {
    background: var(--accent-red);
  }

  .status-interrupted {
    background: var(--text-muted);
  }

  .status-attached {
    background: var(--accent-cyan);
    box-shadow: 0 0 6px var(--accent-cyan);
  }

  /* ── Pulse animation ── */

  .pulse {
    animation: pulse 1s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.4; }
  }

  /* ── Reduced motion ── */

  @media (prefers-reduced-motion: reduce) {
    .pulse {
      animation: none;
    }
  }
</style>
