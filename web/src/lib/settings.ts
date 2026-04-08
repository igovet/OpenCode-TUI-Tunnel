export interface Settings {
  notificationsEnabled: boolean;
}

const SETTINGS_KEY = 'opencode-tui-settings';

export function getSettings(): Settings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return JSON.parse(stored) as Settings;
    }
  } catch {
    // intentional — ignore parse errors
  }
  return { notificationsEnabled: true }; // default
}

export function setSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // intentional — ignore storage errors
  }
}
