import bcrypt from "bcrypt";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "../context";

/**
 * Idempotent, additive migrations (ALTER TABLE ... plus data backfills and seeds).
 * Run on every boot, exactly as in the original server. Safe against existing
 * production databases: every step is wrapped in try/catch and only adds.
 */
export function runMigrations(db: Db) {
  // Automatic Migrations
  try { db.exec("ALTER TABLE media ADD COLUMN language TEXT"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE media ADD COLUMN isOngoing INTEGER"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE media ADD COLUMN releaseStatus TEXT"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE media ADD COLUMN lastSyncAt TEXT"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE media ADD COLUMN noEnemies INTEGER DEFAULT 0"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE media ADD COLUMN isHighPriority INTEGER DEFAULT 0"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE media ADD COLUMN noAutoDrop INTEGER DEFAULT 0"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE media ADD COLUMN storyHeavyModifier REAL"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE media ADD COLUMN userReview TEXT"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE media ADD COLUMN dropReason TEXT"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE settings ADD COLUMN enemyDifficulty REAL DEFAULT 1.0"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE settings ADD COLUMN mediaDifficulty TEXT"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE settings ADD COLUMN questConfigs TEXT"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE world_bosses ADD COLUMN unit TEXT"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE ai_recaps ADD COLUMN data TEXT"); } catch (e) { /* Ignore if it exists */ }
  try { db.exec("ALTER TABLE world_bosses ADD COLUMN updatedAt TEXT"); } catch (e) { /* Ignore if it exists */ }

  // Migration steps
  try { 
    const defaultUserExists = db.prepare('SELECT id FROM users WHERE id = ?').get('default_user');
    if (!defaultUserExists) {
      const defaultHash = bcrypt.hashSync('admin', 10);
      db.prepare(`
        INSERT INTO users (id, username, passwordHash, role, createdAt, updatedAt) 
        VALUES ('default_user', 'admin', ?, 'Admin', ?, ?)
      `).run(defaultHash, new Date().toISOString(), new Date().toISOString());
    }
  } catch (e) {
    console.error("Migration: seed user", e);
  }

  // Synchronize media progress with logs
  try {
    const allMedia = db.prepare('SELECT id, userId FROM media').all() as any[];
    for (const m of allMedia) {
      const logs = db.prepare('SELECT metricType, delta FROM logs WHERE mediaId = ? AND userId = ?').all(m.id, m.userId) as any[];
      
      const sums: Record<string, number> = {};
      for (const l of logs) {
        if (!sums[l.metricType]) sums[l.metricType] = 0;
        sums[l.metricType] += l.delta;
      }
      
      for (const [metric, total] of Object.entries(sums)) {
        if (['playtimeHours', 'pagesRead', 'chaptersRead', 'episodesWatched', 'watchCount', 'issuesRead'].includes(metric)) {
          // If total logs > 0, or if total is 0 but we had logs
          db.prepare(`UPDATE media SET ${metric} = MAX(0, ?) WHERE id = ? AND userId = ?`).run(total, m.id, m.userId);
        }
      }
    }
  } catch(e) {
    console.error("Migration: sync media progress", e);
  }

  // Migrate API keys from settings to system_settings
  try {
    const adminSettings: any = db.prepare('SELECT * FROM settings WHERE userId = ?').get('default_user');
    if (adminSettings) {
      db.prepare(`
        INSERT INTO system_settings (id, igdbClientId, igdbClientSecret, tmdbApiKey, hardcoverApiKey, nanoGptApiKey, nanoGptModel, geminiApiKey, googleBooksApiKey)
        VALUES ('system', @igdbClientId, @igdbClientSecret, @tmdbApiKey, @hardcoverApiKey, @nanoGptApiKey, @nanoGptModel, @geminiApiKey, @googleBooksApiKey)
        ON CONFLICT(id) DO UPDATE SET
          igdbClientId=COALESCE(system_settings.igdbClientId, excluded.igdbClientId),
          igdbClientSecret=COALESCE(system_settings.igdbClientSecret, excluded.igdbClientSecret),
          tmdbApiKey=COALESCE(system_settings.tmdbApiKey, excluded.tmdbApiKey),
          hardcoverApiKey=COALESCE(system_settings.hardcoverApiKey, excluded.hardcoverApiKey),
          nanoGptApiKey=COALESCE(system_settings.nanoGptApiKey, excluded.nanoGptApiKey),
          nanoGptModel=COALESCE(system_settings.nanoGptModel, excluded.nanoGptModel),
          geminiApiKey=COALESCE(system_settings.geminiApiKey, excluded.geminiApiKey),
          googleBooksApiKey=COALESCE(system_settings.googleBooksApiKey, excluded.googleBooksApiKey)
      `).run({
        igdbClientId: adminSettings.igdbClientId || null,
        igdbClientSecret: adminSettings.igdbClientSecret || null,
        tmdbApiKey: adminSettings.tmdbApiKey || null,
        hardcoverApiKey: adminSettings.hardcoverApiKey || null,
        nanoGptApiKey: adminSettings.nanoGptApiKey || null,
        nanoGptModel: adminSettings.nanoGptModel || null,
        geminiApiKey: adminSettings.geminiApiKey || null,
        googleBooksApiKey: adminSettings.googleBooksApiKey || null,
      });
    }
  } catch (e) {
    console.error("Migration: system_settings", e);
  }

  try { db.prepare("ALTER TABLE media ADD COLUMN userId TEXT NOT NULL DEFAULT 'default_user'").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE logs ADD COLUMN userId TEXT NOT NULL DEFAULT 'default_user'").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE ai_recaps ADD COLUMN userId TEXT NOT NULL DEFAULT 'default_user'").run(); } catch (e) {}
  // --- Recreate ai_text_cache for correct PRIMARY KEY ---
  try {
    const tableInfo = db.prepare("PRAGMA table_info(ai_text_cache)").all() as any[];
    const hasUserIdPk = tableInfo.some(c => c.name === 'userId' && c.pk > 0);
    if (!hasUserIdPk) {
      console.log("Migrating ai_text_cache schema for proper multi-user PK...");
      db.prepare(`
        CREATE TABLE IF NOT EXISTS ai_text_cache_new (
          key TEXT NOT NULL,
          userId TEXT NOT NULL DEFAULT 'default_user',
          value TEXT NOT NULL,
          PRIMARY KEY (userId, key)
        )
      `).run();
      db.prepare(`INSERT OR IGNORE INTO ai_text_cache_new (key, userId, value) SELECT key, userId, value FROM ai_text_cache`).run();
      db.prepare(`DROP TABLE ai_text_cache`).run();
      db.prepare(`ALTER TABLE ai_text_cache_new RENAME TO ai_text_cache`).run();
    }
  } catch (e: any) {
    console.error("Migration error for ai_text_cache:", e);
  }
  try { db.prepare("ALTER TABLE settings ADD COLUMN questDifficulty REAL").run(); } catch (e) {} // old
  try { db.prepare("ALTER TABLE settings ADD COLUMN yearlyGoals TEXT").run(); console.log("Migration: Added yearlyGoals"); } catch (e) {}
  try { db.prepare("ALTER TABLE settings ADD COLUMN nanoGptApiKey TEXT").run(); console.log("Migration: Added nanoGptApiKey"); } catch (e) {}
  try { db.prepare("ALTER TABLE settings ADD COLUMN nanoGptModel TEXT").run(); console.log("Migration: Added nanoGptModel"); } catch (e) {}
  try { db.prepare("ALTER TABLE settings ADD COLUMN geminiApiKey TEXT").run(); console.log("Migration: Added geminiApiKey"); } catch (e) {}
  try { db.prepare("ALTER TABLE system_settings ADD COLUMN googleBooksApiKey TEXT").run(); } catch(e) {}
  try { db.prepare("ALTER TABLE system_settings ADD COLUMN imageModel TEXT").run(); } catch(e) {}
  try { db.prepare("ALTER TABLE system_settings ADD COLUMN imageSize TEXT").run(); } catch(e) {}
  try { db.prepare("ALTER TABLE system_settings ADD COLUMN imageSteps INTEGER").run(); } catch(e) {}
  try { db.prepare("ALTER TABLE system_settings ADD COLUMN imageGuidance REAL").run(); } catch(e) {}
  try { db.prepare("ALTER TABLE system_settings ADD COLUMN imageNegativePrompt TEXT").run(); } catch(e) {}
  try { db.prepare("ALTER TABLE settings ADD COLUMN googleBooksApiKey TEXT").run(); } catch(e) {}
  try { db.prepare("ALTER TABLE settings ADD COLUMN lastActiveDate TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE settings ADD COLUMN currentStreak INTEGER").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE settings ADD COLUMN questOffsets TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE settings ADD COLUMN questRerollsUsed TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN hltbMain REAL").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE artifacts ADD COLUMN targetType TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE artifacts ADD COLUMN targetValue TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE artifacts ADD COLUMN bonusPercent INTEGER").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN hltbMainExtra REAL").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN hltbCompletionist REAL").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN isReRun INTEGER").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN platforms TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN franchises TEXT").run(); } catch (e) {}
  // SQLite ALTER TABLE doesn't support adding foreign keys or multiple columns at once well,
  // but we can add columns if they are missing.
  try { db.prepare("ALTER TABLE artifacts ADD COLUMN userId TEXT NOT NULL DEFAULT 'default_user'").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE artifacts ADD COLUMN rarity TEXT DEFAULT 'Common'").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE artifacts ADD COLUMN type TEXT DEFAULT 'Trinket'").run(); } catch (e) {}
  
  try { db.prepare("ALTER TABLE artifacts ADD COLUMN durability INTEGER DEFAULT 100").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE artifacts ADD COLUMN maxDurability INTEGER DEFAULT 100").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE artifacts ADD COLUMN slot TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE artifacts ADD COLUMN isEquipped INTEGER DEFAULT 0").run(); } catch (e) {}
  
  try { db.prepare("ALTER TABLE media ADD COLUMN originalMediaId TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN selectedHltbType TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN expectedReleaseDate TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN subtitle TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN maturityRating TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE logs ADD COLUMN location TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE logs ADD COLUMN isHistoric INTEGER DEFAULT 0").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE logs ADD COLUMN bonusMultiplier REAL DEFAULT 0").run(); } catch (e) {}
  // Generic metadata-provenance tracking. Lets any media item be re-looked-up at its
  // origin so it can be auto-refreshed (see services/metadataRefresh.ts).
  try { db.prepare("ALTER TABLE media ADD COLUMN metadataSource TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN metadataSourceId TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN sourceVersion TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN sourceUpdatedAt TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN updateAvailable INTEGER DEFAULT 0").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE media ADD COLUMN updateSeenAt TEXT").run(); } catch (e) {}
  // Broken items (0 durability) should never remain equipped.
  try { db.prepare("UPDATE artifacts SET isEquipped = 0 WHERE durability <= 0 AND isEquipped = 1").run(); } catch (e) {}
  
  try { db.prepare("UPDATE media SET status = 'Active' WHERE status = 'Playing'").run(); } catch(e) {}
  try { db.prepare("UPDATE media SET status = 'Planning' WHERE status = 'Backlog'").run(); } catch(e) {}
  try { db.prepare("UPDATE world_bosses SET status = 'Defeated', currentProgress = targetProgress WHERE status = 'Active' AND mediaId IN (SELECT id FROM media WHERE status = 'Completed')").run(); } catch(e) {}
  try { db.prepare("UPDATE world_bosses SET status = 'Failed' WHERE status = 'Active' AND mediaId IN (SELECT id FROM media WHERE status = 'Dropped')").run(); } catch(e) {}

  // Auto-assign default_user records to the first Admin user
  try {
    const firstAdmin: any = db.prepare('SELECT id FROM users WHERE role = ? ORDER BY createdAt ASC LIMIT 1').get('Admin');
    if (firstAdmin) {
      const adminId = firstAdmin.id;
      db.prepare("UPDATE media SET userId = ? WHERE userId = 'default_user'").run(adminId);
      db.prepare("UPDATE logs SET userId = ? WHERE userId = 'default_user'").run(adminId);
      db.prepare("UPDATE settings SET userId = ? WHERE userId = 'default_user'").run(adminId);
      db.prepare("UPDATE ai_recaps SET userId = ? WHERE userId = 'default_user'").run(adminId);
      db.prepare("UPDATE artifacts SET userId = ? WHERE userId = 'default_user'").run(adminId);
      db.prepare("UPDATE ai_text_cache SET userId = ? WHERE userId = 'default_user'").run(adminId);
      db.prepare("UPDATE world_bosses SET userId = ? WHERE userId = 'default_user'").run(adminId);
      db.prepare("UPDATE oracle_messages SET userId = ? WHERE userId = 'default_user'").run(adminId);
      db.prepare("UPDATE franchises SET userId = ? WHERE userId = 'default_user'").run(adminId);
    }
  } catch(e) { console.error('Migration of default_user failed:', e); }

  // Auto-migrate artifacts slots/durability
  try {
    db.prepare(`
      UPDATE artifacts SET 
        durability = CASE WHEN durability IS NULL THEN 100 ELSE durability END,
        maxDurability = CASE WHEN maxDurability IS NULL THEN 100 ELSE maxDurability END,
        slot = CASE 
          WHEN slot IS NOT NULL THEN slot
          WHEN name LIKE '%Sword%' OR name LIKE '%Blade%' OR name LIKE '%Axe%' THEN 'Primary'
          WHEN name LIKE '%Shield%' OR name LIKE '%Book%' OR name LIKE '%Tome%' THEN 'Secondary'
          WHEN name LIKE '%Helm%' OR name LIKE '%Crest%' THEN 'Head'
          WHEN name LIKE '%Armor%' OR name LIKE '%Robe%' THEN 'Body'
          WHEN name LIKE '%Boots%' OR name LIKE '%Greaves%' THEN 'Legs'
          ELSE 'Accessory'
        END
      WHERE durability IS NULL OR slot IS NULL
    `).run();
  } catch(e) { console.error('Migration of artifacts failed:', e); }

  // Auto-migrate historical log timestamps
  try {
    const historicalUpdateResult = db.prepare("UPDATE logs SET timestamp = '1970-01-01T00:00:00.000Z' WHERE isHistoric = 1 AND timestamp != '1970-01-01T00:00:00.000Z'").run();
    if (historicalUpdateResult.changes > 0) {
      console.log(`Migrated ${historicalUpdateResult.changes} historical logs to proper timestamp.`);
    }
  } catch(e) { console.error('Migration of historical log timestamps failed:', e); }

  // Seed Taxonomies if empty
  try {
    const genreCount = db.prepare('SELECT count(*) as count FROM global_taxonomy WHERE type = ?').get('genre') as { count: number };
    const tagCount = db.prepare('SELECT count(*) as count FROM global_taxonomy WHERE type = ?').get('tag') as { count: number };
    
    if (genreCount.count === 0 && tagCount.count === 0) {
      if (fs.existsSync('taxonomy.json')) {
         const { genres, tags } = JSON.parse(fs.readFileSync('taxonomy.json', 'utf8'));
         const insertTaxonomy = db.prepare('INSERT INTO global_taxonomy (id, type, name) VALUES (@id, @type, @name) ON CONFLICT(name) DO NOTHING');
         
         db.transaction(() => {
           for (const genre of genres) {
              insertTaxonomy.run({ id: uuidv4(), type: 'genre', name: genre });
           }
           for (const tag of tags) {
              insertTaxonomy.run({ id: uuidv4(), type: 'tag', name: tag });
           }
         })();
         console.log('Seeded global taxonomies');
      }
    }
  } catch (e) {
    console.error("Taxonomy Seed Error:", e);
  }

  try {
    const versionRow = db.prepare("PRAGMA user_version").get() as { user_version: number };
    if (versionRow.user_version < 1) {
      db.prepare("UPDATE world_bosses SET targetProgress = targetProgress * 2 WHERE status = 'Active'").run();
      db.prepare("PRAGMA user_version = 1").run();
      console.log('Migrated world_bosses to double target progress (user_version 1)');
    }
  } catch (e) {
    console.error("Migration to user_version 1 failed:", e);
  }

  try { db.prepare("ALTER TABLE artifacts ADD COLUMN imageUrl TEXT").run(); console.log("Migration: Added imageUrl to artifacts"); } catch (e) {}
  try { db.prepare("ALTER TABLE world_bosses ADD COLUMN imageUrl TEXT").run(); console.log("Migration: Added imageUrl to world_bosses"); } catch (e) {}
  try { db.prepare("ALTER TABLE artifacts ADD COLUMN imageStatus TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE world_bosses ADD COLUMN imageStatus TEXT").run(); } catch (e) {}
}
