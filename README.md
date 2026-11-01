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

## CLIProxyAPI as an alternative AI provider

The global **Settings → System → API Integrations → AI Models** selector supports
**NanoGPT** (default, unchanged) and **CLIProxyAPI** (ChatGPT subscription via
a local Codex OAuth gateway). Analytical text, creative text, and image model IDs
are configured independently for CLIProxyAPI; the original NanoGPT settings
remain available when switching back.

CLIProxyAPI settings:

- **Base URL:** The URL visible to the *FauxLore server*, ending in `/v1`.
- **API Key:** The locally configured gateway access key, not an OpenAI API key.
  Its saved value is never returned by `/api/system-settings`. Leave the
  input blank to keep the saved key, or enter a new value to replace it.
- **Text models:** Use a chat-completions-compatible model returned by CLIProxyAPI
  (e.g. `gpt-6.1-sol`). The creative slot defaults to the analytical slot.
- **Image model:** Use a supported image model (e.g. `gpt-image-2`).
  Image generation uses `/v1/images/generations` with `b64_json`; FauxLore
  saves the decoded image in its existing local uploads directory. Diffusion
  step counts and CFG do **not** apply. Image sizes map to 1024×1024,
  1536×1024 or 1024×1536, and negative prompts are phrased as best-effort
  natural-language constraints.

**Provider isolation:** When CLIProxyAPI is selected, ordinary text, image
generation, and explicit web-search requests use CLIProxyAPI. Codex research
uses its native Responses web search; no automatic paid NanoGPT fallback.
Selecting NanoGPT restores its original online-search models and settings.

### CLIProxyAPI and FauxLore in separate Docker Compose stacks

The gateway published on Windows at `127.0.0.1:3002` is **not** reachable from
inside the FauxLore container via `localhost:3002`. Its internal Docker port is
8317. Connect both containers to the same Docker network:

```powershell
docker network ls
docker network connect cliproxyapi_default fauxlore-app
```

Then use **`http://cli-proxy-api:8317/v1`** in FauxLore's global CLIProxyAPI
Base URL setting, and enter the local gateway access key. The network name
above is from the default CLIProxyAPI Compose project; check `docker network ls`
if yours differs. A manual `docker network connect` must be repeated after
recreating the FauxLore container. **Recommended:** use the optional included
`docker-compose.cliproxy.yml` overlay to keep that connection attached
across rebuilds:

```powershell
docker compose -f docker-compose.yml -f docker-compose.cliproxy.yml up -d --build
```

Use that same `-f` pair for later `up`, `build` and `down` operations.
The overlay assumes the CLIProxyAPI Docker network exists. **It is opt-in**
so FauxLore can still start without CLIProxyAPI when only NanoGPT is used.

Do not publish CLIProxyAPI's management or authenticated endpoints to the
internet. The existing loopback-only Windows port mapping can stay unchanged.


### CLIProxyAPI native web search for Codex (new)

With the global provider set to **CLIProxyAPI**, Codex compilation now uses the
**Codex Responses API** (`POST /v1/responses`) with
`tools: [{ "type": "web_search" }]`, `tool_choice: "required"`,
`include: ["web_search_call.action.sources"]`, `store: false`, and SSE streaming.
The **Codex Research Model** setting selects the model independently from
analytical/creative models (default: `gpt-6.1-sol`).

This mode **does not invoke NanoGPT search or Linkup Deep**. A completed native
web search with source receipts and a structurally usable dossier is required
before a Codex will be saved. Model-only responses, missing citations, incomplete
streams, and API errors are surfaced as failures without a paid fallback.
When the global provider is **NanoGPT**, the existing deep search still works
exactly as before. Other AI helpers that request web search (for example missing-art-direction
research) also use native CLIProxyAPI Responses search while CLIProxyAPI is
selected. NanoGPT research backends are used **only** when NanoGPT itself is
selected. The legacy nano-gpt proxy routes remain named for compatibility.

*Validation*: mocked SSE parser tests cover search-source receipts,
memory-only responses, split frames and incomplete streams. A real end-to-end
test requires your locally authenticated CLIProxyAPI container and a model
that supports native Responses `web_search`. The build/CI cannot validate
those external conditions. If your gateway version does not forward
`web_search_call.action.sources`, update CLIProxyAPI and retest before
loosening source-verification rules.

### Codex editorial quality controls

Codex generation now separates the main research from **at most one optional,
focused follow-up** when using CLIProxyAPI's native search:

- **Abundant, well-documented work with fewer than five distinct memories:**
  a separate targeted search asks for distinct in-work quotations, signature
  interactions and community memories. It must return per-entry source URLs
  matching the gateway's actual web-search receipts. New memories are deduped
  against the existing set by subject/topic, not just exact wording. A second
  Mako joke is not more coverage of Mass Effect.
- **A book with a shallow early dossier (few characters and plot beats):**
  a targeted lookup seeks narrative structure and genuinely different verified
  moments beyond the publisher's synopsis. Only evidence-backed, sufficiently
  specific material may replace a bibliographic-only structure or supplement
  scenes. A recent/obscure work with **thin** coverage does not get fabricated
  memories just to fill a quota.
- **NanoGPT mode remains single-pass** because each deep-search call is billed.
  The optional follow-up never silently falls back to NanoGPT.
- If that follow-up fails, the already valid main dossier is still saved; the
  error is reported in diagnostics. There is at most one added call.
- Quality warnings and section-confidence downgrades flag a book whose
  narrative structure is still mere metadata, or a well-documented work whose
  memories remain sparse. A list's raw length does not prove correctness.
- Existing saved Codexes are **not** mutated on app startup. Regenerate or
  explicitly expand a Codex to apply the new logic. Expanded entries remain
  additive except that semantically duplicate researched memory lines are
  pruned; the code does not rewrite previously researched plot events.

Source receipts confirm that an URL appeared in a native search. They cannot,
by themselves, confirm every factual claim on the page; editorial QA is
best-effort and deliberately conservative. This change does not promise that
an undocumented new novel will suddenly have detailed accessible canon.
