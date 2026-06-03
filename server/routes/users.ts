import type { Express } from "express";
import type { ServerContext } from "../context";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";

export function registerUserRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser } = ctx;

  app.get("/api/users", (req, res) => {
     try {
       const actingUserId = getAuthUser(req, res);
      if (!actingUserId) return;
       if (!actingUserId) return res.status(401).json({ error: 'Unauthorized' });
       
       const rows = db.prepare('SELECT id, username, role, profilePic, bio, createdAt, updatedAt FROM users').all();
       res.json(rows);
     } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/users", (req, res) => {
     try {
       const actingUserId = getAuthUser(req, res);
      if (!actingUserId) return;
       const actingUser: any = db.prepare('SELECT role FROM users WHERE id = ?').get(actingUserId);
       if (actingUser?.role !== 'Admin') {
         return res.status(403).json({ error: 'Only admins can create users' });
       }

       const { username, password, role } = req.body;
       const id = uuidv4();
       const hash = bcrypt.hashSync(password, 10);
       db.prepare(`
         INSERT INTO users (id, username, passwordHash, role, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)
       `).run(id, username, hash, role || 'User', new Date().toISOString(), new Date().toISOString());
       res.json({ id, username, role });
     } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.put("/api/users/:id", (req, res) => {
    try {
      const actingUserId = getAuthUser(req, res);
      if (!actingUserId) return;
      const actingUser: any = db.prepare('SELECT role FROM users WHERE id = ?').get(actingUserId);
      const id = req.params.id;

      if (actingUserId !== id && actingUser?.role !== 'Admin') {
        return res.status(403).json({ error: 'Unauthorized to modify this user' });
      }

      const { username, password, role, profilePic, bio } = req.body;
      const user: any = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      if (!user) return res.status(404).json({ error: 'User not found' });

      let hash = null;
      if (password) {
         hash = bcrypt.hashSync(password, 10);
      }

      let finalRole = role;
      // If user is not Admin, they cannot modify roles
      if (actingUser?.role !== 'Admin') {
        finalRole = null;
      }

      db.prepare(`
        UPDATE users SET 
          username = COALESCE(?, username),
          passwordHash = COALESCE(?, passwordHash),
          role = COALESCE(?, role),
          profilePic = COALESCE(?, profilePic),
          bio = COALESCE(?, bio),
          updatedAt = ?
        WHERE id = ?
      `).run(username || null, hash, finalRole || null, profilePic || null, bio || null, new Date().toISOString(), id);
      
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.delete("/api/users/:id", (req, res) => {
     try {
        db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
        res.json({ success: true });
     } catch (e) { res.status(500).json({ error: String(e) }); }
  });

}
