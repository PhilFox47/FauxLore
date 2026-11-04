import type { StoryPeriod } from './storyDiscovery';

export interface EditorialMemoryTake {
  title: string;
  thesis: string;
  mediaIds: string[];
  /** Only explicit stored theses are authoritative enough for repeat checking. */
  explicit: boolean;
}
export interface WrappedEditorialMemoryItem {
  timeframe: StoryPeriod;
  timeId: string;
  title: string;
  periodEnd: string;
  /** Previously published editorial opinions, NOT evidence of actual events. */
  takes: EditorialMemoryTake[];
  finale?: { mode?: string; payoff: string };
  samePeriodRerun?: boolean;
}
export interface SavedEditorialRow {
  timeframe: string;
  timeId: string;
  story: string;
}

type Range = { start: string; end: string };
const date = (day:Date) => day.toISOString().slice(0,10);
export function wrappedPeriodRange(timeframe:string,timeId:string):Range|null {
  if (timeframe === 'month' && /^\d{4}-(0[1-9]|1[0-2])$/.test(timeId)) {
    const y=+timeId.slice(0,4),m=+timeId.slice(5,7);
    return {start:date(new Date(Date.UTC(y,m-1,1))),
      end:date(new Date(Date.UTC(y,m,0)))};
  }
  if (timeframe === 'year' && /^\d{4}$/.test(timeId)) return {
    start:timeId+'-01-01',end:timeId+'-12-31',
  };
  if (timeframe === 'week' && /^(\d{4})-W(0[1-9]|[1-4]\d|5[0-3])$/.test(timeId)) {
    const year=+timeId.slice(0,4),week=+timeId.slice(6);
    const jan4=new Date(Date.UTC(year,0,4));
    const mondayIndex=(jan4.getUTCDay()+6)%7;
    const monday=new Date(Date.UTC(year,0,4-mondayIndex+(week-1)*7));
    const sunday=new Date(monday.getTime()+6*86400000);
    // W53 is valid only in ISO years with 53 weeks.
    if (week===53 && (sunday.getUTCFullYear()!==year || sunday.getUTCMonth()!==11)) return null;
    return {start:date(monday),end:date(sunday)};
  }
  return null;
}
const short=(s:unknown,n=320)=>typeof s==='string'?s.replace(/[\u0000-\u001f]+/g,' ').trim().slice(0,n):'';
const mediaIds=(scene:any):string[]=>[...new Set([
  scene?.media?.id,
  ...(Array.isArray(scene?.artworks)?scene.artworks.map((m:any)=>m?.id):[]),
  ...(Array.isArray(scene?.design?.mediaIds)?scene.design.mediaIds:[]),
].filter((v):v is string=>typeof v==='string' && v.length>0 && v.length<130))].slice(0,6);

/**
 * Pure, date-bounded archival editor memory. It is a list of PREVIOUS TAKES,
 * not factual source material. Exclude overlapping and future periods. A
 * rerun of the exact target may see the prior target *opinion* to avoid repeats.
 */
