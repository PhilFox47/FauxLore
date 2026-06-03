import type { Db } from "../context";

/** Builds the session-token auth resolver used by protected routes. */
export function createGetAuthUser(db: Db) {
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
    return session.userId;
  };
  return getAuthUser;
}
