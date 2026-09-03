import type { Express } from "express";
import type { ServerContext } from "../context";

/**
 * Admin-only access to the diagnostic log.
 *
 * Everything here is gated on the Admin role rather than just on being signed
 * in. The log records what every user's AI calls did, carries prompts and error
 * text, and exists to be exported and sent somewhere — that is not ordinary
 * account data and it does not belong to whoever happens to be logged in.
 */
export function registerDiagnosticsRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser } = ctx;

  /** Returns the acting admin's id, or null having already answered 401/403. */
  function requireAdmin(req: any, res: any): string | null {
    const userId = getAuthUser(req, res);
    if (!userId) return null;
    const user: any = db.prepare("SELECT role FROM users WHERE id = ?").get(userId);
    if (user?.role !== "Admin") {
      res.status(403).json({ error: "Unauthorized. Admins only." });
      return null;
    }
    return userId;
  }

  /**
   * Builds the WHERE clause shared by reading and exporting, so the file you
   * download is exactly the rows you were looking at.
   */
  function buildQuery(q: any): { where: string; params: any[] } {
    const clauses: string[] = [];
    const params: any[] = [];

    const channel = String(q.channel || "all");
    if (channel === "internal" || channel === "ai") {
      clauses.push("channel = ?");
      params.push(channel);
    }

    // "warn" means warnings AND errors: nobody filtering for problems wants the
    // more serious ones hidden.
    const level = String(q.level || "all");
    if (level === "error") clauses.push("level = 'error'");
    else if (level === "warn") clauses.push("level IN ('warn','error')");
    else if (level === "info") clauses.push("level IN ('info','warn','error')");

    const scope = String(q.scope || "").trim();
    if (scope) {
      clauses.push("scope = ?");
      params.push(scope);
    }

    const search = String(q.q || "").trim();
    if (search) {
      clauses.push("(message LIKE ? OR detail LIKE ? OR scope LIKE ?)");
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const since = String(q.since || "").trim();
    if (since) {
      clauses.push("ts >= ?");
      params.push(since);
    }

    return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
  }

  const hydrate = (r: any) => ({
    ...r,
    detail: (() => {
      if (!r.detail) return null;
      try { return JSON.parse(r.detail); } catch { return r.detail; }
    })(),
  });

  app.get("/api/diagnostics", (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { where, params } = buildQuery(req.query);
      const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 2000);

      const rows = db
        .prepare(`SELECT * FROM diagnostics ${where} ORDER BY id DESC LIMIT ?`)
        .all(...params, limit) as any[];
      const total = (db.prepare(`SELECT COUNT(*) AS n FROM diagnostics ${where}`).get(...params) as any).n;

      res.json({ entries: rows.map(hydrate), total, returned: rows.length });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  /**
   * The numbers above the table: what is in the log, and what is wrong in it.
   *
   * `scopes` drives the filter dropdown, so it lists what actually occurs rather
   * than a hardcoded set that would drift the moment a new subsystem logs.
   */
  app.get("/api/diagnostics/summary", (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      res.json({
        total: (db.prepare("SELECT COUNT(*) AS n FROM diagnostics").get() as any).n,
        byChannel: db.prepare("SELECT channel, COUNT(*) AS n FROM diagnostics GROUP BY channel").all(),
        byLevel: db.prepare("SELECT level, COUNT(*) AS n FROM diagnostics GROUP BY level").all(),
        scopes: db
          .prepare("SELECT scope, COUNT(*) AS n FROM diagnostics WHERE scope IS NOT NULL GROUP BY scope ORDER BY n DESC")
          .all(),
        errorsLastDay: (db
          .prepare("SELECT COUNT(*) AS n FROM diagnostics WHERE level = 'error' AND ts >= ?")
          .get(dayAgo) as any).n,
        oldest: (db.prepare("SELECT MIN(ts) AS ts FROM diagnostics").get() as any).ts,
        /**
         * Calls that started and never reported back.
         *
         * A "started" row with no matching "end" row is either still running or
         * died without a word — a killed process, a restarted container. Both
         * were completely invisible before, because a log written only when an
         * answer arrives says nothing at all about an answer that never does.
         *
         * Anything from before the most recent boot is not still running,
         * whatever the rows say, so the search starts there.
         */
        inFlight: (() => {
          const lastBoot = (db
            .prepare("SELECT MAX(ts) AS ts FROM diagnostics WHERE scope = 'boot'")
            .get() as any)?.ts || dayAgo;
          return db.prepare(
            `SELECT ts, message, userId,
                    json_extract(detail, '$.callId') AS callId,
                    json_extract(detail, '$.model')  AS model,
                    json_extract(detail, '$.scope')  AS callScope,
                    json_extract(detail, '$.attempt') AS attempt
             FROM diagnostics
             WHERE channel = 'ai'
               AND ts >= ?
               AND json_extract(detail, '$.phase') = 'start'
               AND json_extract(detail, '$.callId') NOT IN (
                 SELECT json_extract(detail, '$.callId') FROM diagnostics
                 WHERE channel = 'ai' AND ts >= ? AND json_extract(detail, '$.phase') = 'end'
               )
             ORDER BY id DESC LIMIT 20`,
          ).all(lastBoot, lastBoot);
        })(),
        /** Rows from before the last restart that never finished. */
        abandoned: (() => {
          const lastBoot = (db
            .prepare("SELECT MAX(ts) AS ts FROM diagnostics WHERE scope = 'boot'")
            .get() as any)?.ts;
          if (!lastBoot) return [];
          return db.prepare(
            `SELECT ts, message,
                    json_extract(detail, '$.model') AS model,
                    json_extract(detail, '$.scope') AS callScope
             FROM diagnostics
             WHERE channel = 'ai' AND ts < ? AND ts >= ?
               AND json_extract(detail, '$.phase') = 'start'
               AND json_extract(detail, '$.callId') NOT IN (
                 SELECT json_extract(detail, '$.callId') FROM diagnostics
                 WHERE channel = 'ai' AND json_extract(detail, '$.phase') = 'end'
               )
             ORDER BY id DESC LIMIT 10`,
          ).all(lastBoot, dayAgo);
        })(),
        newest: (db.prepare("SELECT MAX(ts) AS ts FROM diagnostics").get() as any).ts,
        /**
         * What the AI actually did in the last day.
         *
         * Grouped by model name, which carries the search suffix — so a run that
         * silently used a shallower search than it asked for shows up here as a
         * separate row rather than having to be inferred from a bill.
         */
        aiLastDay: db
          .prepare(
            `SELECT
               json_extract(detail, '$.model') AS model,
               json_extract(detail, '$.searchDepth') AS depth,
               COUNT(*) AS calls,
               SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) AS failures,
               SUM(COALESCE(json_extract(detail, '$.promptTokens'), 0)) AS promptTokens,
               SUM(COALESCE(json_extract(detail, '$.completionTokens'), 0)) AS completionTokens,
               ROUND(AVG(json_extract(detail, '$.durationMs'))) AS avgMs
             FROM diagnostics
             WHERE channel = 'ai' AND detail IS NOT NULL AND ts >= ?
             GROUP BY model, depth
             ORDER BY calls DESC`,
          )
          .all(dayAgo),
      });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  /**
   * The same rows as a file.
   *
   * Text is the default because the point of exporting is usually to paste it
   * somewhere or read it in an editor; JSON is there for when it needs to be
   * processed rather than read.
   */
  app.get("/api/diagnostics/export", (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { where, params } = buildQuery(req.query);
      const limit = Math.min(Math.max(Number(req.query.limit) || 5000, 1), 20000);
      const rows = db
        .prepare(`SELECT * FROM diagnostics ${where} ORDER BY id DESC LIMIT ?`)
        .all(...params, limit) as any[];
      // Oldest first in the file: a log is read forwards.
      rows.reverse();

      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const format = String(req.query.format || "txt");

      if (format === "json") {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename="fauxlore-diagnostics-${stamp}.json"`);
        return res.send(JSON.stringify({ exportedAt: new Date().toISOString(), count: rows.length, entries: rows.map(hydrate) }, null, 2));
      }

      const lines = rows.map((r) => {
        const head = `${r.ts}  ${r.level.toUpperCase().padEnd(5)} [${r.channel}/${r.scope || "app"}]  ${r.message}`;
        if (!r.detail) return head;
        let detail = r.detail;
        try { detail = JSON.stringify(JSON.parse(r.detail), null, 2); } catch { /* keep raw */ }
        return `${head}\n${String(detail).split("\n").map((l: string) => `        ${l}`).join("\n")}`;
      });

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="fauxlore-diagnostics-${stamp}.txt"`);
      res.send(
        `FauxLore diagnostics — exported ${new Date().toISOString()}\n${rows.length} entries\n${"─".repeat(72)}\n\n${lines.join("\n")}\n`,
      );
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.delete("/api/diagnostics", (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { where, params } = buildQuery(req.query);
      const result = db.prepare(`DELETE FROM diagnostics ${where}`).run(...params);
      res.json({ success: true, deleted: result.changes });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });
}
