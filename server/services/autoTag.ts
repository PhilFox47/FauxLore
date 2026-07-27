import type { Db } from "../context";
import { getAiConfig, nanoGenerateText, parseJsonLoose } from "../lib/ai";
import { codexPromptBlock, type CodexService } from "./codex";

/**
 * Auto-tagging, on the server.
 *
 * It used to run in the browser, which meant adding a title was a two-stage
 * wait: press Auto Tag, watch a spinner, and only then press Save. Worse, the
 * whole thing died if the tab was closed. Now saving a new entry queues the work
 * here — the Codex gets compiled and the tags written while the user carries on
 * — and the entry simply gains its genres and tags a little later.
 *
 * Status lives on the media row (`autoTagStatus`), so the UI can show that
 * something is in flight and stop guessing.
 */

export type AutoTagStatus = "pending" | "done" | "failed";

export interface AutoTagResult {
  genres: string[];
  tags: string[];
}

export function createAutoTagService({ db, codex }: { db: Db; codex: CodexService }) {
  // One run per media at a time. The queue-on-create path and a manual retry can
  // otherwise land together and write over each other.
  const inFlight = new Set<string>();

  function setStatus(mediaId: string, status: AutoTagStatus | null) {
    try {
      db.prepare("UPDATE media SET autoTagStatus = ? WHERE id = ?").run(status, mediaId);
    } catch (e) { /* column missing on a very old DB */ }
  }

  /** Reconciles what the model returned against the taxonomy that already exists. */
  function reconcile(parsed: any, validGenres: string[], validTags: string[]): AutoTagResult {
    const finalGenres = new Set<string>();
    const finalTags = new Set<string>();

    const knownGenre = (v: string) => validGenres.find((g) => g.toLowerCase() === v.toLowerCase());
    const knownTag = (v: string) => validTags.find((t) => t.toLowerCase() === v.toLowerCase());

    // A term is a genre OR a tag, never both: if the model files something under
    // the wrong heading and the app already knows it under the other, move it.
    for (const raw of Array.isArray(parsed?.genres) ? parsed.genres : []) {
      const value = String(raw || "").trim();
      if (!value) continue;
      const asTag = knownTag(value);
      const asGenre = knownGenre(value);
      if (asTag && !asGenre) finalTags.add(asTag);
      else finalGenres.add(asGenre || value);
    }
    for (const raw of Array.isArray(parsed?.tags) ? parsed.tags : []) {
      const value = String(raw || "").trim();
      if (!value) continue;
      const asGenre = knownGenre(value);
      const asTag = knownTag(value);
      if (asGenre && !asTag) finalGenres.add(asGenre);
      else finalTags.add(asTag || value);
    }

    return { genres: [...finalGenres], tags: [...finalTags] };
  }

  /** Keeps global_taxonomy in step with what a title now carries. */
  function applyTaxonomy(mediaId: string, userId: string, next: AutoTagResult) {
    const row: any = db.prepare("SELECT genres, tags FROM media WHERE id = ? AND userId = ?").get(mediaId, userId);
    const parse = (v: any) => { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } };
    const prevGenres: string[] = row ? parse(row.genres) : [];
    const prevTags: string[] = row ? parse(row.tags) : [];

    const count = db.prepare("UPDATE global_taxonomy SET usageCount = usageCount + ? WHERE name = ? AND type = ?");
    prevGenres.forEach((g) => count.run(-1, g, "genre"));
    prevTags.forEach((t) => count.run(-1, t, "tag"));
    next.genres.forEach((g) => count.run(1, g, "genre"));
    next.tags.forEach((t) => count.run(1, t, "tag"));
  }

  /**
   * Tags one media entry. Resolves to the terms written, or null when it could
   * not run (no AI configured, entry gone, model unusable).
   */
  async function autoTagMedia(userId: string, mediaId: string): Promise<AutoTagResult | null> {
    if (inFlight.has(mediaId)) return null;
    inFlight.add(mediaId);
    try {
      const media: any = db.prepare("SELECT * FROM media WHERE id = ? AND userId = ?").get(mediaId, userId);
      if (!media) return null;

      const aiConfig = getAiConfig(db, userId);
      if (!aiConfig) {
        setStatus(mediaId, "failed");
        return null;
      }

      setStatus(mediaId, "pending");

      const taxonomy = db.prepare("SELECT type, name FROM global_taxonomy").all() as { type: string; name: string }[];
      const validGenres = taxonomy.filter((t) => t.type === "genre").map((t) => t.name);
      const validTags = taxonomy.filter((t) => t.type === "tag").map((t) => t.name);

      // The Codex first: it is the shared research every AI feature reads, and
      // compiling it here means the entry is ready for enemies and loot too.
      const codexRow = await codex.tryEnsureCodex(userId, {
        mediaId,
        title: media.title,
        mediaType: media.mediaType,
      });
      const codexBlock = codexPromptBlock(codexRow);

      const systemPrompt = `You are FauxLore, an expert taxonomy system. Your job is to classify media.
Existing Genres: ${validGenres.join(", ")}
Existing Tags: ${validTags.join(", ")}

Rules:
1. Strongly prefer using exact matches from the Existing lists above.
2. ONLY invent a new Genre or Tag if it is ABSOLUTELY ESSENTIAL and the media cannot be properly described without it. Do not do this lightly.
3. Select between 1 and 3 core Genres. ONLY use up to 5 if absolutely essential. Order them from most defining/important to least.
4. Select between 3 and 10 highly relevant Tags. ONLY use more (up to 15) if absolutely essential. Be strict and focused - less is often more. Order them from most defining/important to least.
5. NO DUPLICATES: A term can be a Genre OR a Tag, never both. Do not use an existing Genre as a Tag, or an existing Tag as a Genre.
6. ${codexBlock
        ? "Base your classification on the Codex supplied with the request — it is the researched record of this work — mapped onto the vocabulary above. The Codex's own genre and tag suggestions are raw material, not answers: translate them into the Existing lists wherever a match exists."
        : `USE YOUR WEB SEARCH CAPABILITIES to confirm details about "${media.title}" (${media.mediaType}).`}
7. Return ONLY a pure JSON object in this exact format:
{"genres": ["Genre1", "Genre2"], "tags": ["Tag1", "Tag2"]}
Do not wrap it in markdown. Do not include any explanations.`;

      const parse = (v: any) => { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } };
      const userPrompt = `Please tag the following media:
Title: ${media.title}
Type: ${media.mediaType}
Description: ${media.description || "N/A"}
Creator: ${media.creator || media.publisher || "N/A"}
Year: ${media.year || "N/A"}
Existing genres on the entry: ${parse(media.genres).join(", ") || "N/A"}
Existing tags on the entry: ${parse(media.tags).join(", ") || "N/A"}
Platforms: ${parse(media.platforms).join(", ") || "N/A"}${codexBlock ? `\n\n${codexBlock}` : ""}`;

      // With a Codex in hand the facts are settled, so this is plain
      // classification. Without one, fall back to searching the web here.
      const raw = await nanoGenerateText(aiConfig, userPrompt, {
        temperature: 0.1,
        webSearch: !codexBlock,
        systemPrompt,
      });
      if (!raw) throw new Error("The model returned an empty response.");

      const result = reconcile(parseJsonLoose<any>(raw), validGenres, validTags);
      if (result.genres.length === 0 && result.tags.length === 0) {
        throw new Error("The model returned no usable terms.");
      }

      applyTaxonomy(mediaId, userId, result);
      db.prepare("UPDATE media SET genres = ?, tags = ?, autoTagStatus = 'done', updatedAt = ? WHERE id = ? AND userId = ?")
        .run(JSON.stringify(result.genres), JSON.stringify(result.tags), new Date().toISOString(), mediaId, userId);

      return result;
    } catch (e) {
      console.error(`Auto-tagging failed for media ${mediaId}`, e);
      setStatus(mediaId, "failed");
      return null;
    } finally {
      inFlight.delete(mediaId);
    }
  }

  /**
   * Queues tagging without blocking the request that asked for it — how saving a
   * new entry returns immediately while the work carries on server-side.
   */
  function queueAutoTag(userId: string, mediaId: string) {
    setStatus(mediaId, "pending");
    autoTagMedia(userId, mediaId).catch((e) => console.error("Queued auto-tag failed", e));
  }

  return { autoTagMedia, queueAutoTag };
}

export type AutoTagService = ReturnType<typeof createAutoTagService>;
