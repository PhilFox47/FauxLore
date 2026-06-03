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
      
      const session: any = db.prepare('SELECT userId FROM sessions WHERE token = ?').get(token);
      if (!session) return res.status(401).json({ error: 'Session expired' });
      
      const user: any = db.prepare('SELECT * FROM users WHERE id = ?').get(session.userId);
      if (!user) return res.status(404).json({ error: 'User not found' });
      
      const safeUser = { id: user.id, username: user.username, role: user.role, profilePic: user.profilePic, bio: user.bio };
      
      res.json({ user: safeUser });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

}
