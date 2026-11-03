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
  Ordinary image generation uses `/v1/images/generations` with `b64_json`;
  FauxLore saves the decoded images in its existing uploads directory.
  **Boss state artwork (Enrage + Victory):** The first normal portrait is
  recorded as an immutable base reference. Taunting an enemy generates a
  source-appropriate enraged depiction; defeating one generates a defeated
  aftermath instead, preserving its original silhouette, face, outfit and gear.
  Even if an enraged enemy is defeated, Victory edits use the ORIGINAL image,
  not the enraged version. GPT Image 2.5 uses `/v1/images/edits` with the
  original local image encoded privately; NanoGPT and unsupported edits use
  separate, accurate text-only state prompts. Defeat is not automatically
  death or gore; comedic and nonviolent enemies lose in their own style.

  The trigger covers progress logs, completing media and difficulty changes.
  Both state transitions return promptly, then render in the background; the
  UI polls for completion. Image generation tokens prevent older overlapping
  renders from overwriting a new state, and a reroll clears the previous enemy's
  reference. A legacy `enrageOriginalImageUrl` snapshot is still supported;
  the canonical field going forward is `basePortraitImageUrl`.
  Unavailable references and unsupported edit routes fall back to text-only
  generation; auth, rate-limit and transient failures do not silently retry
  with a second paid call. Diffusion steps and CFG do **not** apply; image
  sizes map to 1024×1024, 1536×1024 or 1024×1536.

  Image state regression tests: `npm run test:boss-state-images`.
  This tests local prompt and reference handling; a live gateway test is still
  required to verify the configured CLIProxyAPI image-edit endpoint.

### Dungeon Achievements as Recap/Wrapped souvenirs

Achievements now celebrate the **defining, evidence-backed events and themes**
of a period, including the same subjects already prominent in its Recap or
Wrapped. Selecting an obscure detail merely because the recap has not mentioned
it is no longer a goal. A central highlight should anchor the first (or only)
achievement. A multi-achievement set should have distinct significant
highlights, rather than redundant versions of the same moment.

Achievements still invent their own title, joke, narrative angle and purely
imaginary reward; they **do not copy** existing recap/Wrapped prose or invent
user actions. Older achievement titles and punchlines remain anti-duplication
references, but a beloved medium can recur across time periods when there is
new logged evidence.

When a Wrapped already exists at generation time its themes also inform the
award selection; otherwise the saved Recap provides the primary editorial
throughline. Archived achievements are not silently rewritten. Use
**Reforge achievements** in either the Wrapped view or its deep-dive recap to
replace only that period's set. The prior set remains intact if generation fails,
and an atomic save prevents a half-updated set.

Tests: `npm run test:achievements`.

### Wrapped: AI-directed dynamic scene compositions

Wrapped is now a **two-pass experience**. The existing Story Director first
writes a fully evidence-grounded editorial story. A separate Visual Director
then designs **every scene** individually, from opening to finale, using a
restricted scene-composition JSON format plus a cinematic/data/typography
direction shared with image generation. Weak or invalid compositions still
fall back to the original layout; the Director is asked to create a meaningful
visual concept, not just more decorative circles or book-cover grids. This format supports freely positioned
headlines, narration, media artwork, title art, verified numeric comparisons,
chronological beats, real user quotes and geometric shapes, plus entry and
subtle ambient animations.

These scenes use `DynamicStorySlide` and a bounded percentage-coordinate desktop
canvas. Mobile automatically uses a readable vertical composition rather than
scaling the desktop layout. Motion respects reduced-motion preferences.
Older Wrapped issues without a composition and any invalid AI output
retain their trustworthy preset layouts. Dynamic headline/body rectangles
automatically fit their content rather than becoming scrollable text windows.

