import type { Express } from "express";
import type { ServerContext } from "../context";

export function registerFranchiseRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser } = ctx;

  app.get("/api/franchises", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const f = db.prepare('SELECT * FROM franchises WHERE userId = ?').all(userId);
      res.json(f);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/franchises", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      
      const { name, coverImageUrl, description } = req.body;
      if (!name) return res.status(400).json({ error: "Name is required" });
      
      const id = req.body.id || crypto.randomUUID();
      
      const stmt = db.prepare(`
        INSERT INTO franchises (id, userId, name, coverImageUrl, description)
        VALUES (@id, @userId, @name, @coverImageUrl, @description)
        ON CONFLICT(userId, name) DO UPDATE SET
          coverImageUrl=excluded.coverImageUrl,
          description=excluded.description
      `);
      stmt.run({
        id,
        userId,
        name,
        coverImageUrl: coverImageUrl || null,
        description: description || null
      });
      res.json({ success: true, franchise: { id, userId, name, coverImageUrl, description } });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

}
