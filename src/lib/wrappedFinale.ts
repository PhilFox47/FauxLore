import type { WrappedEvidence } from './wrappedEvidence';

export const finaleModes = [
  'dungeon-verdict', 'sharp-reversal', 'ruthless-roast', 'earned-sincerity',
  'absurd-callback', 'unsettling-question', 'unexpected-connection',
  'defiant-last-word',
] as const;
export type WrappedFinaleMode = typeof finaleModes[number];

const modeSet = new Set<string>(finaleModes);
const meaningful = (v:unknown,min:number,max:number):v is string =>
  typeof v === 'string' && v.trim().length >= min && v.length <= max;

/**
 * Enforce only the objective contract here. Is a finale trite, repetitive,
 * needlessly sentimental, vicious enough, or a genuinely new turn? That is
 * the job of the independent AI editorial reviewer, NOT a lexical blacklist.
 */
export function evaluateWrappedFinale(scenes:any[],evidence:WrappedEvidence):{
  acceptable:boolean;reason?:string;
} {
  const last=scenes.at(-1);
  if(!last || last.kind!=='closing')return {acceptable:false,reason:'Final scene must be closing'};
  if(!modeSet.has(last.finaleMode))return {
    acceptable:false,reason:'Closing needs a valid finaleMode',
  };
  if(!meaningful(last.finalePayoff,40,450))return {
    acceptable:false,reason:'Closing needs a nonempty finalePayoff within its storage limit',
  };
  if(!meaningful(last.body,35,5000))return {
    acceptable:false,reason:'Closing needs narrative text within its storage limit',
  };
  const known=new Set(evidence.facts.map(f=>f.id));
  const refs=Array.isArray(last.evidenceIds)?last.evidenceIds:[];
  if(!refs.length || refs.length>5 || refs.some((id:unknown)=>typeof id!=='string'||!known.has(id)))
    return {acceptable:false,reason:'Closing must cite 1–5 real evidence IDs'};
  const interior=new Set(scenes.slice(1,-1).flatMap(s=>Array.isArray(s.evidenceIds)?s.evidenceIds:[]));
  if(!refs.some((id:string)=>interior.has(id)))
    return {acceptable:false,reason:'Closing must anchor to a surviving interior scene'};
  return {acceptable:true};
}

/** Legacy stories do not require finale metadata; only newly generated issues use this check. */
export function enforceWrappedFinale(draft:any,evidence:WrappedEvidence):any {
  const result=evaluateWrappedFinale(draft.scenes,evidence);
  if(!result.acceptable)throw new Error('Invalid Wrapped finale: '+result.reason);
  return draft;
}