**Security and factual integrity:** The model cannot output or execute HTML,
CSS or JavaScript. The shared `normalizeDynamicScene` schema is enforced both
when the visual ideas are created and again by the API when they are saved.
It reconstructs only approved element types, positions, animations and visual
tokens. Media references must belong to the **existing verified scene**;
numbers, quotes and timeline labels are always resolved from that verified
scene at render time, not supplied by the model. Invalid layouts are skipped,
not allowed to corrupt a saved Wrapped.

New Wrapped generation automatically attempts the independent visual pass
after the written story has passed validation. If that optional AI call fails,
the written Wrapped still saves and displays. Use **Restyle scenes** on an
existing Wrapped to generate fresh designs and repaint the title/chapter
illustrations without changing its story text, statistics or achievements.
Rerolls use a saved
`visualRevision` token, rejecting stale changes from other tabs; existing
visuals remain visible if a reroll fails. Restyling also regenerates the
interior illustrations to match newly proposed visual concepts.

Tests: `npm run test:wrapped-visuals` (or `npm run test:wrapped`).
These exercise parser isolation, media/stat provenance, invalid layouts,
AI proposals and the save boundary; a live GPT model + browser render test
still requires the local configured provider.

### Wrapped: Cinematic Editorial (full-bleed visual direction)

Wrapped's Visual Director now uses a **Cinematic Editorial** contract for each
scene. Instead of asking an image model to position every title in a little
percentage box inside a colorful card, it supplies a validated design plan:

- `direction.presentation`: `cinematic`, `data`, `typography` or legacy `composed`
- `direction.textSide`: `left`, `right` or `center`
- `direction.textPosition`: `top`, `middle` or `bottom`
- `direction.imageFocus`: `left`, `right` or `center`

**Cinematic** renders the generated 3:2 image as an actual edge-to-edge
background of the whole story slide, without a second colorful frame, image
panel, or card-within-card. React owns typography, the responsive reading
column, subtle contrast overlays and placement, while the image provider
receives the *same* editorial text-side and subject-focus specification.
An inconsistent focal point is corrected away from the headline region.
Existing generated opening/chapter images gain full-bleed presentation too;
new scenes can use precise placement and a specific art concept.

**Data** is intentionally image-free: verified numbers are presented as
dominant editorial graphics with clear labels and understated dividers.
**Typography** provides quiet, spacious editorial finales and reflective
interludes. `composed` and the original fixed layouts remain available for
advanced sequences, invalid/failed AI compositions or old stories without a
dynamic design.

The image selector budgets **up to three original interior chapter images**
plus the opening illustration, but excludes `outlier`/`taste` statistical
comparison scenes from paid image requests. This is a maximum, not a quota.
The story-writing prompt now explicitly forbids consecutive slides repeating
the same claim with different visuals: a hook should not spoil the next
infographic. After **Restyle scenes**, the opening illustration and chapter
artwork are both regenerated so their focal framing matches the new layout;
the story stays hidden until the image jobs complete or fail. Existing story
text, numbers, provenance and achievements do not change.

Image model final priorities no longer override the requested focus with a
fixed "text-left / subject-right" instruction. Neither the director nor the
saved composition can execute arbitrary HTML, CSS or JavaScript.

### Wrapped: optional visual self-insert

**Settings → Base Preferences → Visual Self-Insert** stores a private,
account-specific appearance description (up to 700 characters) with three
modes: **Never** (default, no appearance sent to image providers), **Auto**
(use the owner only when a natural human protagonist benefits the image), and
**Prefer** (favor the owner over a generic human when the scene genuinely
needs a personal protagonist). Both Auto and Prefer require a non-empty
description and NEVER force a person into an abstract concept or replace
fictional/source characters. Settings use per-user database columns, not
system-wide image settings, and missing fields in partial settings POSTs
preserve existing values.

Both the Wrapped opening cover and up to three original chapter illustrations
read that account's profile at render time. The AI receives a bounded
appearance description as optional factual guidance. This does not affect
story narration, achievements, other account images or previously saved
artwork. To apply a changed description to an existing Wrapped, explicitly
use **Redraw title artwork** and/or **Redraw chapter artwork**; no automatic
mass-regeneration occurs.

