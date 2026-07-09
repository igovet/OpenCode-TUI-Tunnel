<script lang="ts">
  /**
   * InstallBanner.svelte — PWA install CTA banner.
   *
   * Shows a glass Card banner when the `beforeinstallprompt` event has fired
   * (deferredPrompt is stashed in pwa.ts). Clicking "Install" triggers the
   * native install prompt. Dismiss stores a localStorage flag so the banner
   * doesn't re-appear every session.
   *
   * On iOS Safari (no beforeinstallprompt event), shows instructions for
   * manual "Add to Home Screen" via the Share sheet.
   *
   * Show logic:
   *   - deferredPrompt is non-null (event fired, app not yet installed)
   *   - AND user hasn't permanently dismissed (localStorage flag)
   *   - AND app is not already running in standalone mode
   *
   * iOS variant:
   *   - navigator.standalone is an iOS Safari-only property
   *   - If iOS and not standalone → show instructions
   *   - No beforeinstallprompt on iOS, so this is the only path
   */
  import { getDeferredPrompt } from '$lib/pwa.svelte';
  import { onMount } from 'svelte';
  import Card from './ui/Card.svelte';
  import Button from './ui/Button.svelte';
  import Icon from './ui/Icon.svelte';

  const DISMISSED_KEY = 'opencode-tui-install-dismissed';

  let showBanner = $state(false);
  let isIOS = $state(false);
  let dismissed = $state(false);

  // iOS Safari PWA mode — navigator.standalone is a non-standard property
  interface IOSNavigator extends Navigator {
    standalone?: boolean;
  }

  // Reactive showBanner: recomputes whenever deferredPrompt ($state) changes.
  // Works regardless of whether the event fired before or after this component mounted.
  $effect(() => {
    showBanner = getDeferredPrompt() !== null && !dismissed;
  });

  onMount(() => {
    // Never show if user permanently dismissed
    if (localStorage.getItem(DISMISSED_KEY)) {
      dismissed = true;
      return;
    }

    // Never show if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // iOS detection: navigator.standalone is an iOS Safari-only property
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as IOSNavigator).MSStream;

    if (iOS) {
      // navigator.standalone is true when running as a PWA on iOS
      if (!(navigator as IOSNavigator).standalone) {
        isIOS = true;
        showBanner = true;
      }
      return;
    }

    // For non-iOS, $effect above handles deferredPrompt reactivity.
    // Hide banner on successful install
    const handleInstalled = () => {
      showBanner = false;
      dismissed = true;
      localStorage.setItem(DISMISSED_KEY, 'true');
    };
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('appinstalled', handleInstalled);
    };
  });

  async function handleInstall() {
    const prompt = getDeferredPrompt();
    if (!prompt) return;

    await prompt.prompt();
    const result = await prompt.userChoice;

    if (result.outcome === 'accepted') {
      dismissed = true;
      localStorage.setItem(DISMISSED_KEY, 'true');
    }
  }

  function handleDismiss() {
    dismissed = true;
    localStorage.setItem(DISMISSED_KEY, 'true');
  }
</script>

  {#if showBanner}
  <div class="install-banner" role="status" aria-live="polite">
    <Card variant="glass" padding="md" class="install-card">
      <div class="install-row">
        <!-- Left: app icon (maskable — declared in manifest with purpose=maskable) -->
        <img
          class="install-icon"
          src="/icons/icon-maskable-192.png"
          alt=""
          width="52"
          height="52"
          aria-hidden="true"
        />

        <!-- Center: app name + description (PWA is mentioned in the text, not a badge) -->
        <div class="install-meta">
          <span class="install-name">OpenCode TUI Tunnel</span>
          <span class="install-desc">Install this PWA app for quick access to your terminal sessions</span>
        </div>

        <!-- Right: Dismiss + Install buttons / iOS instructions -->
        <div class="install-btn-wrap">
          {#if isIOS}
            <Button
              variant="ghost"
              size="md"
              onclick={handleDismiss}
            >
              Dismiss
            </Button>
            <Button
              variant="secondary"
              size="md"
              onclick={handleDismiss}
              title="Tap Share → Add to Home Screen"
            >
              {#snippet icon_src()}
                <Icon name="plus" size={16} />
              {/snippet}
              Add
            </Button>
          {:else}
            <Button
              variant="ghost"
              size="md"
              onclick={handleDismiss}
            >
              Dismiss
            </Button>
            <Button
              variant="primary"
              size="md"
              onclick={handleInstall}
            >
              {#snippet icon_src()}
                <Icon name="power" size={16} />
              {/snippet}
              Install
            </Button>
          {/if}
        </div>
      </div>

      {#if isIOS}
        <p class="install-ios-hint">
          Tap <strong>Share</strong> <Icon name="plus" size={12} aria-hidden="true" /> &rarr; <strong>Add to Home Screen</strong>.
        </p>
      {/if}
    </Card>
  </div>
  {/if}

<style>
  .install-banner {
    margin-bottom: var(--space-5);
  }

  /* ── Row: [icon] [meta] [button] ── */
  .install-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
  }

  /* ── App icon ── */
  .install-icon {
    flex-shrink: 0;
    width: 52px;
    height: 52px;
    border-radius: var(--radius-md);
    /* Subtle border so the icon edge reads against the glass surface. */
    border: 1px solid var(--border-subtle);
    object-fit: contain;
    /* Drop shadow like the app-store icon lift. */
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.4));
  }

  /* ── Center meta: name, description ── */
  .install-meta {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1 1 auto;
    min-width: 0;
  }

  .install-name {
    font-family: var(--font-ui);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
    line-height: var(--line-height-tight);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .install-desc {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    line-height: var(--line-height-normal);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── Action buttons: [Dismiss] [Install] side by side ── */
  .install-btn-wrap {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .install-btn-wrap :global(.btn) {
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* ── iOS hint line under the row ── */
  .install-ios-hint {
    margin: var(--space-3) 0 0 0;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    line-height: var(--line-height-normal);
  }

  /* ── Mobile: keep the row comfortable; let the icon/btn stay fixed-size ── */
  @media (max-width: 640px) {
    .install-banner {
      margin-bottom: var(--space-3);
    }

    .install-icon {
      width: 48px;
      height: 48px;
    }
  }

  /* Coarse-pointer hover suppression handled globally by theme.css */
</style>
