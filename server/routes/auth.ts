import type { Express } from "express";
import type { ServerContext } from "../context";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";

export function registerAuthRoutes(app: Express, ctx: ServerContext) {
  const { db } = ctx;

  app.post("/api/auth/login", (req, res) => {
    try {
      const { username, password, stayLoggedIn } = req.body;
      const user: any = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      
      let isValidPass = false;
      if (user) {
        // Fallback for plain text 'admin' password from before migration
        if (user.passwordHash === 'admin' && password === 'admin') {
           isValidPass = true;
           // Auto-migrate the hash
           const newHash = bcrypt.hashSync(password, 10);
           db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(newHash, user.id);
        } else {
           isValidPass = bcrypt.compareSync(password, user.passwordHash);
        }
      }

      if (!user || !isValidPass) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const token = uuidv4();
      const expiresAt = new Date();
      if (stayLoggedIn) {
        expiresAt.setDate(expiresAt.getDate() + 14);
      } else {
        expiresAt.setHours(expiresAt.getHours() + 24);
      }
      
      db.prepare('INSERT INTO sessions (token, userId, expiresAt) VALUES (?, ?, ?)').run(token, user.id, expiresAt.toISOString());
      
      const safeUser = { id: user.id, username: user.username, role: user.role, profilePic: user.profilePic, bio: user.bio };
      res.json({ token, user: safeUser });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  /**
   * Self-service registration. Username + password only, since there is no mail
   * server to verify addresses against.
   *
   * The role is never taken from the request: a new account is always a plain
   * User, otherwise anyone could register themselves an admin.
   */
  app.post("/api/auth/register", (req, res) => {
    try {
      const username = String(req.body?.username ?? "").trim();
      const password = String(req.body?.password ?? "");

      if (username.length < 3 || username.length > 32) {
        return res.status(400).json({ error: "Username must be 3-32 characters." });
      }
      if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
        return res.status(400).json({ error: "Username can only contain letters, numbers, and . _ -" });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters." });
      }

      // Case-insensitive uniqueness, so "Phil" and "phil" can't both exist and
      // confuse who is logging in.
      const existing = db
        .prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE")
        .get(username);
      if (existing) return res.status(409).json({ error: "That username is taken." });

      const id = uuidv4();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO users (id, username, passwordHash, role, createdAt, updatedAt, lastActiveAt)
         VALUES (?, ?, ?, 'User', ?, ?, ?)`,
      ).run(id, username, bcrypt.hashSync(password, 10), now, now, now);

      // Log straight in, so registering doesn't dead-end on the login form.
      const token = uuidv4();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 14);
      db.prepare("INSERT INTO sessions (token, userId, expiresAt) VALUES (?, ?, ?)").run(
        token,
        id,
        expiresAt.toISOString(),
      );

      console.log(`[auth] New account registered: ${username}`);
      res.json({ token, user: { id, username, role: "User", profilePic: null, bio: null } });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
         db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      }
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.get("/api/auth/me", (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'No token' });
      
      db.prepare('DELETE FROM sessions WHERE expiresAt < ?').run(new Date().toISOString());
      
      const session: any = db.prepare('SELECT userId, impersonatedBy FROM sessions WHERE token = ?').get(token);
      if (!session) return res.status(401).json({ error: 'Session expired' });

      const user: any = db.prepare('SELECT * FROM users WHERE id = ?').get(session.userId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const safeUser = { id: user.id, username: user.username, role: user.role, profilePic: user.profilePic, bio: user.bio };

      // Tell the client when it is viewing someone else's account, so it can show
      // the banner and offer a way back instead of silently acting as them.
      let impersonating = null;
      if (session.impersonatedBy) {
        const admin: any = db.prepare('SELECT username FROM users WHERE id = ?').get(session.impersonatedBy);
        impersonating = { byUserId: session.impersonatedBy, byUsername: admin?.username || 'admin' };
      }

      res.json({ user: safeUser, impersonating });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

}
