<script lang="ts">
  import FilterChip from './FilterChip.svelte';

  export interface FilterOption {
    value: string;
    label: string;
    count?: number;
  }

  interface Props {
    options: FilterOption[];
    value?: string;
    onchange?: (value: string) => void;
  }

  let {
    options,
    value = $bindable(),
    onchange,
  }: Props = $props();

  function handleKeydown(e: KeyboardEvent, index: number) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = (index + 1) % options.length;
      const nextOption = options[next];
      value = nextOption.value;
      onchange?.(nextOption.value);
      requestAnimationFrame(() => {
        const chips = document.querySelectorAll<HTMLElement>('.chip-group .chip');
        chips[next]?.focus();
      });
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = (index - 1 + options.length) % options.length;
      const prevOption = options[prev];
      value = prevOption.value;
      onchange?.(prevOption.value);
      requestAnimationFrame(() => {
        const chips = document.querySelectorAll<HTMLElement>('.chip-group .chip');
        chips[prev]?.focus();
      });
    }
  }
</script>

<div class="chip-group" role="radiogroup" aria-label="Filter options">
  {#each options as option, index (option.value)}
    {@const isActive = value === option.value}
    <FilterChip
      label={option.label}
      count={option.count}
      active={isActive}
      onclick={() => {
        value = option.value;
        onchange?.(option.value);
      }}
      onkeydown={(e: KeyboardEvent) => handleKeydown(e, index)}
    />
  {/each}
</div>

<style>
  .chip-group {
    display: flex;
    flex-wrap: nowrap;
    overflow-x: auto;
    white-space: nowrap;
    gap: var(--space-2, 0.5rem);
    align-items: center;
    scrollbar-width: thin;
    -webkit-overflow-scrolling: touch;
    scroll-behavior: smooth;
    touch-action: pan-x;
  }
  .chip-group::-webkit-scrollbar {
    height: 4px;
  }
  .chip-group :global(.chip) {
    flex-shrink: 0;
  }
</style>
