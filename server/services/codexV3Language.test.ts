import test from "node:test";
import assert from "node:assert/strict";
import { collectLanguageIssues, applyLanguageFixes, stripNativeAnnotations, hasUnwantedScript } from "./codexV3Language";
import { normalizeManifest, normalizeEntries } from "./codexV3Knowledge";
import { assembleKnowledge } from "./codexV3";
import { v3Prompt } from "./codexV3Prompts";

test("romanized Japanese names remain canonical with no native-script annotation",()=>{
  const name="Junnosuke Tachibana (橘 淳之介)";
  assert.equal(stripNativeAnnotations(name),"Junnosuke Tachibana");
  assert.equal(stripNativeAnnotations("Nukitashi (抜きゲー（わたし）です)"),"Nukitashi");
  assert.equal(hasUnwantedScript(stripNativeAnnotations(name)),false);
  const manifest=normalizeManifest([{area:"characters",name,priority:"essential"}]);
  const entries=normalizeEntries([{area:"characters",name,
    facts:["A central character"],relatesTo:["Nanase Katagiri (片桐 奈々瀬)"]}],[],"cast");
  assert.equal(manifest[0].name,"Junnosuke Tachibana");
  assert.equal(entries[0].name,"Junnosuke Tachibana");
  assert.deepEqual(entries[0].relatesTo,["Nanase Katagiri"]);
  const untranslated=normalizeEntries([{area:"flavorTexts",name:"（話そ、いっぱい）",facts:["A notable line"]}],[],"audience");
  assert.equal(untranslated.length,1); // Await translation; do not lose the memory.
  assert.equal(collectLanguageIssues({entries:untranslated}).length,1);
});

test("language checks ignore source URLs but find native dialogue and prose",()=>{
  const payload={core:{production:"Credits include 鈴木理人."},entries:[
    {area:"flavorTexts",name:"話そ、いっぱい",facts:["A recognizable line"],
      sourceUrls:["https://jp.example/日本語"]}],
    identity:{sourceUrl:"https://jp.example/日本語"},
  };
  const problems=collectLanguageIssues(payload);
  assert.deepEqual(problems.map(x=>x.path),["core.production","entries.0.name"]);
  const repaired=applyLanguageFixes(payload,[
    {path:"core.production",english:"The credits include Rihito Suzuki."},
    {path:"entries.0.name",english:"Let us talk, a lot."},
  ]);
  assert.equal(collectLanguageIssues(repaired).length,0);
  assert.equal(repaired.identity.sourceUrl,"https://jp.example/日本語");
});

test("review localizes source-language memories without pretending they are official English quotes",()=>{
  const identity={output:{identity:{title:"Anime",type:"Series",year:2026}},sources:[]};
  const discovery={output:{manifest:[{name:"Nanase Katagiri (片桐 奈々瀬)",area:"characters",priority:"essential"}]},sources:[]};
  const cast={output:{entries:[{area:"characters",name:"Nanase Katagiri (片桐 奈々瀬)",facts:["A central figure"]}]},sources:[]};
  const audience={output:{entries:[{area:"flavorTexts",name:"話そ、いっぱい",facts:["A memorable dialogue exchange"],
    details:{kind:"quote",attribution:"A character"}}]},sources:[]};
  const before=assembleKnowledge({identity,discovery,cast,audience},"Anime");
  assert.deepEqual(collectLanguageIssues(before).map(x=>x.path),["entries.1.name"]);
  assert.throws(()=>assembleKnowledge({identity,discovery,cast,audience,review:{output:{rejectedIds:[],reasons:[]},sources:[]}},"Anime"),/Language review left/);
  const fixes=[{path:"entries.1.name",english:"Let us talk together."}];
  const after=assembleKnowledge({identity,discovery,cast,audience,review:{output:{rejectedIds:[],reasons:[],languageFixes:fixes},sources:[]}},"Anime");
  assert.equal(collectLanguageIssues(after).length,0);
  assert.equal(after.entries[1].details.kind,"reference");
  assert.match(String(after.entries[1].details.why),/not a verified official English quote/);
  assert.equal(after.missing.length,0);
});

test("all research stages require English or original German in Codex output",()=>{
  const subject={title:"Japanese game",mediaType:"Game",year:2018};
  const knowledge=assembleKnowledge({},"Japanese game");
  for (const stage of ["identity","discovery","core","cast","world","story","craft","audience","coverage"] as const) {
    const prompt=v3Prompt(stage,subject,knowledge,[]);
    assert.match(prompt,/LANGUAGE POLICY/);
    assert.match(prompt,/ENGLISH/);
    assert.match(prompt,/German/);
  }
});
