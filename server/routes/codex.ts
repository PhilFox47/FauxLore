import type { Express } from "express";
import type { ServerContext } from "../context";
import { codexPromptBlock, type CodexRow } from "../services/codex";

/**
 * Codex endpoints.
 *
 * Reading is cheap and never generates: the Media Detail view asks whether a
 * Codex exists and shows it if so. Generation is an explicit POST, used by the
 * "Consult the Codex" button and by auto-tagging, which runs in the browser and
 * needs a Codex before it can classify anything. Enemies and loot are generated
 * on the server and reach the Codex service directly.
 */
export function registerCodexRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser, codex, activity } = ctx;

  // Auto-tagging embeds the Codex in its own prompt from the browser, so the
  // rendered prompt block ships with it and only one formatter ever exists.
  const withPromptBlock = (row: CodexRow | null) =>
    row ? { ...row, promptBlock: codexPromptBlock(row) } : null;

  app.get("/api/media/:id/codex", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const media: any = db.prepare("SELECT title, mediaType FROM media WHERE id = ? AND userId = ?").get(req.params.id, userId);
      const row = codex.getCodexRow(userId, {
        mediaId: req.params.id,
        title: media?.title,
        mediaType: media?.mediaType,
      });
      res.json(withPromptBlock(row));
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  app.post("/api/media/:id/codex", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      // Dormant accounts cost nothing: this call spends tokens.
      if (!activity.requireActive(userId as string, res)) return;
      const media: any = db.prepare("SELECT title, mediaType FROM media WHERE id = ? AND userId = ?").get(req.params.id, userId);
      if (!media) return res.status(404).json({ error: "Media not found" });

      const row = await codex.ensureCodex(userId, {
        mediaId: req.params.id,
        title: media.title,
        mediaType: media.mediaType,
        force: !!(req.body || {}).force,
      });
      if (!row) return res.status(400).json({ error: "AI is not configured. Add a Nano-GPT API key in Settings." });
      if (row.status === "failed") return res.status(502).json({ error: row.error || "Codex research failed." });
      res.json(withPromptBlock(row));
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  /**
   * Codex for a title that may not be a saved entry yet — how Auto Tag works while
   * you are still filling in the Add Media form. The Codex is stored against the
   * title, and the entry adopts it once it is saved.
   */
  /**
   * Rendered Codex blocks for a set of entries, read-only.
   *
   * The title-smith runs on the client and wants the flavour of the one or two
   * works that earned a level. This never researches anything — an entry with no
   * Codex is simply absent from the answer — so it costs nothing and can be
   * called freely.
   */
  app.post("/api/codex/prompt-blocks", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const ids: string[] = Array.isArray(req.body?.mediaIds)
        ? req.body.mediaIds.filter((v: any) => typeof v === "string").slice(0, 8)
        : [];
      const out: Record<string, string> = {};
      for (const mediaId of ids) {
        const row = codex.getCodexRow(userId as string, { mediaId });
        if (row?.status === "ready" && row.data) {
          const block = codexPromptBlock(row);
          if (block) out[mediaId] = block;
        }
      }
      res.json(out);
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  app.post("/api/codex/ensure", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      // Dormant accounts cost nothing: this call spends tokens.
      if (!activity.requireActive(userId as string, res)) return;
      const { mediaId, title, mediaType, force } = req.body || {};
      if (!mediaId && (!title || !mediaType)) {
        return res.status(400).json({ error: "A mediaId, or a title and mediaType, is required." });
      }

      const row = await codex.ensureCodex(userId, { mediaId, title, mediaType, force: !!force });
      if (!row) return res.status(400).json({ error: "AI is not configured. Add a Nano-GPT API key in Settings." });
      if (row.status === "failed") return res.status(502).json({ error: row.error || "Codex research failed." });
      res.json(withPromptBlock(row));
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });
}
