
import type { CodexData, CodexEntity, CodexFlavorText } from "./codex";
import { verifiedResearchSource } from "./codexQuality";
import { stripNativeAnnotations } from "./codexV3Language";

export const V3_VERSION = 3;
export type KnowledgeArea =
  | "characters" | "antagonists" | "locations" | "factions"
  | "items" | "terminology" | "events" | "flavorTexts"
  | "craft" | "production" | "mechanics" | "content" | "misc";
export type KnowledgeUse = "enemy" | "loot" | "image" | "wrapped" | "tags" | "story" | "memory";
export interface ManifestTarget {
  name: string;
  area: KnowledgeArea;
  priority: "essential" | "important" | "supporting";
  reason?: string;
}
export interface KnowledgeEntry {
  id: string;
  area: KnowledgeArea;
  name: string;
  facts: string[];
  details: Record<string, unknown>;
  relatesTo: string[];
  sourceUrls: string[];
  sourceStatus: "verified" | "uncertain";
  priority: "essential" | "important" | "supporting";
  introducedAt?: string;
  introducedPct?: number;
}
export interface CodexKnowledge {
  version: 3;
  identity: Record<string, unknown>;
  core: Partial<CodexData>;
  manifest: ManifestTarget[];
  entries: KnowledgeEntry[];
  missing: ManifestTarget[];
  sources: string[];
  notes: string[];
}
export const AREAS: KnowledgeArea[] = [
  "characters","antagonists","locations","factions","items","terminology","events","flavorTexts",
  "craft","production","mechanics","content","misc",
];
const value = (v: unknown): string => typeof v === "string" ? v.trim() : "";
export const normalizeKey = (v: unknown): string =>
  value(v).toLowerCase().replace(/[\s\-_]+/g, " ").trim();

