<script lang="ts">
  /**
   * SessionTabs.svelte — Chrome-style compact floating tab strip.
   *
   * Visual rework (ui-redesign-2026): tabs are now compact pills with
   * ALL corners rounded (small radius), floating above the strip bg.
   *  - Chrome-like: inactive tabs transparent (hover faint bg), active tab
   *    solid slightly-elevated bg + subtle shadow/lift, all-corners-rounded.
   *  - The strip has NO bottom toolbar line — tabs float over the strip bg.
   *  - Hover-only close X (active tab always shows X).
   *  - Drag-to-reorder via pointer events + 2px accent drop indicator.
   *  - Right-click context menu (TabContextMenu) with close/close-others/close-right/move.
   *  - Overflow "more" dropdown when tabs exceed the strip width.
   *  - Compact "+" new-session button as matching floating pill (no clipping).
   *
   * Paging model: the workspace pane grid still pages internally
   * (workspaceMaxPanes / workspacePage). The strip renders a SINGLE
   * continuous row across all tabs regardless of page grouping, so
   * activating a tab in page N still works via requestedWorkspacePage.
   * Page-group separators are intentionally removed (concept §2.4).
   *
   * Svelte 5 runes. Zero hardcoded hex.
   */

  import { workspace, type WorkspaceTab } from '../lib/workspace';
  import { get } from 'svelte/store';
  import { requestedWorkspacePage } from '../lib/workspacePage';
  import { workspaceMaxPanes } from '../lib/workspaceDisplay';
  import { deleteSession } from '../lib/api';
  import { refreshAllManagers } from '../lib/zoomStore.svelte';
  import Icon from './ui/Icon.svelte';
  import StatusDot from './ui/StatusDot.svelte';
  import Button from './ui/Button.svelte';
  import Dialog from './ui/Dialog.svelte';
  import Tooltip from './ui/Tooltip.svelte';
  import TabContextMenu from './TabContextMenu.svelte';

  let {
    ongoHome,
    ongoWorkspace,
    currentView,
  }: { ongoHome: () => void; ongoWorkspace: () => void; currentView: 'home' | 'workspace' } =
    $props();

  // ── Close-confirm dialog state (preserved from prior implementation) ──
  let closeModalSessionId = $state<string | null>(null);
  let closeKilling = $state(false);

  // ── Strip / scroll container ──
  let stripEl: HTMLElement | null = $state(null);

  // ── Drag-to-reorder state ──
  let dragIndex = $state<number | null>(null);
  let dropIndex = $state<number | null>(null);
  let dragging = $state(false);
  let dragStartX = $state(0);
  const DRAG_THRESHOLD = 4; // px movement before drag activates

  // ── Context menu state ──
  let menuOpen = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);
  let menuTabIndex = $state(0);
  let menuTriggerEl: HTMLElement | null = $state(null);

  // ── Overflow "more" dropdown state ──
  let overflowOpen = $state(false);
  let hasOverflow = $state(false);
  let clippedTabs = $state<WorkspaceTab[]>([]);

  // Tab elements for drag geometry + overflow measurement
  let tabEls: HTMLElement[] = [];

  // ── Wheel-to-horizontal-scroll (preserved from prior implementation) ──
  $effect(() => {
    if (!stripEl) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        stripEl!.scrollLeft += e.deltaY;
      }
    };
    stripEl.addEventListener('wheel', onWheel, { passive: false });
    return () => stripEl?.removeEventListener('wheel', onWheel);
  });

  // ── Overflow detection: measure scrollWidth vs clientWidth ──
  function measureOverflow() {
    if (!stripEl) {
      hasOverflow = false;
      clippedTabs = [];
      return;
    }
    const sw = stripEl.scrollWidth;
    const cw = stripEl.clientWidth;
    if (sw <= cw + 1) {
      hasOverflow = false;
      clippedTabs = [];
      overflowOpen = false;
      return;
    }
    hasOverflow = true;
    // A tab is "clipped" if its right edge exceeds the visible viewport.
    const stripRect = stripEl.getBoundingClientRect();
    const clipped = $workspace.tabs.filter((tab, i) => {
      const el = tabEls[i];
      if (!el) return false;
      const r = el.getBoundingClientRect();
      // right edge beyond the visible right side (with small tolerance)
      return r.right > stripRect.right - 1 || r.left < stripRect.left;
    });
    clippedTabs = clipped;
  }

  // Resize observer to re-measure overflow on viewport changes / tab add/remove
  $effect(() => {
    if (!stripEl) return;
    const ro = new ResizeObserver(() => measureOverflow());
    ro.observe(stripEl);
    // Re-measure when the tab count changes.
    void $workspace.tabs.length;
    measureOverflow();
    return () => ro.disconnect();
  });

  // Close overflow dropdown on outside pointerdown handled by contextmenu's window listener;
  // but overflow lives in the same component so handle separately.
  function onOverflowPointerDown(e: MouseEvent) {
    if (overflowOpen) {
      const el = document.querySelector('.tab-overflow-menu');
      if (el && !el.contains(e.target as Node)) {
        const trigger = document.querySelector('.tab-overflow-trigger');
        if (trigger && !trigger.contains(e.target as Node)) {
          overflowOpen = false;
        }
      }
    }
  }

  $effect(() => {
    if (!overflowOpen) return;
    window.addEventListener('pointerdown', onOverflowPointerDown);
    return () => window.removeEventListener('pointerdown', onOverflowPointerDown);
  });

  // ── Activation (preserved logic: activateTab + requestedWorkspacePage + refresh) ──
  function activate(sessionId: string) {
    workspace.activateTab(sessionId);
    ongoWorkspace();
    const ws = get(workspace);
    const tabIndex = ws.tabs.findIndex((t) => t.sessionId === sessionId);
    if (tabIndex >= 0) {
      const size = Math.max(1, $workspaceMaxPanes);
      requestedWorkspacePage.set(Math.floor(tabIndex / size));
    }
    refreshAllManagers();
  }

  // ── Close flow (preserved) ──
  function close(e: Event, sessionId: string) {
    e.stopPropagation();
    closeModalSessionId = sessionId;
  }

  function doClose(sessionId: string) {
    workspace.closeTab(sessionId);
    if ($workspace.tabs.length === 0) {
      ongoHome();
    }
  }

  async function killAndClose() {
    if (!closeModalSessionId || closeKilling) return;
    const sessionId = closeModalSessionId;
    closeKilling = true;
    try {
      await deleteSession(sessionId);
      doClose(sessionId);
    } catch (error) {
      console.error(error);
    } finally {
      closeKilling = false;
      closeModalSessionId = null;
    }
  }

  function justClose() {
    if (!closeModalSessionId) return;
    const sessionId = closeModalSessionId;
    doClose(sessionId);
    closeModalSessionId = null;
  }

  // ── Context-menu-triggered batch actions ──
  function closeTabByIndex(index: number) {
    const tab = $workspace.tabs[index];
    if (tab) doClose(tab.sessionId);
  }

  function closeOthers(index: number) {
    const keep = $workspace.tabs[index];
    if (!keep) return;
    const others = $workspace.tabs.filter((_, i) => i !== index);
    for (const t of others) {
      workspace.closeTab(t.sessionId);
    }
  }

  function closeRight(index: number) {
    const right = $workspace.tabs.slice(index + 1);
    for (const t of right) {
      workspace.closeTab(t.sessionId);
    }
  }

  function moveLeft(index: number) {
    if (index <= 0) return;
    workspace.moveTab(index, index - 1);
  }

  function moveRight(index: number) {
    if (index >= $workspace.tabs.length - 1) return;
    workspace.moveTab(index, index + 1);
  }

  // ── Context menu open ──
  function openContextMenu(e: MouseEvent, index: number, tabEl: HTMLElement) {
    e.preventDefault();
    e.stopPropagation();
    menuX = e.clientX;
    menuY = e.clientY;
    menuTabIndex = index;
    menuTriggerEl = tabEl;
    menuOpen = true;
  }

  // ── Drag-to-reorder (pointer events) ──
  function onTabPointerDown(e: PointerEvent, index: number) {
    // Only left button initiates drag; ignore close button / context-menu triggers
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.tab-close')) return;
    dragIndex = index;
    dragStartX = e.clientX;
    dragging = false;
    const el = tabEls[index];
    if (!el) return;
    el.setPointerCapture(e.pointerId);
  }

  function onTabPointerMove(e: PointerEvent, index: number) {
    if (dragIndex !== index) return;
    if (dragIndex === null) return;
    if (!dragging) {
      if (Math.abs(e.clientX - dragStartX) > DRAG_THRESHOLD) {
        dragging = true;
      } else {
        return;
      }
    }
    // Compute drop index from pointer x relative to each tab's center.
    const tabs = $workspace.tabs;
    let newDrop = dragIndex;
    for (let i = 0; i < tabs.length; i++) {
      const el = tabEls[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const centerX = r.left + r.width / 2;
      if (e.clientX < centerX) {
        newDrop = i;
        break;
      }
      if (i === tabs.length - 1 && e.clientX >= centerX) {
        newDrop = tabs.length;
      }
    }
    // If cursor is past the last tab center, drop at end.
    if (e.clientX > (tabEls[tabs.length - 1]?.getBoundingClientRect().right ?? 0)) {
      newDrop = tabs.length;
    }
    // Clamp: dropping back to original or just after original is a no-op visually.
    dropIndex = newDrop;
  }

  function onTabPointerUp(e: PointerEvent, index: number) {
    if (dragIndex !== index) return;
    const el = tabEls[index];
    try {
      el?.releasePointerCapture(e.pointerId);
    } catch {
      // pointer capture may already be released
    }
    if (dragging && dropIndex !== null) {
      // Normalize: if dropping after the dragged index, the effective target
      // index after removal is dropIndex-1.
      let target = dropIndex;
      if (target > index) target -= 1;
      if (target >= 0 && target < $workspace.tabs.length && target !== index) {
        workspace.moveTab(index, target);
      }
    }
    dragIndex = null;
    dropIndex = null;
    dragging = false;
  }

  // ── Keyboard nav (role="tab") ──
  function handleKeydown(e: KeyboardEvent, sessionId: string, index: number) {
    const tabs = $workspace.tabs;
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        activate(sessionId);
        break;
      case 'ArrowRight': {
        e.preventDefault();
        const next = (index + 1) % tabs.length;
        tabEls[next]?.focus();
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        const prev = (index - 1 + tabs.length) % tabs.length;
        tabEls[prev]?.focus();
        break;
      }
      case 'Home': {
        e.preventDefault();
        tabEls[0]?.focus();
        break;
      }
      case 'End': {
        e.preventDefault();
        tabEls[tabs.length - 1]?.focus();
        break;
      }
      case 'Delete': {
        e.preventDefault();
        close(e, sessionId);
        break;
      }
    }
  }

  function tabLabel(tab: WorkspaceTab): string {
    return tab.title || (tab.cwd ? tab.cwd.split('/').pop() : '') || tab.sessionId.slice(0, 8);
  }