export function selectWrappedEditorialMemory(
  rows:SavedEditorialRow[],target:{timeframe:StoryPeriod;timeId:string},
  relevantMediaIds:readonly string[]=[],limit=10,
):WrappedEditorialMemoryItem[] {
  const targetRange=wrappedPeriodRange(target.timeframe,target.timeId);
  if(!targetRange)return [];
  const relevant=new Set(relevantMediaIds);
  const candidate: Array<{item:WrappedEditorialMemoryItem;score:number}>=[];
  for(const row of rows.slice(0,500)){
    const range=wrappedPeriodRange(row.timeframe,row.timeId);
    if(!range)continue;
    const same=row.timeframe===target.timeframe&&row.timeId===target.timeId;
    if(!same && range.end>=targetRange.start) continue;
    let story:any;
    try { story=JSON.parse(row.story); }catch{continue;}
    if(!story||!Array.isArray(story.scenes))continue;
    const takes:EditorialMemoryTake[]=[];
    for(const scene of story.scenes.slice(1,-1)){
      if(!scene || typeof scene!=='object')continue;
      const explicit=!!short(scene.editorialThesis,330);
      const thesis=short(scene.editorialThesis,330)||
        short(scene.body,230);
      if(!thesis)continue;
      takes.push({title:short(scene.title,130),thesis,
        mediaIds:mediaIds(scene),explicit});
    }
    const finaleScene=story.scenes.at(-1);
    const payoff=short(finaleScene?.finalePayoff,380)||
      short(finaleScene?.body,230);
    if(!takes.length&&!payoff)continue;
    const shared=takes.some(t=>t.mediaIds.some(id=>relevant.has(id)));
    candidate.push({item:{
      timeframe:row.timeframe as StoryPeriod,timeId:row.timeId,
      title:short(story.title,150),periodEnd:range.end,
      takes:takes.slice(0,5),
      ...(payoff?{finale:{payoff,mode:short(finaleScene?.finaleMode,35)||undefined}}:{}),
      ...(same?{samePeriodRerun:true}:{}),
    },score: (shared?100:0)+(same?50:0)});
  }
  // Strongly relevant older takes beat recent but irrelevant period chatter.
  // Within each group prefer more recently covered periods, never generation time.
  candidate.sort((a,b)=>b.score-a.score||
    b.item.periodEnd.localeCompare(a.item.periodEnd)||
    a.item.timeId.localeCompare(b.item.timeId));
  return candidate.slice(0,Math.max(0,Math.min(20,limit))).map(c=>c.item);
}

export function wrappedEditorialMemoryBrief(memory:WrappedEditorialMemoryItem[]):string {
  if(!memory.length)return 'No earlier Saved Wrapped editorials are available.';
  return [
    'EDITORIAL MEMORY: prior published AI interpretations, NOT factual logs, ratings, thoughts or proof of what happened. Historical verdicts may be wildly WRONG.',
    ...memory.map(m=>[
      '['+m.timeframe+' '+m.timeId+(m.samePeriodRerun?' · earlier rerun':'')+'] '+m.title,
      ...m.takes.slice(0,5).map(t=>' ALREADY SAID'+(t.explicit?' (explicit thesis)':' (older scene)')+
        ' [media IDs: '+t.mediaIds.join(',')+']: '+t.thesis),
      ...(m.finale?[' PRIOR ENDING ('+(m.finale.mode||'legacy')+'): '+m.finale.payoff]:[]),
    ].join('\n')),
    'DO NOT REPEAT old takes merely because the same medium appears again. Find the NEW DEVELOPMENT or a genuinely different, supportable interpretation in the CURRENT verified evidence. Contradicting an earlier AI take or admitting an old error is welcome, and can be funny. Older AI interpretations can never certify a fact, feeling or event in this period. Do not quote old opinions as user testimony. Do not reveal future periods.',
  ].join('\n\n');
}

function tokens(value:string):Set<string>{
  const stop=new Set(['the','and','that','with','from','this','your','than','into','over','were',
    'have','been','they','there','about','some','their','which','while','through','because',
    'where','when','after','before','just','really','rather','instead','same']);
  return new Set((value.toLowerCase().match(/[a-z]{4,}/g)||[]).filter(t=>!stop.has(t)));
}
export function wrappedThesisOverlap(a:string,b:string):number {
  const x=tokens(a),y=tokens(b);
  if(x.size<5||y.size<5)return 0;
  const shared=[...x].filter(t=>y.has(t)).length;
  return shared/Math.min(x.size,y.size);
}
/** Only exact-near-verbatim reuse of an explicit prior thesis is hard rejected;
 * wider semantic novelty is decided by the writer, not brittle string rules.
 */
export function recycledWrappedThesis(
  scenes:Array<{thesis?:string}>,
  memory:WrappedEditorialMemoryItem[],
):string|null {
  const published=memory.flatMap(m=>m.takes.filter(t=>t.explicit).map(t=>t.thesis));
  for(const s of scenes.slice(1,-1)){
    if(typeof s?.thesis!=='string')continue;
    const repeated=published.find(prior=>wrappedThesisOverlap(prior,s.thesis!)>=0.92);
    if(repeated)return repeated.slice(0,130);
  }
  return null;
}
