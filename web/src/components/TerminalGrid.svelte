<script lang="ts">
  import TerminalPane from './TerminalPane.svelte';
  import { workspace } from '../lib/workspace';
  import { requestedWorkspacePage } from '../lib/workspacePage';
  import { workspacePage, workspaceTotalPages, workspaceMaxPanes } from '../lib/workspaceDisplay';
  import { getSettings } from '../lib/settings';
  import { refreshAllManagers } from '../lib/zoomStore.svelte';

  let containerWidth = $state(0);
  let containerHeight = $state(0);

  let activeSessionId = $derived($workspace.activeTabId);
  let tabs = $derived($workspace.tabs);

  let settings = $derived(getSettings());

  // Layout direction
  let isVertical = $derived(settings.terminalLayout === 'vertical');

  // Max panes: user setting overrides auto-computed
  let autoMaxPanes = $derived(
    containerWidth < 900 ? 1 : containerWidth > 1600 ? 3 : 2,
  );
  let maxPanes = $derived(
    settings.maxTerminals > 0 ? settings.maxTerminals : autoMaxPanes,
  );

  let totalPages = $derived(Math.ceil(tabs.length / maxPanes) || 1);

  $effect(() => {
    workspaceMaxPanes.set(maxPanes);
  });

  $effect(() => {
    workspaceTotalPages.set(totalPages);
  });

  // Ensure page is within bounds when tabs length changes
  $effect(() => {
    if ($workspacePage >= totalPages) {
      workspacePage.set(Math.max(0, totalPages - 1));
    }
  });

  $effect(() => {
    const tabIdx = $requestedWorkspacePage;
    if (tabIdx !== null) {
      const targetPage = Math.floor(tabIdx / maxPanes);
      if (targetPage !== $workspacePage && targetPage < totalPages) {
        workspacePage.set(targetPage);
      }
      requestedWorkspacePage.set(null); // consume
      refreshAllManagers();
    }
  });

  // Keep visual workspace page aligned with the active tab.
  // This covers restored activeTabId from localStorage on resume.
  $effect(() => {
    if (maxPanes <= 0 || !activeSessionId) return;

    const activeTabIdx = tabs.findIndex((tab) => tab.sessionId === activeSessionId);
    if (activeTabIdx === -1) return;

    const targetPage = Math.floor(activeTabIdx / maxPanes);
    if (targetPage !== $workspacePage && targetPage < totalPages) {
      workspacePage.set(targetPage);
    }
  });

  let visiblePanes = $derived(
    containerWidth < 900
      ? tabs.filter((t) => t.sessionId === activeSessionId)
      : tabs.slice($workspacePage * maxPanes, ($workspacePage + 1) * maxPanes),
  );

  // ── Resizable pane sizes ──
  // paneSizes[i] is the width of visiblePanes[i] expressed as a percentage of
  // the grid row (sums to ~100). Sizes live in component state only — the
  // workspace store has no pane-size field, so persistence is deferred (see
  // result.md residual). Sizes reset to equal whenever the *set* of visible
  // pane session ids changes (page switch, tab open/close, maxPanes bracket
  // change) so they never go stale for a different pane set.
  let paneSizes = $state<number[]>([]);

  let panesKey = $derived(visiblePanes.map((p) => p.sessionId).join('|'));

  $effect(() => {
    // track only the session-id set (panesKey), not the array identity, so
    // sizes reset only when the pane set actually changes.
    void panesKey;
    const n = visiblePanes.length;
    paneSizes = n > 0 ? new Array(n).fill(100 / n) : [];
  });

  function activateFirstTabOnPage(newPage: number) {
    const firstTabIdx = newPage * maxPanes;
    if (firstTabIdx < tabs.length) {
      workspace.activateTab(tabs[firstTabIdx].sessionId);
    }
  }

  // ── Active pane (derived from the workspace active tab) ──
  // Clicking a pane calls workspace.activateTab inside TerminalPane, which
  // flows back here through activeSessionId. activePaneIndex is therefore a
  // derived view of which visible pane is active, not an independent source of
  // truth — this keeps a single activation path.
  let activePaneIndex = $derived(
    Math.max(0, visiblePanes.findIndex((p) => p.sessionId === activeSessionId)),
  );

  function moveActivePane(direction: 1 | -1) {
    if (visiblePanes.length <= 1) return;
    let next = activePaneIndex + direction;
    // Clamp at edges (no wrap) — terminal focus shouldn't jump unexpectedly.
    if (next < 0) next = 0;
    if (next >= visiblePanes.length) next = visiblePanes.length - 1;
    if (next !== activePaneIndex) {
      workspace.activateTab(visiblePanes[next].sessionId);
    }
  }

  // ── Splitter drag (pointer events — mouse + touch) ──
  const MIN_PANE_PCT = 15;
  let isDragging = $state(false);
  let dragState: {
    index: number;
    axis: 'x' | 'y';
    startPos: number;
    startLeft: number;
    startRight: number;
    span: number; // containerWidth (x) or containerHeight (y)
  } | null = null;

  function onSplitterPointerDown(e: PointerEvent, index: number) {
    const span = isVertical ? containerHeight : containerWidth;
    if (span <= 0) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const even = 100 / visiblePanes.length;
    dragState = {
      index,
      axis: isVertical ? 'y' : 'x',
      startPos: isVertical ? e.clientY : e.clientX,
      startLeft: paneSizes[index] ?? even,
      startRight: paneSizes[index + 1] ?? even,
      span,
    };
    isDragging = true;
  }

  function onSplitterPointerMove(e: PointerEvent) {
    if (!dragState) return;
    const pos = dragState.axis === 'y' ? e.clientY : e.clientX;
    const d = pos - dragState.startPos;
    const deltaPct = (d / dragState.span) * 100;
    const sum = dragState.startLeft + dragState.startRight;
    let newLeft = dragState.startLeft + deltaPct;
    let newRight = sum - newLeft;
    if (newLeft < MIN_PANE_PCT) {
      newLeft = MIN_PANE_PCT;
      newRight = sum - MIN_PANE_PCT;
    }
    if (newRight < MIN_PANE_PCT) {
      newRight = MIN_PANE_PCT;
      newLeft = sum - MIN_PANE_PCT;
    }
    paneSizes[dragState.index] = newLeft;
    paneSizes[dragState.index + 1] = newRight;
    // TerminalPane owns a ResizeObserver on its container; shrinking/growing the
    // pane wrapper fires it and the xterm FitAddon refits — no manual fit here.
  }

  function onSplitterPointerUp(e: PointerEvent) {
    if (dragState) {
      const el = e.currentTarget as HTMLElement;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        // intentional — pointer may already be released
      }
    }
    dragState = null;
    isDragging = false;
  }

  // Keyboard resize on a focused splitter (a11y — concept §3 focus ring).
  function onSplitterKeydown(e: KeyboardEvent, index: number) {
    const prevKey = isVertical ? 'ArrowUp' : 'ArrowLeft';
    const nextKey = isVertical ? 'ArrowDown' : 'ArrowRight';
    if (e.key === prevKey || e.key === nextKey) {
      e.preventDefault();
      e.stopPropagation();
      adjustSplitter(index, e.key === prevKey ? -2 : 2);
    }
  }

  function adjustSplitter(index: number, deltaPct: number) {
    const left = paneSizes[index] ?? 0;
    const right = paneSizes[index + 1] ?? 0;
    const sum = left + right;
    if (sum <= 0) return;
    let newLeft = left + deltaPct;
    if (newLeft < MIN_PANE_PCT) newLeft = MIN_PANE_PCT;
    if (newLeft > sum - MIN_PANE_PCT) newLeft = sum - MIN_PANE_PCT;
    paneSizes[index] = newLeft;
    paneSizes[index + 1] = sum - newLeft;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (containerWidth < 900) return;
    if (e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
      if (e.key >= '1' && e.key <= '9') {
        const pageIdx = parseInt(e.key) - 1;
        if (pageIdx < totalPages) {
          workspacePage.set(pageIdx);
          refreshAllManagers();
          activateFirstTabOnPage(pageIdx);
          e.preventDefault();
        }
      } else if (e.key === 'ArrowLeft') {
        if ($workspacePage > 0) {
          const newPage = $workspacePage - 1;
          workspacePage.set(newPage);
          refreshAllManagers();
          activateFirstTabOnPage(newPage);
          e.preventDefault();
        }
      } else if (e.key === 'ArrowRight') {
        if ($workspacePage < totalPages - 1) {
          const newPage = $workspacePage + 1;
          workspacePage.set(newPage);
          refreshAllManagers();
          activateFirstTabOnPage(newPage);
          e.preventDefault();
        }
      }
    }
  }

  </script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="terminal-grid-container"
  class:dragging={isDragging}
  role="region"
  aria-label="Terminal workspace"
