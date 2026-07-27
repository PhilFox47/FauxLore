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
import { createOracleService } from "./services/oracle";
import { createWorldBossService } from "./services/worldBoss";
import { createCodexService } from "./services/codex";
import { createLootService } from "./services/loot";
import { createAutoTagService } from "./services/autoTag";

import { registerAuthRoutes } from "./routes/auth";
import { registerUserRoutes } from "./routes/users";
import { registerSystemSettingsRoutes } from "./routes/systemSettings";
import { registerMediaRoutes } from "./routes/media";
import { registerLogRoutes } from "./routes/logs";
import { registerSettingsRoutes } from "./routes/settings";
import { registerRecapRoutes } from "./routes/recaps";
import { registerAiRoutes } from "./routes/ai";
import { registerCodexRoutes } from "./routes/codex";
import { registerArtifactRoutes } from "./routes/artifacts";
import { registerBossRoutes } from "./routes/bosses";
import { registerOracleRoutes } from "./routes/oracle";
import { registerFranchiseRoutes } from "./routes/franchises";
import { registerSystemRoutes } from "./routes/system";
import { registerTaxonomyRoutes } from "./routes/taxonomy";
import { registerSearchRoutes } from "./routes/search";

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
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
  if (!fs.existsSync(aiImagesDir)) fs.mkdirSync(aiImagesDir);

  // Schema + migrations must run before any startup query (e.g. the missed-oracle
  // check below) reads a table. Both are idempotent and safe to run against an
  // existing production database: CREATE TABLE IF NOT EXISTS and guarded ALTERs.
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
  const codex = createCodexService({ db });
  const { generateBossImageBackground, generateArtifactImageBackground } = createImageService({ db, aiImagesDir, codex });
  const { generateOracleMessage, checkMissedOracleMessages } = createOracleService({ db });
  const { spawnWorldBoss, generateEnemy } = createWorldBossService({ db, generateBossImageBackground, codex });
  const { generateLoot } = createLootService({ db, codex });
  const autoTag = createAutoTagService({ db, codex });

  // Log headless-browser availability once at boot (GameStoryLog needs it).
  reportBrowserStatus();

  // Daily metadata refresh: re-check tracked media (Active / On Hold) against their
  // source for new versions. Runs early, off-peak, before the morning Oracle.
  const { notify, runAllChecks, runForAllUsers } = createNotifications(db);
  const { refreshTrackedMedia, refreshAllUsers } = createMetadataRefresh(db, notify);
  cron.schedule("30 4 * * *", () => {
    console.log("Running daily metadata refresh...");
    refreshAllUsers().catch((e) => console.error("Metadata refresh failed", e));
  });

  // Notification producers (releases, finished recap periods, expiring bosses).
  // Runs each morning, and once shortly after boot so a restart surfaces anything
  // that came due while the server was down.
  cron.schedule("0 6 * * *", () => runForAllUsers());
  setTimeout(() => runForAllUsers(), 10_000);

  // Cron schedule for Oracle messages (09:00 and 21:00)
  cron.schedule("0 9 * * *", () => {
    const users = db.prepare("SELECT id FROM users").all() as { id: string }[];
    for (const u of users) generateOracleMessage(u.id, "morning");
  });
  cron.schedule("0 21 * * *", () => {
    const users = db.prepare("SELECT id FROM users").all() as { id: string }[];
    for (const u of users) generateOracleMessage(u.id, "evening");
  });

  // Weekly boss spawn (Mondays)
  cron.schedule("0 5 * * 1", () => {
    const users = db.prepare("SELECT id FROM users").all() as { id: string }[];
    for (const u of users) {
      db.prepare("UPDATE world_bosses SET status = 'Failed' WHERE userId = ? AND status = 'Active' AND expiresAt < ?").run(
        u.id,
        new Date().toISOString(),
      );
      spawnWorldBoss(u.id);
    }
  });

  checkMissedOracleMessages();

  // Request-scoped helpers
  const getAuthUser = createGetAuthUser(db);
  const syncOngoingMediaInBackground = createMediaSync(db);

  // Recalculate Taxonomy Usage Counts on startup
  recalcTaxonomyUsageCounts(db);

  const ctx: ServerContext = {
    db,
    getAuthUser,
    normalizeMedia,
    safeJsonParse,
    syncOngoingMediaInBackground,
    createDatabaseBackup,
    generateOracleMessage,
    spawnWorldBoss,
    generateEnemy,
    generateLoot,
    generateBossImageBackground,
    generateArtifactImageBackground,
    codex,
    autoTag,
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
  registerArtifactRoutes(app, ctx);
  registerBossRoutes(app, ctx);
  registerOracleRoutes(app, ctx);
  registerFranchiseRoutes(app, ctx);
  registerSystemRoutes(app, ctx);
  registerTaxonomyRoutes(app, ctx);
  registerSearchRoutes(app, ctx);

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
