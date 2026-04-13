import webpush from 'web-push';

import type { AppConfig } from '../config/index.js';
import { saveConfig } from '../config/index.js';
import {
  listPushSubscriptions,
  removePushSubscriptionByEndpoint,
  type Database,
} from '../db/index.js';

interface PushSubscriptionPayload {
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
}

export function ensureVapidConfig(config: AppConfig): AppConfig {
  if (
    typeof config.push.vapidPublicKey === 'string' &&
    config.push.vapidPublicKey.trim().length > 0 &&
    typeof config.push.vapidPrivateKey === 'string' &&
    config.push.vapidPrivateKey.trim().length > 0
  ) {
    return config;
  }

  const generated = webpush.generateVAPIDKeys();
  const updated: AppConfig = {
    ...config,
    push: {
      vapidSubject:
        typeof config.push.vapidSubject === 'string' && config.push.vapidSubject.trim().length > 0
          ? config.push.vapidSubject
          : 'mailto:admin@localhost',
      vapidPublicKey: generated.publicKey,
      vapidPrivateKey: generated.privateKey,
    },
  };

  saveConfig(updated);
  return updated;
}

export function configureWebPush(config: AppConfig): void {
  webpush.setVapidDetails(
    config.push.vapidSubject || 'mailto:admin@localhost',
    config.push.vapidPublicKey,
    config.push.vapidPrivateKey,
  );
}

export function isValidPushSubscription(payload: unknown): payload is PushSubscriptionPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const typed = payload as { endpoint?: unknown; keys?: unknown };
  if (typeof typed.endpoint !== 'string' || typed.endpoint.trim().length === 0) {
    return false;
  }

  if (!typed.keys || typeof typed.keys !== 'object') {
    return false;
  }

  const keys = typed.keys as { p256dh?: unknown; auth?: unknown };
  return (
    typeof keys.p256dh === 'string' &&
    keys.p256dh.length > 0 &&
    typeof keys.auth === 'string' &&
    keys.auth.length > 0
  );
}

export function encodePushKeys(subscription: PushSubscriptionPayload): string {
  const keys = {
    p256dh:
      subscription.keys && typeof subscription.keys.p256dh === 'string'
        ? subscription.keys.p256dh
        : '',
    auth:
      subscription.keys && typeof subscription.keys.auth === 'string' ? subscription.keys.auth : '',
  };

  return JSON.stringify(keys);
}

function decodePushSubscription(
  endpoint: string,
  keysJson: string,
): webpush.PushSubscription | null {
  let parsedKeys: unknown;

  try {
    parsedKeys = JSON.parse(keysJson) as unknown;
  } catch {
    return null;
  }

  if (!parsedKeys || typeof parsedKeys !== 'object') {
    return null;
  }

  const keys = parsedKeys as { p256dh?: unknown; auth?: unknown };
  if (typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
    return null;
  }

  return {
    endpoint,
    keys: {
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  };
}

function isGoneStatusCode(statusCode: unknown): boolean {
  return statusCode === 404 || statusCode === 410;
}

export async function sendPushNotification(
  db: Database,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const subscriptions = listPushSubscriptions(db);
  if (subscriptions.length === 0) {
    return;
  }

  const payload = JSON.stringify({ title, body, data });

  await Promise.all(
    subscriptions.map(async (entry) => {
      const subscription = decodePushSubscription(entry.endpoint, entry.keys);
      if (!subscription) {
        removePushSubscriptionByEndpoint(db, entry.endpoint);
        return;
      }

      try {
        await webpush.sendNotification(subscription, payload);
      } catch (error) {
        const statusCode =
          error && typeof error === 'object' && 'statusCode' in error
            ? (error as { statusCode?: unknown }).statusCode
            : undefined;

        if (isGoneStatusCode(statusCode)) {
          removePushSubscriptionByEndpoint(db, entry.endpoint);
        } else {
          console.warn('[push] Delivery failed for endpoint', entry.endpoint.slice(0, 60), error);
        }
      }
    }),
  );
}
