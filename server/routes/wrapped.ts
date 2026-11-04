import { createManualWrappedIntentGate } from '../lib/manualWrappedIntent';
import { diag } from '../lib/diagnostics';
import { FAUXLORE_RUNTIME_BUILD } from '../../src/lib/runtimeBuild';
import type { Express } from "express";
import type { ServerContext } from "../context";
import { normalizeDynamicScene } from "../../src/lib/dynamicScenes";
import { finaleModes } from "../../src/lib/wrappedFinale";
import { MAX_DATA_SLIDES, isDataLayout, isStrongSceneData, isStrongVerifiedAnalytic, normalizeEditorialJob, normalizeVerifiedAnalytic } from "../../src/lib/wrappedEditorial";
import type { StoryPeriod } from "../../src/lib/storyDiscovery";

const validPeriod = (timeframe: unknown, timeId: unknown): timeframe is "week" | "month" | "year" =>
  (timeframe === "week" && typeof timeId === "string" && /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(timeId)) ||
  (timeframe === "month" && typeof timeId === "string" && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(timeId)) ||
  (timeframe === "year" && typeof timeId === "string" && /^\d{4}$/.test(timeId));

const sceneTypes = new Set(["opening","insight","outlier","location","journal","spotlight","taste","return","timeline","rhythm","closing"]);
const string = (value: unknown, limit: number): string | null =>
  typeof value === "string" && value.trim() && value.length <= limit ? value.trim() : null;
const isObject = (value: any): boolean => !!value && typeof value === "object" && !Array.isArray(value);


const allowedLayouts = new Set(["cover-hero","split-feature","cover-wall","infographic","quote-poster","type-poster","timeline-film","editorial"]);
const allowedPalettes = new Set(["violet","cobalt","amber","rose","emerald","cyan","monochrome"]);
const allowedVisuals = new Set(["auto","cover","mosaic","bars","rings","tiles","timeline","quote","none"]);
function cleanDesign(value: any): any {
  if (value === undefined || value === null) return undefined; // legacy Wrapped rows
  if (!isObject(value) || !allowedLayouts.has(value.layout) ||
    !allowedPalettes.has(value.palette) || !allowedVisuals.has(value.visual)) {
    throw new Error("Invalid Wrapped visual composition");
  }
  const ids = value.mediaIds === undefined ? [] : value.mediaIds;
  if (!Array.isArray(ids) || ids.length > 6 || ids.some((id: unknown) => !string(id, 120))) {
    throw new Error("Invalid Wrapped artwork references");
  }
  return {
    layout: value.layout,
    palette: value.palette,
    visual: value.visual,
    align: value.align === "center" ? "center" : "left",
    mediaIds: ids,
  };
}
/** Artwork can be remote OR served by FauxLore's own cover cache.
 * Cached library covers use /uploads/covers/<content-hash>.webp etc.
 * Deliberately reject protocol-relative URLs, traversal and script schemes.
 */
export function isAllowedArtworkUrl(url: string): boolean {
  if (/^https?:\/\/[^\s]+$/i.test(url)) return true;
  if (!url.startsWith('/uploads/') || url.startsWith('//') || url.includes('\\')) return false;
  if (!/^\/uploads\/[a-zA-Z0-9_./%-]+$/.test(url)) return false;
  if (url.split('/').some(segment => segment === '.' || segment === '..' || /%2e|%2f|%5c/i.test(segment))) return false;
  return true;
}

function cleanArtwork(value: any): any {
  if (!isObject(value) || !string(value.id, 120) || !string(value.title, 300) ||
    !string(value.type, 80)) throw new Error("Invalid Wrapped artwork");
  const url = string(value.cover, 1600);
  if (url && !isAllowedArtworkUrl(url)) throw new Error("Invalid artwork URL");
  return { id: value.id.trim(), title: value.title.trim(), type: value.type.trim(),
    ...(url ? { cover: url } : {}) };
}

