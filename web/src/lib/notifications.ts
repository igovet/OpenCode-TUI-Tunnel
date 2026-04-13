export const ACTIVATE_SESSION_MESSAGE_TYPE = 'ACTIVATE_SESSION';
export const ACTIVATE_SESSION_EVENT = 'opencode:activate-session';
export const ACTIVATE_SESSION_QUERY_PARAM = 'activateSession';

import { getSettings } from './settings';

type ActivateSessionPayload = {
  type: typeof ACTIVATE_SESSION_MESSAGE_TYPE;
  sessionId: string;
};

interface VapidPublicKeyResponse {
  publicKey: string;
}

interface PushUnsubscribeBody {
  endpoint: string;
}

let notificationAudioWarningLogged = false;

export function setupNotificationAudioUnlock(): void {
  // No-op: HTML5 Audio does not require explicit AudioContext unlock gestures.
  // The audio element will play on user-gesture-gated autoplay policies automatically.
}

function canUseNotifications(): boolean {
  return typeof window !== 'undefined' && typeof Notification !== 'undefined';
}

function canUsePushManager(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!canUsePushManager()) {
    return null;
  }

  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const response = await fetch('/api/push/vapid-public-key');
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as VapidPublicKeyResponse;
    return typeof payload.publicKey === 'string' && payload.publicKey.trim().length > 0
      ? payload.publicKey
      : null;
  } catch {
    return null;
  }
}

export async function subscribeToPushNotifications(): Promise<boolean> {
  const registration = await getServiceWorkerRegistration();
  if (!registration) {
    return false;
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const publicKey = await fetchVapidPublicKey();
    if (!publicKey) {
      return false;
    }

    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    } catch {
      return false;
    }
  }

  try {
    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ subscription }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  const registration = await getServiceWorkerRegistration();
  if (!registration) {
    return true;
  }

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return true;
  }

  const endpoint = subscription.endpoint;
  const unsubscribed = await subscription.unsubscribe().catch(() => false);

  try {
    const payload: PushUnsubscribeBody = { endpoint };
    await fetch('/api/push/unsubscribe', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Best-effort cleanup on backend
  }

  return unsubscribed;
}

export function isActivateSessionPayload(payload: unknown): payload is ActivateSessionPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const typed = payload as { type?: unknown; sessionId?: unknown };
  return typed.type === ACTIVATE_SESSION_MESSAGE_TYPE && typeof typed.sessionId === 'string';
}

export function dispatchSessionActivation(sessionId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<{ sessionId: string }>(ACTIVATE_SESSION_EVENT, {
      detail: { sessionId },
    }),
  );
}

export function consumeRequestedSessionActivation(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const url = new URL(window.location.href);
  const sessionId = url.searchParams.get(ACTIVATE_SESSION_QUERY_PARAM);
  if (!sessionId) {
    return null;
  }

  url.searchParams.delete(ACTIVATE_SESSION_QUERY_PARAM);
  window.history.replaceState({}, document.title, url);
  return sessionId;
}

function playNotificationSound(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const audio = new Audio('/sounds/notification.mp3');
    audio.play().catch((err: unknown) => {
      if (!notificationAudioWarningLogged) {
        notificationAudioWarningLogged = true;
        console.warn('[notifications] Notification sound playback failed', err);
      }
    });
  } catch (error) {
    if (!notificationAudioWarningLogged) {
      notificationAudioWarningLogged = true;
      console.warn('[notifications] Failed to play notification sound', error);
    }
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!canUseNotifications()) {
    return 'denied';
  }

  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }

  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  return (await requestNotificationPermission()) === 'granted';
}

export async function showBrowserNotification(
  title: string,
  body: string,
  sessionId: string,
  projectName?: string,
): Promise<boolean> {
  // Check user settings first — respect per-device notification preference
  const settings = getSettings();
  if (!settings.notificationsEnabled) {
    return false;
  }

  if (!canUseNotifications()) {
    return false;
  }

  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    return false;
  }

  const titleWithProject =
    typeof projectName === 'string' && projectName.trim().length > 0
      ? `${projectName}: ${title}`
      : title;

  const bodyWithProject =
    typeof projectName === 'string' && projectName.trim().length > 0
      ? `${body}\nProject: ${projectName}`
      : body;

  const payload = {
    sessionId,
    projectName,
    timestamp: Date.now(),
  };

  void playNotificationSound();

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification(titleWithProject, {
          body: bodyWithProject,
          tag: `opencode-${sessionId}`,
          renotify: true,
          silent: false,
          data: payload,
        });
        return true;
      }
    }

    const notification = new Notification(titleWithProject, {
      body: bodyWithProject,
      tag: `opencode-${sessionId}`,
      silent: false,
      data: payload,
    });

    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        // ignore focus failures
      }
      dispatchSessionActivation(sessionId);
      notification.close();
    };

    return true;
  } catch {
    return false;
  }
}
