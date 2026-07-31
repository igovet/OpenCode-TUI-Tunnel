import type { TerminalManager } from './terminal';

const DESKTOP_KEY = 'terminal-zoom-desktop';
const MOBILE_KEY = 'terminal-zoom-mobile';
const DEFAULT_DESKTOP = 13;
const DEFAULT_MOBILE = 11;

function isMobile() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 900;
}

function getStoredZoom(): number {
  if (typeof localStorage === 'undefined') return isMobile() ? DEFAULT_MOBILE : DEFAULT_DESKTOP;
  const key = isMobile() ? MOBILE_KEY : DESKTOP_KEY;
  const stored = localStorage.getItem(key);
  return stored ? parseInt(stored, 10) : isMobile() ? DEFAULT_MOBILE : DEFAULT_DESKTOP;
}

function saveZoom(size: number) {
  if (typeof localStorage === 'undefined') return;
  const key = isMobile() ? MOBILE_KEY : DESKTOP_KEY;
  localStorage.setItem(key, String(size));
}

export const zoomState = $state({
  value: getStoredZoom(),
});

export const terminalManagers = new Set<TerminalManager>();

export function registerManager(manager: TerminalManager) {
  terminalManagers.add(manager);
  // Don't setFontSize here — terminal may not be open yet
  // The canvas addon needs the terminal to be open to measure DPI correctly
  return () => terminalManagers.delete(manager);
}

export function setZoom(size: number) {
  const clamped = Math.max(8, Math.min(24, size));
  zoomState.value = clamped;
  saveZoom(clamped);
  for (const m of terminalManagers) {
    m.setFontSize(clamped);
  }
}

let refreshRAF: number | null = null;
let refreshVisualRAF: number | null = null;

export function refreshAllManagers() {
  if (refreshRAF !== null) {
    return;
  }
  refreshRAF = requestAnimationFrame(() => {
    refreshRAF = null;
    for (const manager of terminalManagers) {
      manager.terminal.refresh(0, manager.terminal.rows - 1);
      // Only reconnect managers that are actually disconnected (not already connected)
      if (!manager.isConnected()) {
        manager.reconnectIfDisconnected();
      }
    }
  });
}

export function refreshAllManagersVisual() {
  console.log('[refreshAllManagersVisual] called, refreshVisualRAF=', refreshVisualRAF);
  // Cancel any pending RAF so the latest call always wins (coalescing, not debouncing).
  // This prevents calls from being silently dropped when multiple callers invoke
  // this function in quick succession (page switch + tab drag + keyboard nav).
  if (refreshVisualRAF !== null) {
    console.log('[refreshAllManagersVisual] cancelling pending RAF');
    cancelAnimationFrame(refreshVisualRAF);
    refreshVisualRAF = null;
  }
  refreshVisualRAF = requestAnimationFrame(() => {
    refreshVisualRAF = null;
    let refreshed = 0;
    try {
      for (const manager of terminalManagers) {
        // Refresh ALL managers regardless of current dimensions.
        // After a page switch, panes that just became visible need
        // their WebGL canvas re-rendered even if dimensions are 0.
        // refresh() on a zero-dimension canvas is harmless — it's a no-op.
        if (manager.element) {
          manager.terminal.refresh(0, manager.terminal.rows - 1);
          refreshed++;
          console.log('[refreshAllManagersVisual] refreshed manager, rows=', manager.terminal.rows);
        }
      }
    } catch (err) {
      console.error('[refreshAllManagersVisual] error in RAF callback:', err);
    }
    console.log('[refreshAllManagersVisual] done, refreshed=', refreshed);
  });
}

let fitRAF: number | null = null;

/**
 * Fit ALL terminal managers to their container dimensions.
 * After a page switch, panes that just became visible may have
 * clientWidth=0 / clientHeight=0 because the browser hasn't laid
 * them out yet. Skipping them means they never get fitted.
 * fit() on a zero-dimension container is harmless — ResizeObserver
 * will re-fit when dimensions become non-zero.
 */
export function fitAllManagersVisual() {
  console.log('[fitAllManagersVisual] called, fitRAF=', fitRAF);
  // Cancel any pending RAF so the latest call always wins (coalescing, not debouncing).
  // This prevents calls from being silently dropped when multiple callers invoke
  // this function in quick succession (page switch + tab drag + keyboard nav).
  if (fitRAF !== null) {
    console.log('[fitAllManagersVisual] cancelling pending RAF');
    cancelAnimationFrame(fitRAF);
    fitRAF = null;
  }
  fitRAF = requestAnimationFrame(() => {
    fitRAF = null;
    let fitted = 0;
    try {
      for (const manager of terminalManagers) {
        // Fit ALL managers regardless of current dimensions.
        // After a page switch, panes that just became visible may have
        // clientWidth=0 / clientHeight=0 because the browser hasn't laid
        // them out yet. Skipping them means they never get fitted.
        // fit() on a zero-dim container is harmless — ResizeObserver
        // will re-fit when dimensions become non-zero.
        if (manager.element) {
          manager.fit();
          fitted++;
          console.log('[fitAllManagersVisual] fitted manager');
        }
      }
    } catch (err) {
      console.error('[fitAllManagersVisual] error in RAF callback:', err);
    }
    console.log('[fitAllManagersVisual] done, fitted=', fitted);
  });
}
