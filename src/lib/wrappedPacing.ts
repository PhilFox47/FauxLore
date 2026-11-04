import type { WrappedEvidence, WrappedFact } from './wrappedEvidence';

export type WrappedPacingBudget = {
  hardMax: number;
  suggestedMax: number;
  meaningfulAnchors: number;
  deepMoments: number;
};

/**
 * Editorial material, not raw session count, determines how many separate
 * claims the Story Director should ATTEMPT. This is a soft planning ceiling;
 * normalization retains the historical server maximum, never a minimum quota.
 */
export function wrappedPacingBudget(evidence:WrappedEvidence):WrappedPacingBudget {
  const hardMax={week:6,month:9,year:14}[evidence.timeframe];
  const byTopic=new Map<string,number>();
  let deepMoments=0;
  for(const f of evidence.facts){
    const type=classifyEvidence(f);
    if(!type) continue;
    const key=(f.mediaId||f.mediaIds?.[0]||'period')+':'+type;
    const count=byTopic.get(key)||0;
    const cap=type==='personal'?2:type==='contrast'?2:1;
    if(count>=cap)continue;
    byTopic.set(key,count+1);
    if(type==='personal')deepMoments++;
  }
  const meaningfulAnchors=[...byTopic.values()].reduce((sum,v)=>sum+v,0);
  const suggestedMax=Math.max(3,Math.min(hardMax,2+Math.ceil(meaningfulAnchors*.8)));
  return {hardMax,suggestedMax,meaningfulAnchors,deepMoments};
}

function classifyEvidence(f:WrappedFact): 'personal'|'contrast'|'spatial'|'change'|null {
  if(f.kind==='journal') return 'personal';
  if(f.id.startsWith('session-resonance-')||f.id.startsWith('taste-')||f.id.startsWith('focus-') ||
     f.id.startsWith('outlier-')||!!f.analytic) return 'contrast';
  if(f.kind==='location'&&f.mediaId) return 'spatial';
  if(f.id==='timeline'||f.id.startsWith('gap-')) return 'change';
  // Routine leaderboards, progress totals and monthly phases do NOT earn extra slides.
  return null;
}

export type WrappedProseTier='punchline'|'standard'|'substantial';
export function wrappedProseTier(body:string):WrappedProseTier {
  const words=body.trim().split(/\s+/).filter(Boolean).length;
  return words>=95?'substantial':words<=38?'punchline':'standard';
}
