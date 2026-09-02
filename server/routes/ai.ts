import type { Express } from "express";
import type { ServerContext } from "../context";
import { getAiConfig } from "../lib/ai";

export function registerAiRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser, activity } = ctx;

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

  /**
   * Which providers can serve the configured model, and what each one costs.
   *
   * Provider IDs are not guessable and differ per model, so this asks NanoGPT
   * rather than making the user find them. `supportsProviderSelection` is the
   * field that matters: when it is false the setting is inert for that model,
   * and knowing that is better than wondering why pinning one changed nothing.
   *
   * Deliberately not under /api/v1 upstream, and the model ID has to be
   * URL-encoded because it usually contains a slash.
   */
  app.get("/api/ai/providers", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const config = getAiConfig(db, userId as string);
      if (!config) return res.status(400).json({ error: "AI is not configured." });

      const model = (req.query.model as string) || config.model;
      const url = `https://nano-gpt.com/api/models/${encodeURIComponent(model)}/providers`;
      const upstream = await fetch(url, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!upstream.ok) {
        return res.status(502).json({ error: `${upstream.status} ${(await upstream.text()).slice(0, 300)}`, model });
      }
      const body: any = await upstream.json();
      res.json({
        model,
        configured: config.provider || null,
        supportsProviderSelection: body?.supportsProviderSelection ?? null,
        defaultPrice: body?.defaultPrice ?? null,
        providers: body?.providers ?? [],
      });
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  app.post("/api/nano-gpt/chat/completions", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      // Dormant accounts cost nothing: this call spends tokens.
      if (!activity.requireActive(userId as string, res)) return;
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
      // Dormant accounts cost nothing: this call spends tokens.
      if (!activity.requireActive(userId as string, res)) return;
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
