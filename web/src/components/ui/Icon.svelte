<script lang="ts">
  /**
   * Icon — inline SVG icon component.
   *
   * Usage:
   *   <Icon name="power" size={20} />
   *
   * A11y:
   *   - Decorative (pure visual): pass `aria-hidden="true"` via rest props
   *     or rely on the parent giving it an aria label.
   *   - Meaningful (conveys information): pass `role="img"` + `aria-label="..."`
   *     e.g. <Icon name="warning" role="img" aria-label="Attention" />
   */

  import { icons } from '$lib/icons';

  interface Props {
    /** Icon name from icons.ts registry */
    name: string;
    /** Width/height in px (default 16). Use '1em' for font-relative sizing. */
    size?: number | '1em';
    /** Stroke width (default 1.75). */
    stroke?: number;
    /** Additional CSS classes. */
    class?: string;
    /** Rest props spread onto the <svg> element — use for aria-*, title, onclick, etc. */
    [rest: string]: unknown;
  }

  const {
    name,
    size = 16,
    stroke = 1.75,
    class: className = '',
    ...rest
  }: Props = $props();

  const content = $derived(icons[name]);
</script>

{#if content}
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    stroke-width={stroke}
    stroke-linecap="round"
    stroke-linejoin="round"
    class={className}
    { ...rest }
  >
    {@html content}
  </svg>
{:else}
  <!-- Fallback: invisible 1x1 so layout doesn't shift -->
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    stroke-width={stroke}
    aria-hidden="true"
    class={className}
    { ...rest }
  >
    <!-- empty -->
  </svg>
  <!-- dev-only warning -->
  {#if typeof window !== 'undefined'}
    <!-- eslint-disable-next-line no-console -->
    console.warn(`[Icon] Unknown icon name: "${name}". Check web/src/lib/icons.ts for available icons.`);
  {/if}
{/if}
