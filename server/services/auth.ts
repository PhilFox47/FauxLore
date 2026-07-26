import type { Db } from "../context";

/** Builds the session-token auth resolver used by protected routes. */
export function createGetAuthUser(db: Db) {
  // Last-active is refreshed at most this often. Every authenticated request
  // passes through here, so writing each time would mean a DB write per request
  // for a value only ever read at minute granularity.
  const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;
  const lastTouched = new Map<string, number>();

  const touchActivity = (userId: string) => {
    const now = Date.now();
    const previous = lastTouched.get(userId) ?? 0;
    if (now - previous < ACTIVITY_THROTTLE_MS) return;
    lastTouched.set(userId, now);
    try {
      db.prepare('UPDATE users SET lastActiveAt = ? WHERE id = ?').run(new Date(now).toISOString(), userId);
    } catch {
      /* activity tracking must never break a request */
    }
  };

  const getAuthUser = (req: any, res?: any) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      if (res) res.status(401).json({ error: 'Unauthorized' });
      return null;
    }
    const session: any = db.prepare('SELECT userId, expiresAt FROM sessions WHERE token = ?').get(token);
    if (!session || new Date(session.expiresAt) < new Date()) {
      if (res) res.status(401).json({ error: 'Unauthorized' });
      return null;
    }
    touchActivity(session.userId);
    return session.userId;
  };
  return getAuthUser;
}
