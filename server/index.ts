import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import * as dotenv from "dotenv";
import Database from "better-sqlite3";
import fs from "fs";
import cron from "node-cron";

import type { ServerContext } from "./context";
import { hltbSearch } from "./integrations/hltb";
import { getIgdbToken } from "./integrations/igdb";
import { initSchema } from "./db/schema";
import { runMigrations } from "./db/migrations";
import { safeJsonParse, normalizeMedia } from "./lib/normalize";
import { recalcTaxonomyUsageCounts } from "./lib/taxonomyCounts";
import { createGetAuthUser } from "./services/auth";
import { createMediaSync } from "./services/mediaSync";
import { createMetadataRefresh } from "./services/metadataRefresh";
import { createNotifications } from "./services/notifications";
import { reportBrowserStatus } from "./integrations/gamestorylog";
import { createBackupManager } from "./services/backup";
import { createImageService } from "./services/images";
import { createCoverCache } from "./services/coverCache";
import { createWorldBossService } from "./services/worldBoss";
import { createCodexService } from "./services/codex";
import { createFlavorLibrary } from "./services/flavorLibrary";
import { createLootService } from "./services/loot";
import { createAutoTagService } from "./services/autoTag";
import { createActivityService, INACTIVITY_DAYS } from "./services/activity";

import { registerAuthRoutes } from "./routes/auth";
import { registerUserRoutes } from "./routes/users";
import { registerSystemSettingsRoutes } from "./routes/systemSettings";
import { registerMediaRoutes } from "./routes/media";
import { registerLogRoutes } from "./routes/logs";
import { registerSettingsRoutes } from "./routes/settings";
import { registerRecapRoutes } from "./routes/recaps";
import { registerAiRoutes } from "./routes/ai";
import { registerCodexRoutes } from "./routes/codex";
import { registerFlavorTextRoutes } from "./routes/flavorTexts";
import { registerArtifactRoutes } from "./routes/artifacts";
import { registerBossRoutes } from "./routes/bosses";
import { registerFranchiseRoutes } from "./routes/franchises";
import { registerSystemRoutes } from "./routes/system";
import { registerPushRoutes } from "./routes/push";
import { createPushService } from "./services/push";
import { registerTaxonomyRoutes } from "./routes/taxonomy";
import { registerSearchRoutes } from "./routes/search";
import { registerLocationRoutes } from "./routes/locations";

dotenv.config();

