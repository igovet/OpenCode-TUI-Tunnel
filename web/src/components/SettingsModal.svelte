<script lang="ts">
  import { getSettings, setSettings } from '../lib/settings';
  import { ensureNotificationPermission } from '../lib/notifications';

  let { open, onClose }: { open: boolean; onClose: () => void } = $props();

  let settings = $state(getSettings());

  async function handleToggle() {
    if (!settings.notificationsEnabled) {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        return;
      }
    }

    settings = { ...settings, notificationsEnabled: !settings.notificationsEnabled };
    setSettings(settings);
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
            onclick={handleToggle}
            aria-checked={settings.notificationsEnabled}
            role="switch"
            aria-label="Enable notifications"
          >
            {settings.notificationsEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
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
