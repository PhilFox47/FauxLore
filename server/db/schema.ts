import type { Db } from "../context";

/** Creates all tables if they do not exist. Schema is unchanged from the original server. */
export function initSchema(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL DEFAULT 'default_user',
      title TEXT NOT NULL,
      mediaType TEXT NOT NULL,
      coverImageUrl TEXT,
      description TEXT,
      creator TEXT,
      publisher TEXT,
      year INTEGER,
      reviewScore INTEGER,
      averagePlaytime REAL,
      totalDurationHours REAL,
      hltbMain REAL,
      hltbMainExtra REAL,
      hltbCompletionist REAL,
      selectedHltbType TEXT,
      status TEXT NOT NULL,
      userRating INTEGER,
      userReview TEXT,
      dropReason TEXT,
      genres TEXT,
      tags TEXT,
      tropes TEXT,
      platforms TEXT,
      franchises TEXT,
      subtitle TEXT,
      maturityRating TEXT,
      playtimeHours REAL,
      pagesRead INTEGER,
      totalPages INTEGER,
      chaptersRead INTEGER,
      totalChapters INTEGER,
      season INTEGER,
      episodesWatched INTEGER,
      totalEpisodes INTEGER,
      watched INTEGER,
      watchCount INTEGER,
      runtimeMinutes INTEGER,
      issuesRead INTEGER,
      totalIssues INTEGER,
      isReRun INTEGER,
      originalMediaId TEXT,
      expectedReleaseDate TEXT,
      language TEXT,
      isOngoing INTEGER,
      noEnemies INTEGER DEFAULT 0,
      noAutoDrop INTEGER DEFAULT 0,
      autoTagStatus TEXT,
      releaseStatus TEXT,
      lastSyncAt TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );
  
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL DEFAULT 'default_user',
      mediaId TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      metricType TEXT NOT NULL,
      delta REAL NOT NULL,
      note TEXT,
      thoughts TEXT,
      thoughtPrompt TEXT,
      sessionEnjoyment INTEGER CHECK(sessionEnjoyment IS NULL OR (sessionEnjoyment BETWEEN 1 AND 5)),
      location TEXT,
      isHistoric INTEGER DEFAULT 0,
      bonusMultiplier REAL DEFAULT 0,
      -- When the row was written. The timestamp column is the moment being
      -- recorded, which for a backfilled session is months ago; this is the one
      -- that says whether the account is still being used.
      createdAt TEXT,
      FOREIGN KEY(mediaId) REFERENCES media(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'User',
      profilePic TEXT,
      bio TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      id TEXT PRIMARY KEY DEFAULT 'system',
      igdbClientId TEXT,
      igdbClientSecret TEXT,
      tmdbApiKey TEXT,
      hardcoverApiKey TEXT,
      nanoGptApiKey TEXT,
      nanoGptModel TEXT,
      nanoGptWebModel TEXT,
      nanoGptProvider TEXT,
      nanoGptSearchProvider TEXT,
      nanoGptCreativeModel TEXT,
      geminiApiKey TEXT,
      googleBooksApiKey TEXT,
      imageModel TEXT,
      imageSize TEXT,
      imageSteps INTEGER,
      imageGuidance REAL,
      imageNegativePrompt TEXT,
      aiProvider TEXT DEFAULT 'nanoGpt',
      cliProxyBaseUrl TEXT,
      cliProxyApiKey TEXT,
      cliProxyTextModel TEXT,
      cliProxyCreativeModel TEXT,
      cliProxyImageModel TEXT,
      cliProxyCodexModel TEXT,
      cliProxyCodexPipeline TEXT DEFAULT 'v3'
    );

    CREATE TABLE IF NOT EXISTS global_taxonomy (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL, -- 'genre' or 'tag'
      name TEXT NOT NULL UNIQUE,
      usageCount INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      userId TEXT PRIMARY KEY,
      igdbClientId TEXT,
      igdbClientSecret TEXT,
      tmdbApiKey TEXT,
      hardcoverApiKey TEXT,
      nanoGptApiKey TEXT,
      nanoGptModel TEXT,
      nanoGptWebModel TEXT,
      nanoGptProvider TEXT,
      nanoGptSearchProvider TEXT,
      nanoGptCreativeModel TEXT,
      geminiApiKey TEXT,
      googleBooksApiKey TEXT,
      timezone TEXT,
      aiPersona TEXT,
      masterPageConfig TEXT,
      yearlyGoals TEXT,
      lastActiveDate TEXT,
      currentStreak INTEGER,
      enemyDifficulty REAL DEFAULT 1.0,
      mediaDifficulty TEXT,
      questOffsets TEXT,
      questRerollsUsed TEXT,
      questConfigs TEXT,
      -- Opt out of inactivity aging: no cobwebs, no automatic drop.
      disableAutoDrop INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ai_recaps (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL DEFAULT 'default_user',
      timeframe TEXT NOT NULL,
      timeId TEXT NOT NULL,
      title TEXT,
      summary TEXT,
      data TEXT,
      UNIQUE(userId, timeframe, timeId)
    );

    -- Wrapped has its own editorial lifecycle, independent of ai_recaps.
    -- Request tokens prevent an older model response replacing a newer reroll.
    CREATE TABLE IF NOT EXISTS wrapped_stories (
      userId TEXT NOT NULL,
      timeframe TEXT NOT NULL CHECK (timeframe IN ('week','month','year')),
      timeId TEXT NOT NULL,
      story TEXT NOT NULL,
      generatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      -- One independently generated title illustration per saved story.
      coverArtUrl TEXT,
      coverArtStatus TEXT,
      coverArtRequestId TEXT,
      PRIMARY KEY (userId, timeframe, timeId),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS wrapped_requests (
      userId TEXT NOT NULL,
      timeframe TEXT NOT NULL CHECK (timeframe IN ('week','month','year')),
      timeId TEXT NOT NULL,
      requestId TEXT NOT NULL,
      PRIMARY KEY (userId, timeframe, timeId),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    -- AI-written achievement archive. No fixed definitions, rarity or unlock counter.
    CREATE TABLE IF NOT EXISTS generated_achievements (
      userId TEXT NOT NULL,
      timeframe TEXT NOT NULL CHECK (timeframe IN ('week', 'month', 'year')),
      timeId TEXT NOT NULL,
      position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 2),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      reward TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (userId, timeframe, timeId, position),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_generated_achievements_user
      ON generated_achievements(userId, timeId DESC);

    CREATE TABLE IF NOT EXISTS ai_text_cache (
      key TEXT NOT NULL,
      userId TEXT NOT NULL DEFAULT 'default_user',
      value TEXT NOT NULL,
      PRIMARY KEY (userId, key)
    );


    CREATE TABLE IF NOT EXISTS franchises (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL DEFAULT 'default_user',
      name TEXT NOT NULL,
      coverImageUrl TEXT,
      description TEXT,
      UNIQUE(userId, name)
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      mediaId TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      rarity TEXT NOT NULL, 
      type TEXT NOT NULL,
      earnedAt TEXT NOT NULL,
      durability INTEGER DEFAULT 100,
      maxDurability INTEGER DEFAULT 100,
      slot TEXT,
      isEquipped INTEGER DEFAULT 0,
      targetType TEXT,
      targetValue TEXT,
      bonusPercent INTEGER,
      imageUrl TEXT,
      imageStatus TEXT,
      FOREIGN KEY(mediaId) REFERENCES media(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS world_bosses (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      mediaId TEXT NOT NULL,
      name TEXT NOT NULL,
      level INTEGER NOT NULL, -- 1=Pleb, 2=Easy, 3=Medium, 4=Hard, 5=World Boss
      unit TEXT,
      targetProgress REAL NOT NULL,
      currentProgress REAL DEFAULT 0,
      status TEXT DEFAULT 'Active',
      expiresAt TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT,
      imageUrl TEXT,
      imageStatus TEXT,
      -- Taunted once and never again: a bigger target, a bigger reward, a bigger
      -- penalty, and one more week to settle it.
      enraged INTEGER DEFAULT 0,
      enragedAt TEXT,
      -- Keep the pre-enrage image as an immutable reference for edits and retries.
      enrageOriginalImageUrl TEXT,
      -- Source-of-truth portrait shared by Enrage and Victory transformations.
      basePortraitImageUrl TEXT,
      -- A stale in-flight render must not overwrite a taunt or a reroll.
      imageGenerationToken TEXT,
      FOREIGN KEY(mediaId) REFERENCES media(id) ON DELETE CASCADE
    );

    -- One researched dossier per title, shared by auto-tagging, enemy generation
    -- and item generation. Identity is the title+type (titleKey), not the media
    -- row, so re-runs share one Codex and a Codex researched while adding an
    -- entry is adopted once that entry exists.
    CREATE TABLE IF NOT EXISTS media_codex (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      mediaId TEXT,
      titleKey TEXT NOT NULL,
      title TEXT NOT NULL,
      mediaType TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready', -- generating | ready | failed
      error TEXT,
      data TEXT,                            -- the Codex JSON document
      model TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(userId, titleKey)
    );
    CREATE INDEX IF NOT EXISTS idx_media_codex_media ON media_codex(userId, mediaId);
    -- V2 stage checkpoints survive gateway errors and Docker restarts. Only
    -- the final assembled dossier is published to media_codex.
    CREATE TABLE IF NOT EXISTS codex_v2_runs (
      codexId TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      state TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_codex_v2_user ON codex_v2_runs(userId, updatedAt);
    -- V3 resumes source research without publishing an incomplete Codex.
    CREATE TABLE IF NOT EXISTS codex_v3_runs (
      codexId TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      state TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    -- Complete V3 knowledge survives compilation and is task-retrievable.
    CREATE TABLE IF NOT EXISTS codex_knowledge (
      codexId TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      version INTEGER NOT NULL,
      data TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_codex_knowledge_user ON codex_knowledge(userId);


    -- The lines that appear under a library title.
    --
    -- Two pools, one table, because they are the same kind of thing and want the
    -- same handling. A row with userId NULL is a STARTER: seeded from
    -- server/data/starterFlavorTexts.ts, shared by every account, the floor a new
    -- library stands on. A row with a userId was EARNED — Codex research on a work
    -- that user actually consumed — and belongs to them alone. User X finishing a
    -- book must never put a line in user Y's library, and the userId column is
    -- what makes that structural rather than a filter someone can forget.
    --
    -- The origin column records where a row came from and never changes; retired
    -- hides a row without deleting it, so re-seeding cannot bring back something
    -- that was dismissed.
    CREATE TABLE IF NOT EXISTS flavor_texts (
      id TEXT PRIMARY KEY,
      userId TEXT,                          -- NULL = a global starter line
      mediaType TEXT NOT NULL,
      text TEXT NOT NULL,
      source TEXT,                          -- the work; NULL for a house line
      kind TEXT NOT NULL DEFAULT 'quote',   -- quote | reference | joke
      scope TEXT NOT NULL DEFAULT 'work',   -- work | medium
      attribution TEXT,
      why TEXT,
      mediaId TEXT,                         -- the entry that earned it
      origin TEXT NOT NULL DEFAULT 'starter', -- starter | codex
      retired INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );
    -- Two partial indexes rather than one over (userId, mediaType, text): SQLite
    -- treats NULLs as distinct in a unique index, so the global rows would not be
    -- de-duplicated by a single index and every restart would seed them again.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_flavor_global
      ON flavor_texts(mediaType, text) WHERE userId IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_flavor_user
      ON flavor_texts(userId, mediaType, text) WHERE userId IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_flavor_media ON flavor_texts(userId, mediaId);

    -- Locations are free text on each log. A group is a label laid over them —
    -- "Cinema", "Home", "Travelling" — that says which places belong together
    -- without rewriting a single log, which is what merging does instead.
    CREATE TABLE IF NOT EXISTS location_groups (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      icon TEXT,
      createdAt TEXT NOT NULL,
      UNIQUE(userId, name)
    );

    -- Membership is many-to-many on purpose: a local cinema belongs in "Cinema"
    -- and in the town it is in, and both readings are useful.
    CREATE TABLE IF NOT EXISTS location_group_members (
      groupId TEXT NOT NULL,
      userId TEXT NOT NULL,
      location TEXT NOT NULL,
      PRIMARY KEY (groupId, location),
      FOREIGN KEY(groupId) REFERENCES location_groups(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_location_group_members_user
      ON location_group_members(userId, location);

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      type TEXT NOT NULL,        -- media_update | media_released | recap_ready | boss_expiring
      title TEXT NOT NULL,
      body TEXT,
      mediaId TEXT,              -- optional subject, for deep-linking
      link TEXT,                 -- optional in-app route
      -- Stable per-event identity. Producers run on a schedule, so this is what
      -- stops a daily sweep from re-announcing the same thing every morning.
      dedupeKey TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      readAt TEXT,
      UNIQUE(userId, dedupeKey)
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user
      ON notifications(userId, readAt, createdAt DESC);

    -- One row per browser or phone that has granted permission. A single user
    -- can have several: the endpoint is what the push service issued, so it is
    -- the identity rather than the user.
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      userAgent TEXT,
      createdAt TEXT NOT NULL,
      lastSuccessAt TEXT,
      -- Push services answer 404 or 410 once a subscription is dead. That is the
      -- only reliable signal it will never work again, so it is recorded and the
      -- row dropped rather than retried forever.
      failureCount INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
      ON push_subscriptions(userId);
  `);
}
