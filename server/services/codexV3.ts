
import type { Db } from "../context";
import { nanoGenerateText, parseJsonLoose, type AiConfig } from "../lib/ai";
import { cliProxyResearch, type CliProxyResearchResult } from "../lib/cliProxyResearch";
import { nextCallId, recordAiCall, recordAiCallStart, recordPayload } from "../lib/diagnostics";
import type { CodexData } from "./codex";
import type { CodexSubject } from "./codexResearch";
import {
  type CodexKnowledge, type KnowledgeEntry, type ManifestTarget,
  normalizeManifest, normalizeEntries, mergeKnowledgeEntries,
  missingManifest, excludeReviewedErrors, toCodexData, V3_VERSION,
} from "./codexV3Knowledge";
import { V3_PHASES, v3Fingerprint, v3Prompt, type V3Phase } from "./codexV3Prompts";
import { collectLanguageIssues, applyLanguageFixes, hasUnwantedScript } from "./codexV3Language";

type PhaseState = {output:any;sources:string[]};
type State = Partial<Record<V3Phase,PhaseState>>;

export interface CodexV3Result {
  data:CodexData;
  knowledge:CodexKnowledge;
  researchedCount:number;
}
function loadState(db:Db,id:string,userId:string,hash:string):State {
  const row=db.prepare("SELECT fingerprint,state FROM codex_v3_runs WHERE codexId=? AND userId=?")
    .get(id,userId) as {fingerprint:string;state:string}|undefined;
  if(!row || row.fingerprint!==hash)return {};
  try{return JSON.parse(row.state);}catch{return {};}
}
function saveState(db:Db,id:string,userId:string,hash:string,state:State) {
  db.prepare(`INSERT INTO codex_v3_runs(codexId,userId,fingerprint,state,updatedAt)
    VALUES(?,?,?,?,?) ON CONFLICT(codexId) DO UPDATE SET
    userId=excluded.userId,fingerprint=excluded.fingerprint,
    state=excluded.state,updatedAt=excluded.updatedAt`)
    .run(id,userId,hash,JSON.stringify(state),new Date().toISOString());
}
export function clearV3Checkpoint(db:Db,id:string,userId:string){
  db.prepare("DELETE FROM codex_v3_runs WHERE codexId=? AND userId=?").run(id,userId);
}
export function persistCodexV3(db:Db,id:string,userId:string,knowledge:CodexKnowledge){
  db.prepare(`INSERT INTO codex_knowledge(codexId,userId,version,data,updatedAt)
    VALUES(?,?,?,?,?) ON CONFLICT(codexId) DO UPDATE SET
    userId=excluded.userId,version=excluded.version,data=excluded.data,updatedAt=excluded.updatedAt`)
    .run(id,userId,V3_VERSION,JSON.stringify(knowledge),new Date().toISOString());
  clearV3Checkpoint(db,id,userId);
}
function parseReply(raw:string,stage:V3Phase):any{
  let out:any;
  try{out=parseJsonLoose(raw);}catch{}
  if(!out||typeof out!=="object"||Array.isArray(out))
    throw new Error(`Codex V3 ${stage}: invalid JSON response`);
  return out;
}
function strings(input:unknown):string[]{
  return Array.isArray(input) ? input.filter((s):s is string=>typeof s==="string" && !!s.trim())
    .map(s=>s.trim()):[];
}
export function mergeCore(base:Partial<CodexData>,additional:any):Partial<CodexData>{
  if(!additional || typeof additional!=="object"||Array.isArray(additional))return base;
  const out:any={...base};
  const arrays=new Set(["themes","conflicts","signatureMoments","relatedWorks","genres","tags","contentWarnings"]);
  const stringsFields=new Set(["premise","overview","setting","tone","structure","distinctive",
    "worldRules","everydayLife","production","reception","soundAndMusic","audience","creators","notes"]);
  for(const [key,value] of Object.entries(additional)){
    if(arrays.has(key)){
      out[key]=[...new Set([...strings(out[key]),...strings(value)])];
    }else if(key==="artStyle" && value && typeof value==="object"&&!Array.isArray(value)){
      const art:any={...out.artStyle};
      for(const [k,v] of Object.entries(value)){
        if(k==="styleKeywords")art[k]=[...new Set([...strings(art[k]),...strings(v)])];
        else if(typeof v==="string"&&v.trim() && (!art[k]||v.trim().length>String(art[k]).length))
          art[k]=v.trim();
      }
      out.artStyle=art;
    }else if(stringsFields.has(key) && typeof value==="string" && value.trim()){
      const old=typeof out[key]==="string"?out[key]:"";
      // A shorter later pass must not replace richer research.
      if(!old)out[key]=value.trim();
      else if(!old.includes(value.trim()) && value.trim().length>old.length)
        out[key]=value.trim();
      else if(!value.trim().includes(old) && old.length>=value.trim().length
        && ["distinctive","production","reception","soundAndMusic","worldRules"].includes(key))
        out[key]=`${old}\n${value.trim()}`;
    }
  }
  return out;
}
function phaseEntries(state:State):KnowledgeEntry[]{
  const all:KnowledgeEntry[]=[];
  for(const phase of ["core","cast","world","story","craft","audience","coverage"] as const){
    const step=state[phase];
    if(step)all.push(...normalizeEntries(step.output?.entries,step.sources,phase));
  }
  return mergeKnowledgeEntries(all);
}
export function assembleKnowledge(state:State,workTitle:string):CodexKnowledge {
  let core:Partial<CodexData>={};
  for(const phase of ["core","craft"] as const)core=mergeCore(core,state[phase]?.output?.core);
  const manifest=normalizeManifest(state.discovery?.output?.manifest);
  const entries=phaseEntries(state);
  // Keep stable entry indices for the language-review paths. Rejections are
  // applied AFTER localization, otherwise an unrelated blacklist item could
  // shift a Japanese quote onto the wrong entry.
  const identity=state.identity?.output?.identity||{title:workTitle};
  const allSources=[...new Set(Object.values(state).flatMap(s=>s?.sources||[]))];
  const missing=missingManifest(manifest,entries);
  const notes=missing.length?[
    `Coverage manifest still lacks ${missing.length} named target(s); no unsupported filler was fabricated.`
  ]:[];
  const knowledge:CodexKnowledge={version:3,identity,core,manifest,entries,missing,sources:allSources,notes};
  if (!state.review) return knowledge;

  // The existing quick (no-web) review also repairs unavoidable localized
  // source fragments. No new expensive web-search pass is introduced.
  const localized=applyLanguageFixes(knowledge,state.review.output?.languageFixes);
  const remaining=collectLanguageIssues(localized);
  if (remaining.length) {
    throw new Error(
      `Language review left ${remaining.length} non-English-script field(s) untranslated: ` +
      remaining.slice(0,5).map(x=>x.path).join(", ")
    );
  }
  // Translated original-language dialogue is a reference, not an authenticated
  // verbatim English quotation. Keep its meaning without misattribution.
  for(let i=0;i<entries.length;i++){
    if(entries[i].area!=="flavorTexts" || !hasUnwantedScript(entries[i].name))continue;
    const repaired=localized.entries[i];
    if(!repaired)continue;
    repaired.details={...repaired.details,kind:"reference",
      why:[typeof repaired.details.why==="string"?repaired.details.why:"",
        "English rendering of original-language dialogue; not a verified official English quote."]
        .filter(Boolean).join(" ")};
  }
  localized.entries=excludeReviewedErrors(localized.entries,state.review.output);
  localized.missing=missingManifest(localized.manifest,localized.entries);
  localized.notes=localized.missing.length?[
    `Coverage manifest still lacks ${localized.missing.length} named target(s); no unsupported filler was fabricated.`
  ]:[];
  return localized;
}
export async function buildCodexV3(args:{
  db:Db;codexId:string;userId:string;config:AiConfig;
  subject:CodexSubject;alreadyKnown?:string|null;
  research?:(prompt:string)=>Promise<CliProxyResearchResult>;
  compile?:(prompt:string)=>Promise<string>;
}):Promise<CodexV3Result>{
  const {db,codexId,userId,config,subject,alreadyKnown}=args;
  if(config.backend!=="cliProxy")throw new Error("Codex V3 requires the CLIProxyAPI provider.");
  const model=config.cliProxyCodexModel||config.model;
  const fingerprint=v3Fingerprint(subject,model,alreadyKnown);
  const state=loadState(db,codexId,userId,fingerprint);
  // A checkpoint created before the language policy may already contain a
  // quick review with no translations. Re-run ONLY that cheap phase, never
  // discard completed native-search research.
  if(state.review){
    try{assembleKnowledge(state,subject.title);}
    catch(err:any){
      if(!String(err?.message||err).includes("Language review left"))throw err;
      delete state.review;
      saveState(db,codexId,userId,fingerprint,state);
    }
  }
  const research=args.research||((prompt:string)=>cliProxyResearch({
    apiKey:config.apiKey,baseUrl:config.baseUrl,model,
  },prompt,900_000));
  const compile=args.compile||((prompt:string)=>nanoGenerateText({...config,model},prompt,{
    tier:"analytical",scope:"codex",userId,json:true,stream:true,
    maxTokens:6_000,timeoutMs:240_000,
  }));
  for(const phase of V3_PHASES){
    if(state[phase])continue;
    const current=assembleKnowledge(state,subject.title);
    // Coverage repair is conditional on discovered essential/important gaps.
    const gaps=current.missing.filter(x=>x.priority!=="supporting");
    if(phase==="coverage" && gaps.length===0){
      state.coverage={output:{entries:[]},sources:[]};
      saveState(db,codexId,userId,fingerprint,state);
      continue;
    }
    const prompt=v3Prompt(phase,subject,current,gaps,alreadyKnown);
    const usesSearch=phase!=="review";
    const callId=nextCallId(),started=Date.now();
    const meta={callId,userId,model,scope:"codex",tier:"analytical" as const,
      webSearch:usesSearch,searchProvider:usesSearch?"codex-native":undefined,
      searchDepth:`v3:${phase}`,json:true,stream:true,
      attempt:V3_PHASES.indexOf(phase)+1,promptChars:prompt.length};
    recordAiCallStart(meta);
    recordPayload(callId,"codex",{prompt});
    console.log(`[codex-v3] ${subject.title}: ${phase} (${meta.attempt}/${V3_PHASES.length})`);
    try{
      let output:any,sources:string[]=[],usage:{promptTokens?:number;completionTokens?:number}={};
      if(usesSearch){
        const response=await research(prompt);
        if(!response.searched || !response.sources?.length)
          throw new Error(`Codex V3 ${phase}: no completed native search receipts`);
        output=parseReply(response.text,phase);
        sources=response.sources;usage=response;
        if(phase==="identity" && typeof output?.identity?.title!=="string")
          throw new Error("Could not identify the exact work.");
        if(phase==="discovery" && !Array.isArray(output.manifest))
          throw new Error("Coverage inventory missing.");
        if(["cast","world","story","audience","coverage"].includes(phase) &&
          !Array.isArray(output.entries))
          throw new Error(`Missing ${phase} knowledge entries.`);
        if(phase==="core" && (!output.core || typeof output.core!=="object"))
          throw new Error("General knowledge core missing.");
      }else{
        output=parseReply(await compile(prompt),phase);
        if(!Array.isArray(output.rejectedIds) || !Array.isArray(output.reasons))
          throw new Error("Quick review did not return its rejection list.");
        // Fail only the cheap review if the model missed a translation. Keep
        // every prior searched stage/checkpoint to retry without burning tokens.
        assembleKnowledge({...state,review:{output,sources:[]}},subject.title);
      }
      state[phase]={output,sources};
      saveState(db,codexId,userId,fingerprint,state);
      recordPayload(callId,"codex",{reply:JSON.stringify(output)});
      recordAiCall({...meta,httpStatus:200,durationMs:Date.now()-started,
        promptTokens:usage.promptTokens,completionTokens:usage.completionTokens,finishReason:"stop"});
    }catch(err:any){
      recordAiCall({...meta,durationMs:Date.now()-started,error:String(err?.message||err)});
      throw new Error(`Codex V3 ${phase} failed; completed phases saved: ${String(err?.message||err)}`,{cause:err});
    }
  }
  const knowledge=assembleKnowledge(state,subject.title);
  const data=toCodexData(knowledge);
  if(!data.premise&&!data.overview&&!knowledge.entries.length)
    throw new Error("Codex V3 returned no usable researched knowledge.");
  return {knowledge,data,researchedCount:knowledge.entries.length};
}
