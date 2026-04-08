export const ACTIVATE_SESSION_MESSAGE_TYPE = 'ACTIVATE_SESSION';
export const ACTIVATE_SESSION_EVENT = 'opencode:activate-session';
export const ACTIVATE_SESSION_QUERY_PARAM = 'activateSession';

import { getSettings } from './settings';

type ActivateSessionPayload = {
  type: typeof ACTIVATE_SESSION_MESSAGE_TYPE;
  sessionId: string;
};

let notificationAudioWarningLogged = false;

export function setupNotificationAudioUnlock(): void {
  // No-op: HTML5 Audio does not require explicit AudioContext unlock gestures.
  // The audio element will play on user-gesture-gated autoplay policies automatically.
}

function canUseNotifications(): boolean {
  return typeof window !== 'undefined' && typeof Notification !== 'undefined';
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
