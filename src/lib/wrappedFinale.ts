import type { WrappedEvidence } from './wrappedEvidence';

export const finaleModes = [
  'dungeon-verdict', 'sharp-reversal', 'ruthless-roast', 'earned-sincerity',
  'absurd-callback', 'unsettling-question', 'unexpected-connection',
  'defiant-last-word',
] as const;
export type WrappedFinaleMode = typeof finaleModes[number];

const modeSet = new Set<string>(finaleModes);
const staleTitle = /^(?:leave (?:the |a )?light on|the light stays on|leave the seam visible|the seam remains|the margin remains open|until next time|to be continued|the story continues|the journey continues|another chapter|one more chapter)$/i;
const stockConclusion = /(?:the (?:journey|story|adventure) (?:isn't|is not) (?:over|finished)|the (?:door|window) (?:remains|stays) open|the light (?:stays|remains) on|the (?:world|story) keeps (?:turning|moving)|what (?:really )?matters (?:isn't|is not) the (?:number|quantity))/i;

function tokens(input: string): Set<string> {
  const stop = new Set(['this','that','with','from','your','there','about','their','because','which','would','these','those','more','than','into','over','after','under','where','were','have','just','been']);
  return new Set((input.toLowerCase().match(/[a-z]{4,}/g) || []).filter(token => !stop.has(token)));
}
function overlap(a: string,b: string): number {
  const x=tokens(a),y=tokens(b);
  if (!x.size || !y.size) return 0;
  return [...x].filter(token=>y.has(token)).length / Math.min(x.size,y.size);
}
function meaningful(value: unknown, min: number, max: number): value is string {
  return typeof value==='string' && value.trim().length>=min && value.length<=max;
}

export function evaluateWrappedFinale(scenes: any[], evidence: WrappedEvidence): {
  acceptable:boolean; reason?:string;
} {
  const last=scenes.at(-1);
  if (!last || last.kind!=='closing') return {acceptable:false,reason:'Final scene must be closing'};
  if (!modeSet.has(last.finaleMode)) return {
    acceptable:false,reason:'Closing requires an intentional finaleMode from the allowed editorial palette',
  };
  if (!meaningful(last.finalePayoff,40,450)) return {
    acceptable:false,reason:'Closing needs a specific new payoff (40–450 characters), not a generic recap',
  };
  if (!meaningful(last.body,35,5000)) return {
    acceptable:false,reason:'Closing body must actually deliver its payoff',
  };
  if (staleTitle.test(String(last.title||'').trim()) || stockConclusion.test(String(last.body))) {
    return {acceptable:false,reason:'Recycled lamps, doors, seams and generic continuation endings are not earned final thoughts'};
  }
  const known=new Set(evidence.facts.map(f=>f.id));
  const refs=Array.isArray(last.evidenceIds)?last.evidenceIds:[];
  if (!refs.length || refs.some((id:unknown)=>typeof id!=='string'||!known.has(id))) {
    return {acceptable:false,reason:'Finale needs at least one real fact ID; the Dungeon may interpret, not invent'};
  }
  // A closing must pay off something ACTUALLY told in the surviving story.
  const interiorRefs=new Set(scenes.slice(1,-1).flatMap(s=>Array.isArray(s.evidenceIds)?s.evidenceIds:[]));
  if (!refs.some((id:string)=>interiorRefs.has(id))) {
    return {acceptable:false,reason:'Finale source must connect with a surviving interior scene, not a cut subplot'};
  }
  // Avoid a second copy of the last scene disguised as an epilogue.
  const payoff=String(last.finalePayoff).trim();
  if (scenes.slice(1,-1).some(s=>overlap(payoff,String(s.thesis||''))>=0.88)) {
    return {acceptable:false,reason:'Finale repeats an earlier thesis rather than adding a turn or last word'};
  }
  return {acceptable:true};
}

/** Preserve old persisted stories without finale metadata; only NEW drafts use this gate. */
export function enforceWrappedFinale(draft:any,evidence:WrappedEvidence):any {
  const result=evaluateWrappedFinale(draft.scenes,evidence);
  if (!result.acceptable) throw new Error('Weak Wrapped finale: '+result.reason);
  return draft;
}