>
  <div class="terminal-grid" bind:clientWidth={containerWidth} bind:clientHeight={containerHeight} class:vertical={isVertical}>
    {#each visiblePanes as pane, i (pane.sessionId)}
      <div
        class="pane_wrapper"
        style="flex: 1 1 {(paneSizes[i] ?? 100 / (visiblePanes.length || 1))}%; {isVertical ? 'min-height: 0;' : 'min-width: 0;'}"
      >
        <TerminalPane
          sessionId={pane.sessionId}
          isActive={pane.sessionId === activeSessionId}
          showBorder={visiblePanes.length > 1}
          showChrome={visiblePanes.length > 1}
        />
      </div>
      {#if i < visiblePanes.length - 1}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          class="splitter"
          class:dragging={isDragging}
          class:splitter-horizontal={isVertical}
          role="separator"
          aria-orientation={isVertical ? 'horizontal' : 'vertical'}
          tabindex="0"
          aria-label="Resize adjacent panes"
          aria-valuemin={MIN_PANE_PCT}
          aria-valuemax={Math.round((paneSizes[i] ?? 0) + (paneSizes[i + 1] ?? 0) - MIN_PANE_PCT)}
          aria-valuenow={Math.round(paneSizes[i] ?? 0)}
          onpointerdown={(e) => onSplitterPointerDown(e, i)}
          onpointermove={onSplitterPointerMove}
          onpointerup={onSplitterPointerUp}
          onkeydown={(e) => onSplitterKeydown(e, i)}
        ></div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .terminal-grid-container {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    background: var(--bg-terminal);
    padding: var(--space-1);
    gap: var(--space-1);
    border: 1px solid var(--border-subtle);
  }

  /* user-select is inherited -> disables text selection in panes mid-drag */
  .terminal-grid-container.dragging {
    user-select: none;
    cursor: col-resize;
  }
  .terminal-grid-container.dragging .terminal-grid.vertical {
    cursor: row-resize;
  }

  .terminal-grid {
    display: flex;
    flex-direction: row;
    width: 100%;
    flex: 1;
    min-height: 0;
    min-width: 0;
    gap: 0;
    overflow: hidden;
    background: var(--bg-terminal);
  }
  .terminal-grid.vertical {
    flex-direction: column;
    height: 100%;
  }

  .pane_wrapper {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    background: var(--bg-terminal);
  }
  /* In horizontal mode the pane_wrapper fills the full column height */
  .terminal-grid:not(.vertical) .pane_wrapper {
    height: 100%;
  }
  /* In vertical mode the pane_wrapper fills the full row width */
  .terminal-grid.vertical .pane_wrapper {
    width: 100%;
  }

  /* The pane border (1px on each side) lives inside the pane-wrapper's
     border-box; the wrapper's overflow:hidden must not clip it. Allow the
     right edge border to paint by NOT overflowing the wrapper — the pane
     uses box-sizing: border-box so the 1px border is within its width. The
     grid container's overflow:hidden is the outer clip; the wrapper itself
     keeps its content (the pane) fully inside. */

  :global(.terminal-grid > .pane_wrapper > .terminal-pane) {
    flex: 1;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }

  /* ── Splitter handle (concept §3) ── */
  .splitter {
    flex: 0 0 6px;
    width: 6px;
    height: 100%;
    background: var(--border-default);
    cursor: col-resize;
    position: relative;
    user-select: none;
    touch-action: none;
    transition: background var(--transition-fast);
  }

  /* Vertical layout: splitter becomes a horizontal bar */
  .splitter-horizontal {
    width: 100%;
    height: 6px;
    cursor: row-resize;
  }

  /* 2px accent line centered in the hit-area, revealed on hover/drag */
  .splitter::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 2px;
    transform: translateX(-1px);
    background: transparent;
    transition: background var(--transition-fast);
  }

  .splitter-horizontal::after {
    top: 50%;
    bottom: auto;
    left: 0;
    right: 0;
    width: auto;
    height: 2px;
    transform: translateY(-1px);
  }

  .splitter.dragging {
    background: var(--border-accent);
  }

  @media (min-width: 769px) {
    .splitter:hover {
      background: var(--border-accent);
    }
  }

  .splitter.dragging::after {
    background: var(--accent-blue);
  }

  @media (min-width: 769px) {
    .splitter:hover::after {
      background: var(--accent-blue);
    }
  }

  .splitter:focus-visible {
    box-shadow: 0 0 0 1px var(--accent-blue);
    border-color: var(--border-accent);
  }

  /* ── Pagination indicator removed per user feedback (tab strip suffices) ── */

  @media (prefers-reduced-motion: reduce) {
    .splitter,
    .splitter::after {
      transition: none;
    }
  }
</style>