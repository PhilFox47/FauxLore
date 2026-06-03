<div align="center">
  <img width="120" alt="FauxLore" src="https://i.imgur.com/97UOYvQ.png" />
  <h1>FauxLore</h1>
  <p>A self-hosted media tracker for games, books, anime, manga, movies & series — with deep statistics and a gamified RPG layer (world bosses, artifacts, quests, streaks, and an AI "Oracle").</p>
</div>

## Stack

- **Frontend:** React 19 + Vite 6 + Tailwind CSS 4 (`src/`)
- **Backend:** Express + `better-sqlite3`, written in TypeScript (`server/`)
- **Single process:** the Express server also serves the built SPA in production and proxies Vite in development.
- **Storage:** a single SQLite file (`fauxlore.db`) plus on-disk `uploads/` (AI images) and `backups/`.
- **Integrations:** IGDB (+ HowLongToBeat), TMDB, VNDB, MangaDex, Google Books, Gemini, and NanoGPT.

## Run locally

**Prerequisites:** Node.js 22+.

```bash
npm install
cp .env.example .env   # then fill in any keys you want (all optional except where a feature needs them)
npm run dev            # starts the Express + Vite dev server on http://localhost:3000
```

A default admin account is created on first boot: **username `admin`, password `admin`** — change it in Settings.

### Production / Docker

```bash
npm run build          # builds the SPA (dist/assets) and bundles the server (dist/server.cjs)
npm start              # NODE_ENV=production node dist/server.cjs
# or:
docker compose up --build
```

`docker-compose.yml` mounts `./data` into the container and sets `DATA_DIR=/app/data`, so the database and uploads persist across restarts.

## Database & migrations

The database lives at `${DATA_DIR}/fauxlore.db` (where `DATA_DIR` defaults to the current working directory). The schema is created on boot via `CREATE TABLE IF NOT EXISTS`, and additive migrations (`ALTER TABLE …`, data backfills, and seeds) run on every startup. **Every migration step is idempotent and guarded**, so pointing a new build at an existing database is safe and non-destructive.

**To migrate an existing (production) database to this version:** stop the old app, copy your existing `fauxlore.db` into the `DATA_DIR` used by the new app (e.g. `./data/fauxlore.db` with Docker Compose, or `./fauxlore.db` for a local run), then start it. Pending migrations apply automatically; a timestamped backup is also taken daily and retained for 28 days under `${DATA_DIR}/backups/`.

## Configuration (`.env`)

All keys are optional and can also be set per-user (or system-wide by an Admin) in **Settings → API Integrations**; environment variables act as fallbacks. See `.env.example` for the full list (`GEMINI_API_KEY`, `IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET`, `TMDB_API_KEY`, `HARDCOVER_API_KEY`, `PORT`, …).

> **Security note:** `GEMINI_API_KEY` is exposed to the browser bundle (via Vite's `define`) so the client can call Gemini directly as a fallback when no per-user key is set. If you host this publicly, prefer configuring Gemini per-user in Settings and leaving the env var unset.

## Project layout

```
src/                     React SPA
  components/ pages/ contexts/ hooks/ lib/ services/ types/
server/                  Express backend
  index.ts               app bootstrap, cron jobs, route wiring
  context.ts             shared ServerContext passed to route modules
  db/                    schema.ts (DDL) + migrations.ts
  lib/                   pure helpers (row normalization, taxonomy counts)
  services/              auth, backup, media sync, AI images, oracle, world boss
  integrations/          HowLongToBeat + IGDB clients
  routes/                one module per API area (media, logs, settings, search, …)
taxonomy.json            seed data for genres/tags (loaded on first boot)
scripts/                 one-off data-seeding & API-exploration scripts (not part of the app)
```

## Scripts

- `npm run dev` — dev server (Express + Vite middleware)
- `npm run build` — build SPA + server bundle
- `npm start` — run the production bundle
- `npm run lint` — TypeScript type-check (`tsc --noEmit`)
- `npm run clean` — remove `dist/`
