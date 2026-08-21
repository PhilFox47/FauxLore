import type { Express } from "express";
import type { ServerContext } from "../context";

/**
 * Web Push registration.
 *
 * Deliberately not gated on the account being active. The whole point of the
 * inactivity reminder is to reach someone whose account has gone dormant, and a
 * push costs nothing — the freeze exists to stop dormant accounts spending AI
 * tokens, which none of this does.
 */
export function registerPushRoutes(app: Express, ctx: ServerContext) {
  const { getAuthUser, push } = ctx;

  /**
   * The public half of the server's keypair, which the browser needs before it
   * can subscribe. Generated on first request so a fresh install works without
   * anyone having to run a key-generation step.
   */
  app.get("/api/push/key", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const keys = push.ensureVapidKeys();
      res.json({ publicKey: keys.publicKey });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  /** Registers one browser or phone. Re-subscribing the same device is an upsert. */
  app.post("/api/push/subscribe", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const ok = push.saveSubscription(userId, req.body?.subscription, String(req.headers["user-agent"] || ""));
      if (!ok) return res.status(400).json({ error: "Incomplete subscription" });
      res.json({ ok: true, devices: push.countFor(userId) });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/push/unsubscribe", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const endpoint = String(req.body?.endpoint || "");
      if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });
      push.removeSubscription(endpoint);
      res.json({ ok: true, devices: push.countFor(userId) });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  /** How many devices are registered, so the UI can say something truthful. */
  app.get("/api/push/status", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const prefs = push.prefsFor(userId);
      res.json({ devices: push.countFor(userId), configured: !!push.getVapidKeys(), ...prefs });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  /**
   * Sends one real push, so a user can find out whether this works without
   * waiting for something to actually happen.
   */
  app.post("/api/push/test", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      if (!push.countFor(userId)) {
        return res.status(400).json({ error: "No device is registered for push yet." });
      }
      const result = await push.sendToUser(userId, {
        title: "FauxLore",
        body: "Push notifications are working.",
        type: "test",
        link: "/",
        tag: "push-test",
      });
      res.json(result);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });
}
