import type { Express } from "express";
import type { ServerContext } from "../context";
import { getAiConfig } from "../lib/ai";
import { recordAiCallStart, recordAiCall, nextCallId, recordPayload } from "../lib/diagnostics";
import { longRequestDispatcher } from "../lib/httpDispatcher";

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

  /**
   * A raw passthrough, not a wrapper around `nanoGenerateText` — the frontend
   * (recap titles, loot flavor text, the generic AI-text helpers under
   * `nanoGptService.ts`) assembles its own OpenAI-shaped body and calls this
   * directly, entirely bypassing `server/lib/ai.ts`. That is exactly why those
   * calls were invisible to the Diagnostics panel: every start/end row it shows
   * comes from `postChat`, which this route never touches. Logged here
   * instead, on the same `ai` channel with the same start/end pairing, under
   * `scope: "client"` so it reads distinctly from the server-initiated calls.
   */
  app.post("/api/nano-gpt/chat/completions", async (req, res) => {
    const callId = nextCallId();
    const messages: { role?: string; content?: string }[] = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const promptChars = messages.reduce((n, m) => n + String(m?.content || "").length, 0);
    const shape = {
      callId,
      model: String(req.body?.model || "?"),
      scope: "client",
      webSearch: !!req.body?.webSearch?.enabled || /:online\b/.test(String(req.body?.model || "")),
      json: !!req.body?.response_format,
      stream: !!req.body?.stream,
      attempt: 1,
      promptChars,
    };
    const startedAt = Date.now();
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
      recordAiCallStart({ ...shape, userId });
      recordPayload(callId, "client", { prompt: messages.map((m) => `[${m?.role}]\n${m?.content}`).join("\n\n") });

      const remoteRes = await fetch("https://nano-gpt.com/api/v1/chat/completions", {
        method: "POST",
        // Lifts Node's 300s response-header cap — see lib/httpDispatcher.ts.
        // This route was missing it entirely: a non-streamed generation past
        // five minutes (recap synthesis over a whole year of logs, easily)
        // died with a bare "fetch failed" at 300,785ms, the exact failure
        // this fix was already proven against on the Codex's own calls.
        ...(longRequestDispatcher ? { dispatcher: longRequestDispatcher } : {}),
        signal: AbortSignal.timeout(600_000),
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify(req.body)
      } as any);
      const text = await remoteRes.text();
      recordPayload(callId, "client", { reply: text });

      let usage: any, reply: any, finishReason: string | undefined;
      try {
        const parsed = JSON.parse(text);
        usage = parsed?.usage;
        reply = parsed?.choices?.[0]?.message?.content;
        finishReason = parsed?.choices?.[0]?.finish_reason;
      } catch { /* not JSON, or an error body — the payload capture above still has it */ }

      const ownPromptTokens = Math.ceil(promptChars / 4);
      recordAiCall({
        ...shape,
        userId,
        durationMs: Date.now() - startedAt,
        httpStatus: remoteRes.status,
        promptTokens: usage?.prompt_tokens,
        completionTokens: usage?.completion_tokens,
        reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens,
        injectedTokens: usage?.prompt_tokens != null ? Math.max(0, usage.prompt_tokens - ownPromptTokens) : undefined,
        finishReason,
        error: !remoteRes.ok ? `HTTP ${remoteRes.status}` : (!reply ? "empty reply" : undefined),
      });

      res.status(remoteRes.status).send(text);
    } catch (e: any) {
      recordAiCall({ ...shape, durationMs: Date.now() - startedAt, error: String(e?.message || e) });
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/nano-gpt/images/generations", async (req, res) => {
    const callId = nextCallId();
    const prompt = String(req.body?.prompt || "");
    const shape = { callId, model: String(req.body?.model || "?"), scope: "client-image", attempt: 1, promptChars: prompt.length };
    const startedAt = Date.now();
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
      recordAiCallStart({ ...shape, userId });
      recordPayload(callId, "client-image", { prompt: JSON.stringify(req.body, null, 2) });

      const remoteRes = await fetch("https://nano-gpt.com/api/v1/images/generations", {
        method: "POST",
        // Same 300s-cap fix as the chat-completions route above, for the
        // same reason — a slow render should not die with a bare "fetch
        // failed" just because it crossed Node's default header timeout.
        ...(longRequestDispatcher ? { dispatcher: longRequestDispatcher } : {}),
        signal: AbortSignal.timeout(180_000),
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify(req.body)
      } as any);
      const text = await remoteRes.text();
      recordPayload(callId, "client-image", { reply: text });

      recordAiCall({
        ...shape,
        userId,
        durationMs: Date.now() - startedAt,
        httpStatus: remoteRes.status,
        error: !remoteRes.ok ? `HTTP ${remoteRes.status}` : undefined,
      });

      res.status(remoteRes.status).send(text);
    } catch (e: any) {
      recordAiCall({ ...shape, durationMs: Date.now() - startedAt, error: String(e?.message || e) });
      res.status(500).json({ error: String(e) });
    }
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