export function validateStory(raw: any, timeframe?: StoryPeriod): any {
  if (!isObject(raw) || raw.version !== 2 || !string(raw.title, 180) || !string(raw.dek, 500) ||
    !Array.isArray(raw.scenes) || raw.scenes.length < 3 || raw.scenes.length > 14) {
    throw new Error("Invalid Wrapped story");
  }
  if (raw.scenes[0]?.kind !== "opening" || raw.scenes.at(-1)?.kind !== "closing") {
    throw new Error("Wrapped story requires an opening and a closing");
  }
  const ids = new Set<string>();
  const scenes = raw.scenes.map((scene: any) => {
    if (!isObject(scene) || !sceneTypes.has(scene.kind)) throw new Error("Invalid scene type");
    const id = string(scene.id, 80), eyebrow = string(scene.eyebrow, 90);
    const title = string(scene.title, 200), body = string(scene.body, 5000);
    if (!id || !eyebrow || !title || !body || ids.has(id)) throw new Error("Invalid or repeated scene");
    ids.add(id);
    if (!Array.isArray(scene.evidenceIds) || scene.evidenceIds.length > 5 ||
      scene.evidenceIds.some((v: any) => !string(v, 120))) throw new Error("Invalid scene evidence");
    const media = scene.media === undefined ? undefined : scene.media;
    if (media && (!isObject(media) || !string(media.id, 120) || !string(media.title, 300))) throw new Error("Invalid scene media");
    if (media?.cover && !isAllowedArtworkUrl(media.cover)) throw new Error("Invalid scene media cover");
    const bars = scene.bars === undefined ? undefined : scene.bars;
    if (bars && (!Array.isArray(bars) || bars.length > 6 || bars.some((b: any) =>
      !isObject(b) || !string(b.label, 80) || !string(b.note, 120) ||
      typeof b.value !== "number" || !Number.isFinite(b.value) || b.value < 0 || b.value > 100))) throw new Error("Invalid chart data");
    const beats = scene.beats === undefined ? undefined : scene.beats;
    if (beats && (!Array.isArray(beats) || beats.length > 16 || beats.some((b: any) =>
      !isObject(b) || !string(b.label, 80) || !string(b.title, 220) || !string(b.detail, 220)))) throw new Error("Invalid timeline");
    if (scene.quote !== undefined && !string(scene.quote, 3000)) throw new Error("Invalid quote");
    const design = cleanDesign(scene.design);
    const analytic = scene.analytic == null ? undefined : normalizeVerifiedAnalytic(scene.analytic);
    if (analytic && !isStrongVerifiedAnalytic(analytic)) {
      throw new Error("Weak or malformed analytics are not eligible for a data scene");
    }
    const editorialJob = normalizeEditorialJob(scene.editorialJob, scene.kind);
    if (scene.finaleMode !== undefined && (scene.kind !== "closing" || !finaleModes.some(mode => mode === scene.finaleMode))) {
      throw new Error("Invalid editorial finale mode");
    }
    if (scene.finalePayoff !== undefined &&
        (scene.kind !== "closing" || !string(scene.finalePayoff, 450))) {
      throw new Error("Invalid editorial finale payoff");
    }
    const artworks = scene.artworks;
    if (artworks !== undefined && (!Array.isArray(artworks) || artworks.length > 6)) {
      throw new Error("Invalid artwork collection");
    }
    const cleanArtworks = artworks?.map(cleanArtwork);
    if ((isDataLayout(scene.kind, design?.layout, design?.visual) ||
          editorialJob === 'data-reveal') &&
        !isStrongSceneData(scene.kind, bars) && !isStrongVerifiedAnalytic(analytic)) {
      // New stories cannot reinstate a weak chart by hand-editing JSON. Old
      // saved issues remain readable and untouched until rerolled.
      if (timeframe) throw new Error('Weak or unsupported infographic comparison');
    }
    const saved: any = {
      id, kind: scene.kind, eyebrow, title, body, evidenceIds: scene.evidenceIds,
      editorialJob,
      ...(string(scene.editorialThesis, 330) ? { editorialThesis: scene.editorialThesis.trim() } : {}),
      ...(scene.finaleMode ? { finaleMode: scene.finaleMode } : {}),
      ...(scene.finalePayoff ? { finalePayoff: scene.finalePayoff.trim() } : {}),
      ...(analytic ? { analytic } : {}),
      ...(string(scene.detail, 1200) ? { detail: scene.detail.trim() } : {}),
      ...(string(scene.quote, 3000) ? { quote: scene.quote.trim() } : {}),
      ...(string(scene.sourceLabel, 160) ? { sourceLabel: scene.sourceLabel.trim() } : {}),
      ...(media ? { media: { id: media.id, title: media.title,
        cover: string(media.cover, 1500) || undefined, type: string(media.type, 80) || "Media" } } : {}),
      ...(bars ? { bars } : {}), ...(beats ? { beats } : {}),
      ...(design ? { design } : {}),
      ...(cleanArtworks?.length ? { artworks: cleanArtworks } : {}),
    };
    if (scene.composition !== undefined) {
      try {
        // Validate again on the SERVER against already sanitized factual data.
        // Never trust a browser's claimed stat values or media reference URLs.
        saved.composition = normalizeDynamicScene(scene.composition, saved);
      } catch {
        // The story is valid without generated visuals: reject only the
        // optional composition, retaining a fully functional legacy slide.
      }
    }
    return saved;
  });
  if (timeframe) {
    const count = scenes.slice(1, -1).filter((scene: any) =>
      isDataLayout(scene.kind, scene.design?.layout, scene.design?.visual) ||
      scene.editorialJob === 'data-reveal' ||
      scene.composition?.direction?.presentation === "data" ||
      scene.composition?.elements?.some((item: any) => item.type === "stat")).length;
    if (count > MAX_DATA_SLIDES[timeframe]) {
      throw new Error("Infographic limit exceeded for " + timeframe + ": " +
        count + " data slides, maximum " + MAX_DATA_SLIDES[timeframe]);
    }
  }
  return { version: 2, title: raw.title.trim(), dek: raw.dek.trim(), visualRevision: 0, scenes };
}

