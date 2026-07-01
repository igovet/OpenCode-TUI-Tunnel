<script lang="ts">
  import { getSettings, setSettings } from '../lib/settings';
  import {
    getCurrentPushSubscription,
    isIOSPWARequired,
    isPushSupported,
    requestNotificationPermission,
    subscribeToPushNotifications,
    unsubscribeFromPushNotifications,
  } from '../lib/notifications';
  import { showToast } from '../lib/toastStore.svelte';
  import { setZoom } from '../lib/zoomStore.svelte';
  import Dialog from './ui/Dialog.svelte';
  import Button from './ui/Button.svelte';
  import Select from './ui/Select.svelte';
  import Icon from './ui/Icon.svelte';

  let { open, onClose }: { open: boolean; onClose: () => void } = $props();

  let settings = $state(getSettings());
  let checkingPushState = $state(true);
  let pushError = $state('');
  let notificationPermission = $state<BrowserNotificationPermission | null>(
    getNotificationPermissionState(),
  );

  const NOT_SUPPORTED_ERROR = 'Браузер не поддерживает push-уведомления';
  const PERMISSION_DENIED_ERROR = 'Разрешения на уведомления отклонены в настройках браузера';
  const SUBSCRIBE_FAILED_ERROR = 'Ошибка подписки на уведомления';
  const IOS_PWA_REQUIRED_ERROR =
    'Для push-уведомлений добавьте приложение на главный экран (iOS)';

  type BrowserNotificationPermission = 'default' | 'denied' | 'granted';

  function getNotificationPermissionState(): BrowserNotificationPermission | null {
    if (typeof Notification === 'undefined') {
      return null;
    }

    return Notification.permission;
  }

  function setNotificationsEnabled(enabled: boolean): void {
    settings = { ...settings, notificationsEnabled: enabled };
    setSettings(settings);
  }

  async function syncNotificationToggleFromSubscription(): Promise<void> {
    checkingPushState = true;
    pushError = '';

    notificationPermission = getNotificationPermissionState();

    if (!settings.notificationsEnabled) {
      checkingPushState = false;
      return;
    }

    if (!isPushSupported()) {
      pushError = NOT_SUPPORTED_ERROR;
      setNotificationsEnabled(false);
      checkingPushState = false;
      return;
    }

    const subscription = await getCurrentPushSubscription();
    if (subscription) {
      checkingPushState = false;
      return;
    }

    if (notificationPermission === 'denied') {
      pushError = PERMISSION_DENIED_ERROR;
      setNotificationsEnabled(false);
      checkingPushState = false;
      return;
    }

    const subscribed = await subscribeToPushNotifications();
    notificationPermission = getNotificationPermissionState();

    if (!subscribed) {
      pushError = iosPwaRequired ? IOS_PWA_REQUIRED_ERROR : SUBSCRIBE_FAILED_ERROR;
      setNotificationsEnabled(false);
      checkingPushState = false;
      return;
    }

    setNotificationsEnabled(true);
    checkingPushState = false;
  }

  $effect(() => {
    if (!open) {
      return;
    }

    void syncNotificationToggleFromSubscription();
  });

  const notificationPermissionDenied = $derived(notificationPermission === 'denied');
  const iosPwaRequired = $derived(isIOSPWARequired());

  async function handleToggle() {
    if (checkingPushState) {
      return;
    }

    pushError = '';

    if (!settings.notificationsEnabled) {
      if (!isPushSupported()) {
        pushError = NOT_SUPPORTED_ERROR;
        setNotificationsEnabled(false);
        return;
      }

      const permission = await requestNotificationPermission();
      notificationPermission = permission;
      if (permission !== 'granted') {
        pushError = PERMISSION_DENIED_ERROR;
        setNotificationsEnabled(false);
        return;
      }

      const subscribed = await subscribeToPushNotifications();
      if (!subscribed) {
        pushError = iosPwaRequired ? IOS_PWA_REQUIRED_ERROR : SUBSCRIBE_FAILED_ERROR;
        setNotificationsEnabled(false);
        return;
      }

      setNotificationsEnabled(true);
    } else {
      await unsubscribeFromPushNotifications();
      setNotificationsEnabled(false);
    }
  }

  function saveSettings() {
    setSettings(settings);
  }

  function handleReduceMotionChange() {
    settings = { ...settings, reduceMotion: !settings.reduceMotion };
    saveSettings();
  }

  function handleUiFontSizeChange(v: string) {
    settings = { ...settings, uiFontSize: v as 'sm' | 'md' | 'lg' };
    saveSettings();
  }

  function handleTerminalFontSizeChange(v: string) {
    const n = parseInt(v, 10);
    if (!isNaN(n) && n >= 8 && n <= 24) {
      settings = { ...settings, terminalFontSize: n };
      saveSettings();
    }
  }

  // Wire terminalFontSize → zoomStore: when the setting changes, push the
  // new font size to all live terminal managers via the shared zoom store.
  $effect(() => {
    setZoom(settings.terminalFontSize);
  });

  function handleScrollbackChange(v: string) {
    const n = parseInt(v, 10);
    if (!isNaN(n) && n >= 100 && n <= 100000) {
      settings = { ...settings, scrollback: n };
      saveSettings();
    }
  }

  function handleTestNotification() {
    showToast({
      message: 'This is a test notification — your toast system is working!',
      type: 'success',
      duration: 4000,
    });
  }

  function handleMaxTerminalsChange(v: string) {
    const n = parseInt(v, 10);
    if (!isNaN(n) && n >= 0 && n <= 4) {
      settings = { ...settings, maxTerminals: n };
      saveSettings();
    }
  }

  function handleTerminalLayoutChange(v: string) {
    if (v === 'horizontal' || v === 'vertical') {
      settings = { ...settings, terminalLayout: v };
      saveSettings();
    }
  }

  // ── Section navigation ──

  type SectionId = 'notifications' | 'appearance' | 'terminal' | 'keyboard';

  const sections: { id: SectionId; label: string; icon: string }[] = [
    { id: 'notifications', label: 'Notifications', icon: 'bell' },
    { id: 'appearance', label: 'Appearance', icon: 'settings' },
    { id: 'terminal', label: 'Terminal', icon: 'terminal' },
    { id: 'keyboard', label: 'Keyboard', icon: 'copy' },
  ];

  let activeSection: SectionId = $state('notifications');

  // ── Keyboard shortcuts data ──

  const shortcuts = [
    { keys: ['Ctrl', '→'], desc: 'Next pane' },
    { keys: ['Ctrl', '←'], desc: 'Previous pane' },
    { keys: ['Ctrl', '↑'], desc: 'Pane above' },
    { keys: ['Ctrl', '↓'], desc: 'Pane below' },
    { keys: ['Alt', '1..9'], desc: 'Go to page' },
    { keys: ['Alt', '←'], desc: 'Previous page' },
    { keys: ['Alt', '→'], desc: 'Next page' },
    { keys: ['Esc'], desc: 'Close modal / pane focus' },
    { keys: ['Tab'], desc: 'Next focusable element' },
    { keys: ['Shift', 'Tab'], desc: 'Previous focusable element' },
  ];
