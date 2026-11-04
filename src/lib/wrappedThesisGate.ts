import type { WrappedEvidence, WrappedFact } from './wrappedEvidence';

const generic = [
  /\b(?:was|is|became) (?:a |an )?(?:busy|varied|mixed|interesting|full|eventful) (?:week|month|year|period)\b/i,
  /\b(?:many|several|various|different) (?:media|titles|genres|things|experiences|works)\b/i,
  /\b(?:the )?(?:logs|master pages|numbers|stats|data) (?:tell|show|suggest) (?:a )?story\b/i,
  /\bthe (?:story|journey|month) (?:continues|goes on)\b/i,
];
const activityOnly = /^(?:the (?:user|player|month|week) |you )?(?:logged|played|watched|read|finished|consumed|returned to|spent|recorded|completed|had)\b/i;
const interpretive = /\b(?:because|rather than|instead of|but|however|while|yet|despite|although|reveals|meant|matters|changed|turned|proved|contradiction|unexpected|cost|felt|together|compared|actually|wasn't|isn't|more than|less than|ironic|absurd|disaster|triumph)\b/i;
const phrase = (value: unknown, min: number, max: number) =>
  typeof value === 'string' && value.trim().length >= min &&
  value.trim().length <= max && /[A-Za-z]{3}/.test(value);

/** The director declares a point *before* earning a separate narrative slide. */
export function evaluateWrappedThesis(item: any, facts: Map<string, WrappedFact>): {
  acceptable: boolean; reason?: string;
} {
  if (!phrase(item?.thesis, 24, 330)) return {acceptable:false,reason:'Missing specific editorial thesis (24–330 chars)'};
  const claim = String(item.thesis).trim();
  if (generic.some(regex => regex.test(claim)) && !interpretive.test(claim)) {
    return {acceptable:false,reason:'Generic activity summary is not a specific claim'};
  }
  if (activityOnly.test(claim) && !interpretive.test(claim)) {
    return {acceptable:false,reason:'Just naming what was consumed is not an argument'};
  }
  const ids: string[] = Array.isArray(item.evidenceIds) ? [...new Set(item.evidenceIds)] : [];
  const known = ids.map(id => facts.get(id)).filter((f): f is WrappedFact => !!f);
  if (!known.length) return {acceptable:false,reason:'No verified source supports the proposed argument'};
  const significant = known.some(f =>
    f.kind === 'journal' ||
    f.id.startsWith('reference-') ||
    f.id.startsWith('session-resonance-') ||
    f.id.startsWith('taste-') ||
    f.id.startsWith('focus-') ||
    f.id.startsWith('outlier-') ||
    f.id.startsWith('gap-') ||
    f.id.startsWith('timeline-') ||
    f.kind === 'location' ||
    !!f.analytic ||
    /Review recorded by period end:/i.test(f.evidence));
  if (!significant && !interpretive.test(claim)) {
    return {acceptable:false,reason:'Only a leaderboard/count/phase source with no interpretation'};
  }
  if (!phrase(item.body, 40, 5000)) {
    return {acceptable:false,reason:'Body cannot be a bare headline or numeric caption'};
  }
  return {acceptable:true};
}

function semanticTokens(thesis: string): Set<string> {
  const common = new Set(['the','and','with','this','that','your','from','were','there',
    'during','into','over','have','what','just','than','they','their','about','which']);
  return new Set(thesis.toLowerCase().match(/[a-z]{4,}/g)?.filter(word => !common.has(word)) || []);
}
function thesisSimilarity(a: string,b: string): number {
  const x = semanticTokens(a), y = semanticTokens(b);
  if (!x.size || !y.size) return 0;
  const shared = [...x].filter(token => y.has(token)).length;
  return shared / Math.min(x.size,y.size);
}

export type WrappedThesisGateResult = {
  draft: any;
  cut: Array<{title:string;reason:string}>;
};

/**
 * Strict gate for NEW AI issues only. Old persisted stories still load.
 * It can DELETE weak interior slides without inventing a stronger claim.
 * The existing story validator then checks source IDs, chronology and layout.
 */
export function curateWrappedTheses(raw: any,evidence: WrappedEvidence): WrappedThesisGateResult {
  const wrapper = raw?.story && typeof raw.story === 'object' ? raw.story : raw;
  if (!Array.isArray(wrapper?.scenes)) throw new Error('Wrapped draft did not include scenes.');
  const all = wrapper.scenes as any[];
  const facts = new Map(evidence.facts.map(f => [f.id,f]));
  const cut: WrappedThesisGateResult['cut'] = [];
  const kept: any[] = [];
  const already: string[] = [];
  for (let i=0;i<all.length;i++) {
    const scene=all[i];
    if (i===0 || i===all.length-1) {
      kept.push(scene);
      continue;
    }
    const result = evaluateWrappedThesis(scene,facts);
    if (!result.acceptable) {
      cut.push({title:String(scene?.title||'Unnamed scene').slice(0,90),reason:result.reason||'Weak thesis'});
      continue;
    }
    const thesis=String(scene.thesis).trim();
    if (already.some(prior => thesisSimilarity(thesis,prior)>=0.78)) {
      cut.push({title:String(scene.title||'Unnamed scene').slice(0,90),reason:'Repeats a previous editorial thesis'});
      continue;
    }
    already.push(thesis);
    kept.push(scene);
  }
  if (kept.length < 3) throw new Error('No distinct, evidence-backed interior slide survived the editorial thesis gate. Draft fewer but stronger scenes.');
  const draft = {...wrapper, scenes:kept};
  return {draft,cut};
}
