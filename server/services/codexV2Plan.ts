 
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
  const yes = new Set(Array.isArray(decision?.approvedIds) ? decision.approvedIds : []);
  const no = new Set(Array.isArray(decision?.rejectedIds) ? decision.rejectedIds : []);
  return claims.filter(c => yes.has(c.id) && !no.has(c.id));
}
export function narrowDossier(dossier: CodexData, claims: Claim[]): CodexData {
  const lists: Record<string, "name" | "term" | "text"> = {
    characters: "name", antagonists: "name", locations: "name", factions: "name",
    items: "name", terminology: "term", flavorTexts: "text",
  };
  const clean: any = { ...dossier };
  for (const [section, field] of Object.entries(lists)) {
    const allowed = new Map(claims.filter(c => c.section === section)
      .map(c => [(c.name || c.fact).trim().toLowerCase(), c] as const));
    clean[section] = (Array.isArray(clean[section]) ? clean[section] : [])
      .filter((item: any) => typeof item?.[field] === "string" &&
        allowed.has(item[field].trim().toLowerCase()))
      .map((item: any) => {
        const claim = allowed.get(item[field].trim().toLowerCase())!;
        const entry = { ...item };
        // First-appearance metadata is safety-critical for spoiler controls.
        // A compiler's guess is not evidence: only the researched claim may
        // supply these fields, and zero is not a verified introduction.
        delete entry.introducedAt;
        delete entry.introducedPct;
        if (claim.introducedAt && typeof claim.introducedAt === "string") {
          entry.introducedAt = claim.introducedAt;
        }
        if (Number.isFinite(claim.introducedPct) &&
            Number(claim.introducedPct) > 0 && Number(claim.introducedPct) <= 100) {
          entry.introducedPct = claim.introducedPct;
        }
        return entry;
      });
  }
  const moments = new Set(claims.filter(c => c.section === "signatureMoments").map(c => c.fact.trim().toLowerCase()));
  clean.signatureMoments = (Array.isArray(clean.signatureMoments) ? clean.signatureMoments : [])
    .filter((x: any) => typeof x === "string" && moments.has(x.trim().toLowerCase()));
  return clean;
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
Return ONLY valid JSON, no prose or markdown.`;
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
  const candidates = claims.map(c => ({ id:c.id, section:c.section,
    name:c.name, fact:c.fact, sourceUrl:c.sourceUrl,
    introducedAt:c.introducedAt, introducedPct:c.introducedPct,
    details:c.details }));
  return `${subject.title} verify first appearance source evidence franchise canon contradictions
${prefix}
INDEPENDENTLY VERIFY EACH CANDIDATE BY NEW WEB SEARCH, not merely by noticing
its source URL. Check actual claim/source correspondence, sequel-only elements,
false quotes, and contradictory primary sources. Approve only corroborated facts.
If you cannot substantiate a claim, reject it. Keep a balanced variety of
memories, not filler. Return an explicit verdict for EACH candidate ID. Omitted
IDs are dropped, so don't silently omit vetted ones.
CANDIDATES (${candidates.length}):
${JSON.stringify(candidates).slice(0, 64000)}
{"approvedIds":["n_1"],"rejectedIds":["e_2"],
"reasons":[{"id":"e_2","reason":"Only appears in sequel"}],
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
APPROVED VERIFIED CLAIMS (${claims.length}):
${JSON.stringify(claims).slice(0, 90000)}
JSON SCHEMA TEMPLATE:
${combinedShape()}`;
}
