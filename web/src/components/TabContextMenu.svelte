<!--
  TabContextMenu.svelte — Chrome-style right-click context menu for tabs.

  A11y:
  - role="menu", items role="menuitem"
  - ArrowUp/Down keyboard navigation, Enter activates, Escape closes
  - Focus returns to the triggering tab on close (via restoreFocusEl)
  - Click outside closes the menu

  Props:
  - open: boolean (bindable)
  - x / y: number — viewport coordinates for menu placement
  - tabIndex: number — index of the tab the menu was opened on
  - tabCount: number — total tab count (controls enabled state of actions)
  - restoreFocusEl: HTMLElement | null — element to refocus on close
  - Actions: onClose, onCloseOthers, onCloseRight, onMoveLeft, onMoveRight
-->
<script lang="ts" module>
  export interface TabContextMenuAction {
    type: 'close' | 'closeOthers' | 'closeRight' | 'moveLeft' | 'moveRight';
    tabIndex: number;
  }
</script>

<script lang="ts">
  interface Props {
    open: boolean;
    x: number;
    y: number;
    tabIndex: number;
    tabCount: number;
    restoreFocusEl?: HTMLElement | null;
    onClose?: () => void;
    onCloseOthers?: () => void;
    onCloseRight?: () => void;
    onMoveLeft?: () => void;
    onMoveRight?: () => void;
  }

  let {
    open = $bindable(false),
    x = 0,
    y = 0,
    tabIndex = 0,
    tabCount = 0,
    restoreFocusEl = null,
    onClose,
    onCloseOthers,
    onCloseRight,
    onMoveLeft,
    onMoveRight,
  }: Props = $props();

  let menuEl: HTMLDivElement | null = $state(null);
  let focusedIndex = $state(0);

  // Menu item descriptors; disabled state computed from tabIndex / tabCount
  type Item = {
    key: string;
    label: string;
    disabled: boolean;
    action?: () => void;
  };

  let items = $derived.by<Item[]>(() => [
    {
      key: 'close',
      label: 'Close tab',
      disabled: false,
      action: onClose,
    },
    {
      key: 'closeOthers',
      label: 'Close other tabs',
      disabled: tabCount <= 1,
      action: onCloseOthers,
    },
    {
      key: 'closeRight',
      label: 'Close tabs to the right',
      disabled: tabIndex >= tabCount - 1,
      action: onCloseRight,
    },
    {
      key: 'moveLeft',
      label: 'Move left',
      disabled: tabIndex <= 0,
      action: onMoveLeft,
    },
    {
      key: 'moveRight',
      label: 'Move right',
      disabled: tabIndex >= tabCount - 1,
      action: onMoveRight,
    },
  ]);

  // Clamp focusedIndex into the enabled-item range
  let clampedFocus = $derived.by(() => {
    let idx = Math.max(0, Math.min(focusedIndex, items.length - 1));
    // If the clamped item is disabled, nudge to nearest enabled forward/backward
    if (items[idx]?.disabled) {
      let fwd = idx;
      while (fwd < items.length && items[fwd].disabled) fwd++;
      if (fwd < items.length) return fwd;
      let bwd = idx;
      while (bwd >= 0 && items[bwd].disabled) bwd--;
      if (bwd >= 0) return bwd;
    }
    return idx;
  });

  $effect(() => {
    if (!open) return;
    focusedIndex = 0;
    // Focus first enabled menu item so keyboard events land on the menu.
    requestAnimationFrame(() => {
      let first = 0;
      while (first < items.length && items[first].disabled) first++;
      if (first < items.length) {
        focusedIndex = first;
        const el = menuEl?.querySelector<HTMLElement>(`[data-index="${first}"]`);
        el?.focus();
      } else {
        menuEl?.focus();
      }
    });
    // Best-effort viewport collision: if menu would overflow the right/bottom
    // edge, flip it to the left/above the cursor.
    if (menuEl) {
      const MARGIN = 8;
      const rect = menuEl.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (rect.right > vw) {
        menuEl.style.left = 'auto';
        menuEl.style.right = `${Math.max(MARGIN, vw - x)}px`;
      }
      if (rect.bottom > vh) {
        menuEl.style.top = 'auto';
        menuEl.style.bottom = `${Math.max(MARGIN, vh - y)}px`;
      }
    }
  });

  function focusItem(index: number) {
    focusedIndex = index;
    const el = menuEl?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    el?.focus();
  }

  function handleKeydown(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        let next = clampedFocus + 1;
        while (next < items.length && items[next].disabled) next++;
        if (next < items.length) focusItem(next);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        let prev = clampedFocus - 1;
        while (prev >= 0 && items[prev].disabled) prev--;
        if (prev >= 0) focusItem(prev);
        break;
      }
      case 'Home': {
        e.preventDefault();
        let first = 0;
        while (first < items.length && items[first].disabled) first++;
        if (first < items.length) focusItem(first);
        break;
      }
      case 'End': {
        e.preventDefault();
        let last = items.length - 1;
        while (last >= 0 && items[last].disabled) last--;
        if (last >= 0) focusItem(last);
        break;
      }
      case 'Enter': {
        e.preventDefault();
        const item = items[clampedFocus];
        if (item && !item.disabled) {
          item.action?.();
          closeMenu();
        }
        break;
      }
      case 'Escape': {
        e.preventDefault();
        closeMenu();
        break;
      }
    }
  }

  function onPointerDown(e: MouseEvent) {
    // Click outside closes
    if (menuEl && !menuEl.contains(e.target as Node)) {
      closeMenu();
    }
  }

  function closeMenu() {
    open = false;
    // Return focus to the triggering tab
    requestAnimationFrame(() => {
      restoreFocusEl?.focus();
    });
  }

  function onItemClick(item: Item) {
    if (item.disabled) return;
    item.action?.();
    closeMenu();
  }
