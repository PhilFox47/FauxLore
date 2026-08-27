import type { Express } from "express";
import type { ServerContext } from "../context";

/**
 * The lines that can appear under a library title.
 *
 * One call returns both pools already merged: the global starter lines every
 * account has, and the ones this user's own Codexes earned from works they have
 * actually consumed. Earned rows are marked so the client can weight them, and
 * they are scoped to the requesting user by the query itself — someone else
 * finishing a book never puts a line in your library.
 *
 * Cheap and read-only, so it is not gated on the account being active.
 */
export function registerFlavorTextRoutes(app: Express, ctx: ServerContext) {
  const { getAuthUser, flavorLibrary } = ctx;

  app.get("/api/flavor-texts", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      res.json(flavorLibrary.readFor(userId as string));
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });
}
