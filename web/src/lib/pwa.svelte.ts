import { showToast } from './toastStore.svelte';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  prompt(): Promise<void>;
}

let _deferredPrompt: BeforeInstallPromptEvent | null = $state(null);

export function getDeferredPrompt(): BeforeInstallPromptEvent | null {
  return _deferredPrompt;
}

export function registerServiceWorker() {
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e: BeforeInstallPromptEvent) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      _deferredPrompt = e;
      console.log('[PWA] beforeinstallprompt event fired and stashed');
    });
  }

  if ('serviceWorker' in navigator) {
    const register = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('[PWA] Service worker registered:', registration.scope);

          // Check for updates periodically
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  showToast({
                    message: 'New version available — reload to update',
                    type: 'info',
                    duration: 0,
                    action: { label: 'Reload', callback: () => window.location.reload() },
                  });
                }
              });
            }
          });
        })
        .catch((error) => {
          // Non-fatal: app works without service worker
          console.warn('[PWA] Service worker registration failed:', error);
        });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register);
    }
  }
}
