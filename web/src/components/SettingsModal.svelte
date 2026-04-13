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

  function handleOverlayKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="modal-overlay"
    onclick={onClose}
    onkeydown={handleOverlayKeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-modal-title"
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="modal-box" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h2 id="settings-modal-title" class="modal-title">[ SETTINGS ]</h2>
      </div>

      <div class="settings-list">
        <div class="setting-row">
          <label class="setting-label" for="notifications-toggle">
            <span class="setting-name">Enable notifications</span>
            <span class="setting-desc">Show browser notifications when a session requires attention</span>
          </label>
          <button
            id="notifications-toggle"
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
          <p class="setting-note">Проверка текущей push-подписки...</p>
        {/if}

        {#if notificationPermissionDenied}
          <p class="setting-note warning">Разрешения на уведомления отклонены в настройках браузера</p>
        {/if}

        {#if iosPwaRequired}
          <p class="setting-note">
            На iPhone/iPad push-уведомления работают только если добавить приложение на главный
            экран
          </p>
        {/if}

        {#if pushError}
          <p class="setting-note error">Не удалось подписаться: {pushError}</p>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="btn primary" onclick={onClose}>CLOSE</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: var(--space-4);
  }

  .modal-box {
    background: var(--bg-surface);
    border: 1px solid var(--border-accent);
    border-radius: 0;
    padding: var(--space-6);
    max-width: 420px;
    width: 100%;
    box-sizing: border-box;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    font-family: var(--font-mono);
  }

  .modal-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    border-bottom: 1px solid var(--border-default);
    padding-bottom: var(--space-3);
  }

  .modal-title {
    margin: 0;
    font-size: var(--font-size-md, 1rem);
    font-weight: 700;
    color: var(--accent-blue);
    letter-spacing: 0.5px;
  }

  .settings-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: 20px 0;
  }

  .setting-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    cursor: default;
    flex: 1;
    min-width: 0;
  }

  .setting-name {
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    font-weight: 600;
  }

  .setting-desc {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    line-height: 1.4;
  }

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

  .toggle-btn:hover {
    border-color: var(--border-accent);
    color: var(--text-secondary);
  }

  .toggle-btn.active:hover {
    background: rgba(63, 185, 80, 0.25);
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    border-top: 1px solid var(--border-default);
    padding-top: var(--space-3);
  }

  .setting-note {
    margin: 0;
    font-size: var(--font-size-xs);
    line-height: 1.4;
    color: var(--text-muted);
  }

  .setting-note.warning {
    color: var(--accent-orange, #d29922);
  }

  .setting-note.error {
    color: var(--accent-red);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    border-radius: 0;
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--border-default);
    background: var(--bg-elevated);
    color: var(--text-primary);
    transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
    text-decoration: none;
  }

  .btn.primary {
    background: rgba(88, 166, 255, 0.15);
    border-color: var(--accent-blue);
    color: var(--accent-blue);
    font-weight: 700;
    letter-spacing: 1px;
  }

  .btn.primary:hover {
    background: rgba(88, 166, 255, 0.25);
  }

  @media (max-width: 768px) {
    button:hover,
    button:focus,
    button:focus-visible,
    .toggle-btn:hover,
    .toggle-btn:focus,
    .toggle-btn:focus-visible,
    .btn:hover,
    .btn:focus,
    .btn:focus-visible {
      outline: none;
      background: inherit;
      color: inherit;
      border-color: inherit;
      box-shadow: none;
    }
  }
</style>
