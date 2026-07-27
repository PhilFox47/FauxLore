import type DatabaseConstructor from "better-sqlite3";
import type { CodexService } from "./services/codex";
import type { GeneratedEnemy } from "./services/worldBoss";

/** The better-sqlite3 database instance type. */
export type Db = DatabaseConstructor.Database;

/**
 * Shared dependencies passed to every route-registration module.
 *
 * The route handlers were originally closures defined inside a single
 * `startServer()` function, so they referenced these helpers by name. Each
 * route module destructures the names it needs out of this context, which lets
 * the handler bodies remain byte-for-byte identical to the original server.
 */
export interface ServerContext {
  db: Db;
  getAuthUser: (req: any, res?: any) => string | null;
  normalizeMedia: (row: any) => any;
  safeJsonParse: (str: any) => any[];
  syncOngoingMediaInBackground: (userId: string) => Promise<void>;
  createDatabaseBackup: () => { success: boolean; file?: string; error?: string };
  generateOracleMessage: (userId: string, type: "morning" | "evening") => Promise<void>;
  spawnWorldBoss: (userId: string, throwOnEmpty?: boolean, targetMediaType?: string) => Promise<void>;
  generateEnemy: (userId: string, mediaItem: any, level: number) => Promise<GeneratedEnemy | null>;
  // Both image jobs read everything they need (including the AI-written image
  // prompt) off the row itself, so callers only identify what to draw.
  generateBossImageBackground: (userId: string, bossId: string) => Promise<void>;
  generateArtifactImageBackground: (userId: string, artifactId: string) => Promise<void>;
  codex: CodexService;
  hltbSearch: (query: string) => Promise<any[]>;
  getIgdbToken: (clientId: string, clientSecret: string) => Promise<string>;
}
