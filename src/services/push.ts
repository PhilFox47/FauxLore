import { apiFetch } from './db';

/**
 * Web Push registration, browser side.
 *
 * The awkward parts of this API are all environmental rather than logical, so
 * `pushSupport()` reports what is actually wrong instead of letting the button
 * fail silently: service workers need a secure context, iOS only allows push
 * once the site has been installed to the home screen, and a permission the user
 * has already denied cannot be asked for again from script.
 */

export type PushBlocker =
  | 'ok'
  | 'insecure'
  | 'unsupported'
  | 'ios-needs-install'
  | 'denied';

export interface PushSupport {
  blocker: PushBlocker;
  /** What to tell the user, in the case where they cannot simply be asked. */
  message?: string;
}

const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  // iPadOS reports itself as a Mac, and is only distinguishable by touch.
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as any).standalone === true;

/** Whether push can work here at all, and why not when it cannot. */
export function pushSupport(): PushSupport {
  // Secure context covers https and localhost, which is exactly the rule.
  if (!window.isSecureContext) {
    return {
      blocker: 'insecure',
      message:
        'Push needs a secure connection. Open FauxLore over HTTPS (or on localhost) — a plain http:// address on your network will not work.',
    };
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    if (isIos() && !isStandalone()) {
      return {
        blocker: 'ios-needs-install',
        message:
          'On iPhone and iPad, push only works once FauxLore is installed: open it in Safari, tap Share, then "Add to Home Screen", and turn this on from there.',
      };
    }
    return { blocker: 'unsupported', message: 'This browser does not support push notifications.' };
  }
  if (isIos() && !isStandalone()) {
    return {
      blocker: 'ios-needs-install',
      message:
        'On iPhone and iPad, push only works once FauxLore is installed: open it in Safari, tap Share, then "Add to Home Screen", and turn this on from there.',
    };
  }
  if (Notification.permission === 'denied') {
    return {
      blocker: 'denied',
      message:
        'Notifications are blocked for this site. Allow them in your browser settings, then try again.',
    };
  }
  return { blocker: 'ok' };
}

/** The VAPID key arrives base64url; PushManager wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

/**
 * Asks permission, subscribes, and tells the server. Returns the device count
 * so the caller can say something concrete.
 */
export async function enablePush(): Promise<{ devices: number }> {
  const support = pushSupport();
  if (support.blocker !== 'ok') throw new Error(support.message || 'Push is not available here.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permission was not granted.');

  const keyRes = await apiFetch('/api/push/key');
  if (!keyRes.ok) throw new Error('Could not read the server key.');
  const { publicKey } = await keyRes.json();
  if (!publicKey) throw new Error('The server has no push key configured.');

  const reg = await registration();
  await navigator.serviceWorker.ready;

  // An existing subscription made against a different key must go, or the push
  // service will keep accepting messages this server cannot sign.
  const current = await reg.pushManager.getSubscription();
  if (current) await current.unsubscribe().catch(() => {});

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
  });

  const res = await apiFetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (!res.ok) throw new Error('The server rejected the subscription.');
  return res.json();
}

/** Unsubscribes this device only. Other devices keep receiving. */
export async function disablePush(): Promise<{ devices: number }> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    await apiFetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  const res = await apiFetch('/api/push/status');
  return res.ok ? res.json() : { devices: 0 };
}

/** Whether THIS device is subscribed, which is not the same as the account. */
export async function isThisDeviceSubscribed(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration('/');
  if (!reg) return false;
  return !!(await reg.pushManager.getSubscription());
}

export async function pushStatus(): Promise<{ devices: number; configured: boolean; enabled: boolean; types: string[] }> {
  const res = await apiFetch('/api/push/status');
  if (!res.ok) throw new Error('Could not read push status.');
  return res.json();
}

export async function sendTestPush(): Promise<{ sent: number; failed: number }> {
  const res = await apiFetch('/api/push/test', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || 'The test push failed.');
  }
  return res.json();
}