</script>

<svelte:window onpointerdown={onPointerDown} />

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="tab-context-menu"
    role="menu"
    aria-label="Tab actions"
    tabindex="-1"
    bind:this={menuEl}
    style:left={`${x}px`}
    style:top={`${y}px`}
    onkeydown={handleKeydown}
  >
    {#each items as item, i (item.key)}
      <button
        type="button"
        class="menu-item"
        class:focused={i === clampedFocus}
        class:disabled={item.disabled}
        role="menuitem"
        data-index={i}
        disabled={item.disabled}
        tabindex={i === clampedFocus ? 0 : -1}
        aria-disabled={item.disabled ? 'true' : undefined}
        onclick={() => onItemClick(item)}
        onfocus={() => (focusedIndex = i)}
      >
        {item.label}
      </button>
    {/each}
  </div>
{/if}

<style>
  .tab-context-menu {
    position: fixed;
    z-index: var(--z-dropdown);
    min-width: 180px;
    padding: var(--space-1) 0;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    /* Inset top highlight — glassmorphism contract */
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.06),
      var(--shadow-lg);
    font-family: var(--font-ui);
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
  }

  .menu-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: var(--space-1-5) var(--space-3);
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
    line-height: 1.4;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
  }

  .menu-item.focused:not(.disabled) {
    background: var(--bg-overlay);
    color: var(--text-primary);
  }

  @media (min-width: 769px) {
    .menu-item:not(.disabled):hover {
      background: var(--bg-overlay);
      color: var(--text-primary);
    }
  }

  .menu-item.disabled {
    color: var(--text-muted);
    cursor: not-allowed;
  }

  .menu-item:focus-visible {
    box-shadow: 0 0 0 1px var(--border-accent);
    border-color: var(--border-accent);
  }

  @media (prefers-reduced-motion: reduce) {
    .menu-item {
      transition: none;
    }
  }
</style>