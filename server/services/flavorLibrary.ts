import { v4 as uuidv4 } from "uuid";
import type { Db } from "../context";
import { STARTER_FLAVOR_TEXTS } from "../data/starterFlavorTexts";
import { normalizeFlavorTexts, type CodexFlavorText } from "./codex";

/**
 * The flavor-text library: what can appear under a library title.
 *
 * Two pools live in `flavor_texts` and are read as one. STARTERS are global
 * (userId NULL), seeded from the repo, and every account sees them. EARNED lines
 * come from Codex research on a work the user actually consumed, and belong to
 * that user — someone else finishing the same book does not put a line in your
 * library, and a work you have never added cannot put one there either.
 *
 * Why a table at all, when the Codex JSON already holds the researched lines:
 * that document is the RESEARCH RECORD, written once and not meant to be edited.
 * This is the LIVE LIBRARY — rows that can be retired, counted, and reasoned
 * about per user without unpacking a blob. The two are kept in step at the only
 * moment the research can change, which is when a Codex is compiled.
 *
 * Eligibility is deliberately NOT materialised. Whether a work counts as
 * consumed changes every time the user touches its status, so it is evaluated on
 * read against the media row. That is one join, and it means finishing something
 * makes its lines appear immediately rather than after a job runs.
 */

/** Finished is the obvious case. */
const FINISHED = ["Completed", "Extras"];

/**
 * Ongoing works are the exception the rule needs: a long-running series is
 * almost never marked Completed, so waiting for that would permanently exclude
 * the works someone has spent the most time with. Following it is enough — but
 * following it, not merely owning it. A Planning entry is something nobody has
 * watched a minute of.
 */
const FOLLOWING = ["Active", "Caught Up", "On Hold", "Completed", "Extras"];

export interface FlavorRow {
  quote: string;
  source?: string;
  kind?: string;
  attribution?: string;
  earned?: boolean;
  mediaId?: string;
}

