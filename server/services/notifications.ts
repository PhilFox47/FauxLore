import { v4 as uuidv4 } from "uuid";
import type { Db } from "../context";

/**
 * Persistent notifications.
 *
 * Toasts only exist while the app is open, so anything detected by a nightly job
 * was effectively invisible unless the user happened to be looking. These are
 * stored, survive restarts, and are marked read explicitly.
 *
 * Every notification carries a dedupeKey that identifies the *event*, not the
 * moment it was noticed. Producers run on a schedule and re-observe the same facts
 * every night, so the key is what keeps a released game from being announced daily
 * forever. Insert is ON CONFLICT DO NOTHING against UNIQUE(userId, dedupeKey).
 */

export type NotificationType =
  | "media_update"
  | "media_released"
  | "recap_ready"
  | "boss_expiring";

export interface NewNotification {
  type: NotificationType;
  title: string;
  body?: string;
  mediaId?: string;
  link?: string;
  dedupeKey: string;
}

export function createNotifications(db: Db) {
  /** Records a notification. Returns true only when it was genuinely new. */
  const notify = (userId: string, n: NewNotification): boolean => {
    try {
      const res = db
        .prepare(
          `INSERT INTO notifications (id, userId, type, title, body, mediaId, link, dedupeKey, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(userId, dedupeKey) DO NOTHING`,
        )
        .run(
          uuidv4(),
          userId,
          n.type,
          n.title,
          n.body ?? null,
          n.mediaId ?? null,
          n.link ?? null,
          n.dedupeKey,
          new Date().toISOString(),
        );
      return res.changes > 0;
    } catch (e) {
      console.error("[notifications] Failed to record notification", e);
      return false;
    }
  };

  /**
   * Unreleased items whose expected release date has arrived.
   * The key is tied to the date so a rescheduled release notifies again, while an
   * unchanged one stays quiet.
   */
  const checkReleases = (userId: string): number => {
    let created = 0;
    try {
      const now = new Date();
      const rows: any[] = db
        .prepare(
          `SELECT id, title, mediaType, expectedReleaseDate
             FROM media
            WHERE userId = ? AND status = 'Unreleased'
              AND expectedReleaseDate IS NOT NULL AND expectedReleaseDate != ''`,
        )
        .all(userId);

      for (const row of rows) {
        const due = new Date(row.expectedReleaseDate);
        if (isNaN(due.getTime()) || due.getTime() > now.getTime()) continue;
        const day = row.expectedReleaseDate.slice(0, 10);
        if (
          notify(userId, {
            type: "media_released",
            title: `${row.title} is out`,
            body: `This ${String(row.mediaType).toLowerCase()} was expected on ${day}. Move it out of Unreleased when you pick it up.`,
            mediaId: row.id,
            link: `/library/${encodeURIComponent(row.mediaType)}`,
            dedupeKey: `released:${row.id}:${day}`,
          })
        ) {
          created++;
        }
      }
    } catch (e) {
      console.error("[notifications] Release check failed", e);
    }
    return created;
  };

  /**
   * A finished period worth looking back on. Fires once per interval, the day after
   * it closes, so the recap covers a complete week/month/year.
   */
  const checkRecapsReady = (userId: string, now = new Date()): number => {
    let created = 0;
    try {
      // Only bother if the user actually logged something in that period.
      const hasActivity = (from: Date, to: Date) =>
        (
          db
            .prepare(
              `SELECT COUNT(*) n FROM logs
                WHERE userId = ? AND isHistoric = 0
                  AND timestamp >= ? AND timestamp < ? AND metricType != 'statusChange'`,
            )
            .get(userId, from.toISOString(), to.toISOString()) as any
        ).n > 0;

      const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

      // Previous ISO week (weeks start Monday)
      const today = startOfDay(now);
      const dow = (today.getDay() + 6) % 7; // Mon = 0
      const thisWeekStart = new Date(today);
      thisWeekStart.setDate(today.getDate() - dow);
      const lastWeekStart = new Date(thisWeekStart);
      lastWeekStart.setDate(thisWeekStart.getDate() - 7);
      if (hasActivity(lastWeekStart, thisWeekStart)) {
        const key = lastWeekStart.toISOString().slice(0, 10);
        if (
          notify(userId, {
            type: "recap_ready",
            title: "Your weekly recap is ready",
            body: `The week of ${key} is complete. See how it went.`,
            link: "/recaps",
            dedupeKey: `recap:week:${key}`,
          })
        ) {
          created++;
        }
      }

      // Previous month
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      if (hasActivity(lastMonthStart, thisMonthStart)) {
        const key = `${lastMonthStart.getFullYear()}-${String(lastMonthStart.getMonth() + 1).padStart(2, "0")}`;
        if (
          notify(userId, {
            type: "recap_ready",
            title: "Your monthly recap is ready",
            body: `${key} is in the books.`,
            link: "/recaps",
            dedupeKey: `recap:month:${key}`,
          })
        ) {
          created++;
        }
      }

      // Previous year
      const thisYearStart = new Date(now.getFullYear(), 0, 1);
      const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
      if (hasActivity(lastYearStart, thisYearStart)) {
        const key = String(lastYearStart.getFullYear());
        if (
          notify(userId, {
            type: "recap_ready",
            title: `Your ${key} recap is ready`,
            body: "A whole year of it. Take a look.",
            link: "/recaps",
            dedupeKey: `recap:year:${key}`,
          })
        ) {
          created++;
        }
      }
    } catch (e) {
      console.error("[notifications] Recap check failed", e);
    }
    return created;
  };

  /** World bosses close to expiring, so they can be salvaged rather than failed. */
  const checkExpiringBosses = (userId: string, withinHours = 48): number => {
    let created = 0;
    try {
      const now = Date.now();
      const rows: any[] = db
        .prepare("SELECT id, name, expiresAt, mediaId FROM world_bosses WHERE userId = ? AND status = 'Active'")
        .all(userId);
      for (const b of rows) {
        const left = new Date(b.expiresAt).getTime() - now;
        if (isNaN(left) || left <= 0 || left > withinHours * 3600_000) continue;
        if (
          notify(userId, {
            type: "boss_expiring",
            title: `${b.name} expires soon`,
            body: `About ${Math.max(1, Math.round(left / 3600_000))}h left to finish this one.`,
            mediaId: b.mediaId,
            link: "/lorekeeper",
            dedupeKey: `boss_expiring:${b.id}`,
          })
        ) {
          created++;
        }
      }
    } catch (e) {
      console.error("[notifications] Boss expiry check failed", e);
    }
    return created;
  };

  /** Runs every producer for one user. */
  const runAllChecks = (userId: string): number =>
    checkReleases(userId) + checkRecapsReady(userId) + checkExpiringBosses(userId);

  const runForAllUsers = () => {
    const users = db.prepare("SELECT id FROM users").all() as { id: string }[];
    for (const u of users) {
      const n = runAllChecks(u.id);
      if (n > 0) console.log(`[notifications] ${n} new notification(s) for user ${u.id}`);
    }
  };

  return { notify, checkReleases, checkRecapsReady, checkExpiringBosses, runAllChecks, runForAllUsers };
}
