 
import type { Db } from "../context";
import { nanoGenerateText, parseJsonLoose, type AiConfig } from "../lib/ai";
import { cliProxyResearch, type CliProxyResearchResult } from "../lib/cliProxyResearch";
import { nextCallId, recordAiCallStart, recordAiCall, recordPayload } from "../lib/diagnostics";
import { verifiedResearchSource } from "./codexQuality";
import { subjectYear, type CodexSubject } from "./codexResearch";
import type { CodexData } from "./codex";
import {
  CODEX_V2_PHASES, fingerprint, researchPrompt, compilePrompt,
  gathered, approved, narrowDossier, type State,
} from "./codexV2Plan";

// Intentionally one row per Codex. A restarted job resumes only if model,
// subject, and expansion inventory match the checkpoint's fingerprint.
function readState(db: Db, codexId: string, userId: string, hash: string): State {
  const r = db.prepare("SELECT fingerprint, state FROM codex_v2_runs WHERE codexId = ? AND userId = ?")
    .get(codexId, userId) as { fingerprint:string; state:string } | undefined;
  if (!r || r.fingerprint !== hash) return {};
  try { return JSON.parse(r.state); } catch { return {}; }
}
function saveState(db: Db, codexId: string, userId: string, hash: string, state: State) {
  db.prepare(`INSERT INTO codex_v2_runs (codexId,userId,fingerprint,state,updatedAt)
    VALUES (?,?,?,?,?) ON CONFLICT(codexId) DO UPDATE SET
    userId=excluded.userId,fingerprint=excluded.fingerprint,
    state=excluded.state,updatedAt=excluded.updatedAt`)
    .run(codexId,userId,hash,JSON.stringify(state),new Date().toISOString());
}
export function clearCodexV2Checkpoint(db: Db, codexId: string, userId: string) {
  db.prepare("DELETE FROM codex_v2_runs WHERE codexId = ? AND userId = ?").run(codexId,userId);
}
function parseStage(raw: string, name: string): any {
  let data: any = null;
  try { data = parseJsonLoose(raw); } catch {}
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${name} returned no usable JSON object.`);
  }
  return data;
}
export interface V2Result { data: CodexData; verifiedCount: number; sources: string[] }
export async function compileCodexV2(args: {
  db: Db; codexId: string; userId: string;
  config: AiConfig; subject: CodexSubject; alreadyKnown?: string | null;
  research?: (prompt:string) => Promise<CliProxyResearchResult>;
  compile?: (prompt:string) => Promise<string>;
}): Promise<V2Result> {
  const { db, codexId, userId, config, subject, alreadyKnown } = args;
  if (config.backend !== "cliProxy") throw new Error("Codex V2 requires CLIProxyAPI.");
  const model = config.cliProxyCodexModel || config.model;
  const hash = fingerprint(subject, model, alreadyKnown);
  const state = readState(db, codexId, userId, hash);
  const research = args.research || ((prompt:string) =>
    cliProxyResearch({ apiKey:config.apiKey, baseUrl:config.baseUrl, model },prompt,900_000));
  const compile = args.compile || ((prompt:string) =>
    nanoGenerateText({ ...config, model }, prompt, {
      tier:"analytical", scope:"codex", userId, json:true,
      stream:true, maxTokens:32_000, timeoutMs:900_000,
    }));

  for (const phase of CODEX_V2_PHASES) {
    if (state[phase]) {
      console.log(`[codex-v2] ${subject.title}: checkpoint restored ${phase}`);
      continue;
    }
    const candidates = gathered(state);
    const selected = approved(candidates, state.verification?.output);
    const prompt = phase === "compilation"
      ? compilePrompt(subject,state,selected)
      : researchPrompt(phase,subject,state,candidates,alreadyKnown);
    const callId = nextCallId();
    const began = Date.now();
    const shape = {
      callId,model,scope:"codex",tier:"analytical" as const,userId,
      searchProvider:phase==="compilation"?undefined:"codex-native",
      searchDepth:`v2:${phase}`,webSearch:phase!=="compilation",
      stream:true,json:true,attempt:CODEX_V2_PHASES.indexOf(phase)+1,
      promptChars:prompt.length,
    };
    recordAiCallStart(shape);
    recordPayload(callId,"codex",{prompt});
    console.log(`[codex-v2] ${subject.title}: ${phase} (${shape.attempt}/6)`);
    try {
      let output: any;
      let sources: string[] = [];
      let usage: {promptTokens?:number;completionTokens?:number} = {};
      if (phase==="compilation") {
        if (selected.length<3) throw new Error("Too few independently verified claims to compile a Codex.");
        output=parseStage(await compile(prompt),phase);
        if (!output.premise && !output.overview && !(Array.isArray(output.characters)&&output.characters.length)) {
          throw new Error("Compilation produced no usable core encyclopedic content.");
        }
        output=narrowDossier(output,selected);
        output.identifiedAs={
          ...output.identifiedAs,
          title:state.identity?.output?.title || subject.title,
          year:state.identity?.output?.year || subjectYear(subject),
          creator:state.identity?.output?.creator || subject.creator,
          type:state.identity?.output?.type || subject.mediaType,
          coverage:state.identity?.output?.coverage || "moderate",
        };
        sources=[...new Set(selected.map(c=>c.sourceUrl))];
        output.sources=sources;
      } else {
        const response=await research(prompt);
        if (!response.searched || !response.sources.length) {
          throw new Error(`No native web_search receipt for ${phase}.`);
        }
        output=parseStage(response.text,phase);
        sources=response.sources;usage=response;
        if (phase==="identity") {
          if (typeof output.title!=="string" || output.title.trim().length<2 ||
              !verifiedResearchSource(output.sourceUrl,sources)) {
            throw new Error("Identity was not established with a verified search URL.");
          }
        } else if (phase==="verification") {
          if (!Array.isArray(output.approvedIds) || !Array.isArray(output.rejectedIds)) {
            throw new Error("Independent reviewer did not return explicit claim verdicts.");
          }
          if (approved(candidates,output).length<3) {
            throw new Error("Independent verification did not approve enough supported claims.");
          }
        } else if (!Array.isArray(output.claims)) {
          throw new Error(`${phase} research did not return a claims array.`);
        }
      }
      state[phase]={output,sources};
      saveState(db,codexId,userId,hash,state);
      recordPayload(callId,"codex",{reply:JSON.stringify(output)});
      recordAiCall({
        ...shape,durationMs:Date.now()-began,httpStatus:200,
        promptTokens:usage.promptTokens,completionTokens:usage.completionTokens,
        finishReason:"stop",
      });
    } catch (e:any) {
      recordAiCall({ ...shape,durationMs:Date.now()-began,error:String(e?.message||e) });
      throw new Error(`Codex V2 ${phase} failed, completed phases preserved: ${String(e?.message||e)}`,{cause:e});
    }
  }
  const selected=approved(gathered(state),state.verification?.output);
  const data=state.compilation?.output as CodexData;
  if (!data?.sources?.length) throw new Error("Codex V2 has no grounded sourced result.");
  return {data,sources:data.sources,verifiedCount:selected.length};
}
