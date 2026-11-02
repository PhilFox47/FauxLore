import type { Express } from "express";
import type { ServerContext } from "../context";

const validTimeframe = (value: unknown): value is "week" | "month" | "year" =>
  value === "week" || value === "month" || value === "year";

function validTimeId(timeframe: string, value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (timeframe === "week") return /^\d{4}-W\d{2}$/.test(value);
  if (timeframe === "month") return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
  return /^\d{4}$/.test(value);
}

export function registerRecapRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser } = ctx;

  app.get("/api/recaps", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const rows = db.prepare("SELECT * FROM ai_recaps WHERE userId = ?").all(userId) as any[];
      res.json(rows.map(r => ({
        ...r,
        data: r.data ? JSON.parse(r.data) : null
      })));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/recaps", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const payload = req.body || {};
      if (!validTimeframe(payload.timeframe) || !validTimeId(payload.timeframe, payload.timeId)) {
        return res.status(400).json({ error: "Invalid recap period" });
      }

      const id = typeof payload.id === "string" && payload.id ? payload.id : Math.random().toString(36).slice(2, 11);
      // Saving a rewritten recap invalidates its former achievements. Both operations
      // are in one transaction, so a failed recap write cannot destroy the archive.
      db.transaction(() => {
        db.prepare(
          "INSERT INTO ai_recaps (id, userId, timeframe, timeId, title, summary, data) " +
          "VALUES (@id, @userId, @timeframe, @timeId, @title, @summary, @data) " +
          "ON CONFLICT(userId, timeframe, timeId) DO UPDATE SET " +
          "title=excluded.title, summary=excluded.summary, data=excluded.data"
        ).run({
          id,
          userId,
          timeframe: payload.timeframe,
          timeId: payload.timeId,
          title: typeof payload.title === "string" ? payload.title : null,
          summary: typeof payload.summary === "string" ? payload.summary : null,
          data: payload.data ? JSON.stringify(payload.data) : null
        });
        db.prepare("DELETE FROM generated_achievements WHERE userId = ? AND timeframe = ? AND timeId = ?")
          .run(userId, payload.timeframe, payload.timeId);
      })();
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.get("/api/achievements", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      res.json(db.prepare(
        "SELECT timeframe, timeId, position, title, description, reward, subject, createdAt " +
        "FROM generated_achievements WHERE userId = ? ORDER BY timeId DESC, timeframe, position"
      ).all(userId));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/achievements", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const { timeframe, timeId, generationId, achievements } = req.body || {};
      if (!validTimeframe(timeframe) || !validTimeId(timeframe, timeId)) {
        return res.status(400).json({ error: "Invalid achievement period" });
      }
      if (!Array.isArray(achievements) || achievements.length < 1 || achievements.length > 3) {
        return res.status(400).json({ error: "Expected 1-3 achievements" });
      }
      const clean = achievements.map((a: any) => {
        const title = typeof a?.title === "string" ? a.title.trim() : "";
        const description = typeof a?.description === "string" ? a.description.trim() : "";
        const reward = typeof a?.reward === "string" ? a.reward.trim() : "";
        const subject = typeof a?.subject === "string" ? a.subject.trim() : "";
        if (!title || !description || !reward || title.length > 120 ||
            description.length > 5000 || reward.length > 3000 || subject.length > 240) {
          throw new Error("Invalid achievement content");
        }
        return { title, description, reward, subject };
      });
      const titles = new Set(clean.map(a => a.title.toLowerCase()));
      if (titles.size !== clean.length) return res.status(400).json({ error: "Duplicate achievement titles" });

      // Reject late responses from a previous recap rewrite or another browser tab.
      // Legacy recaps without a generationId can still receive achievements on retry.
      const recap = db.prepare(
        "SELECT data FROM ai_recaps WHERE userId = ? AND timeframe = ? AND timeId = ?"
      ).get(userId, timeframe, timeId) as { data: string | null } | undefined;
      if (!recap) return res.status(404).json({ error: "Recap not found" });
      const currentGeneration = recap.data ? (JSON.parse(recap.data)?.generationId || null) : null;
      if (currentGeneration !== (generationId || null)) {
        return res.status(409).json({ error: "Recap was regenerated. Discarding stale achievements." });
      }

      db.transaction(() => {
        // Check again INSIDE the transaction, then atomically replace this period's set.
        const current = db.prepare(
          "SELECT data FROM ai_recaps WHERE userId = ? AND timeframe = ? AND timeId = ?"
        ).get(userId, timeframe, timeId) as { data: string | null } | undefined;
        const token = current?.data ? (JSON.parse(current.data)?.generationId || null) : null;
        if (!current || token !== (generationId || null)) throw new Error("Recap changed during achievement generation");
        db.prepare("DELETE FROM generated_achievements WHERE userId = ? AND timeframe = ? AND timeId = ?")
          .run(userId, timeframe, timeId);
        const insert = db.prepare(
          "INSERT INTO generated_achievements " +
          "(userId, timeframe, timeId, position, title, description, reward, subject) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        );
        clean.forEach((a, position) => {
          insert.run(userId, timeframe, timeId, position, a.title, a.description, a.reward, a.subject);
        });
      })();
      res.json({ success: true, count: clean.length });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });
}
