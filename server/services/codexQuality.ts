/**
 * Small, deterministic quality gates for researched Codex data.
 * No invented entries, no extra network traffic, and no dependence on titles.
 */
const COMMON = new Set([
  "the","and","for","with","from","that","this","they","there","their","them","about",
  "because","after","before","during","over","under","into","through","what","when",
  "some","more","once","also","only","would","could","should","which",
  "quote","quotes","quotation","says","said","saying","line","lines","text",
  "fans","fan","fandom","favorite","favourite","popular","iconic","reference",
  "game","games","book","books","movie","film","show","series","episode","story",
  "meme","memes","joke","jokes","funny","impression","running","known","well",
  "moment","moments","scene","scenes","player","players","community","character",
]);

export interface MemoryCandidate {
  text: string;
  kind?: string;
  scope?: string;
  topic?: string;
  why?: string;
  attribution?: string;
}

function words(s: string): string[] {
  return (s.toLowerCase().normalize("NFKD").match(/[a-z0-9\p{L}]{3,}/gu) || [])
    .filter(w => !COMMON.has(w));
}

/** Excludes medium-level lines and quotes, which may legitimately share a speaker. */
export function memoryTopicsOverlap(a: MemoryCandidate, b: MemoryCandidate): boolean {
  if (a.scope === "medium" || b.scope === "medium") return false;
  if (a.kind === "quote" && b.kind === "quote") return false;
  const explicitA = String(a.topic || "").trim().toLowerCase();
  const explicitB = String(b.topic || "").trim().toLowerCase();
  if (explicitA && explicitB) return explicitA === explicitB;
  const left = new Set(words([a.topic, a.why, a.kind === "joke" ? a.attribution : ""].filter(Boolean).join(" ")));
  const right = new Set(words([b.topic, b.why, b.kind === "joke" ? b.attribution : ""].filter(Boolean).join(" ")));
  // A named shared subject in both descriptions is a conservative reason to
  // de-duplicate a fan joke/reference. Short jokes without context are not facts.
  return [...left].some(word => word.length >= 4 && right.has(word));
}

export function memoryQuality(candidate: MemoryCandidate): number {
  let n = candidate.kind === "quote" ? 4 : candidate.kind === "reference" ? 2 : 1;
  const text = candidate.text || "";
  if (text.length >= 18 && text.length <= 130) n += 2;
  if (/\b[A-Z][a-z]+\b/.test(text)) n += 1;
  if ((candidate.attribution || "").length >= 4) n += 1;
  if ((candidate.why || "").length > 15) n += 1;
  // A single sound effect is rarely a useful standalone, verifiable memory.
  if (candidate.kind === "joke" && words(text).length === 0) n -= 5;
  return n;
}

export type FollowUpFocus = "memories" | "facts" | null;
export interface CodexQualitySubject {
  mediaType: string;
  coverage?: string;
  characters?: unknown[];
  signatureMoments?: unknown[];
  flavorTexts?: unknown[];
}

/**
 * At most ONE extra researched pass, only for a specific problem.
 * Unknown/recent books get source-based factual top-up, not meme quota filling.
 * No follow-up is required for sparse low-coverage works.
 */
export function chooseCodexFollowUp(data: CodexQualitySubject): FollowUpFocus {
  const count = (v: unknown) => Array.isArray(v) ? v.length : 0;
  if (data.coverage === "abundant" && count(data.flavorTexts) < 5) return "memories";
  if (data.mediaType === "Book" && count(data.signatureMoments) <= 3 &&
      count(data.characters) <= 5 && data.coverage !== "thin") return "facts";
  return null;
}

/** Count duplicate topical memory slots before the normalizer discards them. */
export function duplicatedMemoryTopics<T extends MemoryCandidate>(rows: T[]): number {
  let collisions = 0;
  const seen: T[] = [];
  for (const item of rows) {
    if (seen.some(other => memoryTopicsOverlap(other, item))) collisions++;
    else seen.push(item);
  }
  return collisions;
}

/** Basic red flag for structure fields that contain only bibliographic metadata. */
export function isGenericStructure(text: unknown): boolean {
  const value = String(text || "").trim();
  if (!value) return true;
  return !/(chapter|kapitel|perspectiv|perspektiv|cliffhanger|flashback|rückblend|timeline|chronolog|act\b|akt\b|mission|episode|episod|plot|erzählt|erzähl|narrativ|twist|story|scene|szene|structure|struktur|wechsel|pacing)/i.test(value);
}

/** Accept only URLs that were actually returned by the native search tool. */
export function verifiedResearchSource(url: unknown, searchSources: string[]): boolean {
  if (typeof url !== "string" || !url) return false;
  const canonical = (value: string) => {
    try {
      const u = new URL(value);
      if (!["http:", "https:"].includes(u.protocol)) return "";
      return `${u.hostname.toLowerCase()}${u.pathname.replace(/\\/+$/, "")}`;
    } catch { return ""; }
  };
  const candidate = canonical(url);
  return !!candidate && searchSources.some(source => canonical(source) === candidate);
}

/** A new scene must add meaningful concrete material instead of restating a blurb beat. */
export function distinctScene(text: string, known: string[]): boolean {
  if (text.trim().length < 35) return false;
  const candidate = new Set(words(text));
  if (candidate.size < 4) return false;
  return !known.some(existing => {
    const old = new Set(words(existing));
    const shared = [...candidate].filter(w => old.has(w)).length;
    return shared / Math.max(1, Math.min(candidate.size, old.size)) >= 0.65;
  });
}
