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
      location TEXT,
      isHistoric INTEGER DEFAULT 0,
      bonusMultiplier REAL DEFAULT 0,
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
      geminiApiKey TEXT,
      googleBooksApiKey TEXT,
      imageModel TEXT,
      imageSize TEXT,
      imageSteps INTEGER,
      imageGuidance REAL,
      imageNegativePrompt TEXT
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
      geminiApiKey TEXT,
      googleBooksApiKey TEXT,
      timezone TEXT,
      masterPageConfig TEXT,
      yearlyGoals TEXT,
      lastActiveDate TEXT,
      currentStreak INTEGER,
      enemyDifficulty REAL DEFAULT 1.0,
      mediaDifficulty TEXT,
      questOffsets TEXT,
      questRerollsUsed TEXT,
      questConfigs TEXT
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
      FOREIGN KEY(mediaId) REFERENCES media(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS oracle_messages (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT, -- 'morning', 'evening'
      timestamp TEXT NOT NULL
    );
  `);
}