Private appearance text is redacted from exportable image diagnostics.
The configured external image provider still receives those appearance
details when the user enables Auto/Prefer, so users should only provide
details they're comfortable transmitting. No reference-photo upload or
biometric face matching is implemented in this text-first version; the
settings schema can later be extended to opt-in image references.

Tests: `npm run test:visual-self` (also included in `npm run test:wrapped`).

### Wrapped: original chapter illustrations and complete first reveal

The same configured image provider can now generate **up to three additional,
original 3:2 chapter illustrations** for important interior story beats, chosen
deterministically by narrative relevance. Prompts are written from the actual
scene premise and optional model-authored `artConcept`, not a list of every
logged medium. One strong editorial metaphor or coherent scene is preferred to
a franchise collage. Each illustration is stored by the scene's ID and
persisted separately from story text and the opening title image.

**First reveal waits for artwork**: a newly generated or previously unillustrated
Wrapped shows a deliberate loading screen until its title and chapter images
finish, or generation fails. This avoids flashing an unrelated media-cover
placeholder before the real illustration appears. If an image fails, verified
story text and the traditional cover/scene renderer remain available. Restyling
also repaints the chapter illustrations, and waits until the new visuals are
ready to avoid showing mismatched old artwork with the new compositions.
The **Redraw chapter artwork** control retries or rerolls only interior images.

Jobs have separate request tokens and statuses, are limited to three interior
images per issue, and do not auto-retry on failed providers. They are not
re-generated at every visit. `npm run test:wrapped` covers their lifecycle,
restart recovery and stale-image protection.

### Wrapped: AI-generated title illustrations

Every **Weekly, Monthly and Yearly Wrapped** can have one independent 3:2
title illustration on its opening slide. These images are **editorial key art,
NOT visual summaries or collages**. Art direction starts from the saved
Wrapped's central thesis and ONE relevant story beat, producing one strong
visual metaphor / hero motif rather than trying to depict every logged title.
When a specific work genuinely dominates the Wrapped narrative, the image
may borrow at most ONE verified work as optional visual inspiration. Otherwise
the cover can be completely abstract and feature no franchise imagery at all.
Logs still verify that a real period of activity exists; no invented user
actions, unrelated game characters, cover grids or multiple worlds are added.
The reporting timezone is stored with the issue to respect period boundaries.
The image does **not** contain typography: the real Wrapped title is overlaid
by the UI. Official media covers remain available as factual references and
fallbacks on interior slides that do not have original chapter illustrations.

The cover uses the selected global image provider (GPT Image 2.5 via
CLIProxyAPI, or the configured NanoGPT image model). It is generated and saved
in the background after a new story is stored, and once when an existing older
Wrapped is first opened. The same saved image is reused on later visits;
opening an issue never generates another cover if one already exists. A
**Redraw title artwork** button rerolls only the illustration using the
current one-motif art direction, leaving the narrative, statistics and
achievements untouched. Existing generated images stay as-is until redrawn. Failed image generation
leaves the saved Wrapped intact and shows a retry button.

Story and cover generation have separate request tokens so old in-flight
renders cannot overwrite a newer Wrapped reroll. Repeated requests do not
start duplicate image jobs. Images for dormant accounts are not automatically
generated, and restart-interrupted jobs move to a retryable failed state.

Tests: `npm run test:wrapped` and `npm run test:image-prompting`.
A real image-output test still requires an authenticated local provider.

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

### Codex V2: staged evidence-first research

When the global AI provider is CLIProxyAPI, **Codex Generation Pipeline** in
System & Keys can select:

