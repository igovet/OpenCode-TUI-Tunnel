<!--
  EmptyState.svelte — First-run / no-data dashboard state (2026 design language)

  Props:
    icon        — icon name from icons.ts (string)
    title       — heading text (string)
    description — supporting body text (string)
    cta         — optional { label, onclick } to render a CTA Button

  A11y: role="status" + aria-live="polite" announces the empty state
  to screen readers without interrupting workflow.
-->
<script lang="ts">
  import Card from '$components/ui/Card.svelte';
  import Button from '$components/ui/Button.svelte';
  import Icon from '$components/ui/Icon.svelte';

  interface CtaProps {
    label: string;
    onclick?: (e: MouseEvent) => void;
  }

  interface Props {
    icon: string;
    title: string;
    description: string;
    cta?: CtaProps;
  }

  const { icon, title, description, cta }: Props = $props();
</script>

<div class="empty-state" role="status" aria-live="polite">
  <Card variant="glass" padding="md">
    <div class="empty-state-inner">
      <div class="icon-wrap" aria-hidden="true">
        <Icon name={icon} size={32} stroke={1.5} />
      </div>

      <h2 class="title">{title}</h2>

      <p class="description">{description}</p>

      {#if cta}
        <div class="cta-wrap">
          <Button variant="primary" size="sm" onclick={cta.onclick}>
            {cta.label}
          </Button>
        </div>
      {/if}
    </div>
  </Card>
</div>

<style>
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 0;
  }

  .empty-state-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-4);
    max-width: 320px;
  }

  .icon-wrap {
    color: var(--text-muted);
    opacity: 0.6;
    line-height: 0;
  }

  .title {
    font-family: var(--font-ui);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
    line-height: var(--line-height-tight);
    margin: 0;
  }

  .description {
    font-family: var(--font-ui);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    line-height: var(--line-height-relaxed);
    margin: 0;
  }

  .cta-wrap {
    margin-top: 0;
  }
</style>
