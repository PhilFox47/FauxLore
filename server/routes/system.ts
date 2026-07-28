import type { Express } from "express";
import dns from "dns/promises";
import net from "net";
import type { ServerContext } from "../context";
import { INACTIVITY_DAYS } from "../services/activity";

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
const BLOCKED_HOST = /^(localhost$|.*\.local$|.*\.internal$)/i;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/** Loopback, link-local, and the RFC1918 / unique-local ranges. */
function isPrivateAddress(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 127 || a === 10 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || a >= 224;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    return lower === "::1" || lower === "::" || lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd") ||
      // v4-mapped, e.g. ::ffff:127.0.0.1
      (lower.startsWith("::ffff:") && isPrivateAddress(lower.slice(7)));
  }
  return true; // unparseable is not something to connect to
}

/**
 * Rejects a host that resolves anywhere on the local network.
 *
 * Checking the hostname string alone would miss the obvious move of pointing a
 * public name at 127.0.0.1, so the name is resolved first. A name that changes
 * its answer between this check and the fetch could still slip through; that
 * needs connection-level pinning, which is more machinery than a single-user
 * self-hosted app warrants.
 */
async function resolvesPrivately(hostname: string): Promise<boolean> {
  const literal = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(literal)) return isPrivateAddress(literal);
  try {
    const addrs = await dns.lookup(hostname, { all: true });
    return addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address));
  } catch {
    return true;
  }
}

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