- **V2 (default)**: four narrow native Responses-web_search phases (identity,
  narrative/craft, canonical entities, audience/memories), followed by a short
  **no-search plausibility review** and one **non-search** compilation using the selected
  **Codex Research Model**. Choose `gpt-6.1-sol` for this slot independently
  from analytical/creative `gpt-6.1-terra` models. Model capability and
  quality must be tested on actual dossiers; no guarantee is implied.
- **Legacy**: the pre-V2 one-pass Codex with a possible targeted top-up.
- **NanoGPT**: remains on its existing single deep-search call. Neither
  mode silently routes a failed CLIProxy search through paid NanoGPT.

The existing final `CodexData` shape is unchanged. Every V2 fact must link to
an actual search receipt. The brief reviewer only flags obvious mistakes;
**unmentioned claims are kept**, and each rejection needs an explicit reason. The final no-search
compiler cannot add unapproved named characters, canonical objects, quotes or
signature moments. This substantially reduces unsupported details, but a
search result's URL alone still cannot prove every sentence of its page.

V2 saves each completed phase into SQLite (`codex_v2_runs`) and resumes
after errors/restarts when the **work, model and previous Codex inventory**
match. Checkpoints are cleared only after the final Codex has been stored.
A failed regeneration leaves the last ready dossier intact. Existing Codexes
are never overwritten on deployment.

The Media Codex panel starts long requests **asynchronously** so browser and
reverse-proxy request timeouts do not interrupt server-side research. The panel
polls every four seconds and shows the current phase and completed count.
A typical V2 Codex runs more tool calls and may take noticeably longer than
Legacy, especially on new or obscure works. Phase and model usage are logged
separately in Diagnostics.

To compare pipelines, regenerate the **same exact edition** in V2 and Legacy
(or save diagnostics before replacing the dossier), then compare source
attribution, factual contamination from other franchise entries, specificity,
memories and total runtime. The staged method does not justify filling a new
book's missing memories with invented quotations.


### Codex V3: durable knowledge base, tags and Wrapped context

With CLIProxyAPI selected, choose **V3: Coverage-driven knowledge base**
in System & Keys. Its dedicated Codex research model (e.g. gpt-6.1-sol) is
independent of the Terra text/creative models. V2 and Legacy remain selectable.
Existing dossiers are not automatically regenerated or overwritten on upgrade.

V3 builds a named **Coverage Manifest** (important characters, locations,
objects and events), then searches core identity, cast and relationships,
world/items/technology, story events, visual/cultural design and fandom.
An optional targeted repair addresses missing essential/important inventory
targets. A short, no-web plausibility review can reject obvious wrong-work
facts with reasons. It does not force every claim through a second web search.
Unknown/uncertain source URLs remain attached with provenance; they do NOT
delete an important researched item.

Intermediate work is durable in SQLite table codex_v3_runs; completed stages
resume on retry after a failure. Once finished, the full relationship-rich
knowledge base is saved atomically to codex_knowledge alongside the existing
CodexData projection in media_codex. No expensive final model rewrite. The
user-facing CodexData, enemies, loot, images and existing clients stay compatible.

The task-specific context builder selects the always-relevant core plus
specialized knowledge for Enemy Forge, Loot Forge, images and Auto Tag.
Classification is based on Codex themes/genres/tags but is mapped into the
EXISTING FauxLore taxonomy by autoTag.ts; a research model does not create
arbitrary library tags. For Spotify-Wrapped-like Recaps, the app retrieves
only general work identity/tone/genre information about active titles.
Personal playtime, completion, ratings, journal and achievements are supplied
strictly by FauxLore's user data, never inferred from the media Codex.
Spoiler-specific event records are never sent to Wrapped.

No stored content is truncated to fixed cast or memory counts. Task retrieval
has a character budget to avoid flooding other model calls, but the complete
knowledge persists for subsequent tasks. A comprehensive V3 run can take
10-15 minutes or more, depending on the title and gateway. The current
offline tests cover checkpoint recovery and data preservation; genuine Sol
quality and usage still require real local gateway tests.
