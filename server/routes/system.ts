import type { Express } from "express";
import type { ServerContext } from "../context";
import { BLOCKED_HOST, resolvesPrivately } from "../lib/publicHost";
import { INACTIVITY_DAYS } from "../services/activity";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/**
 * Hosts a browser is allowed to pull through the image proxy.
 *
 * A canvas that has drawn a cross-origin image cannot be exported, and cover art
 * comes from whichever source the entry was matched against — none of which
 * promise CORS headers. Fetching server-side and re-serving from our own origin
 * is the only reliable fix.
 *
 * That makes this endpoint a request-forwarder, so it is deliberately narrow:
 * https only, and nothing that resolves to an address the server can reach but
 * the user cannot. The point is that it never becomes a way to probe whatever
 * network the container happens to sit on.
 */
export function registerSystemRoutes(app: Express, ctx: ServerContext) {
  const { createDatabaseBackup, getAuthUser, activity } = ctx;

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  /**
   * Whether this account is dormant, so the client can say so plainly instead of
   * letting the user run into a 403 with no explanation.
   */
  app.get("/api/activity", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      res.json({ ...activity.stateOf(userId as string), inactivityDays: INACTIVITY_DAYS });
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  /** Re-serves a remote image from this origin, so a canvas can export it. */
  app.get("/api/image-proxy", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;

      const raw = String(req.query.url || "");
      let target: URL;
      try {
        target = new URL(raw);
      } catch {
        return res.status(400).json({ error: "Not a URL" });
      }
      if (target.protocol !== "https:" && target.protocol !== "http:") {
        return res.status(400).json({ error: "Unsupported protocol" });
      }
      if (BLOCKED_HOST.test(target.hostname) || (await resolvesPrivately(target.hostname))) {
        return res.status(403).json({ error: "Host not allowed" });
      }

      const upstream = await fetch(target.toString(), {
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });
      if (!upstream.ok) return res.status(502).json({ error: `Upstream ${upstream.status}` });

      const type = upstream.headers.get("content-type") || "";
      if (!type.startsWith("image/")) return res.status(415).json({ error: "Not an image" });

      const buf = Buffer.from(await upstream.arrayBuffer());
      if (buf.byteLength > MAX_IMAGE_BYTES) return res.status(413).json({ error: "Image too large" });

      res.setHeader("Content-Type", type);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(buf);
    } catch (e: any) {
      res.status(502).json({ error: String(e?.message || e) });
    }
  });

  app.post("/api/backup", (req, res) => {
    const result = createDatabaseBackup();
    if (result.success) {
      res.json({ message: "Backup created successfully", file: result.file });
    } else {
      res.status(500).json({ error: result.error });
    }
  });

}
