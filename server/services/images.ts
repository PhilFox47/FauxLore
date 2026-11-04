import fs from "fs";
import { imageSize } from "../lib/imageSize";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "../context";
import { getAiConfig, nanoGenerateText } from "../lib/ai";
import { recordAiCallStart, recordAiCall, nextCallId, recordPayload } from "../lib/diagnostics";
import { longRequestDispatcher } from "../lib/httpDispatcher";
import { cliProxyBaseUrl, cliProxyImageSize, cliProxyImagePrompt, cliProxyImageEditBody, imageEditSupportsTextFallback } from "../lib/cliProxy";
import { imagePromptCraft, resolveImagePromptProfile, gptImage25DeliveryPrompt } from "../lib/imagePromptGuidance";
import { buildBossStateImagePrompt, bossVisualState, basePortraitForTransition, localImageReferenceDataUrl } from "../lib/bossStateImages";
import { imageFrameSize, imageFrameMatches, withImageFrame, type ImageFrame } from "../../src/lib/imageFraming";
import { redactVisualSelfForDiagnostics } from "../../src/lib/visualSelf";
import { readUserFaceReference } from "../lib/visualSelfReference";
import { AUTHENTICITY, SHARPNESS, enemyTier, rarityArt } from "../lib/artDirection";
import { codexArtStyleBlock, type CodexService } from "./codex";
import { codexTaskContext } from "./codexV3Context";

/**
 * Image-generation defaults, and how they differ by model family.
 *
 * These were written for Z-Image-Turbo and are still its correct values. That
 * model is DISTILLED: it runs in a handful of steps, wants CFG barely above 1,
 * and softens above 1024x1024. None of that is true of a full model like
 * Seedream, which runs its own step schedule, reads long natural language
 * properly and is happy at 2K.
 *
 * So the numbers are no longer sent unconditionally. A step count and a CFG
 * meant for a four-step distillation are actively wrong for anything else, and
 * a provider that starts honouring them one day would quietly wreck the output
 * of an install that had been fine for months. For a non-distilled model they
 * are omitted unless somebody has set them deliberately, which lets the provider
 * apply its own — the values it was tuned with.
 */
const IMAGE_DEFAULTS = {
  model: "z-image-turbo",
  // Legacy fallback for global settings. Generated boss/loot images use
  // per-feature square or 3:2 canvases instead of this generic resolution.
  size: "1024x768",
  steps: 10,
  guidance: 1.5,
  negative: "watermark, signature, low quality, blurry, soft focus, out of focus, bokeh, shallow depth of field, heavy vignette, jpeg artifacts, deformed, disfigured, bad anatomy, extra limbs, cropped, oversaturated",
};

/**
 * Tidies a resolution typed by hand into the form the API expects.
 *
 * The setting is a free-text field and the failure it produces is silent: a
 * stray space or a multiplication sign instead of an "x" is not an error, it is
 * a value the provider does not recognise and quietly replaces with its own
 * default. Having just spent a round chasing exactly that, the obvious typos are
 * now absorbed rather than passed on. Anything that still does not look like a
 * resolution is left untouched, because inventing a correction would be worse
 * than sending what was actually typed.
 */
export function normalizeResolution(value?: string | null): string | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const m = raw.replace(/[×✕✖]/g, "x").replace(/\s+/g, "").match(/^(\d{2,5})[xX*](\d{2,5})$/);
  return m ? `${Number(m[1])}x${Number(m[2])}` : raw;
}

// Subject-specific negatives appended to the (configurable) base negative.
const BOSS_NEGATIVE_EXTRA = "multiple characters, duplicate, collage, cluttered scene, static standing pose, T-pose, arms at sides, mugshot, passport photo, character select screen, posing for the camera";
const LOOT_NEGATIVE_EXTRA = "hands, fingers, person, multiple items, cluttered scene, environment, landscape";

