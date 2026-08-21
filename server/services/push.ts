import { v4 as uuidv4 } from "uuid";
import webpush from "web-push";
import type { Db } from "../context";
import type { NewNotification, NotificationType } from "./notifications";

/**
 * Web Push delivery.
 *
 * The app already records every notable event as a persistent notification with
 * a dedupe key, so this layer deliberately does not decide *what* is worth
 * sending — it hangs off the moment a notification turns out to be genuinely
 * new. That is what stops a nightly producer re-announcing the same released
 * game to a phone every morning: the dedupe already answered that question.
 *
 * Delivery is best-effort and never blocks the thing that triggered it. A push
 * that fails is a push that did not arrive; the notification is in the database
 * either way and the bell will still show it.
 */

/** Which events a user wants on their phone. All on unless they say otherwise. */
export const PUSH_TYPES: NotificationType[] = [
  "media_update",
  "media_released",
  "recap_ready",
  "boss_expiring",
  "inactivity",
];

export interface PushPrefs {
  enabled: boolean;
  types: NotificationType[];
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function createPushService(db: Db) {
  /**
   * The keypair identifying this server to the push services.
   *
   * Generated once and kept, because rotating it silently invalidates every
   * subscription already handed out — every phone would go quiet with nothing
   * to explain why.
   */
  function getVapidKeys(): VapidKeys | null {
    const row: any = db
      .prepare("SELECT vapidPublicKey, vapidPrivateKey, vapidSubject FROM system_settings WHERE id = 'system'")
      .get();
    if (!row?.vapidPublicKey || !row?.vapidPrivateKey) return null;
    return {
      publicKey: row.vapidPublicKey,
      privateKey: row.vapidPrivateKey,
      subject: row.vapidSubject || "mailto:admin@fauxlore.local",
    };
  }

  /** Creates the keypair on first use. Existing keys are never overwritten. */
  function ensureVapidKeys(): VapidKeys {
    const existing = getVapidKeys();
    if (existing) return existing;

    const generated = webpush.generateVAPIDKeys();
    const subject = "mailto:admin@fauxlore.local";
    db.prepare(
      `INSERT INTO system_settings (id, vapidPublicKey, vapidPrivateKey, vapidSubject)
       VALUES ('system', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         vapidPublicKey = excluded.vapidPublicKey,
         vapidPrivateKey = excluded.vapidPrivateKey,
         vapidSubject = COALESCE(system_settings.vapidSubject, excluded.vapidSubject)`,
    ).run(generated.publicKey, generated.privateKey, subject);
    console.log("[push] Generated a new VAPID keypair.");
    return { ...generated, subject };
  }

  /** What this user wants delivered. */
  function prefsFor(userId: string): PushPrefs {
    const row: any = db
      .prepare("SELECT pushEnabled, pushTypes FROM settings WHERE userId = ?")
      .get(userId);
    let types: NotificationType[] = PUSH_TYPES;
    if (row?.pushTypes) {
      try {
        const parsed = JSON.parse(row.pushTypes);
        if (Array.isArray(parsed)) types = parsed;
      } catch { /* a corrupt preference means all of them, not none */ }
    }
    return { enabled: row?.pushEnabled !== 0, types };
  }

  function subscriptionsFor(userId: string) {
    return db
      .prepare("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE userId = ?")
      .all(userId) as { id: string; endpoint: string; p256dh: string; auth: string }[];
  }

  function saveSubscription(userId: string, sub: any, userAgent?: string): boolean {
    const endpoint = String(sub?.endpoint || "");
    const p256dh = String(sub?.keys?.p256dh || "");
    const auth = String(sub?.keys?.auth || "");
    if (!endpoint || !p256dh || !auth) return false;

    // Re-subscribing on the same device returns the same endpoint, so this is an
    // upsert: the keys can be rotated by the browser without a new row.
    db.prepare(
      `INSERT INTO push_subscriptions (id, userId, endpoint, p256dh, auth, userAgent, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         userId = excluded.userId,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         userAgent = excluded.userAgent,
         failureCount = 0`,
    ).run(uuidv4(), userId, endpoint, p256dh, auth, userAgent || null, new Date().toISOString());
    return true;
  }

  function removeSubscription(endpoint: string): boolean {
    return db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint).changes > 0;
  }

  function countFor(userId: string): number {
    const row: any = db.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE userId = ?").get(userId);
    return row?.n || 0;
  }

  /**
   * Sends one payload to every device a user has registered.
   *
   * A 404 or 410 is the push service saying the subscription is gone for good —
   * the browser was uninstalled, the permission revoked, the endpoint expired.
   * Those rows are deleted rather than retried, otherwise a dead phone is
   * re-contacted every night forever.
   */
  async function sendToUser(userId: string, payload: Record<string, unknown>): Promise<{ sent: number; failed: number }> {
    const keys = getVapidKeys();
    if (!keys) return { sent: 0, failed: 0 };

    const subs = subscriptionsFor(userId);
    if (!subs.length) return { sent: 0, failed: 0 };

    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
    const body = JSON.stringify(payload);
    let sent = 0;
    let failed = 0;

    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 24 * 60 * 60 },
        );
        sent++;
        db.prepare("UPDATE push_subscriptions SET lastSuccessAt = ?, failureCount = 0 WHERE id = ?")
          .run(new Date().toISOString(), sub.id);
      } catch (e: any) {
        failed++;
        const status = e?.statusCode;
        if (status === 404 || status === 410) {
          db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(sub.id);
          console.log(`[push] Dropped a subscription the service says is gone (${status}).`);
        } else {
          db.prepare("UPDATE push_subscriptions SET failureCount = failureCount + 1 WHERE id = ?").run(sub.id);
          console.error(`[push] Delivery failed (${status || "no status"}):`, e?.body || e?.message || e);
        }
      }
    }));

    return { sent, failed };
  }

  /**
   * Delivers a notification that has just been recorded, if the user wants it.
   *
   * Fire-and-forget on purpose: the producers that call this are inside cron
   * sweeps and request handlers, and neither should wait on — or fail because
   * of — a push service.
   */
  function deliver(userId: string, n: NewNotification): void {
    const prefs = prefsFor(userId);
    if (!prefs.enabled || !prefs.types.includes(n.type)) return;

    sendToUser(userId, {
      title: n.title,
      body: n.body || "",
      type: n.type,
      link: n.link || "/",
      tag: n.dedupeKey,
    }).catch((e) => console.error("[push] deliver failed", e));
  }

  return {
    getVapidKeys, ensureVapidKeys, prefsFor, saveSubscription, removeSubscription,
    countFor, sendToUser, deliver,
  };
}

export type PushService = ReturnType<typeof createPushService>;