export function createFlavorLibrary({ db }: { db: Db }) {
  const insert = db.prepare(
    `INSERT INTO flavor_texts (id, userId, mediaType, text, source, kind, scope, attribution, why, mediaId, origin, retired, createdAt)
     VALUES (@id, @userId, @mediaType, @text, @source, @kind, @scope, @attribution, @why, @mediaId, @origin, 0, @createdAt)
     ON CONFLICT DO NOTHING`,
  );

  /**
   * Writes any starter line that is not already there.
   *
   * Insert-only, on purpose. Adding lines to the repo file gives every install
   * them on the next restart; editing or removing one there does not reach back
   * into a database that may have been curated since. A retired row still exists,
   * so the conflict clause is also what stops re-seeding resurrecting it.
   */
  function seedStarters(): number {
    const now = new Date().toISOString();
    let added = 0;
    db.transaction(() => {
      for (const [mediaType, list] of Object.entries(STARTER_FLAVOR_TEXTS)) {
        for (const entry of list) {
          const result = insert.run({
            id: uuidv4(),
            userId: null,
            mediaType,
            text: entry.quote,
            source: entry.source || null,
            kind: entry.kind || "quote",
            // A starter with no source is a house line about the medium, which is
            // exactly what `medium` scope means on the earned side.
            scope: entry.source ? "work" : "medium",
            attribution: null,
            why: null,
            mediaId: null,
            origin: "starter",
            createdAt: now,
          });
          added += result.changes;
        }
      }
    })();
    return added;
  }

  /** Replaces one entry's earned lines. Called when its Codex is compiled. */
  function writeEarned(userId: string, mediaId: string, mediaType: string, title: string, texts: CodexFlavorText[]): number {
    const now = new Date().toISOString();
    let added = 0;
    db.transaction(() => {
      // Re-research replaces rather than accumulates: the old lines were this
      // work's answer to the same question and are no longer the answer.
      db.prepare("DELETE FROM flavor_texts WHERE userId = ? AND mediaId = ? AND origin = 'codex'").run(userId, mediaId);
      for (const t of texts) {
        // A format line is about the medium, not the work. Recording the title on
        // it would be false, and would spoil the effect — these are meant to read
        // as house lines, which is the whole reason they work.
        const ofTheWork = t.scope !== "medium";
        added += insert.run({
          id: uuidv4(),
          userId,
          mediaType,
          text: t.text,
          source: ofTheWork ? title : null,
          kind: t.kind || "quote",
          scope: ofTheWork ? "work" : "medium",
          attribution: ofTheWork ? t.attribution || null : null,
          why: t.why || null,
          mediaId,
          origin: "codex",
          createdAt: now,
        }).changes;
      }
    })();
    return added;
  }

  /** Drops an entry's lines. Its media row is going away, so its lines must too. */
  function forgetMedia(userId: string, mediaId: string): void {
    db.prepare("DELETE FROM flavor_texts WHERE userId = ? AND mediaId = ?").run(userId, mediaId);
  }

  /**
   * Everything this user may see, grouped by media type.
   *
   * Starters are unconditional. Earned rows have to clear the eligibility rule,
   * which is why they join back to `media` — a line from a book still sitting in
   * Planning has not been earned yet, and one whose entry has been deleted is
   * gone with it.
   */
  function readFor(userId: string): Record<string, FlavorRow[]> {
    const rows: any[] = db
      .prepare(
        `SELECT f.mediaType, f.text, f.source, f.kind, f.attribution, f.mediaId, f.userId
           FROM flavor_texts f
           LEFT JOIN media m ON m.id = f.mediaId AND m.userId = f.userId
          WHERE f.retired = 0
            AND ( f.userId IS NULL
               OR ( f.userId = ?
                    AND m.id IS NOT NULL
                    AND ( m.status IN (${FINISHED.map(() => "?").join(", ")})
                       OR (m.isOngoing = 1 AND m.status IN (${FOLLOWING.map(() => "?").join(", ")})) ) ) )`,
      )
      .all(userId, ...FINISHED, ...FOLLOWING);

    const byType: Record<string, FlavorRow[]> = {};
    for (const row of rows) {
      const list = (byType[row.mediaType] ||= []);
      const out: FlavorRow = { quote: row.text };
      if (row.source) out.source = row.source;
      if (row.kind) out.kind = row.kind;
      if (row.attribution) out.attribution = row.attribution;
      if (row.userId) {
        out.earned = true;
        if (row.mediaId) out.mediaId = row.mediaId;
      }
      list.push(out);
    }
    return byType;
  }

  /**
   * One-time move of lines already sitting inside Codex JSON.
   *
   * Everything researched before this table existed lives in `media_codex.data`,
   * and would otherwise be silently dropped the moment the read switched over.
   * Insert-only and keyed on the same unique index, so running it twice is free.
   */
  function backfillFromCodexes(): number {
    let added = 0;
    const rows: any[] = db
      .prepare(
        `SELECT c.userId, c.mediaId, c.data, m.title, m.mediaType
           FROM media_codex c
           JOIN media m ON m.id = c.mediaId AND m.userId = c.userId
          WHERE c.status = 'ready' AND c.data IS NOT NULL`,
      )
      .all();

    for (const row of rows) {
      let parsed: any = null;
      try { parsed = JSON.parse(row.data); } catch { continue; }
      const texts = normalizeFlavorTexts(parsed?.flavorTexts);
      if (!texts.length) continue;
      const now = new Date().toISOString();
      for (const t of texts) {
        const ofTheWork = t.scope !== "medium";
        added += insert.run({
          id: uuidv4(),
          userId: row.userId,
          mediaType: row.mediaType,
          text: t.text,
          source: ofTheWork ? row.title : null,
          kind: t.kind || "quote",
          scope: ofTheWork ? "work" : "medium",
          attribution: ofTheWork ? t.attribution || null : null,
          why: t.why || null,
          mediaId: row.mediaId,
          origin: "codex",
          createdAt: now,
        }).changes;
      }
    }
    return added;
  }

  return { seedStarters, writeEarned, forgetMedia, readFor, backfillFromCodexes };
}

export type FlavorLibrary = ReturnType<typeof createFlavorLibrary>;
