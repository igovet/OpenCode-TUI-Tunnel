export interface KeyDefinition {
  label: string; // Display text on button
  key?: string; // Raw key sequence to send (e.g. "\x01" for ctrl+a)
  description: string; // Tooltip/hint
  group: 'modifier' | 'nav' | 'edit' | 'scroll' | 'session' | 'special';
}

export interface KeyGroup {
  name: string;
  keys: KeyDefinition[];
}

// Modifier state keys (toggle behavior)
export const MODIFIER_KEYS = ['ctrl', 'alt', 'shift', 'meta'] as const;
export type ModifierKey = (typeof MODIFIER_KEYS)[number];

// Control sequences for terminal
export const KEY_SEQUENCES: Record<string, string> = {
  // Ctrl sequences
  'ctrl+a': '\x01',
  'ctrl+b': '\x02',
  'ctrl+c': '\x03',
  'ctrl+d': '\x04',
  'ctrl+e': '\x05',
  'ctrl+f': '\x06',
  'ctrl+j': '\x0a',
  'ctrl+k': '\x0b',
  'ctrl+l': '\x0c',
  'ctrl+n': '\x0e',
  'ctrl+p': '\x10',
  'ctrl+r': '\x12',
  'ctrl+u': '\x15',
  'ctrl+w': '\x17',
  'ctrl+x': '\x18',

  // Special keys (ANSI/VT sequences)
  tab: '\t',
  'shift+tab': '\x1b[Z',
  esc: '\x1b',
  enter: '\r',
  backspace: '\x7f',

  // Arrow keys
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',

  // Page keys
  pageup: '\x1b[5~',
  pagedown: '\x1b[6~',
  home: '\x1b[H',
  end: '\x1b[F',
};

export const KEY_GROUPS: KeyGroup[] = [
  {
    name: 'Special',
    keys: [
      {
        label: 'ESC',
        key: KEY_SEQUENCES['esc'],
        description: 'Escape / Go back',
        group: 'special',
      },
      { label: '⏎', key: KEY_SEQUENCES['enter'], description: 'Enter / Confirm', group: 'special' },
      { label: '⌫', key: KEY_SEQUENCES['backspace'], description: 'Backspace', group: 'special' },
      {
        label: 'TAB',
        key: KEY_SEQUENCES['tab'],
        description: 'Tab / Autocomplete',
        group: 'special',
      },
      {
        label: '⇤',
        key: KEY_SEQUENCES['shift+tab'],
        description: 'Shift+Tab / Previous',
        group: 'special',
      },
      {
        label: 'C-j',
        key: KEY_SEQUENCES['ctrl+j'],
        description: 'Ctrl+J / Newline (confirm)',
        group: 'special',
      },
    ],
  },
  {
    name: 'Navigate',
    keys: [
      { label: '↑', key: KEY_SEQUENCES['up'], description: 'Up', group: 'nav' },
      { label: '↓', key: KEY_SEQUENCES['down'], description: 'Down', group: 'nav' },
      { label: '←', key: KEY_SEQUENCES['left'], description: 'Left', group: 'nav' },
      { label: '→', key: KEY_SEQUENCES['right'], description: 'Right', group: 'nav' },
      {
        label: 'PgUp',
        key: KEY_SEQUENCES['pageup'],
        description: 'Page Up / Scroll up',
        group: 'scroll',
      },
      {
        label: 'PgDn',
        key: KEY_SEQUENCES['pagedown'],
        description: 'Page Down / Scroll down',
        group: 'scroll',
      },
      { label: 'Home', key: KEY_SEQUENCES['home'], description: 'Scroll to top', group: 'scroll' },
      { label: 'End', key: KEY_SEQUENCES['end'], description: 'Scroll to bottom', group: 'scroll' },
    ],
  },
  {
    name: 'Ctrl',
    keys: [
      {
        label: 'C-c',
        key: KEY_SEQUENCES['ctrl+c'],
        description: 'Ctrl+C / Cancel',
        group: 'modifier',
      },
      {
        label: 'C-d',
        key: KEY_SEQUENCES['ctrl+d'],
        description: 'Ctrl+D / Quit',
        group: 'modifier',
      },
      {
        label: 'C-l',
        key: KEY_SEQUENCES['ctrl+l'],
        description: 'Ctrl+L / Clear screen',
        group: 'modifier',
      },
      {
        label: 'C-n',
        key: KEY_SEQUENCES['ctrl+n'],
        description: 'Ctrl+N / New',
        group: 'modifier',
      },
      {
        label: 'C-r',
        key: KEY_SEQUENCES['ctrl+r'],
        description: 'Ctrl+R / Search history',
        group: 'modifier',
      },
      {
        label: 'C-u',
        key: KEY_SEQUENCES['ctrl+u'],
        description: 'Ctrl+U / Delete line',
        group: 'edit',
      },
      {
        label: 'C-w',
        key: KEY_SEQUENCES['ctrl+w'],
        description: 'Ctrl+W / Delete word',
        group: 'edit',
      },
      {
        label: 'C-a',
        key: KEY_SEQUENCES['ctrl+a'],
        description: 'Ctrl+A / Start of line',
        group: 'edit',
      },
      {
        label: 'C-e',
        key: KEY_SEQUENCES['ctrl+e'],
        description: 'Ctrl+E / End of line',
        group: 'edit',
      },
      {
        label: 'C-j',
        key: KEY_SEQUENCES['ctrl+j'],
        description: 'Ctrl+J / Newline (confirm)',
        group: 'modifier',
      },
      {
        label: 'C-k',
        key: KEY_SEQUENCES['ctrl+k'],
        description: 'Ctrl+K / Kill to EOL',
        group: 'edit',
      },
      {
        label: 'C-x',
        key: KEY_SEQUENCES['ctrl+x'],
        description: 'Ctrl+X / Leader key',
        group: 'session',
      },
    ],
  },
  {
    name: 'Leader (C-x)',
    keys: [
      { label: 'C-x c', key: '\x18c', description: 'New conversation', group: 'session' },
      { label: 'C-x k', key: '\x18k', description: 'Kill session', group: 'session' },
      {
        label: 'C-f',
        key: KEY_SEQUENCES['ctrl+f'],
        description: 'Ctrl+F / Scroll down',
        group: 'scroll',
      },
      {
        label: 'C-b',
        key: KEY_SEQUENCES['ctrl+b'],
        description: 'Ctrl+B / Scroll up',
        group: 'scroll',
      },
    ],
  },
];
