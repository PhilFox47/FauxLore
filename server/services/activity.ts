import type { Db } from "../context";

/**
 * Dormant accounts stop costing anything.
 *
 * An account that has not logged progress in a week is frozen: the scheduled
 * jobs skip it and every endpoint that spends AI tokens refuses. It thaws the
 * moment a log is written — one entry, and everything resumes.
 *
 * The rule is deliberately "has logged", not "has visited". Opening the app
 * costs nothing worth defending against; enemy generation, recaps and codex
 * lookups are what run up a bill, and there is no reason to run them for
 * someone who has not tracked anything in a week.
 *
 * Activity is measured by when a log was *written*, not the moment it records.
 * Backfilling last year's reading is very much using the app, so it thaws the
 * account even though every timestamp involved is old.
 */

export const INACTIVITY_DAYS = 7;

export interface ActivityState {
  frozen: boolean;
  /** When the account last had a log written, ISO, or null if it never has. */
  lastLogAt: string | null;
  /** Whole days since that, or null when there is nothing to measure from. */
  daysSince: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function createActivityService(db: Db) {
  /**
   * The most recent moment this user wrote a log.
   *
   * COALESCE because `createdAt` only exists on rows written since it was added;
   * older rows fall back to the logged timestamp, which for anything that was not
   * backfilled is the same thing.
   */
  const lastLogAt = (userId: string): string | null => {
    try {
      const row: any = db
        .prepare(
          `SELECT MAX(COALESCE(createdAt, timestamp)) AS at
             FROM logs
            WHERE userId = ? AND metricType != 'statusChange'`,
        )
        .get(userId);
      return row?.at || null;
    } catch {
      return null;
    }
  };

  const stateOf = (userId: string): ActivityState => {
    const at = lastLogAt(userId);
    if (!at) {
      // A brand-new account has never logged anything. Freezing it immediately
      // would mean a new user's first enemy never spawns, so the grace period
      // runs from when the account was created instead.
      const user: any = db.prepare("SELECT createdAt FROM users WHERE id = ?").get(userId);
      const created = user?.createdAt ? Date.parse(user.createdAt) : NaN;
      if (!Number.isFinite(created)) return { frozen: false, lastLogAt: null, daysSince: null };
      const days = (Date.now() - created) / DAY_MS;
      return { frozen: days > INACTIVITY_DAYS, lastLogAt: null, daysSince: Math.floor(days) };
    }
    const days = (Date.now() - Date.parse(at)) / DAY_MS;
    return { frozen: days > INACTIVITY_DAYS, lastLogAt: at, daysSince: Math.floor(days) };
  };

  const isFrozen = (userId: string): boolean => stateOf(userId).frozen;

  /** Every user the scheduled jobs should still do work for. */
  const activeUserIds = (): string[] => {
    const rows = db.prepare("SELECT id FROM users").all() as { id: string }[];
    return rows.map((r) => r.id).filter((id) => !isFrozen(id));
  };

  /**
   * The gate every token-spending endpoint sits behind. Answers 403 and returns
   * false when the account is dormant, so a handler reads:
   *
   *   if (!activity.requireActive(userId, res)) return;
   */
  const requireActive = (userId: string, res: any): boolean => {
    const state = stateOf(userId);
    if (!state.frozen) return true;
    res.status(403).json(frozenResponse(state));
    return false;
  };

  return { lastLogAt, stateOf, isFrozen, activeUserIds, requireActive };
}

export type ActivityService = ReturnType<typeof createActivityService>;

/** The body a frozen account gets back, so the client can explain itself. */
export function frozenResponse(state: ActivityState) {
  return {
    error:
      `This account is paused after ${INACTIVITY_DAYS} days without a log. ` +
      `Log some progress and everything resumes straight away.`,
    frozen: true,
    lastLogAt: state.lastLogAt,
    daysSince: state.daysSince,
  };
}
