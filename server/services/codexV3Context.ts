
import type { Db } from "../context";
import { codexPromptBlock, type CodexRow } from "./codex";
import type { CodexKnowledge, KnowledgeEntry, KnowledgeUse } from "./codexV3Knowledge";

export type CodexTask = KnowledgeUse;
export function loadCodexKnowledge(db:Db,row:CodexRow|null): CodexKnowledge|null {
  if(!row || row.status!=="ready")return null;
  const saved=db.prepare("SELECT data FROM codex_knowledge WHERE codexId=? AND userId=? AND version=3")
    .get(row.id,row.userId) as {data:string}|undefined;
  if(!saved)return null;
  try {
    const data=JSON.parse(saved.data) as CodexKnowledge;
    return data.version===3 && Array.isArray(data.entries)?data:null;
  }catch{return null;}
}
const taskAreas:Record<CodexTask,string[]>={
  enemy:["antagonists","characters","factions","locations","terminology"],
  loot:["items","terminology","factions","locations"],
  image:["characters","antagonists","items","locations","factions"],
  tags:["terminology","factions"],
  wrapped:[],
  story:["events","characters","locations","factions"],
  memory:["flavorTexts"],
};
function coreContext(kb:CodexKnowledge,task:CodexTask):string {
  const c=kb.core;
  const basic=[
    `EXACT WORK: ${String(kb.identity.title||"Unknown")} (${String(kb.identity.year||"")}, ${String(kb.identity.type||"")})`,
    `Premise: ${c.premise||""}`,`Overview: ${c.overview||""}`,
    `Setting: ${c.setting||""}`,`Tone: ${c.tone||""}`,
    `Themes: ${(c.themes||[]).join("; ")}`,
    `Distinctive identity: ${c.distinctive||""}`,
    `Structure: ${c.structure||""}`,
    `Genres: ${(c.genres||[]).join(", ")}`,
    `Classification signals: ${(c.tags||[]).join(", ")}`,
  ];
  if(task==="wrapped" || task==="tags") {
    basic.push(`Reception: ${c.reception||""}`,`Format and craft: ${c.production||""}`);
    if(task==="wrapped")basic.push(
      "IMPORTANT: This is FACTS ABOUT THE WORK, not the user's personal activities.",
      "Only user logs prove what was played, read, finished, loved, chosen or experienced.",
      "Never invent a completed mission, story choice, reaction, rating or time spent.",
      "Use this context to explain cultural identity, tone and topical connections only.",
    );
  }else{
    basic.push(`World rules: ${c.worldRules||""}`,`Conflicts: ${(c.conflicts||[]).join("; ")}`);
    if(task==="image")basic.push(`Visual style: ${JSON.stringify(c.artStyle||{})}`);
    if(task==="enemy"||task==="story")basic.push(`Life in the world: ${c.everydayLife||""}`);
  }
  return basic.filter(Boolean).join("\n");
}
function renderEntry(e:KnowledgeEntry):string {
  const attrs=Object.entries(e.details)
    .filter(([,v])=>v!==undefined&&v!==null)
    .map(([k,v])=>`${k}: ${Array.isArray(v)?v.join(", "):String(v)}`);
  const source=e.sourceStatus==="uncertain"?" [source attribution uncertain]":"";
  return `- ${e.name} (${e.area}, ${e.priority})${source}: ${e.facts.join(" ")}`
    + (attrs.length?`\n  ${attrs.join(" | ")}`:"")
    + (e.relatesTo.length?`\n  Related to: ${e.relatesTo.join(", ")}`:"");
}
export function knowledgeTaskBlock(kb:CodexKnowledge,task:CodexTask,query=""):string {
  const header=coreContext(kb,task);
  if(task==="wrapped")return header;
  const included=new Set(taskAreas[task]);
  const selected=kb.entries.filter(e=>included.has(e.area));
  const search=query.trim().toLowerCase();
  // With a concrete image subject, related profiles must come before other
  // entries; otherwise rank by priority. This is RETRIEVAL, not data deletion.
  const score=(e:KnowledgeEntry)=>
    (search && (e.name.toLowerCase().includes(search)||
      e.relatesTo.some(r=>r.toLowerCase().includes(search)))?100:0)
    + ({essential:30,important:20,supporting:10}[e.priority]);
  selected.sort((a,b)=>score(b)-score(a));
  // Context cost is bounded per generation; the complete KB stays in SQLite.
  // No per-category quotas, and no 'first 20 characters' arbitrary cutoff.
  const maxChars=task==="tags"?12_000:task==="image"?24_000:32_000;
  const lines=[header,`RELEVANT RESEARCHED ${task.toUpperCase()} KNOWLEDGE:`];
  let size=lines.join("\n").length;
  let omitted=0;
  for(const e of selected) {
    const line=renderEntry(e);
    if(size+line.length>maxChars){omitted++;continue;}
    lines.push(line);size+=line.length;
  }
  if(omitted)lines.push(`[${omitted} additional matching knowledge entries remain in the stored Codex; no data was deleted.]`);
  return lines.join("\n");
}
export function codexTaskContext(db:Db,row:CodexRow|null,task:CodexTask,query=""):string {
  const kb=loadCodexKnowledge(db,row);
  if(kb)return knowledgeTaskBlock(kb,task,query);
  if(task==="wrapped") {
    const d=row?.data;
    if(!d)return "";
    return [`WORK: ${row?.title}`,`Premise: ${d.premise||""}`,`Tone: ${d.tone||""}`,
      `Themes: ${(d.themes||[]).join("; ")}`,`Genre: ${(d.genres||[]).join(", ")}`,
      `Distinctive: ${d.distinctive||""}`,
      "These are facts about the WORK, never proof of user experience.",
    ].join("\n");
  }
  return codexPromptBlock(row);
}
