import type { Db } from "../context";
import { codexArtStyleBlock, type CodexRow, type CodexService } from "../services/codex";

/**
 * Compact visual house style from an EXISTING, completed, account-owned Codex.
 * No new Codex research is launched just because a Wrapped scene needs art.
 */
export interface WrappedCodexStyle {
  mediaId: string;
  mediaTitle: string;
  style: string;
}

function usable(value: unknown): string {
  return typeof value === "string" ? value.replace(/[\x00-\x1f\x7f]/g, " ").trim() : "";
}

export function wrappedStyleFromCodex(row: CodexRow | null, mediaId: string, title: string): WrappedCodexStyle | null {
  if (!row || row.status !== "ready" || !row.data?.artStyle) return null;
  const art = row.data.artStyle;
  const form = usable(art.form);
  // A text-only work does not automatically have a canonical cinematography or
  // rendering style. Never invent one from a book's plot or a cover's palette.
  if (/^none\b/i.test(form)) return null;
  const core = [art.summary, art.medium, art.linework, art.characterDesign]
    .map(usable).filter(Boolean);
  const named = Array.isArray(art.styleKeywords) ?
    art.styleKeywords.filter(k => usable(k)).length : 0;
  // Avoid pretending an isolated generic color or "3D" label is a meaningful
  // style. One substantive house-style summary or two crafted traits suffice.
  if (core.length < 2 && named < 2 &&
    !(usable(art.summary).length >= 65 && (form || named))) return null;

  const block = codexArtStyleBlock(row);
  if (!block) return null;
  const lines = block.split("\n").map(line => line.replace(/[\x00-\x1f\x7f]/g, " ").trim())
    .filter(Boolean).map(line => line.slice(0, 190));
  // Prioritize actual medium + named craft language, not huge source excerpts.
  const style = lines.join("\n").slice(0, 1700);
  return style ? { mediaId, mediaTitle: title.slice(0, 180), style } : null;
}

export function createWrappedCodexStyleResolver(
  db: Db, codex: Pick<CodexService, "getCodexRow">,
): (userId: string, mediaId: string) => WrappedCodexStyle | null {
  return (userId, mediaId) => {
    try {
      // Explicit tenant ownership check before inspecting any Codex.
      const media = db.prepare(
        "SELECT title, mediaType, year, season FROM media WHERE userId=? AND id=?",
      ).get(userId, mediaId) as {
        title: string; mediaType: string; year: number | null; season: number | null;
      } | undefined;
      if (!media) return null;
      const row = codex.getCodexRow(userId, {
        mediaId, title: media.title, mediaType: media.mediaType,
        year: media.year, season: media.season,
      });
      return wrappedStyleFromCodex(row, mediaId, media.title);
    } catch (error) {
      // A missing, malformed or unavailable Codex must never block paid image
      // generation or trigger duplicate provider calls.
      console.warn("[wrapped-style] Existing Codex unavailable; using standard scene art.", error);
      return null;
    }
  };
}