function normalizePriority(v: unknown): ManifestTarget["priority"] {
  return v === "essential" || v === "important" ? v : "supporting";
}
export function normalizeManifest(raw: unknown): ManifestTarget[] {
  const input = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  return input.flatMap((r): ManifestTarget[] => {
    if (!r || !AREAS.includes(r.area) || !value(r.name)) return [];
    const name=stripNativeAnnotations(value(r.name));
    if (!name) return [];
    const key = `${r.area}:${normalizeKey(name)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ name, area: r.area,
      priority: normalizePriority(r.priority), reason: value(r.reason) || undefined }];
  });
}

const DETAILS = new Set([
  "aliases","description","appearance","affiliation","role","prominence",
  "abilities","personality","relationships","status","nature","motivation",
  "methods","opposedTo","material","purpose","significance","owner","origin",
  "region","atmosphere","whatHappensThere","opposes","goal","symbol","colors",
  "members","category","kind","scope","topic","attribution","why",
  "chronology","participants","consequences","optional","location",
  "visualDesign","themes",
]);

function cleanDetails(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, unknown> = {};
  for (const [k,v] of Object.entries(input)) {
    if (!DETAILS.has(k)) continue;
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
    else if (typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v)) {
      const parts = v.filter(x=>typeof x==="string" && !!x.trim()).map(x=>x.trim());
      if (parts.length) out[k] = parts;
    }
  }
  return out;
}
export function normalizeEntries(raw: unknown, receipts: string[], prefix: string): KnowledgeEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: KnowledgeEntry[] = [];
  for (let i=0;i<raw.length;i++) {
    const r=raw[i];
    if (!r || typeof r !== "object") continue;
    const originalArea=value(r.area);
    if (!originalArea) continue;
    const aliases:Record<string,KnowledgeArea>={
      "creative techniques":"craft","creativetechniques":"craft",
      "techniques":"craft","creative technique":"craft",
      "gameplay":"mechanics","game mechanics":"mechanics",
      "themes":"craft","art":"craft","reception":"production",
      "content warnings":"content",
    };
    const key=originalArea.toLowerCase().replace(/[_-]/g," ").trim();
    const area:KnowledgeArea=AREAS.includes(originalArea as KnowledgeArea)
      ? originalArea as KnowledgeArea : aliases[key] || "misc";
    const name=stripNativeAnnotations(value(r.name || (area === "flavorTexts" ? r.text : "")));
    if (!name) continue;
    // Some model versions return craft details as a STRING and use "sources"
    // instead of "sourceUrls". Keep the researched prose and URLs.
    const rawFacts=Array.isArray(r.facts) ? r.facts
      : [r.facts,r.fact,r.description,typeof r.details==="string"?r.details:undefined];
    const facts:string[]=rawFacts.filter((v:unknown):v is string=>
      typeof v==="string" && !!v.trim()).map(v=>v.trim());
    const rawUrls=[
      ...(Array.isArray(r.sourceUrls)?r.sourceUrls:[r.sourceUrl]),
      ...(Array.isArray(r.sources)?r.sources:[]),
    ];
    const urls:string[]=rawUrls.filter((v: unknown):v is string=>
      typeof v==="string" && /^https?:\/\//i.test(v));
    const status=urls.some((u: string)=>verifiedResearchSource(u,receipts))?"verified":"uncertain";
    const related:string[]=Array.isArray(r.relatesTo)
      ? r.relatesTo.filter((x: unknown):x is string=>typeof x==="string"&&!!x.trim())
        .map((x: string)=>stripNativeAnnotations(x)) : [];
    const details=cleanDetails(r.details);
    if(area==="misc" || area!==originalArea)details.originalArea=originalArea;
    const result:KnowledgeEntry={
      id:`${prefix}_${i}`,area,name,facts,details,
      relatesTo:related,sourceUrls:[...new Set(urls)],sourceStatus:status,
      priority:normalizePriority(r.priority),
    };
    if (typeof r.introducedAt==="string" && r.introducedAt.trim()) result.introducedAt=r.introducedAt.trim();
    if (Number.isFinite(r.introducedPct) && r.introducedPct>0 && r.introducedPct<=100)
      result.introducedPct=r.introducedPct;
    out.push(result);
  }
  return out;
}
export function mergeKnowledgeEntries(entries: KnowledgeEntry[]): KnowledgeEntry[] {
  const byKey=new Map<string, KnowledgeEntry>();
  for(const entry of entries) {
    const key=`${entry.area}:${normalizeKey(entry.name)}`;
    const old=byKey.get(key);
    if (!old) {byKey.set(key,{...entry});continue;}
    const priority={essential:3,important:2,supporting:1};
    old.facts=[...new Set([...old.facts,...entry.facts])];
    old.relatesTo=[...new Set([...old.relatesTo,...entry.relatesTo])];
    old.sourceUrls=[...new Set([...old.sourceUrls,...entry.sourceUrls])];
    old.details={...entry.details,...old.details};
    if (entry.sourceStatus==="verified")old.sourceStatus="verified";
    if(priority[entry.priority]>priority[old.priority])old.priority=entry.priority;
    if(!old.introducedAt && entry.introducedAt)old.introducedAt=entry.introducedAt;
    if(!old.introducedPct && entry.introducedPct)old.introducedPct=entry.introducedPct;
  }
  return [...byKey.values()];
}
export function missingManifest(manifest: ManifestTarget[],entries: KnowledgeEntry[]):ManifestTarget[] {
  const present=new Set(entries.map(e=>`${e.area}:${normalizeKey(e.name)}`));
  return manifest.filter(m=>!present.has(`${m.area}:${normalizeKey(m.name)}`));
}
export function excludeReviewedErrors(entries: KnowledgeEntry[], review: any): KnowledgeEntry[] {
  const reasons=new Map<string,string>();
  for (const r of Array.isArray(review?.reasons)?review.reasons:[]) {
    if(typeof r?.id==="string" && typeof r?.reason==="string" && r.reason.trim().length>=12)
      reasons.set(r.id,r.reason.trim());
  }
  const rejected=new Set((Array.isArray(review?.rejectedIds)?review.rejectedIds:[])
    .filter((id:unknown)=>typeof id==="string"&&reasons.has(id as string)));
  return entries.filter(e=>!rejected.has(e.id));
}

function asEntity(entry:KnowledgeEntry): CodexEntity {
  const x:any={...entry.details,name:entry.name};
  // Canonical CodexEntity expects aliases/members arrays. A descriptive
  // sentence about membership is prose, not a roster of names.
  if(typeof x.aliases==="string")x.aliases=[x.aliases];
  const membersProse=typeof x.members==="string" ? x.members : "";
  if(membersProse)delete x.members;
  const prose=[...entry.facts, ...(membersProse?[membersProse]:[])];
  if(prose.length)x.description=prose.join(" ");
  if(entry.introducedAt)x.introducedAt=entry.introducedAt;
  if(entry.introducedPct)x.introducedPct=entry.introducedPct;
  return x as CodexEntity;
}
export function toCodexData(kb:CodexKnowledge):CodexData {
  const core:CodexData={...kb.core};
  const id=kb.identity;
  core.identifiedAs={
    ...(core.identifiedAs || {}),
    title:value(id.title),year:typeof id.year==="number"?id.year:undefined,
    type:value(id.type),creator:value(id.creator),
    coverage: id.coverage==="abundant"||id.coverage==="moderate"||id.coverage==="thin" ? id.coverage : "moderate",
  };
  const entities=(area:KnowledgeArea)=>kb.entries.filter(e=>e.area===area);
  for(const area of ["characters","antagonists","locations","factions","items"] as const) {
    core[area]=entities(area).map(asEntity);
  }
  core.terminology=entities("terminology").map(e=>({
    term:e.name,meaning:e.facts.join(" "), category:value(e.details.category)||undefined,
    introducedAt:e.introducedAt,introducedPct:e.introducedPct,
  }));
  core.flavorTexts=entities("flavorTexts").map(e=>({
    text:e.name,kind:(["quote","reference","joke"].includes(value(e.details.kind))?
      e.details.kind:"reference") as CodexFlavorText["kind"],scope:"work",
    attribution:value(e.details.attribution)||undefined,
    topic:value(e.details.topic)||undefined,why:value(e.details.why)||undefined,
  }));
  const moments=entities("events").filter(e=>e.priority!=="supporting")
    .map(e=>e.facts[0] ? `${e.name}: ${e.facts[0]}` : e.name);
  core.signatureMoments=[...new Set([...(core.signatureMoments || []),...moments])];
  core.sources=kb.sources;
  core.confidence=kb.missing.some(m=>m.priority==="essential")?"medium":
    kb.entries.some(e=>e.sourceStatus==="uncertain")?"medium":"high";
  core.notes=[value(core.notes),...kb.notes,
    kb.missing.length?`Research coverage gaps: ${kb.missing.map(x=>x.name).join(", ")}`:""
  ].filter(Boolean).join("\n");
  return core;
}
