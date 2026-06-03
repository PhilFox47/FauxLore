import type { Express } from "express";
import type { ServerContext } from "../context";

export function registerOracleRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser, generateOracleMessage } = ctx;

  app.get("/api/oracle", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const rows = db.prepare('SELECT * FROM oracle_messages WHERE userId = ? ORDER BY timestamp DESC LIMIT 5').all(userId);
      res.json(rows);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/oracle/generate", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const hour = new Date().getHours();
      const type = hour < 12 ? 'morning' : 'evening';
      await generateOracleMessage(userId, type);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

}