export function registerWrappedRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser, activity, queueWrappedCoverArt, queueWrappedSceneArtwork } = ctx;
  const manualIntent = createManualWrappedIntentGate();
  const findSaved = db.prepare(
    "SELECT story, generatedAt, coverArtUrl, coverArtStatus, sceneArtJson, sceneArtStatus FROM wrapped_stories WHERE userId=? AND timeframe=? AND timeId=?",
  );
  function savedStory(userId: string, timeframe: "week" | "month" | "year", timeId: string) {
    const row = findSaved.get(userId, timeframe, timeId) as {
      story: string; generatedAt: string; coverArtUrl: string | null; coverArtStatus: string | null;
      sceneArtJson: string | null; sceneArtStatus: string | null;
    } | undefined;
    if (!row) return null;
    let sceneArt: Record<string,string> = {};
    try {
      const parsed = JSON.parse(row.sceneArtJson || "{}");
      if (isObject(parsed)) for (const [id,url] of Object.entries(parsed)) {
        if ((/^wrapped-[0-9]{1,2}$/.test(id) || id === "achievement-finale") &&
            typeof url === "string" && isAllowedArtworkUrl(url)) {
          sceneArt[id] = url;
        }
      }
    } catch { /* Corrupt optional images never break the saved story. */ }
    return {
      ...JSON.parse(row.story), generatedAt: row.generatedAt,
      coverArtUrl: row.coverArtUrl, coverArtStatus: row.coverArtStatus,
      sceneArt, sceneArtStatus: row.sceneArtStatus,
    };
  }

  app.get("/api/wrapped/:timeframe/:timeId", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const { timeframe, timeId } = req.params;
      if (!validPeriod(timeframe, timeId)) return res.status(400).json({ error: "Invalid period" });
      // Navigation must be read-only. No story, cover or chapter artwork jobs
      // may be scheduled by merely viewing an earlier week/month/year.
      const clientBuild = req.get("X-FauxLore-Client-Build") || "missing";
      if (clientBuild !== FAUXLORE_RUNTIME_BUILD) {
        diag.warn("wrapped-generation", "Read from a mismatched or outdated client bundle",
          { timeframe, timeId, clientBuild, serverBuild: FAUXLORE_RUNTIME_BUILD });
      }
      res.json(savedStory(userId, timeframe, timeId));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  /** Reroll only the title illustration, keeping every story scene unchanged. */
  app.post("/api/wrapped/:timeframe/:timeId/cover", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      if (!activity.requireActive(userId, res)) return;
      const { timeframe, timeId } = req.params;
      if (!validPeriod(timeframe, timeId)) return res.status(400).json({ error: "Invalid period" });
      if (!savedStory(userId, timeframe, timeId)) return res.status(404).json({ error: "Wrapped not found" });
      if (!queueWrappedCoverArt(userId, timeframe, timeId, true)) {
        return res.status(409).json({ error: "A cover image is already being generated." });
      }
      res.json(savedStory(userId, timeframe, timeId));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  /** Replace ONLY the composed visual stages; the narrative and cover survive. */
  app.post("/api/wrapped/:timeframe/:timeId/scenes", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      if (!activity.requireActive(userId, res)) return;
      const { timeframe, timeId } = req.params;
      if (!validPeriod(timeframe, timeId)) return res.status(400).json({ error: "Invalid period" });
      const { generatedAt, visualRevision, compositions } = req.body || {};
      if (!string(generatedAt, 80) || !Number.isInteger(visualRevision) ||
        visualRevision < 0 || visualRevision > 1000000 ||
        !Array.isArray(compositions) || compositions.length < 1 || compositions.length > 14) {
        return res.status(400).json({ error: "Invalid visual reroll request" });
      }
      const seen = new Set<string>();
      const saved = db.transaction(() => {
        const row = db.prepare(
          "SELECT story, generatedAt FROM wrapped_stories WHERE userId=? AND timeframe=? AND timeId=?",
        ).get(userId, timeframe, timeId) as { story: string; generatedAt: string } | undefined;
        if (!row) return "missing";
        const current = JSON.parse(row.story) as { visualRevision?: number; scenes: any[] };
        if (row.generatedAt !== generatedAt || (current.visualRevision || 0) !== visualRevision) {
          return "stale";
        }
        const byScene = new Map<string, unknown>();
        for (const proposal of compositions) {
          if (!isObject(proposal) || !string(proposal.sceneId, 80) || seen.has(proposal.sceneId)) {
            throw new Error("Duplicate or malformed scene selection");
          }
          const scene = current.scenes.find(scene => scene.id === proposal.sceneId);
          if (!scene) throw new Error("Unknown scene ID");
          seen.add(proposal.sceneId);
          const composition = normalizeDynamicScene(proposal.composition, scene);
          if ((composition.direction?.presentation === 'data' ||
            composition.elements.some(element => element.type === 'stat')) &&
            (!(isDataLayout(scene.kind, scene.design?.layout, scene.design?.visual) ||
                scene.editorialJob === 'data-reveal') ||
              !(isStrongSceneData(scene.kind, scene.bars) ||
                isStrongVerifiedAnalytic(scene.analytic)))) {
            throw new Error('Visual-only rerolls cannot invent data scenes or unsupported charts');
          }
          byScene.set(proposal.sceneId, composition);
        }
        const scenes = current.scenes.map(scene => {
          const { composition: ignored, ...other } = scene;
          return { ...other, ...(byScene.has(scene.id) ? { composition: byScene.get(scene.id) } : {}) };
        });
        const composedDataCount = scenes.slice(1, -1).filter(scene =>
          scene.composition?.direction?.presentation === 'data' ||
          scene.composition?.elements?.some((element: any) => element.type === 'stat')).length;
        if (composedDataCount > MAX_DATA_SLIDES[timeframe]) {
          throw new Error('Visual reroll exceeds ' + timeframe + ' infographic limit');
        }
        const next = JSON.stringify({ ...current, visualRevision: visualRevision + 1, scenes });
        const result = db.prepare(
          "UPDATE wrapped_stories SET story=? WHERE userId=? AND timeframe=? AND timeId=? AND generatedAt=?",
        ).run(next, userId, timeframe, timeId, generatedAt);
        return result.changes ? "saved" : "stale";
      })();
      if (saved === "missing") return res.status(404).json({ error: "Wrapped not found" });
      if (saved === "stale") return res.status(409).json({ error: "Wrapped visuals changed; reload before rerolling." });
      // The same editorial text-side / image-focus plan is used by BOTH
      // generators. A layout-only reroll therefore repaints the title and
      // interior images so no old crop contradicts the new typography.
      queueWrappedCoverArt(userId, timeframe, timeId, true);
      queueWrappedSceneArtwork(userId, timeframe, timeId, true);
      res.json(savedStory(userId, timeframe, timeId));
    } catch (error: any) {
      res.status(400).json({ error: "Could not validate composed scenes: " + String(error?.message || error) });
    }
  });

  /** Reroll cinematic interior illustrations without replacing the story. */
  app.post("/api/wrapped/:timeframe/:timeId/scene-art", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      if (!activity.requireActive(userId, res)) return;
      const { timeframe, timeId } = req.params;
      if (!validPeriod(timeframe, timeId)) return res.status(400).json({ error: "Invalid period" });
      if (!savedStory(userId, timeframe, timeId)) return res.status(404).json({ error: "Wrapped not found" });
      if (!queueWrappedSceneArtwork(userId, timeframe, timeId, true)) {
        return res.status(409).json({ error: "Scene art is already generating or unavailable." });
      }
      res.json(savedStory(userId, timeframe, timeId));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  /** A deliberate Generate Recap / Reroll click grants one short-lived start. */
  app.post("/api/wrapped/:timeframe/:timeId/intent", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      if (!activity.requireActive(userId, res)) return;
      const { timeframe, timeId } = req.params;
      if (!validPeriod(timeframe, timeId)) return res.status(400).json({ error: "Invalid period" });
      diag.info("wrapped-generation", "Manual Wrapped intent requested",
        { timeframe, timeId, clientBuild: req.get("X-FauxLore-Client-Build") || "missing",
          serverBuild: FAUXLORE_RUNTIME_BUILD });
      res.json({ intentId: manualIntent.issue({ userId, timeframe, timeId }) });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/wrapped/:timeframe/:timeId/start", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const { timeframe, timeId } = req.params;
      if (!validPeriod(timeframe, timeId)) return res.status(400).json({ error: "Invalid period" });
      if (!activity.requireActive(userId, res)) return;
      const requestId = manualIntent.begin({ userId, timeframe, timeId }, req.body?.intentId);
      if (!requestId) {
        diag.warn("wrapped-generation", "Rejected Wrapped start without manual intent",
          { timeframe, timeId, clientBuild: req.get("X-FauxLore-Client-Build") || "missing",
            serverBuild: FAUXLORE_RUNTIME_BUILD });
        return res.status(428).json({ error: "Wrapped generation requires an explicit Generate Recap click." });
      }
      diag.info("wrapped-generation", "Accepted manually authorized Wrapped start",
        { timeframe, timeId, clientBuild: req.get("X-FauxLore-Client-Build") || "missing",
          serverBuild: FAUXLORE_RUNTIME_BUILD });
      db.prepare("INSERT INTO wrapped_requests(userId,timeframe,timeId,requestId) VALUES(?,?,?,?) " +
        "ON CONFLICT(userId,timeframe,timeId) DO UPDATE SET requestId=excluded.requestId")
        .run(userId, timeframe, timeId, requestId);
      res.json({ requestId });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post("/api/wrapped/:timeframe/:timeId", (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const { timeframe, timeId } = req.params;
      if (!validPeriod(timeframe, timeId)) return res.status(400).json({ error: "Invalid period" });
      const { requestId, story, timeZone } = req.body || {};
      if (!string(requestId, 100)) return res.status(400).json({ error: "Missing generation token" });
      if (!manualIntent.canSave({ userId, timeframe, timeId }, requestId)) {
        return res.status(428).json({ error: "Wrapped save requires a manually authorized generation." });
      }
      // Client timezone matches the evidence cards' browser-local period bounds.
      // Never allow an arbitrary timezone or oversized string into stored data.
      let reportTimeZone = "UTC";
      if (typeof timeZone === "string" && timeZone.length <= 80) {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
          reportTimeZone = timeZone;
        } catch { /* Older clients and invalid zones fall back to UTC. */ }
      }
      const cleaned = validateStory(story, timeframe);
      const allowedMax = timeframe === "week" ? 6 : timeframe === "month" ? 9 : 14;
      if (cleaned.scenes.length > allowedMax) return res.status(400).json({ error: "Too many scenes" });
      const saved = db.transaction(() => {
        // A stale async response must NOT override a newer generation.
        const pending = db.prepare("SELECT requestId FROM wrapped_requests WHERE userId=? AND timeframe=? AND timeId=?")
          .get(userId, timeframe, timeId) as { requestId: string } | undefined;
        if (!pending || pending.requestId !== requestId) return false;
        db.prepare(
          "INSERT INTO wrapped_stories(userId,timeframe,timeId,story,generatedAt,coverArtUrl,coverArtStatus,coverArtRequestId,coverArtTimeZone,sceneArtJson,sceneArtStatus,sceneArtRequestId) " +
          "VALUES(?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL,NULL,NULL,?,NULL,NULL,NULL) " +
          "ON CONFLICT(userId,timeframe,timeId) DO UPDATE SET story=excluded.story, " +
          "generatedAt=excluded.generatedAt, coverArtUrl=NULL, coverArtStatus=NULL, " +
          "coverArtRequestId=NULL, coverArtTimeZone=excluded.coverArtTimeZone, " +
          "sceneArtJson=NULL, sceneArtStatus=NULL, sceneArtRequestId=NULL",
        ).run(userId, timeframe, timeId, JSON.stringify(cleaned), reportTimeZone);
        db.prepare("DELETE FROM wrapped_requests WHERE userId=? AND timeframe=? AND timeId=?")
          .run(userId, timeframe, timeId);
        return true;
      })();
      if (!saved) return res.status(409).json({ error: "A newer Wrapped generation superseded this one." });
      manualIntent.complete(requestId);
      diag.info("wrapped-generation", "Manually authorized Wrapped saved",
        { timeframe, timeId, serverBuild: FAUXLORE_RUNTIME_BUILD });
      queueWrappedCoverArt(userId, timeframe, timeId);
      queueWrappedSceneArtwork(userId, timeframe, timeId);
      res.json(savedStory(userId, timeframe, timeId));
    } catch (e: any) {
      res.status(e instanceof Error ? 400 : 500)
        .json({ error: String(e?.message || e) });
    }
  });
}