</script>

<Dialog
  bind:open
  title="Settings"
  size="md"
  {onClose}
>
  {#snippet children()}
    <div class="settings-layout">
      <!-- Section nav rail -->
      <nav class="settings-nav" aria-label="Settings sections">
        {#each sections as section}
          <button
            class="settings-nav-item"
            class:active={activeSection === section.id}
            onclick={() => (activeSection = section.id)}
            aria-current={activeSection === section.id ? 'page' : undefined}
            type="button"
          >
            <Icon name={section.icon} size={16} aria-hidden="true" />
            <span>{section.label}</span>
          </button>
        {/each}
      </nav>

      <!-- Section content -->
      <div class="settings-content" role="tabpanel" aria-label={activeSection}>
        {#if activeSection === 'notifications'}
          <div class="section">
            <h3 class="section-title">Notifications</h3>
            <p class="section-desc">
              Configure browser push notifications for session events.
            </p>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-name">Enable notifications</span>
                <span class="setting-desc">
                  Show browser notifications when a session requires attention
                </span>
              </div>
              <button
                class="toggle-btn"
                class:active={settings.notificationsEnabled}
                disabled={checkingPushState || notificationPermissionDenied}
                onclick={handleToggle}
                aria-checked={settings.notificationsEnabled}
                role="switch"
                aria-label="Enable notifications"
              >
                {#if checkingPushState}
                  ...
                {:else if settings.notificationsEnabled}
                  ON
                {:else}
                  OFF
                {/if}
              </button>
            </div>

            {#if checkingPushState}
              <p class="setting-note">Checking current push subscription...</p>
            {/if}

            {#if notificationPermissionDenied}
              <p class="setting-note warning">
                Notification permissions denied in browser settings
              </p>
            {/if}

            {#if iosPwaRequired}
              <p class="setting-note">
                On iPhone/iPad push notifications only work if you add the app to your home screen
              </p>
            {/if}

            {#if pushError}
              <p class="setting-note error">Failed to subscribe: {pushError}</p>
            {/if}

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-name">Test notification</span>
                <span class="setting-desc">
                  Send a test toast to verify the notification system works
                </span>
              </div>
              <Button variant="secondary" size="sm" onclick={handleTestNotification}>
                Test
              </Button>
            </div>
          </div>

        {:else if activeSection === 'appearance'}
          <div class="section">
            <h3 class="section-title">Appearance</h3>
            <p class="section-desc">
              Customize the look and feel of the interface.
            </p>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-name">UI font size</span>
                <span class="setting-desc">
                  Controls the size of interface text and elements
                </span>
              </div>
              <div class="setting-control">
                <Select
                  value={settings.uiFontSize}
                  options={[
                    { value: 'sm', label: 'Small' },
                    { value: 'md', label: 'Medium' },
                    { value: 'lg', label: 'Large' },
                  ]}
                  onchange={(e: Event) => handleUiFontSizeChange((e.target as HTMLSelectElement).value)}
                  aria-label="UI font size"
                />
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-name">Reduce motion</span>
                <span class="setting-desc">
                  Disable animations and transitions for a static experience
                </span>
              </div>
              <button
                class="toggle-btn"
                class:active={settings.reduceMotion}
                onclick={handleReduceMotionChange}
                aria-checked={settings.reduceMotion}
                role="switch"
                aria-label="Reduce motion"
              >
                {settings.reduceMotion ? 'ON' : 'OFF'}
              </button>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-name">Max terminals per screen</span>
                <span class="setting-desc">
                  Limit the number of terminals shown at once. Auto adjusts based on window width.
                </span>
              </div>
              <div class="setting-control">
                <Select
                  value={String(settings.maxTerminals)}
                  options={[
                    { value: '0', label: 'Auto' },
                    { value: '1', label: '1' },
                    { value: '2', label: '2' },
                    { value: '3', label: '3' },
                    { value: '4', label: '4' },
                  ]}
                  onchange={(e: Event) => handleMaxTerminalsChange((e.target as HTMLSelectElement).value)}
                  aria-label="Max terminals per screen"
                />
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-name">Terminal layout</span>
                <span class="setting-desc">
                  Arrange terminals side by side (horizontal) or stacked (vertical).
                </span>
              </div>
              <div class="setting-control">
                <Select
                  value={settings.terminalLayout}
                  options={[
                    { value: 'horizontal', label: 'Horizontal' },
                    { value: 'vertical', label: 'Vertical' },
                  ]}
                  onchange={(e: Event) => handleTerminalLayoutChange((e.target as HTMLSelectElement).value)}
                  aria-label="Terminal layout"
                />
              </div>
            </div>

            <p class="setting-note muted">
              Theme is dark-only. Light mode is not available in this version.
            </p>
          </div>

        {:else if activeSection === 'terminal'}
          <div class="section">
            <h3 class="section-title">Terminal</h3>
            <p class="section-desc">
              Configure terminal emulator behavior and display.
            </p>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-name">Terminal font size</span>
                <span class="setting-desc">
                  Font size for terminal content (8–24 px). Applied to all terminal panes.
                </span>
              </div>
              <div class="setting-control">
                <Select
                  value={String(settings.terminalFontSize)}
                  options={[
                    { value: '8', label: '8' },
                    { value: '9', label: '9' },
                    { value: '10', label: '10' },
                    { value: '11', label: '11' },
                    { value: '12', label: '12' },
                    { value: '13', label: '13' },
                    { value: '14', label: '14' },
                    { value: '15', label: '15' },
                    { value: '16', label: '16' },
                    { value: '17', label: '17' },
                    { value: '18', label: '18' },
                    { value: '19', label: '19' },
                    { value: '20', label: '20' },
                    { value: '21', label: '21' },
                    { value: '22', label: '22' },
                    { value: '23', label: '23' },
                    { value: '24', label: '24' },
                  ]}
                  onchange={(e: Event) => handleTerminalFontSizeChange((e.target as HTMLSelectElement).value)}
                  aria-label="Terminal font size"
                />
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-name">Scrollback buffer</span>
                <span class="setting-desc">
                  Number of lines to keep in terminal scrollback history
                </span>
              </div>
              <div class="setting-control">
                <Select
                  value={String(settings.scrollback)}
                  options={[
                    { value: '1000', label: '1,000' },
                    { value: '5000', label: '5,000' },
                    { value: '10000', label: '10,000' },
                    { value: '25000', label: '25,000' },
                    { value: '50000', label: '50,000' },
                    { value: '100000', label: '100,000' },
                  ]}
                  onchange={(e: Event) => handleScrollbackChange((e.target as HTMLSelectElement).value)}
                  aria-label="Scrollback buffer"
                />
              </div>
            </div>

            <p class="setting-note muted">
              Terminal font size syncs to all open terminals via the zoom store.
              Scrollback applies to terminals created after changing this setting
              (xterm.js does not resize the buffer of an existing instance).
            </p>
          </div>

        {:else if activeSection === 'keyboard'}
          <div class="section">
            <h3 class="section-title">Keyboard Shortcuts</h3>
            <p class="section-desc">
              Reference for available keyboard shortcuts. Custom keybindings are
              not yet configurable.
            </p>

            <div class="shortcuts-list">
              {#each shortcuts as shortcut}
                <div class="shortcut-row">
                  <div class="shortcut-keys">
                    {#each shortcut.keys as key, i}
                      <kbd class="shortcut-key">{key}</kbd>
                      {#if i < shortcut.keys.length - 1}
                        <span class="shortcut-plus">+</span>
                      {/if}
                    {/each}
                  </div>
                  <span class="shortcut-desc">{shortcut.desc}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/snippet}

  {#snippet footer()}
    <Button variant="secondary" onclick={onClose}>Close</Button>
  {/snippet}
</Dialog>

<style>
  /* ── Layout: nav rail + content ── */

  .settings-layout {
    display: flex;
    gap: 0;
    min-height: 320px;
  }

  .settings-nav {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 0.25rem);
    min-width: 160px;
    padding: var(--space-2, 0.5rem);
    border-right: 1px solid var(--border-muted, rgba(255, 255, 255, 0.04));
    flex-shrink: 0;
  }

  .settings-nav-item {
    display: flex;
    align-items: center;
    gap: var(--space-2, 0.5rem);
    padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
    border: none;
    border-radius: var(--radius-sm, 4px);
    background: transparent;
    color: var(--text-secondary);
    font-family: var(--font-ui);
    font-size: var(--font-size-sm, 0.8125rem);
    font-weight: var(--font-weight-medium, 500);
    cursor: pointer;
    text-align: left;
    transition:
      background-color var(--transition-fast, 100ms ease),
      color var(--transition-fast, 100ms ease);
    white-space: nowrap;
  }

  @media (min-width: 769px) {
    .settings-nav-item:hover {
      background: var(--bg-overlay);
      color: var(--text-primary);
    }
  }

  .settings-nav-item.active {
    background: var(--bg-elevated);
    color: var(--accent-blue);
  }

  .settings-nav-item:focus-visible {
    box-shadow: 0 0 0 1px var(--border-accent);
    border-color: var(--border-accent);
  }

  /* ── Content area ── */

  .settings-content {
    flex: 1;
    padding: var(--space-4, 1rem) var(--space-5, 1.25rem);
    overflow-y: auto;
    min-width: 0;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4, 1rem);
  }

  .section-title {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--font-size-md, 1rem);
    font-weight: var(--font-weight-semibold, 600);
    color: var(--text-primary);
    line-height: var(--line-height-tight, 1.25);
  }

  .section-desc {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--font-size-sm, 0.8125rem);
    color: var(--text-muted);
    line-height: var(--line-height-normal, 1.5);
  }

  /* ── Setting rows ── */

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4, 1rem);
    padding: var(--space-3, 0.75rem) 0;
    border-bottom: 1px solid var(--border-muted);
  }

  .setting-row:last-of-type {
    border-bottom: none;
  }

  .setting-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .setting-name {
    font-family: var(--font-ui);
    font-size: var(--font-size-sm, 0.8125rem);
    font-weight: var(--font-weight-medium, 500);
    color: var(--text-primary);
  }

  .setting-desc {
    font-family: var(--font-ui);
    font-size: var(--font-size-xs, 0.75rem);
    color: var(--text-muted);
    line-height: var(--line-height-normal, 1.5);
  }

  .setting-control {
    flex-shrink: 0;
    min-width: 100px;
  }

  /* ── Toggle button (reused from original) ── */

  .toggle-btn {
    background: var(--bg-base);
    border: 1px solid var(--border-default);
    border-radius: 0;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    font-weight: 700;
    letter-spacing: 1px;
    padding: 4px 10px;
    cursor: pointer;
    min-width: 48px;
    text-align: center;
    transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
    flex-shrink: 0;
  }

  .toggle-btn:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }

  .toggle-btn.active {
    background: rgba(63, 185, 80, 0.15);
    border-color: var(--accent-green);
    color: var(--accent-green);
  }

  @media (min-width: 769px) {
    .toggle-btn:hover {
      border-color: var(--border-accent);
      color: var(--text-secondary);
    }
  }

  @media (min-width: 769px) {
    .toggle-btn.active:hover {
      background: rgba(63, 185, 80, 0.25);
    }
  }

  /* ── Setting notes ── */

  .setting-note {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--font-size-xs, 0.75rem);
    line-height: var(--line-height-normal, 1.5);
    color: var(--text-muted);
  }

  .setting-note.warning {
    color: var(--accent-orange);
  }

  .setting-note.error {
    color: var(--accent-red);
  }

  .setting-note.muted {
    font-style: italic;
    padding: var(--space-2, 0.5rem) 0;
  }

  /* ── Keyboard shortcuts list ── */

  .shortcuts-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 0.5rem);
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3, 0.75rem);
    padding: var(--space-2, 0.5rem) 0;
    border-bottom: 1px solid var(--border-muted, rgba(255, 255, 255, 0.04));
  }

  .shortcut-row:last-child {
    border-bottom: none;
  }

  .shortcut-keys {
    display: flex;
    align-items: center;
    gap: var(--space-1, 0.25rem);
    flex-shrink: 0;
  }

  .shortcut-key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    padding: 2px 6px;
    font-family: var(--font-mono);
    font-size: var(--font-size-xs, 0.75rem);
    font-weight: var(--font-weight-medium, 500);
    color: var(--text-primary);
    background: var(--bg-overlay);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm, 4px);
    line-height: var(--line-height-tight, 1.25);
  }

  .shortcut-plus {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs, 0.75rem);
  }

  .shortcut-desc {
    font-family: var(--font-ui);
    font-size: var(--font-size-sm, 0.8125rem);
    color: var(--text-secondary);
    text-align: right;
    flex: 1;
    min-width: 0;
  }

  /* ── Responsive: stack nav on top on narrow screens ── */

  @media (max-width: 640px) {
    .settings-layout {
      flex-direction: column;
    }

    .settings-nav {
      flex-direction: row;
      min-width: unset;
      border-right: none;
      border-bottom: 1px solid var(--border-muted);
      overflow-x: auto;
      padding: var(--space-1, 0.25rem);
    }

    .settings-nav-item {
      white-space: nowrap;
      flex-shrink: 0;
    }

    .settings-content {
      padding: var(--space-3, 0.75rem);
    }
  }
</style>
