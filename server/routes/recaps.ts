import type { Express } from "express";
import type { ServerContext } from "../context";

export function registerRecapRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser } = ctx;

  app.get("/api/recaps", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const rows = db.prepare('SELECT * FROM ai_recaps WHERE userId = ?').all(userId) as any[];
      res.json(rows.map(r => ({
        ...r,
        data: r.data ? JSON.parse(r.data) : null
      })));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/recaps", (req, res) => {
    try {
      const payload = req.body;
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const id = payload.id || Math.random().toString(36).substr(2, 9);
      db.prepare(`
        INSERT INTO ai_recaps (id, userId, timeframe, timeId, title, summary, data)
        VALUES (@id, @userId, @timeframe, @timeId, @title, @summary, @data)
        ON CONFLICT(userId, timeframe, timeId) DO UPDATE SET
          title=excluded.title, summary=excluded.summary, data=excluded.data
      `).run({
        id,
        userId,
        timeframe: payload.timeframe,
        timeId: payload.timeId,
        title: payload.title || null,
        summary: payload.summary || null,
        data: payload.data ? JSON.stringify(payload.data) : null
      });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

}