</script>

<div class="tab-strip-wrapper">
  <div class="tab-strip" role="tablist" bind:this={stripEl}>
    {#each $workspace.tabs as tab, i (tab.sessionId)}
      <div
        class="tab"
        class:active={tab.sessionId === $workspace.activeTabId && currentView === 'workspace'}
        class:attention={tab.attention !== undefined && tab.attention !== 'none'}
        class:attention-question={tab.attention === 'question'}
        class:attention-permission={tab.attention === 'permission'}
        class:dragging={dragging && dragIndex === i}
        class:drop-before={dragging && dropIndex === i && dragIndex !== i}
        class:drop-after={dragging && dropIndex === i + 1 && dragIndex !== i + 1 && i === $workspace.tabs.length - 1}
        role="tab"
        tabindex="0"
        aria-selected={tab.sessionId === $workspace.activeTabId && currentView === 'workspace'}
        aria-label="{tabLabel(tab)} — {tab.status}"
        bind:this={tabEls[i]}
        title={tab.cwd || tab.sessionId}
        onclick={() => activate(tab.sessionId)}
        onkeydown={(e) => handleKeydown(e, tab.sessionId, i)}
        oncontextmenu={(e) => openContextMenu(e, i, tabEls[i])}
        onpointerdown={(e) => onTabPointerDown(e, i)}
        onpointermove={(e) => onTabPointerMove(e, i)}
        onpointerup={(e) => onTabPointerUp(e, i)}
        onpointercancel={() => {
          dragIndex = null;
          dropIndex = null;
          dragging = false;
        }}
      >
        <div class="tab-icon-container">
          {#if tab.attention === 'question'}
            <Icon name="info" size={14} class="attention-icon" aria-label="Question requires attention" />
          {:else if tab.attention === 'permission'}
            <Icon name="key" size={14} class="attention-icon" aria-label="Permission requires attention" />
          {:else}
            <StatusDot status={tab.status} size="sm" />
          {/if}
        </div>
        <span class="tab-title">{tabLabel(tab)}</span>
        <button
          class="tab-close"
          type="button"
          onclick={(e) => close(e, tab.sessionId)}
          aria-label="Close tab"
          tabindex="-1"
        >
          <Icon name="close" size={12} />
        </button>
      </div>
    {/each}

    <!-- "+" new session button (moved from App.svelte header) -->
    <Tooltip content="New session" position="bottom">
      <button
        class="tab-new"
        type="button"
        onclick={ongoHome}
        aria-label="New session"
      >
        <Icon name="plus" size={14} />
      </button>
    </Tooltip>
  </div>

  {#if hasOverflow}
    <div class="tab-overflow">
      <button
        class="tab-overflow-trigger"
        class:open={overflowOpen}
        type="button"
        onclick={() => (overflowOpen = !overflowOpen)}
        aria-label="More tabs"
        aria-haspopup="menu"
        aria-expanded={overflowOpen}
      >
        <Icon name="chevron-down" size={14} />
      </button>
      {#if overflowOpen}
        <div class="tab-overflow-menu" role="menu" aria-label="Hidden tabs">
          {#each clippedTabs as tab (tab.sessionId)}
            <button
              class="overflow-item"
              type="button"
              role="menuitem"
              onclick={() => {
                activate(tab.sessionId);
                overflowOpen = false;
                // Scroll the activated tab into view.
                const idx = $workspace.tabs.findIndex((t) => t.sessionId === tab.sessionId);
                if (idx >= 0) tabEls[idx]?.scrollIntoView({ inline: 'center', block: 'nearest' });
              }}
            >
              <span class="overflow-item-title">{tabLabel(tab)}</span>
              <span class="overflow-item-path">{tab.cwd}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<TabContextMenu
  bind:open={menuOpen}
  x={menuX}
  y={menuY}
  tabIndex={menuTabIndex}
  tabCount={$workspace.tabs.length}
  restoreFocusEl={menuTriggerEl}
  onClose={() => closeTabByIndex(menuTabIndex)}
  onCloseOthers={() => closeOthers(menuTabIndex)}
  onCloseRight={() => closeRight(menuTabIndex)}
  onMoveLeft={() => moveLeft(menuTabIndex)}
  onMoveRight={() => moveRight(menuTabIndex)}
/>

<Dialog
  open={closeModalSessionId !== null}
  title="Close Tab"
  size="sm"
  onClose={() => {
    if (!closeKilling) closeModalSessionId = null;
  }}
>
  {#snippet children()}
    <p class="modal-desc">How do you want to close this tab?</p>
  {/snippet}
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (closeModalSessionId = null)} disabled={closeKilling}
      >Cancel</Button
    >
    <Button variant="secondary" onclick={justClose} disabled={closeKilling}>Close</Button>
    <Button variant="danger" onclick={killAndClose} disabled={closeKilling} loading={closeKilling}>
      Kill &amp; Close
    </Button>
  {/snippet}
</Dialog>

<style>
  .tab-strip-wrapper {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    height: 36px;
  }

  /* Chrome-style: the strip is a plain channel with a subtle bg; tabs FLOAT
     above it (no toolbar bottom line). Vertically centered (align-items:
     center), with vertical padding so the floating tab shadows/lifts are
     never clipped by overflow-y: hidden. */
  .tab-strip {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    min-width: 0;
    padding: var(--space-1) var(--space-1);
    background: var(--bg-base);
  }
  .tab-strip::-webkit-scrollbar {
    display: none;
  }

  /* ── Tab pill (all-corners rounded, floating) ── */
  .tab {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: 0 var(--space-2);
    height: 26px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--text-muted);
    font-family: var(--font-ui);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    transition:
      background var(--transition-fast),
      color var(--transition-fast),
      box-shadow var(--transition-fast),
      border-color var(--transition-fast),
      transform var(--transition-fast);
    flex: 0 1 auto;
    min-width: 90px;
    max-width: 200px;
    width: auto;
    position: relative;
    user-select: none;
  }

  /* Inactive hover: faint elevated bg appears (Chrome-like). */
  @media (min-width: 769px) {
    .tab:hover {
      background: var(--bg-elevated);
      color: var(--text-secondary);
      border-color: var(--border-subtle);
    }
  }

  /* Active tab: solid slightly-elevated bg, subtle shadow/lift → "floating".
     No one-sided border, no bottom indicator line. */
  .tab.active {
    background: var(--bg-elevated);
    color: var(--text-primary);
    border-color: var(--border-subtle);
    box-shadow: var(--shadow-sm), var(--shadow-inset);
    z-index: 2;
  }

  /* Attention indicators (preserved glow language) */
  .tab.attention {
    box-shadow: var(--glow-green);
  }
  .tab.attention.active {
    box-shadow:
      var(--glow-green),
      var(--shadow-sm),
      var(--shadow-inset);
  }
  .tab.attention-question {
    box-shadow: 0 0 16px rgba(255, 92, 87, 0.2);
  }
  .tab.attention-question.active {
    box-shadow:
      0 0 16px rgba(255, 92, 87, 0.2),
      var(--shadow-sm),
      var(--shadow-inset);
  }
  .tab.attention-permission {
    box-shadow: 0 0 16px rgba(240, 177, 50, 0.2);
  }
  .tab.attention-permission.active {
    box-shadow:
      0 0 16px rgba(240, 177, 50, 0.2),
      var(--shadow-sm),
      var(--shadow-inset);
  }

  /* Dragged tab: lift + larger shadow */
  .tab.dragging {
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
    z-index: 5;
    cursor: grabbing;
    opacity: 0.95;
  }

  /* Drop indicator: 2px accent vertical line before/after a tab */
  .tab.drop-before::before {
    content: '';
    position: absolute;
    left: -1px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--accent-blue);
    border-radius: 1px;
    z-index: 6;
  }
  .tab.drop-after::after {
    content: '';
    position: absolute;
    right: -1px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--accent-blue);
    border-radius: 1px;
    z-index: 6;
  }

  .tab-icon-container {
    width: 14px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .tab-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    max-width: 160px;
  }

  /* Animated SVG attention icons — :global because class applied to <Icon> */
  :global(.attention-icon) {
    animation: attention-pulse 1.15s ease-in-out infinite;
    transform-origin: center;
  }

  @keyframes attention-pulse {
    0% {
      transform: scale(1);
      opacity: 0.75;
    }
    50% {
      transform: scale(1.15);
      opacity: 1;
    }
    100% {
      transform: scale(1);
      opacity: 0.75;
    }
  }

  /* Close X — hover/active only, fades in 150ms */
  .tab-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    padding: 2px;
    border-radius: var(--radius-sm);
    line-height: 1;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    opacity: 0;
    transition:
      opacity 150ms ease,
      background var(--transition-fast),
      color var(--transition-fast);
  }

  .tab:focus-within .tab-close,
  .tab.active .tab-close {
    opacity: 1;
  }

  @media (min-width: 769px) {
    .tab:hover .tab-close {
      opacity: 1;
    }
  }

  @media (min-width: 769px) {
    .tab-close:hover {
      background: var(--bg-overlay);
      color: var(--accent-red);
    }
  }

  .tab-close:focus-visible {
    opacity: 1;
    box-shadow: 0 0 0 1px var(--border-accent);
    border-color: var(--border-accent);
  }

  /* "+" new-session button: compact floating pill matching the tabs —
     all-corners rounded, same 26px height, vertically centered, with
     subtle border/bg that is fully visible (no top/bottom clipping). */
  .tab-new {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    margin-left: var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    color: var(--text-muted);
    cursor: pointer;
    font-family: var(--font-ui);
    transition:
      background var(--transition-fast),
      color var(--transition-fast),
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  @media (min-width: 769px) {
    .tab-new:hover {
      background: var(--bg-overlay);
      color: var(--text-primary);
      border-color: var(--border-default);
      box-shadow: var(--shadow-sm);
    }
  }

  .tab-new:focus-visible {
    box-shadow: 0 0 0 1px var(--border-accent);
    border-color: var(--border-accent);
  }

  /* ── Overflow "more" dropdown ── */
  .tab-overflow {
    position: relative;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    border-left: 1px solid var(--border-subtle);
  }

  .tab-overflow-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 100%;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    transition: color var(--transition-fast), background var(--transition-fast);
  }

  .tab-overflow-trigger.open {
    color: var(--text-primary);
    background: var(--bg-surface);
  }

  @media (min-width: 769px) {
    .tab-overflow-trigger:hover {
      color: var(--text-primary);
      background: var(--bg-surface);
    }
  }

  .tab-overflow-trigger:focus-visible {
    box-shadow: 0 0 0 1px var(--border-accent);
    border-color: var(--border-accent);
  }

  .tab-overflow-menu {
    position: absolute;
    top: 100%;
    right: 0;
    z-index: var(--z-dropdown);
    min-width: 220px;
    max-width: 280px;
    max-height: 320px;
    overflow-y: auto;
    padding: var(--space-1) 0;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.06),
      var(--shadow-lg);
  }

  .overflow-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 100%;
    padding: var(--space-1-5) var(--space-3);
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-family: var(--font-ui);
    font-size: var(--font-size-xs);
    text-align: left;
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  @media (min-width: 769px) {
    .overflow-item:hover {
      background: var(--bg-overlay);
      color: var(--text-primary);
    }
  }

  .overflow-item:focus-visible {
    box-shadow: 0 0 0 1px var(--border-accent);
    border-color: var(--border-accent);
  }

  .overflow-item-title {
    font-weight: var(--font-weight-medium);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .overflow-item-path {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .modal-desc {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin: 0;
  }

  /* ── Responsive (mobile) ── */
  @media (max-width: 640px) {
    .tab {
      flex: 0 0 38vw;
      min-width: 0;
      max-width: 38vw;
      width: 38vw;
      padding: 0 var(--space-2);
    }
    .tab-title {
      max-width: none;
    }
  }

  /* ── Reduced motion ── */
  @media (prefers-reduced-motion: reduce) {
    :global(.attention-icon) {
      animation: none;
    }
    .tab,
    .tab-close,
    .tab-new,
    .overflow-item {
      transition: none;
    }
    .tab.dragging {
      transform: none;
    }
  }
</style>