async function startServer() {
  const app = express();
  // AI Studio requires port 3000, but using process.env.PORT allows you to easily proxy or run locally on other ports!
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Middleware to parse JSON bodies
  app.use(express.json());

  // Initialize SQLite Database
  const dataDir = process.env.DATA_DIR || process.cwd();
  const dbPath = path.join(dataDir, "fauxlore.db");
  const db = new Database(dbPath);

  // Backup Manager
  const backupsDir = path.join(dataDir, "backups");
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir);
  }

  // Uploads Manager
  const uploadsDir = path.join(dataDir, "uploads");
  const aiImagesDir = path.join(uploadsDir, "ai-images");
  const coversDir = path.join(uploadsDir, "covers");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
  if (!fs.existsSync(aiImagesDir)) fs.mkdirSync(aiImagesDir);
  if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir);

  // Schema + migrations must run before any startup query reads a table. Both are
  // idempotent and safe to run against an existing production database:
  // CREATE TABLE IF NOT EXISTS and guarded ALTERs.
  initSchema(db);
  runMigrations(db);

  const { createDatabaseBackup } = createBackupManager({ dbPath, backupsDir });

  // Run daily at 13:00
  cron.schedule("0 13 * * *", () => {
    console.log("Running scheduled daily backup...");
    createDatabaseBackup();
  });

  // RPG / AI services. The Codex sits underneath the creative ones: it does the
  // research once per title, and enemies, loot and tags are written from it.
  // Dormant accounts are skipped by every scheduled job below and refused by
  // every endpoint that spends tokens. Nothing runs for someone who has not
  // logged anything in a week.
  const activity = createActivityService(db);

  // The library of lines that appear under a library title. Built before the
  // Codex so research can hand its findings straight over.
  const flavorLibrary = createFlavorLibrary({ db });
  try {
    const seeded = flavorLibrary.seedStarters();
    if (seeded) console.log(`Seeded ${seeded} starter flavor texts`);
    // Everything researched before this table existed lives in Codex JSON, and
    // would otherwise vanish from the libraries the moment the read switched over.
    const moved = flavorLibrary.backfillFromCodexes();
    if (moved) console.log(`Migrated ${moved} earned flavor texts out of Codex documents`);
  } catch (e) {
    console.error("Flavor library seed failed:", e);
  }

  const codex = createCodexService({
    db,
    onFlavorTexts: (userId, mediaId, mediaType, title, texts) => {
      try { flavorLibrary.writeEarned(userId, mediaId, mediaType, title, texts); }
      catch (e) { console.error("[flavorLibrary] Could not record researched lines", e); }
    },
  });
  const { generateBossImageBackground, generateArtifactImageBackground } = createImageService({ db, aiImagesDir, codex });
  const coverCache = createCoverCache({ coversDir });
  const { spawnWorldBoss, generateEnemy } = createWorldBossService({ db, generateBossImageBackground, codex });
  const { generateLoot } = createLootService({ db, codex });
  const autoTag = createAutoTagService({ db, codex });

  // Log headless-browser availability once at boot (GameStoryLog needs it).
  reportBrowserStatus();

  // Daily metadata refresh: re-check tracked media (Active / On Hold) against their
  // source for new versions. Runs early and off-peak.
  // Push is wired into the notification writer rather than into each producer,
  // so anything that records a notification reaches the phone for free — and the
  // dedupe key that stops the bell repeating itself stops the phone repeating too.
  const push = createPushService(db);
  const { notify, runAllChecks, checkInactivity } = createNotifications(db, (userId, n) => push.deliver(userId, n));
  const { refreshTrackedMedia } = createMetadataRefresh(db, notify, (userId, mediaId) => {
    // A released entry finally has something to research. Dormant accounts stay
    // parked: the freeze is about AI spend, and this is the expensive part.
    if (activity.isFrozen(userId)) return;
    autoTag.queueAutoTag(userId, mediaId);
  });
  cron.schedule("30 4 * * *", () => {
    const users = activity.activeUserIds();
    console.log(`Running daily metadata refresh for ${users.length} active user(s)...`);
    Promise.all(users.map((id) => refreshTrackedMedia(id)))
      .catch((e) => console.error("Metadata refresh failed", e));
  });

  // Notification producers (releases, finished recap periods, expiring bosses).
  // Runs each morning, and once shortly after boot so a restart surfaces anything
  // that came due while the server was down.
  cron.schedule("0 6 * * *", () => activity.activeUserIds().forEach((id) => runAllChecks(id)));
  setTimeout(() => activity.activeUserIds().forEach((id) => runAllChecks(id)), 10_000);

  // The inactivity reminder is the one producer that must run for dormant
  // accounts: they are its entire audience. The freeze exists to stop them
  // spending AI tokens, and a reminder spends none.
  const remindInactive = () => {
    const users = db.prepare("SELECT id FROM users").all() as { id: string }[];
    for (const u of users) checkInactivity(u.id);
  };
  cron.schedule("0 18 * * *", remindInactive);
  setTimeout(remindInactive, 15_000);

  // Weekly boss spawn (Mondays)
  cron.schedule("0 5 * * 1", () => {
    // Expiring last week's enemies is bookkeeping and costs nothing, so it runs
    // for everyone. Spawning new ones writes AI text and an image, so it only
    // runs for accounts that are actually being used.
    const users = db.prepare("SELECT id FROM users").all() as { id: string }[];
    for (const u of users) {
      db.prepare("UPDATE world_bosses SET status = 'Failed' WHERE userId = ? AND status = 'Active' AND expiresAt < ?").run(
        u.id,
        new Date().toISOString(),
      );
      if (activity.isFrozen(u.id)) {
        console.log(`[activity] Skipping boss spawn for ${u.id}: no log in ${INACTIVITY_DAYS} days`);
        continue;
      }
      spawnWorldBoss(u.id);
    }
  });

  // Request-scoped helpers
  const getAuthUser = createGetAuthUser(db);
  const syncOngoingMediaInBackground = createMediaSync(db);

  // Recalculate Taxonomy Usage Counts on startup
  recalcTaxonomyUsageCounts(db);

  const ctx: ServerContext = {
    push,
    coverCache,
    db,
    getAuthUser,
    normalizeMedia,
    safeJsonParse,
    syncOngoingMediaInBackground,
    createDatabaseBackup,
    spawnWorldBoss,
    generateEnemy,
    generateLoot,
    generateBossImageBackground,
    generateArtifactImageBackground,
    codex,
    flavorLibrary,
    autoTag,
    activity,
    hltbSearch,
    getIgdbToken,
  };

  // Authorization Routes
  registerAuthRoutes(app, ctx);
  registerUserRoutes(app, ctx);
  registerSystemSettingsRoutes(app, ctx);
  // Local DB API Routes
  registerMediaRoutes(app, ctx);
  registerLogRoutes(app, ctx);
  registerSettingsRoutes(app, ctx);
  registerRecapRoutes(app, ctx);
  registerAiRoutes(app, ctx);
  registerCodexRoutes(app, ctx);
  registerFlavorTextRoutes(app, ctx);
  registerArtifactRoutes(app, ctx);
  registerBossRoutes(app, ctx);
  registerFranchiseRoutes(app, ctx);
  registerSystemRoutes(app, ctx);
  registerPushRoutes(app, ctx);
  registerTaxonomyRoutes(app, ctx);
  registerSearchRoutes(app, ctx);
  registerLocationRoutes(app, ctx);

  // Notifications
  app.get("/api/notifications", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const rows = db
        .prepare(
          `SELECT * FROM notifications WHERE userId = ?
            ORDER BY (readAt IS NOT NULL), createdAt DESC LIMIT 100`,
        )
        .all(userId);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  app.post("/api/notifications/check", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      res.json({ success: true, created: runAllChecks(userId as string) });
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  app.post("/api/notifications/:id/read", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      db.prepare("UPDATE notifications SET readAt = ? WHERE id = ? AND userId = ? AND readAt IS NULL")
        .run(new Date().toISOString(), req.params.id, userId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  app.post("/api/notifications/read-all", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      db.prepare("UPDATE notifications SET readAt = ? WHERE userId = ? AND readAt IS NULL")
        .run(new Date().toISOString(), userId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  app.delete("/api/notifications/:id", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      db.prepare("DELETE FROM notifications WHERE id = ? AND userId = ?").run(req.params.id, userId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  // Metadata refresh: manual trigger + acknowledging a detected update.
  app.post("/api/metadata/refresh", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      // force = ignore the per-item throttle (used by the "check now" button)
      const updates = await refreshTrackedMedia(userId, req.query.force ? { minAgeMs: 0 } : {});
      res.json({ success: true, updates });
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  app.post("/api/media/:id/acknowledge-update", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      // Acknowledging an update means "I now have this version": record it as the
      // installed one so future checks compare against what the user actually holds.
      const body = req.body || {};
      db.prepare(
        `UPDATE media
            SET updateAvailable = 0,
                updateSeenAt = ?,
                installedVersion = COALESCE(?, sourceVersion, installedVersion)
          WHERE id = ? AND userId = ?`,
      ).run(new Date().toISOString(), body.installedVersion ?? null, req.params.id, userId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  app.use("/uploads", express.static(uploadsDir));

  // Middleware to block common scanner probes to prevent Vite from crashing or cluttering logs
  app.use((req, res, next) => {
    const suspiciousPaths = [".env", "/etc/passwd", "/etc/shadow", ".git", ".npmrc", "docker-compose.yml", "Dockerfile", ".bash_history", ".bashrc", "/proc/self/cmdline", "/proc/self/environ", "config/default.json", "config/production.json"];
    if (suspiciousPaths.some((p) => req.path.includes(p))) {
      return res.status(404).end();
    }
    next();
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
