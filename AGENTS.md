# AGENTS.md

Guidance for AI coding agents working on FauxLore. For the human-facing overview, see `README.md`.

## Project overview

FauxLore is a self-hosted media tracker (games, visual novels, books, audiobooks, manga, comics, series, movies) with statistics and a gamified RPG layer (world bosses, loot/artifacts, quests, recaps, lore titles). It runs as a **single Node process**: Express serves the API and the built React SPA (and proxies Vite in dev), backed by one SQLite file.

- Frontend: React 19, Vite 6, Tailwind CSS 4, React Router — `src/`
- Backend: Express 4, `better-sqlite3`, TypeScript run via `tsx` in dev / bundled with esbuild for prod — `server/`
- AI: NanoGPT (OpenAI-compatible chat + image endpoints), with Gemini as a legacy fallback
- Metadata sources: IGDB (+ HowLongToBeat), TMDB, VNDB, MangaDex, Google Books/Hardcover, GameStoryLog

## Setup and commands

Requires Node.js 22+.

```bash
npm install
cp .env.example .env     # all keys optional; most are also configurable in Settings
npm run dev              # Express + Vite on http://localhost:3000 (admin / admin on first boot)
npm run lint             # tsc --noEmit — the type check; this is the "lint" step
npm run build            # vite build + esbuild bundle -> dist/server.cjs
npm start                # run the production bundle
```

`eslint.config.js` exists but ESLint is not installed; `npm run lint` is only the TypeScript check.

## Before you finish a change

1. `npx tsc --noEmit` must pass.
2. `npm run build` must succeed (it catches bundling problems the type check does not).
3. There is **no test framework** in this repo. Verify behavior with a throwaway script at the repo root (e.g. `_check_thing.ts`) run via `npx tsx _check_thing.ts`, then delete it before committing. Useful patterns:
   - In-memory DB: `new Database(":memory:")`, then `initSchema(db)` (`server/db/schema.ts`) and `runMigrations(db)` (`server/db/migrations.ts`). Call `initDiagnostics(db)` if the code under test writes diagnostics.
   - Real routes: build an `express()` app, pass a minimal fake `ServerContext` to the `register*Routes` function, `listen(0)`, and hit it with `fetch`.
   - External APIs: stub `globalThis.fetch`, matching on the **host** (e.g. `nano-gpt.com`, `api.mangadex.org`) so you don't also intercept requests to your own local test server.
4. Never leave `_*.ts` scratch files, `dist/` changes or test databases in a commit.

## Repository layout

```
server/
  index.ts          bootstrap: DB, services, cron jobs, ServerContext, route registration
  context.ts        ServerContext — the shared dependency bag every route module receives
  db/schema.ts      base CREATE TABLE statements
  db/migrations.ts  additive, idempotent migrations (run on every boot)
  routes/           one module per API area; each exports register*Routes(app, ctx)
  services/         stateful features (codex, autoTag, loot, worldBoss, images, metadataRefresh,
                    notifications, coverCache, flavorLibrary, …), created via create*Service(...)
  integrations/     clients for external sources (IGDB, VNDB, MangaDex, release feeds, …)
  lib/              shared helpers: ai.ts (NanoGPT client), diagnostics.ts, httpDispatcher.ts, normalize.ts, …
src/
  pages/ components/ contexts/ hooks/ lib/ services/ types/
  types/schema.ts   shared MediaItem / Settings / etc. types
  lib/scaling.ts    "Master Pages" conversion (see below)
scripts/            one-off seeding/exploration scripts — not part of the app, excluded from tsc
taxonomy.json       genre/tag seed data
```

## Conventions

### Database