/** Provider-aware image generation and local storage. */
export function createImageService({ db, aiImagesDir, codex, canSpendTokens = () => true }: {
  db: Db;
  aiImagesDir: string;
  codex: CodexService;
  canSpendTokens?: (userId: string) => boolean;
}) {
  function readImageConfig() {
    let row: any = {};
    try {
      row = db.prepare("SELECT aiProvider, cliProxyImageModel, imageModel, imageSize, imageSteps, imageGuidance, imageNegativePrompt FROM system_settings WHERE id = 'system'").get() || {};
    } catch (e) { /* columns may not exist yet on very old DBs */ }
    const useCli = row.aiProvider === "cliProxy";
    const model = useCli ? (row.cliProxyImageModel || "gpt-image-2") : (row.imageModel || IMAGE_DEFAULTS.model);
    const profile = resolveImagePromptProfile(useCli ? "cliProxy" : "nanoGpt", model);
    const distilled = profile.distilled;
    return {
      model,
      useCli,
      distilled,
      gptImage25: profile.gptImage25,
      customNegative: String(row.imageNegativePrompt || ""),
      size: normalizeResolution(row.imageSize) || IMAGE_DEFAULTS.size,
      // Only defaulted for the family they were measured on. An explicit setting
      // is always honoured — someone who typed a number meant it.
      steps: row.imageSteps ?? (distilled ? IMAGE_DEFAULTS.steps : undefined),
      guidance: row.imageGuidance ?? (distilled ? IMAGE_DEFAULTS.guidance : undefined),
      negative: row.imageNegativePrompt || IMAGE_DEFAULTS.negative,
    };
  }

  /**
   * Pulls the image URL out of whatever shape the answer arrives in.
   *
   * The normalized route's response is not written down in the documentation,
   * and the legacy one returns `data[0].url`. Rather than guess one and break on
   * the other, every plausible carrier is checked — a URL, a data URL, or raw
   * base64 that has to be given a scheme before anything can fetch it.
   */
  function imageUrlFrom(payload: any): string | null {
    const first = payload?.data?.[0] ?? payload?.images?.[0] ?? payload?.output?.[0] ?? null;
    if (!first) return null;
    if (typeof first === "string") return first;
    if (first.url) return String(first.url);
    if (first.image_url?.url) return String(first.image_url.url);
    if (first.b64_json) return `data:image/png;base64,${first.b64_json}`;
    return null;
  }

  /**
   * Asks NanoGPT for an image.
   *
   * Two routes exist and they do NOT share field names — the documentation says
   * so outright. The normalized one takes `resolution`; the older
   * OpenAI-compatible one takes `size`, which is what this used to send, and
   * which the Seedream route quietly ignored: the size in Settings had no effect
   * and nothing anywhere said why.
   *
   * So the normalized route is tried first with the field it actually documents,
   * and the legacy route is kept as a fallback for any model or deployment the
   * new one does not serve. Losing image generation over a routing change would
   * be a far worse outcome than a square picture.
   */
  /**
   * `attempt` is 1 for the normalized route and 2 for the legacy fallback, so
   * the two show up distinctly in the Diagnostics panel rather than looking
   * like the same call twice — this is the only place server-side image
   * generation touched NanoGPT at all before this, and none of it was logged.
   */
  async function requestImage(apiKey: string, body: Record<string, unknown>, url: string, attempt: 1 | 2 = 1) {
    const callId = nextCallId();
    const prompt = String(body.prompt || "");
    const shape = { callId, model: String(body.model || "?"), scope: "images", attempt, promptChars: prompt.length };
    const startedAt = Date.now();
    recordAiCallStart(shape);
    recordPayload(callId, "images", { prompt: redactVisualSelfForDiagnostics(JSON.stringify(body, null, 2)) });

    const res = await fetch(url, {
      method: "POST",
      // Same 300s Node header-timeout fix as everywhere else this app talks
      // to NanoGPT — see lib/httpDispatcher.ts. Image renders are usually
      // well under that, but a slow one should not die with a bare "fetch
      // failed" for a reason that has nothing to do with the actual timeout
      // below.
      ...(longRequestDispatcher ? { dispatcher: longRequestDispatcher } : {}),
      signal: AbortSignal.timeout(180_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    } as any);
    const text = await res.text();
    recordPayload(callId, "images", { reply: redactVisualSelfForDiagnostics(text) });
    recordAiCall({
      ...shape,
      durationMs: Date.now() - startedAt,
      httpStatus: res.status,
      error: !res.ok ? `HTTP ${res.status}` : undefined,
    });

    if (!res.ok) throw new Error(`${url} -> ${res.status} ${redactVisualSelfForDiagnostics(text)}`);
    return JSON.parse(text);
  }

  async function internalGenerateImageWithNanoGpt(apiKey: string, prompt: string, extraNegative: string = "", frame: ImageFrame = "square", referenceDataUrl: string | null = null, fallbackPrompt: string | null = null, intent: "boss" | "loot" | "wrapped" | "wrapped-scene" = frame === "square" ? "loot" : "boss"): Promise<string> {
    const cfg = readImageConfig();
    const negativePrompt = [cfg.negative, extraNegative].filter(Boolean).join(", ");
    const framedPrompt = withImageFrame(prompt, frame);
    const requestedSize = imageFrameSize(frame, cfg.useCli ? "cliProxy" : "nanoGpt");

    if (cfg.useCli) {
      const sys: any = db.prepare("SELECT cliProxyBaseUrl FROM system_settings WHERE id = 'system'").get() || {};
      const baseUrl = cliProxyBaseUrl(sys.cliProxyBaseUrl);
      const finalPrompt = cfg.gptImage25
        ? gptImage25DeliveryPrompt(framedPrompt, intent, cfg.customNegative)
        : cliProxyImagePrompt(framedPrompt, negativePrompt);
      const size = cliProxyImageSize(requestedSize);

      async function requestCliImage(edit: boolean, attempt: 1 | 2, overriddenPrompt?: string): Promise<string> {
        const route = edit ? "/images/edits" : "/images/generations";
        const effectivePrompt = overriddenPrompt || finalPrompt;
        const faceReference = edit && (intent === "wrapped" || intent === "wrapped-scene");
        const renderPrompt = faceReference
          ? effectivePrompt + "\\n\\nFACE REFERENCE INPUT: The attached photo is a private face identity reference ONLY. If the scene depicts the account owner, preserve recognizable facial structure, eye region, hair and other features. Reimagine their pose, expression, costume, environment and source-media art style from the story brief. Do NOT simply reprint or crop the reference selfie, copy its background, or add a second portrait panel."
          : effectivePrompt;
        const body: Record<string, unknown> = edit
          ? cliProxyImageEditBody(cfg.model, renderPrompt, size, referenceDataUrl || "")
          : { model: cfg.model, prompt: renderPrompt, size, n: 1, response_format: "b64_json" };
        const callId = nextCallId();
        const shape = { callId, model: cfg.model, scope: "images", attempt, promptChars: effectivePrompt.length };
        const startedAt = Date.now();
        recordAiCallStart(shape);
        // NEVER put embedded reference-image bytes into diagnostics or logs.
        recordPayload(callId, "images", {
          prompt: redactVisualSelfForDiagnostics(JSON.stringify({ endpoint: route, ...body, ...(edit ? { images: "[one local image; bytes redacted]" } : {}) })),
        });
        try {
          const response = await fetch(`${baseUrl}${route}`, {
            method: "POST",
            ...(longRequestDispatcher ? { dispatcher: longRequestDispatcher } : {}),
            signal: AbortSignal.timeout(600_000),
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(body),
          } as any);
          if (!response.ok) {
            const detail = redactVisualSelfForDiagnostics((await response.text()).slice(0, 500));
            throw Object.assign(new Error(`CLIProxyAPI image ${edit ? "edit" : "generation"} HTTP ${response.status}: ${detail}`), { httpStatus: response.status });
          }
          const result: any = await response.json();
          const first = result?.data?.[0];
          const encoded = first?.b64_json || (typeof first?.url === "string"
            ? first.url.match(/^data:image\/(?:png|jpeg|webp);base64,(.+)$/)?.[1] : null);
          if (!encoded) throw new Error("CLIProxyAPI returned no base64 image.");
          const buffer = Buffer.from(encoded, "base64");
          const actual = imageSize(buffer);
          if (!actual) throw new Error("CLIProxyAPI returned invalid image bytes.");
          const ext = ({ png: ".png", jpg: ".jpg", jpeg: ".jpg", webp: ".webp" } as Record<string, string>)[String(actual.type).toLowerCase()] || ".png";
          const fileName = `${uuidv4()}${ext}`;
          fs.writeFileSync(path.join(aiImagesDir, fileName), buffer);
          const got = `${actual.width}x${actual.height}`;
          if (!imageFrameMatches(frame, actual.width, actual.height)) {
            console.warn(`[images] ${cfg.model} returned an unexpected ${got} canvas for ${frame}; check Image Generation Diagnostics.`);
          }
          console.log(`[images] CLIProxyAPI ${cfg.model} ${edit ? "edited with original reference" : "generated"} ${got}`);
          recordPayload(callId, "images", { reply: `image saved: ${got}; binary redacted` });
          recordAiCall({ ...shape, durationMs: Date.now() - startedAt, httpStatus: response.status });
          return `/uploads/ai-images/${fileName}`;
        } catch (e: any) {
          recordAiCall({ ...shape, durationMs: Date.now() - startedAt, httpStatus: e?.httpStatus, error: redactVisualSelfForDiagnostics(e?.message || String(e)) });
          throw e;
        }
      }

      if (referenceDataUrl && /^gpt-image-/i.test(cfg.model)) {
        try {
          return await requestCliImage(true, 1);
        } catch (e: any) {
          // Only unsupported/bad-edit-request responses fall back. Do not pay
          // for a second render after timeouts, rate limits or server failures.
          const status = Number(e?.httpStatus || 0);
          if (!imageEditSupportsTextFallback(status)) throw e;
          console.warn(`[images] CLIProxyAPI reference edit unavailable (HTTP ${status}); reverting to text-only image generation.`);
          // An unsupported edit must NOT leave "the supplied image" in the
          // generation-only prompt: there is no reference on that request.
          const textOnly = fallbackPrompt
            ? gptImage25DeliveryPrompt(withImageFrame(fallbackPrompt, frame),
                intent, cfg.customNegative)
            : finalPrompt;
          return requestCliImage(false, 2, textOnly);
        }
      }
      if (referenceDataUrl) {
        console.warn(`[images] Reference supplied, but model ${cfg.model} does not use the GPT Image 2.5 edit endpoint; generating from text.`);
      }
      return requestCliImage(false, 1);
    }

    // Steps and guidance are not among the API's common fields at all — they are
    // model-specific where they exist — so they only ride along for a model whose
    // name says it is the kind that needs them.
    const tuning = {
      ...(cfg.steps !== undefined ? { num_inference_steps: cfg.steps } : {}),
      ...(cfg.guidance !== undefined ? { guidance_scale: cfg.guidance } : {}),
    };

    let remoteUrl: string | null = null;
    try {
      remoteUrl = imageUrlFrom(await requestImage(apiKey, {
        model: cfg.model,
        prompt: framedPrompt,
        negative_prompt: negativePrompt,
        resolution: requestedSize,
        n: 1,
        ...tuning,
      }, "https://nano-gpt.com/api/v1/images", 1));
      if (!remoteUrl) throw new Error("no image in the normalized response");
    } catch (e) {
      console.warn(`[images] Normalized route failed, falling back to /generations: ${String((e as any)?.message || e)}`);
      remoteUrl = imageUrlFrom(await requestImage(apiKey, {
        model: cfg.model,
        prompt: framedPrompt,
        negative_prompt: negativePrompt,
        size: requestedSize,
        ...tuning,
        response_format: "url",
      }, "https://nano-gpt.com/api/v1/images/generations", 2));
    }

    if (!remoteUrl) throw new Error("NanoGPT did not return an image");

    try {
      // Download and store locally
      const imageRes = await fetch(remoteUrl);
      if (!imageRes.ok) throw new Error(`Failed to fetch image from remote URL: ${remoteUrl}`);
      const arrayBuffer = await imageRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const actual = imageSize(buffer);
      if (actual?.width && actual?.height) {
        const got = `${actual.width}x${actual.height}`;
        if (!imageFrameMatches(frame, actual.width, actual.height)) {
          console.warn(`[images] Returned ${got} does not match required ${frame} canvas.`);
        }
        if (got !== requestedSize) {
          console.warn(
            `[images] Asked ${cfg.model} for ${requestedSize} and got ${got}. ` +
              `The provider did not return the required ${frame} canvas; verify its supported image dimensions.`,
          );
        } else {
          console.log(`[images] ${cfg.model} returned ${got}`);
        }
      }

      // The extension follows what actually arrived. It was hard-coded to .webp
      // while the bytes were written through untouched, so a PNG from the model
      // landed on disk claiming to be something else.
      const ext = ({ webp: ".webp", png: ".png", jpg: ".jpg", jpeg: ".jpg", gif: ".gif" } as Record<string, string>)[
        String(actual?.type || "").toLowerCase()
      ] || ".webp";
      const fileName = `${uuidv4()}${ext}`;
      const filePath = path.join(aiImagesDir, fileName);

      fs.writeFileSync(filePath, buffer);

      return `/uploads/ai-images/${fileName}`;
    } catch (e) {
      console.error("Failed to store image locally, falling back to remote URL", e);
      return remoteUrl;
    }
  }

  /**
   * Portrait for an enemy.
   *
   * Enemies are written with their own image prompt (see services/worldBoss.ts),
   * so the usual path is simply "use what the AI already art-directed". The
   * art-director call below is the fallback for enemies created before that, and
   * it leans on the media's Codex when one exists rather than searching again.
   */
  async function generateBossImageBackground(userId: string, bossId: string) {
    // A token guards against old asynchronous renders overwriting the current
    // image after a taunt, a reroll or a second manual regeneration.
    const generationToken = uuidv4();
    const boss: any = db.prepare("SELECT * FROM world_bosses WHERE id = ? AND userId = ?").get(bossId, userId);
    if (!boss) return;
    db.prepare(
      "UPDATE world_bosses SET imageStatus = 'generating', imageGenerationToken = ? WHERE id = ? AND userId = ?",
    ).run(generationToken, bossId, userId);

    try {
      const aiConfig = getAiConfig(db, userId);
      if (!aiConfig) throw new Error("AI image provider is not configured.");
      const mediaItem: any = db.prepare("SELECT title, mediaType FROM media WHERE id = ? AND userId = ?").get(boss.mediaId, userId);
      const mediaTitle = mediaItem?.title || "an unknown work";
      const mediaType = mediaItem?.mediaType || "media";

      let imagePrompt = (boss.imagePrompt || "").trim();
      if (!imagePrompt) {
        imagePrompt = await writeBossImagePrompt(userId, boss, mediaTitle, mediaType);
        if (!imagePrompt) throw new Error("Empty boss prompt");
        const saved = db.prepare(
          "UPDATE world_bosses SET imagePrompt = ? WHERE id = ? AND userId = ? AND imageGenerationToken = ?",
        ).run(imagePrompt, bossId, userId, generationToken);
        if (!saved.changes) return; // A newer generation superseded this one.
      }

      const visualState = bossVisualState(boss);
      let referenceDataUrl: string | null = null;
      let textOnlyStatePrompt: string | null = null;
      if (visualState) {
        const cfg = readImageConfig();
        if (cfg.useCli && cfg.gptImage25) {
          referenceDataUrl = localImageReferenceDataUrl(basePortraitForTransition(boss), aiImagesDir);
        }
        if (!referenceDataUrl) {
          console.warn(`[images] ${visualState} reference unavailable or unsupported for ${bossId}; using source-faithful text-only generation.`);
        }
        const identity = {
          name: boss.name,
          title: boss.title,
          description: boss.description,
          sourceTitle: mediaTitle,
          sourceType: mediaType,
          imagePrompt,
        };
        textOnlyStatePrompt = buildBossStateImagePrompt(visualState, identity, false);
        imagePrompt = referenceDataUrl
          ? buildBossStateImagePrompt(visualState, identity, true)
          : textOnlyStatePrompt;
      }

      const imageUrl = await internalGenerateImageWithNanoGpt(
        aiConfig.apiKey, imagePrompt, BOSS_NEGATIVE_EXTRA, "landscape-3:2", referenceDataUrl, textOnlyStatePrompt,
      );
      const saved = db.prepare(
        `UPDATE world_bosses SET imageUrl = ?, imageStatus = 'done', imageGenerationToken = NULL,
          basePortraitImageUrl = CASE WHEN ? = 1 AND basePortraitImageUrl IS NULL
            THEN ? ELSE basePortraitImageUrl END
          WHERE id = ? AND userId = ? AND imageGenerationToken = ?`,
      ).run(imageUrl, visualState ? 0 : 1, imageUrl, bossId, userId, generationToken);
      if (!saved.changes) console.log(`[images] Discarded superseded image for boss ${bossId}.`);
    } catch (e) {
      console.error("Boss Image Background Gen Error:", e);
      // Failed edits leave the original portrait untouched; users can retry.
      db.prepare(
        "UPDATE world_bosses SET imageStatus = 'failed', imageGenerationToken = NULL WHERE id = ? AND userId = ? AND imageGenerationToken = ?",
      ).run(bossId, userId, generationToken);
    }
  }

  /**
   * A state transition to Defeated queues one Victory artwork. Called ONLY
   * after an actual Active -> Defeated transition, not on ordinary GET requests.
   * The pre-state portrait is frozen before any old in-flight job can finish.
   */
  function queueBossVictoryArtwork(userId: string, bossId: string): void {
    const boss: any = db.prepare("SELECT * FROM world_bosses WHERE id = ? AND userId = ?").get(bossId, userId);
    if (!boss || boss.status !== "Defeated") return;
    const base = basePortraitForTransition(boss);
    const allowed = canSpendTokens(userId);
    db.prepare(
      `UPDATE world_bosses SET
        basePortraitImageUrl = COALESCE(basePortraitImageUrl, ?),
        imageStatus = ?, imageGenerationToken = ?
        WHERE id = ? AND userId = ? AND status = 'Defeated'`,
    ).run(base, allowed ? "pending" : "failed", uuidv4(), bossId, userId);
    if (!allowed) {
      console.log(`[images] Defeated boss ${bossId}: image generation deferred for inactive account.`);
      return;
    }
    void generateBossImageBackground(userId, bossId).catch(error => {
      console.error("[images] Could not start Victory artwork:", error);
    });
  }

  /** Art-directs an enemy portrait for a boss that has no stored prompt. */
  async function writeBossImagePrompt(userId: string, boss: any, mediaTitle: string, mediaType: string): Promise<string> {
    const aiConfig = getAiConfig(db, userId);
    if (!aiConfig) return "";

    const codexRow = await codex.tryEnsureCodex(userId, { mediaId: boss.mediaId, title: mediaTitle, mediaType });
    const codexBlock = codexTaskContext(db,codexRow,"image",boss.name);
    const styleBlock = codexArtStyleBlock(codexRow);
    const tier = enemyTier(boss.level || 1);
    const imageCfg = readImageConfig();
    const imageSharpness = imageCfg.gptImage25
      ? "Keep canonical features, silhouette and signature markings clear, with lighting and depth of field faithful to the source medium."
      : SHARPNESS;
    const fullName = [boss.name, boss.title].filter(Boolean).join(", ");

    const prompt = `You are an expert art director writing ONE text-to-image prompt.

${imagePromptCraft(imageCfg)}

SUBJECT: a single RPG enemy named "${fullName}", from the media "${mediaTitle}" (a ${mediaType}). It is ${tier.word}, and should look ${tier.look}, set against ${tier.scene}, caught ${tier.action}.${boss.description ? `\nIts flavour text reads: "${boss.description}"` : ""}

${codexBlock || `(No Codex is on record. Use web search to identify what "${boss.name}" is within "${mediaTitle}", and the authentic visual art style, medium and colour palette of "${mediaTitle}" itself.)`}

${styleBlock ? `${styleBlock}\n\nCanonical subject identity and the source's visual style must BOTH survive. The creature must keep its recognizable form while looking as though it belongs in the original medium, palette and lighting.\n` : ""}
YOUR TASK: write ONE prompt describing this single character/creature so it looks like it genuinely belongs in "${mediaTitle}".

THE PROMPT MUST:
- OPEN with the creature itself — what it is and the most striking thing about how it looks. Everything else follows it.
- Render the entity in the ACTUAL art style and medium of "${mediaTitle}". NAME that style explicitly in the prompt using the house style above — the named craft terms are what an image model keys on, so use them verbatim rather than paraphrasing them into adjectives. Reference the franchise by name as well, to anchor the look. Do NOT default to generic 2D cartoon or flat vector art unless that truly matches the source.
- ${AUTHENTICITY(mediaTitle)}
- Compose for a HORIZONTAL LANDSCAPE 3:2 frame, with the subject and essential action inside safe margins; no tall/portrait poster framing.
- Depict ONE subject only, with a setting/background appropriate to its tier — never a busy crowd scene.
- Show it mid-action rather than posed: ${tier.action}. Frame it with ${tier.camera}. Never a neutral standing figure facing the lens — no mugshots, no line-ups, no posing for a photograph.
- Faithfully describe its anatomy, armor/weapons, materials, aura and expression, and let the tier drive everything: a Level 1 must look genuinely silly and harmless; a Level 5 must look like a monumental, epic final boss.
- ${imageSharpness}
- Contain no watermarks, signatures or extra/duplicate characters.

Return ONLY the final image prompt text, nothing else.`;

    // Web search only where the Codex could not supply the facts.
    return nanoGenerateText(aiConfig, prompt, { temperature: 0.7, webSearch: !codexBlock, tier: "analytical", scope: "imageprompt", userId });
  }

  /**
   * Inventory icon for a piece of loot. Same deal as enemies: the loot generator
   * writes its own image prompt, and this falls back to art-directing one.
   */
  async function generateArtifactImageBackground(userId: string, artifactId: string) {
    try {
      const aiConfig = getAiConfig(db, userId);
      if (!aiConfig) return;
      const nanoGptKey = aiConfig.apiKey;

      const artifact: any = db.prepare("SELECT * FROM artifacts WHERE id = ? AND userId = ?").get(artifactId, userId);
      if (!artifact) return;
      const mediaItem: any = db.prepare("SELECT title, mediaType FROM media WHERE id = ?").get(artifact.mediaId);
      const mediaTitle = mediaItem?.title || "an unknown work";
      const mediaType = mediaItem?.mediaType || "media";

      db.prepare("UPDATE artifacts SET imageStatus = 'generating' WHERE id = ?").run(artifactId);

      let imagePrompt = (artifact.imagePrompt || "").trim();
      if (!imagePrompt) {
        imagePrompt = await writeArtifactImagePrompt(userId, artifact, mediaTitle, mediaType);
        if (!imagePrompt) throw new Error("Empty artifact prompt");
        db.prepare("UPDATE artifacts SET imagePrompt = ? WHERE id = ?").run(imagePrompt, artifactId);
      }

      const imageUrl = await internalGenerateImageWithNanoGpt(nanoGptKey, imagePrompt, LOOT_NEGATIVE_EXTRA, "square");
      db.prepare("UPDATE artifacts SET imageUrl = ?, imageStatus = 'done' WHERE id = ?").run(imageUrl, artifactId);
    } catch (e) {
      console.error("Artifact Image Background Gen Error:", e);
      // No auto-retry — mark as failed so the UI can offer a manual regenerate.
      try { db.prepare("UPDATE artifacts SET imageStatus = 'failed' WHERE id = ?").run(artifactId); } catch (_) {}
    }
  }

  /** Art-directs a loot icon for an artifact that has no stored prompt. */
  async function writeArtifactImagePrompt(userId: string, artifact: any, mediaTitle: string, mediaType: string): Promise<string> {
    const aiConfig = getAiConfig(db, userId);
    if (!aiConfig) return "";

    const codexRow = await codex.tryEnsureCodex(userId, { mediaId: artifact.mediaId, title: mediaTitle, mediaType });
    const codexBlock = codexTaskContext(db,codexRow,"image",artifact.name);
    const styleBlock = codexArtStyleBlock(codexRow);
    const art = rarityArt(artifact.rarity || "Common");
    const imageCfg = readImageConfig();
    const imageSharpness = imageCfg.gptImage25
      ? "Keep original materials, lettering and construction clearly readable, using source-appropriate lighting and depth of field."
      : SHARPNESS;

    const prompt = `You are an expert art director writing ONE text-to-image prompt.

${imagePromptCraft(imageCfg)}

SUBJECT: a single RPG loot item named "${artifact.name}", described as "${artifact.description}", from the media "${mediaTitle}". Rarity: ${artifact.rarity}. At this rarity the item should read as ${art.grandeur}, carrying ${art.aura}.

${codexBlock || `(No Codex is on record. Use web search to determine what "${artifact.name}" literally IS within "${mediaTitle}", and the authentic art style, medium and material language of "${mediaTitle}".)`}

${styleBlock ? `${styleBlock}\n\nCanonical object identity and the source's visual style must BOTH survive. Preserve the item's genuine shape, materials and markings while matching the original work's medium and palette.\n` : ""}
YOUR TASK: write ONE prompt for a single game-inventory icon of this exact object.

THE PROMPT MUST:
- OPEN with the object itself — what it plainly is, and what it is made of. Everything else follows it.
- Keep the object TYPE literal and correct. If it is a sword it is a sword; a cassette tape a cassette; a book a book; a flower a flower. NEVER substitute a generic ring, gem, orb or "magic trinket" unless the item genuinely is one. Believable proportions, a recognizable real object.
- Render it in the ACTUAL art style and material design of "${mediaTitle}". NAME that style explicitly using the house style above, reusing its craft terms verbatim rather than paraphrasing them, and reference the franchise to anchor the look. Avoid generic flat cartoon icons.
- ${AUTHENTICITY(mediaTitle)}
- Select source-faithful presentation for its rarity: ${art.grandeur}. Its rarity must not change canonical materials, silhouette, colors or built-in features.
- Compose for a SQUARE 1:1 image with the entire object centered and safely inside the canvas, no tall poster framing.
- Present ONE recognizable item on a restrained studio backdrop: ${art.background}. Use ${art.aura} as an environmental lighting cue ONLY, not an effect emitted by the object. A subtle contact shadow may ground the item.
- Describe its genuine materials, proportions, original markings, form and wear; never invent ornaments, supernatural effects or logos to communicate rarity.
- ${imageSharpness}
- No hands, no person, no extra props — just the single item on its background.

Return ONLY the final image prompt text, nothing else.`;

    return nanoGenerateText(aiConfig, prompt, { temperature: 0.7, webSearch: !codexBlock, tier: "analytical", scope: "imageprompt", userId });
  }

  /** One standalone 3:2 title illustration for an entire Wrapped story. */
  async function generateWrappedCoverImage(userId: string, prompt: string, options?: {useFaceReference?: boolean}): Promise<string> {
    const config = getAiConfig(db, userId);
    if (!config) throw new Error("AI image provider is not configured.");
    return internalGenerateImageWithNanoGpt(
      config.apiKey, prompt, "unreadable text, fake logos, watermarks, collage grids",
      "landscape-3:2", options?.useFaceReference ? readUserFaceReference(db, userId) : null, null, "wrapped",
    );
  }

  /** Render a separate, original cinematic illustration for one Wrapped chapter. */
  async function generateWrappedSceneImage(userId: string, prompt: string, options?: {useFaceReference?: boolean}): Promise<string> {
    const config = getAiConfig(db, userId);
    if (!config) throw new Error("AI image provider is not configured.");
    return internalGenerateImageWithNanoGpt(
      config.apiKey, prompt, "collages, grids, franchise logos, letterforms, captions",
      "landscape-3:2", options?.useFaceReference ? readUserFaceReference(db, userId) : null, null, "wrapped-scene",
    );
  }

  /**
   * What the configured image model actually accepts, from NanoGPT itself.
   *
   * `supported_parameters` is machine-readable and varies per model, so this is
   * the only honest answer to "which resolutions can I use" — the enum values,
   * the default, and the price per resolution, straight from the source rather
   * than from a guess. It is also how to find out whether a setting that appears
   * to do nothing is a value the model was never going to accept.
   */
  async function describeImageModel() {
    const cfg = readImageConfig();
    if (cfg.useCli) {
      return {
        ok: true,
        model: cfg.model,
        configured: { bossResolution: imageFrameSize('landscape-3:2', 'cliProxy'), lootResolution: imageFrameSize('square', 'cliProxy') },
        supported_parameters: { size: ["1024x1024", "1536x1024", "1024x1536"] },
        note: "Enemy artwork is requested at 3:2 (1536x1024) and loot at 1:1 (1024x1024), regardless of legacy imageSize. Prompt framing also specifies the aspect ratio and safe composition. Diffusion steps, CFG and negative_prompt are not supported.",
      };
    }
    const url = `https://nano-gpt.com/api/v1/images/models/${encodeURIComponent(cfg.model)}/endpoints`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return { ok: false, model: cfg.model, configured: cfg, error: `${res.status} ${await res.text()}` };
      const body: any = await res.json();
      const endpoint = body?.endpoints?.[0];
      return {
        ok: true,
        model: cfg.model,
        configured: { bossResolution: imageFrameSize('landscape-3:2', 'nanoGpt'), lootResolution: imageFrameSize('square', 'nanoGpt'), legacyResolution: cfg.size, steps: cfg.steps, guidance: cfg.guidance },
        supported_parameters: endpoint?.supported_parameters ?? null,
        pricing: endpoint?.pricing ?? null,
        input_reference_constraints: endpoint?.input_reference_constraints ?? null,
      };
    } catch (e: any) {
      return { ok: false, model: cfg.model, error: String(e?.message || e) };
    }
  }

  return {
    describeImageModel,
    internalGenerateImageWithNanoGpt,
    generateBossImageBackground,
    queueBossVictoryArtwork,
    generateArtifactImageBackground,
    generateWrappedCoverImage,
    generateWrappedSceneImage,
  };
}
