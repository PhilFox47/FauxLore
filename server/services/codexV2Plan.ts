 
import { createHash } from "node:crypto";
import { verifiedResearchSource } from "./codexQuality";
import { combinedShape, subjectSeason, subjectYear, type CodexSubject } from "./codexResearch";
import type { CodexData } from "./codex";

export const CODEX_V2_VERSION = 1;
export const CODEX_V2_PHASES = ["identity", "narrative", "entities", "audience", "verification", "compilation"] as const;
export type Phase = typeof CODEX_V2_PHASES[number];
export interface Claim {
  id: string; section: string; fact: string; sourceUrl: string;
  name?: string; kind?: string; topic?: string; attribution?: string; why?: string;
  introducedAt?: string; introducedPct?: number;
  details?: Record<string, unknown>;
}
export type Step = { output: any; sources: string[] };
export type State = Partial<Record<Phase, Step>>;

export function fingerprint(subject: CodexSubject, model: string, known?: string | null): string {
  return createHash("sha256").update(JSON.stringify({
    v: CODEX_V2_VERSION, subject, model, known,
  })).digest("hex");
}
export function supportedClaim(claim: Claim, receipts: string[]): boolean {
  return claim && typeof claim.id === "string" &&
    /^[a-zA-Z0-9_-]{1,40}$/.test(claim.id) &&
    typeof claim.section === "string" && typeof claim.fact === "string" &&
    claim.fact.trim().length >= 8 && verifiedResearchSource(claim.sourceUrl, receipts);
}
export function gathered(state: State): Claim[] {
  const result: Claim[] = [];
  const seen = new Set<string>();
  for (const phase of ["narrative", "entities", "audience"] as const) {
    for (const row of (Array.isArray(state[phase]?.output?.claims) ? state[phase]!.output.claims : [])) {
      if (!supportedClaim(row, state[phase]?.sources || [])) continue;
      const candidate: Claim = { ...row, id: `${phase[0]}_${row.id}` };
      if (seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      result.push(candidate);
    }
  }
  return result;
}

export function approved(claims: Claim[], decision: any): Claim[] {
  // Only EXPLICIT, reasoned blacklist entries delete researched facts.
  // Missing opinions are NOT rejections: this is a brief sanity review.
  const explanations = new Map<string, string>();
  for (const row of (Array.isArray(decision?.reasons) ? decision.reasons : [])) {
    if (typeof row?.id === "string" && typeof row?.reason === "string" &&
        row.reason.trim().length >= 12) {
      explanations.set(row.id, row.reason.trim());
    }
  }
  const rejected = new Set((Array.isArray(decision?.rejectedIds) ? decision.rejectedIds : [])
    .filter((id: unknown) => typeof id === "string" && explanations.has(id as string)));
  return claims.filter(c => !rejected.has(c.id));
}

// The compiler edits the researched claims; it does NOT get to silently
// destroy them. Recover source-backed entries it omitted, while rejecting
// any unsupported names or quotes it invented.
export function narrowDossier(dossier: CodexData, claims: Claim[]): CodexData {
  const listFields: Record<string, "name" | "term" | "text"> = {
    characters: "name", antagonists: "name", locations: "name", factions: "name",
    items: "name", terminology: "term", flavorTexts: "text",
  };
  const clean: any = { ...dossier };
  const normalized = (value: string): string => value.trim().replace(/\s+/g, " ").toLowerCase();

  for (const [section, field] of Object.entries(listFields)) {
    const evidence = new Map<string, Claim>();
    for (const claim of claims.filter(c => c.section === section)) {
      // A memory is keyed by the actual quote, NEVER its name/speaker.
      const label = section === "flavorTexts" ? claim.fact : claim.name;
      if (typeof label === "string" && label.trim()) evidence.set(normalized(label), claim);
    }
    const rows: any[] = [];
    const seen = new Set<string>();
    for (const item of (Array.isArray(clean[section]) ? clean[section] : [])) {
      if (typeof item?.[field] !== "string") continue;
      const key = normalized(item[field]);
      const claim = evidence.get(key);
      if (!claim || seen.has(key)) continue;
      seen.add(key);
      rows.push(withEvidence(item, claim));
    }
    for (const [key, claim] of evidence) {
      if (seen.has(key)) continue;
      seen.add(key);
      if (section === "flavorTexts") {
        rows.push(withEvidence({
          text: claim.fact, kind: claim.kind || "reference", scope: "work",
          attribution: claim.attribution, why: claim.why, topic: claim.topic,
        }, claim));
      } else if (section === "terminology") {
        rows.push(withEvidence({ term: claim.name, meaning: claim.fact }, claim));
      } else {
        rows.push(withEvidence({
          name: claim.name, description: claim.fact, ...(claim.details || {}),
        }, claim));
      }
    }
    clean[section] = rows;
  }
  const moments = new Map(claims.filter(c => c.section === "signatureMoments")
    .map(c => [normalized(c.fact), c.fact] as const));
  clean.signatureMoments = [...moments.values()];
  return clean;
}

// Introduction positions must come from sourced claims, not the compiler.
function withEvidence(item: Record<string, unknown>, claim: Claim): Record<string, unknown> {
  const entry = { ...item };
  delete entry.introducedAt;
  delete entry.introducedPct;
  if (typeof claim.introducedAt === "string" && claim.introducedAt.trim()) {
    entry.introducedAt = claim.introducedAt;
  }
  if (Number.isFinite(claim.introducedPct) &&
      Number(claim.introducedPct) > 0 && Number(claim.introducedPct) <= 100) {
    entry.introducedPct = claim.introducedPct;
  }
  return entry;
}

function subjectInfo(s: CodexSubject): string {
  return [
    `Title: ${s.title}`, `Media: ${s.mediaType}`,
    subjectYear(s) ? `Year: ${subjectYear(s)}` : "",
    subjectSeason(s) ? `Exact season: ${subjectSeason(s)}` : "",
    s.creator ? `Creator: ${s.creator}` : "",
    s.subtitle ? `Subtitle: ${s.subtitle}` : "",
    s.description ? `Entry description: ${s.description.slice(0, 500)}` : "",
    s.franchises?.length ? `Franchises: ${s.franchises.join(", ")}` : "",
  ].filter(Boolean).join("\n");
}
export function researchPrompt(phase: Exclude<Phase, "compilation">, subject: CodexSubject,
  state: State, claims: Claim[], known?: string | null): string {
  const scope = subjectInfo(subject);
  const identity = JSON.stringify(state.identity?.output || {});
  const common = `You are researching ONE RELEASED media work for a reference encyclopedia.
Use NATIVE WEB SEARCH and verify facts with actual sources. Do not invent.
No sequel-only characters, sequel gameplay, remasters or other seasons.
Source references MUST link to the specific actual page supporting each claim,
not merely a domain from search results. The facts will eventually feed an AI
generator, so false facts are worse than missing facts. Avoid ending spoilers.
Write all returned Codex content in ENGLISH, except authentic original German quotes for German works. Research foreign-language sources if helpful, but output Latin-letter names (established romanizations), never Japanese script or other foreign-script prose. Use a documented English translation for a direct quote, otherwise an English descriptive reference, not a made-up literal translation.\nReturn ONLY valid JSON, no prose or markdown.`;
  if (phase === "identity") return `${scope} first release original creator developer publisher year remake sequel differences
${common}
Identify exactly which work this is, what is excluded (sequels, adaptations,
future seasons, revised editions) and how much trustworthy material exists.
Search first, do not rely on recognition. ONE verified identity source is required.
{"title":"","year":0,"creator":"","type":"","coverage":"abundant | moderate | thin",
"aliases":[],"excludedWorks":[],"exclusionNotes":"","sourceUrl":"https://source-page"}`;
  const prefix = `${scope}\nSOURCE-VERIFIED WORK IDENTITY AND EXCLUSIONS:\n${identity}
${known ? `Already on file (expansion must find new facts):\n${known.slice(0, 3200)}` : ""}
${common}`;
  const shape = `{"claims":[{"id":"unique_id","section":"section_key",
"fact":"concrete supported observation or EXACT quote",
"sourceUrl":"https://actual-supporting-page","name":"canonical entity name if relevant",
"kind":"quote | reference | joke if a memory",
"topic":"specific subject if a memory","attribution":"who said it"}]}`;
  if (phase === "narrative") return `${subject.title} story narrative pacing themes mechanics design production reviews
${prefix}
Research the WORK ITSELF, not just its press announcement. Seek 10-35 distinct,
supported observations and do not rephrase the synopsis repeatedly. For a new
novel find independent reviews, chapter/pacing discussion and reading previews.
If little material exists, return fewer verified facts, never guessed scenes.
Allowed section keys: premise, overview, structure, distinctive, themes, conflicts,
signatureMoments, setting, worldRules, everydayLife, production, reception,
soundAndMusic, audience, contentWarnings, artStyle, genres, tags, relatedWorks.
${shape}`;
  if (phase === "entities") return `${subject.title} canon characters factions locations technology objects first appearance
${prefix}
Find specific named people, opponents, organizations, places, items and terms
IN THIS RELEASE, not merely the franchise. Check for first appearance and
disambiguate sequel-only entries. Aim for 12-60 supported entries if available;
do not pad a small new book. Don't class cities or ships as ordinary items.
Use sections characters, antagonists, locations, factions, items, terminology.
For each entity provide "name" in canonical spelling. Optional "details" is a
dictionary of supported CodexEntity fields (appearance, role, affiliation,
personality, atmosphere, purpose, etc). Include introducedAt/introducedPct ONLY
when verifiable; never invent 0% introductions.
${shape}`;
  if (phase === "audience") return `${subject.title} fan favorite iconic dialogue quotes memes reddit forums memorable moments
${prefix}
Search fan discussions and genuine in-work quotations separately. Return 0-12
memories with exceptional work-specific recognition. A REAL ordinary line of
dialogue is not automatically a strong memory. Distinct topics, at most ONE
joke about one vehicle/mechanic/person. Never manufacture quote wording or a
newly published novel's fandom. A zero-length list is a valid result.
section ALWAYS flavorTexts; "fact" is the EXACT line, "kind" is quote,
reference or joke, "topic" must identify an underlying subject.
${shape}`;

  // Four stages already did research. This is a cheap, no-web plausibility pass.
  const candidates = claims.map(c => ({
    id: c.id,
    section: c.section,
    label: (c.name || c.fact).slice(0, 75),
    context: c.fact.slice(0, 110),
  }));
  return `QUICK PLAUSIBILITY REVIEW for ${subject.title} (${subjectYear(subject) || ""}, ${subject.mediaType}).
Scope: ${JSON.stringify(state.identity?.output || {}).slice(0, 1200)}
You are NOT re-researching or rewriting an encyclopedia. No web search.
All candidates came from source-backed research. KEEP THEM BY DEFAULT.
Your ONLY job is to spot OBVIOUS factual mistakes on sight: a character from a
different sequel, a wrong franchise, a blatantly false first appearance or
an obvious misattributed quotation. Do not reject for uncertainty, incomplete
context, lack of a second citation, subjective importance, or unfamiliarity.
Return ONLY a short blacklist of demonstrably wrong IDs and a specific reason
for each rejection. No approvedIds or per-claim votes. If nothing is CLEARLY
wrong, return {"rejectedIds":[],"reasons":[]}.
CANDIDATES (${candidates.length}):
${JSON.stringify(candidates)}
JSON ONLY: {"rejectedIds":["e_4"],"reasons":[{"id":"e_4","reason":"Appears in a sequel, not the original game."}],
"scopeConfidence":"high | medium | low"}`;


}
export function compilePrompt(subject: CodexSubject, state: State, claims: Claim[]): string {
  return `Compile the final CodexData JSON for EXACTLY this work.
NO WEB SEARCH IN THIS PHASE. Use ONLY the verified claims given below.
No new entity, fact, memory or sequel/other-season content. NO invention.
Keep exact entity names, quote text and signatureMoments text. Use specific,
crisp prose, not generic descriptions. Leave unsupported sections empty.
Use "introducedAt" and "introducedPct" ONLY if backed by a claim.
For books without a fixed visual adaptation use artStyle.form:"none".
Return just one JSON object using the existing app schema, which MUST remain
fully backward compatible with Enemy Forge, Loot, tags and other features.
Work: ${subjectInfo(subject)}
Research identity: ${JSON.stringify(state.identity?.output)}
SOURCE-BACKED CLAIMS AFTER PLAUSIBILITY REVIEW (${claims.length}):
${JSON.stringify(claims).slice(0, 90000)}
JSON SCHEMA TEMPLATE:
${combinedShape()}`;
}
