export interface Settings {
  notificationsEnabled: boolean;
  reduceMotion: boolean;
  uiFontSize: 'sm' | 'md' | 'lg';
  terminalFontSize: number;
  scrollback: number;
  /** Max terminals per screen. 0 = auto (current behavior based on viewport width). */
  maxTerminals: number;
  /** Terminal layout direction. */
  terminalLayout: 'horizontal' | 'vertical';
  /** opencode version to use: v1 (opencode) or v2 (opencode2) */
  opencodeVersion: 'v1' | 'v2';
  /** When enabled, all new sessions will launch in standalone mode by default. */
  standaloneByDefault: boolean;
}

const SETTINGS_KEY = 'opencode-tui-settings';

const DEFAULTS: Settings = {
  notificationsEnabled: true,
  reduceMotion: false,
  uiFontSize: 'md',
  terminalFontSize: 14,
  scrollback: 1000,
  maxTerminals: 0,
  terminalLayout: 'horizontal',
  opencodeVersion: 'v1',
  standaloneByDefault: false,
};

function loadFromStorage(): Settings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<Settings>;
      return { ...DEFAULTS, ...parsed };
    }
  } catch {
    // intentional — ignore parse errors
  }
  return { ...DEFAULTS };
}

// ── Reactive in-memory store ──
// Module-level $state so every consumer that reads _settings in a reactive
// context ($effect, $derived, template) establishes a dependency. When
// setSettings() replaces _settings, all reactive readers re-evaluate.
let _settings: Settings = $state(loadFromStorage());

/**
 * Get the current settings (reactive — call in a $effect or $derived to
 * track changes).
 */
export function getSettings(): Settings {
  return _settings;
}

/**
 * Update settings: writes to the reactive in-memory store AND persists to
 * localStorage. All reactive consumers re-evaluate immediately.
 */
export function setSettings(settings: Settings): void {
  _settings = settings;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // intentional — ignore storage errors
  }
}
