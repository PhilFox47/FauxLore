import type { Express } from "express";
import type { ServerContext } from "../context";
import { normalizeFlavorTexts } from "../services/codex";

/**
 * The lines a user's own library has earned.
 *
 * Every library page carries a line under its title. It used to come from a
 * fixed table of several thousand quotes, which made it a slot machine of other
 * people's favourites. This is the other half: the Codex researches the three to
 * six lines each work is actually known by, and once the user has genuinely
 * consumed that work, those lines join the pool for its media type.
 *
 * The pool therefore grows into a record of what this particular person has read,
 * watched and played, and the built-in set becomes the floor a new library stands
 * on rather than the whole of it.
 */

/**
 * When a work's lines are allowed to surface.
 *
 * Finished is the obvious case. Ongoing works are the exception the rule needs:
 * a long-running series is almost never marked Completed, so waiting for that
 * would permanently exclude exactly the works someone has spent the most time
 * with. For those, following it is enough — but following it, not merely owning
 * it. A Planning entry is something nobody has watched a minute of, and quoting
 * it back at the user would be both meaningless and a spoiler.
 */
const FINISHED = ["Completed", "Extras"];
const FOLLOWING = ["Active", "Caught Up", "On Hold", "Completed", "Extras"];

export function registerFlavorTextRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser } = ctx;

  app.get("/api/flavor-texts", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;

      const rows: any[] = db
        .prepare(
          `SELECT m.id AS mediaId, m.title AS title, m.mediaType AS mediaType, c.data AS data
             FROM media_codex c
             JOIN media m ON m.id = c.mediaId AND m.userId = c.userId
            WHERE c.userId = ?
              AND c.status = 'ready'
              AND ( m.status IN (${FINISHED.map(() => "?").join(", ")})
                 OR (m.isOngoing = 1 AND m.status IN (${FOLLOWING.map(() => "?").join(", ")})) )`,
        )
        .all(userId, ...FINISHED, ...FOLLOWING);

      const byType: Record<string, any[]> = {};

      for (const row of rows) {
        let parsed: any = null;
        try {
          parsed = row.data ? JSON.parse(row.data) : null;
        } catch {
          continue;
        }
        // Dossiers compiled before this existed simply have no lines, and are
        // deliberately not backfilled — they pick them up when re-researched.
        const texts = normalizeFlavorTexts(parsed?.flavorTexts);
        if (!texts.length) continue;

        const list = (byType[row.mediaType] ||= []);
        for (const t of texts) {
          // A format line is about the medium, not the work — naming the entry
          // that happened to surface it would be false, and would spoil the
          // effect: these read as the app's own house lines, and that is the
          // whole reason they work.
          const ofTheWork = t.scope !== "medium";
          list.push({
            quote: t.text,
            // The work itself, not the speaker: this becomes the tooltip under
            // the library title, where "which of my entries is this from" is the
            // only question being asked.
            source: ofTheWork ? row.title : undefined,
            kind: t.kind,
            attribution: ofTheWork ? t.attribution : undefined,
            earned: true,
            mediaId: row.mediaId,
          });
        }
      }

      res.json(byType);
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });
}
