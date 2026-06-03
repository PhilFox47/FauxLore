import type { Express } from "express";
import type { ServerContext } from "../context";

export function registerAiRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser } = ctx;

  app.get("/api/ai-text", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const rows = db.prepare('SELECT * FROM ai_text_cache WHERE userId = ?').all(userId);
      const map: Record<string, string> = {};
      rows.forEach((r: any) => map[r.key] = r.value);
      res.json(map);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/ai-text", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const payload = req.body;
      db.prepare(`
        INSERT INTO ai_text_cache (key, userId, value)
        VALUES (@key, @userId, @value)
        ON CONFLICT(userId, key) DO UPDATE SET value=excluded.value
      `).run({
        key: payload.key,
        userId: userId,
        value: payload.value
      });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/nano-gpt/chat/completions", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const apiKey = req.headers['x-nano-gpt-key'];
      if (!apiKey) {
         res.status(401).json({ error: "Missing API key" });
         return;
      }
      const remoteRes = await fetch("https://nano-gpt.com/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify(req.body)
      });
      const text = await remoteRes.text();
      res.status(remoteRes.status).send(text);
    } catch (e: any) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/nano-gpt/images/generations", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const apiKey = req.headers['x-nano-gpt-key'];
      if (!apiKey) {
         res.status(401).json({ error: "Missing API key" });
         return;
      }
      const remoteRes = await fetch("https://nano-gpt.com/api/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify(req.body)
      });
      const text = await remoteRes.text();
      res.status(remoteRes.status).send(text);
    } catch (e: any) { res.status(500).json({ error: String(e) }); }
  });

  app.delete("/api/ai-text", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const key = req.query.key as string;
      if (key) {
        db.prepare('DELETE FROM ai_text_cache WHERE userId = ? AND key = ?').run(userId, key);
      } else {
        db.prepare('DELETE FROM ai_text_cache WHERE userId = ?').run(userId);
      }
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

}
