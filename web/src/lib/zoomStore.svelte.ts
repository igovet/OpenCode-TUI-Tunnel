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
  return stored ? parseInt(stored, 10) : (isMobile() ? DEFAULT_MOBILE : DEFAULT_DESKTOP);
}

function saveZoom(size: number) {
  if (typeof localStorage === 'undefined') return;
  const key = isMobile() ? MOBILE_KEY : DESKTOP_KEY;
  localStorage.setItem(key, String(size));
}

export const zoomState = $state({
    value: getStoredZoom()
});

export const terminalManagers = new Set<TerminalManager>();

export function registerManager(manager: TerminalManager) {
    terminalManagers.add(manager);
    manager.setFontSize(zoomState.value);
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