- New columns go in `server/db/migrations.ts` as `try { db.prepare("ALTER TABLE … ADD COLUMN …").run(); } catch (e) {}` — idempotent and guarded. Do not edit historic migration steps; add new ones at the end. Pointing a new build at an existing production DB must always be safe.
- `better-sqlite3` **throws** if a named `@param` in the SQL is missing from the params object. When you add a column to an `INSERT … VALUES (@…)` statement, add the key to the `.run({...})` object too — a missing key silently breaks the whole save route (it lands in the route's `catch` as a 500).
- Booleans are stored as `0`/`1` integers and converted in `server/lib/normalize.ts`; JSON arrays are stored as strings.

### Server structure

- Route handlers get dependencies from `ctx` (`ServerContext`). When a route needs a new service function, add it to `ServerContext` in `context.ts`, wire it in `index.ts`, and destructure it in the route.
- Long-running or network-heavy work triggered by a request (auto-tagging, cover downloads) is fire-and-forget with a `.catch()` log, so it never blocks the response. Work behind an explicit user button is awaited.
- Admin-only routes check the user's role (see `requireAdmin` in `server/routes/diagnostics.ts`). Token-spending endpoints call `activity.requireActive(...)` so dormant accounts don't spend AI credits.

### AI calls

- Server-side generation goes through `nanoGenerateText` in `server/lib/ai.ts`. It handles model selection (analytical / web / creative tiers), web search, streaming, retries on transient errors, and diagnostics logging.
- The client talks to NanoGPT through the passthrough proxies `/api/nano-gpt/chat/completions` and `/api/nano-gpt/images/generations` (`server/routes/ai.ts`, scope `client`/`client-image`).
- Every NanoGPT `fetch` must use `longRequestDispatcher` from `server/lib/httpDispatcher.ts` plus an explicit `AbortSignal.timeout(...)`. Without it Node aborts after 300s with a bare `fetch failed`, which kills long non-streamed generations.
- Every AI call must be logged: `recordAiCallStart` / `recordAiCall` / `recordPayload` from `server/lib/diagnostics.ts`, with a paired `callId` and a meaningful `scope`. The Diagnostics panel and exports only show what is logged this way; a new AI code path without it is invisible when debugging.
- Don't put API keys or secrets into logs or payloads; `diagnostics.ts` redacts known patterns, but don't rely on that.

### The Codex (`server/services/codex.ts`, `codexResearch.ts`)

A Codex is a researched per-title dossier that grounds enemy, loot, image and tag generation.

- **Exactly one deep-search call per Codex** (Linkup deep via NanoGPT `:online/linkup-deep`). No automatic retries, fallbacks or follow-up calls — each extra call doubles the running cost. A thin result is saved as-is; a completely unusable reply fails, keeps any previous Codex, and records a `codex_failed` notification so the user can re-run it manually.
- Unreleased media never get a Codex.
- The prompt must never invent facts; empty fields are valid output.

### Metadata imports

- Genres, tags **and franchises** are never copied from external sources. Genres/tags come from auto-tagging against the shared taxonomy; franchises are entered manually (with autocomplete in `MediaFormModal`). Importing them fragments the taxonomy and splits universes.
- Covers are cached locally by `server/services/coverCache.ts` and stored as root-relative `/uploads/covers/…` paths. Treat those as same-origin: don't route them through `/api/image-proxy`. `coverCache.cacheCover` rejects MangaDex's square hotlink placeholder.
- MangaDex: `title` = original (native/romanized) title, `subtitle` = English title from `title.en` or `altTitles`. Covers are English per volume if any exist, otherwise Japanese (never mixed), matched to reading progress via `server/integrations/mangadexCovers.ts` and `media.mangaCoverIndex`. MangaDex image requests from the browser need `referrerPolicy="no-referrer"`.
- The daily `metadataRefresh` sweep (`server/services/metadataRefresh.ts`, cron 04:30) is the one place that re-checks sources for tracked entries. Extend it there rather than adding parallel sync mechanisms.

### Master Pages

All progress is normalized to "Master Pages" (1 book page = 1 Master Page). Per-type multipliers live in `src/lib/scaling.ts` (`calculateScaledPages` and `calculateScaledDelta`, which duplicate the defaults) and are user-overridable via `settings.masterPageConfig`. `server/routes/logs.ts` repeats some of these defaults for durability/boss progress — keep all copies in sync when changing a default.

### Code style

- TypeScript everywhere; match the style of the file you're editing.
- Comments explain **why** (a constraint, a measured failure, a non-obvious trade-off), not what the code does. Don't reference the current task or ticket in comments.
- Prefer editing existing modules over adding new ones; don't leave dead code or unused exports behind.
- UI text is English.

## Git

- Keep commits focused, with a message that explains the root cause and what was verified.
- Don't commit `.env`, databases (`*.db`), `data/`, `uploads/`, `backups/` or `dist/`.
