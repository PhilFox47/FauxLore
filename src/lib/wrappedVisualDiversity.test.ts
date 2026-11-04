import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDynamicScene } from "./dynamicScenes";
import { stageWrappedVisualSequence, wrappedVisualContinuityBrief, sourceStyleWithoutUncastCharacters } from "./wrappedVisualDiversity";
import { buildWrappedSceneArtPrompt, buildWrappedClosingTableauPrompt } from "./wrappedSceneArt";
import { buildWrappedCoverPrompt } from "../../server/services/wrappedCovers";
import type { StoryScene } from "./storyDiscovery";

const opening = (id: string,kind: StoryScene["kind"], title: string,body: string,
  sceneConcept: string, action: string, castMode: "environment"|"self" = "environment"): StoryScene => ({
  id,kind,eyebrow:"APRIL",title,body,evidenceIds:[],
  composition:{
    version:1,backdrop:"cinematic",
    direction:{presentation:"cinematic",textSide:"left",imageFocus:"right",textPosition:"middle"},
    artConcept:sceneConcept,
    elements:[
      {id:"headline",type:"title",box:{x:7,y:12,w:45,h:24},size:"lg",tone:"primary",motion:"fade",delay:0},
      {id:"copy",type:"body",box:{x:7,y:51,w:45,h:28},size:"md",tone:"secondary",motion:"fade",delay:0},
    ],
    visualPlan:{
      activityMode:"action",castMode,camera:"medium",
      action,
      interaction:"a stack of tiny everyday objects on a small table",
      propStrategy:"tabletop",
    },
  },
});

const april: StoryScene[] = [
  opening("wrapped-0","opening","Watching the empty end of the corridor",
    "April arrived late and the story gathered weight.","A corridor catches a beam of light",
    "Carefully balance small objects on a cluttered wooden table","self"),
  opening("wrapped-2","spotlight","The comedy had the early lead",
    "Taskmaster - Series 7 dominated this phase.", "A comedy game-show stage",
    "Carefully balance small objects on a cluttered wooden table","self"),
  opening("wrapped-3","location","The hotel afterimage",
    "Hotel room scenes and Monster.", "Hotel room in cool light",
    "Carefully balance small objects on a cluttered wooden table","self"),
  opening("wrapped-5","location","Two series one recurring seat",
    "On the train I watched Taskmaster - Series 7 and Series 8.", "A train window and passenger seat",
    "Carefully balance small objects on a cluttered wooden table","self"),
  opening("wrapped-6","closing","A long shadow fades",
    "The earlier month ends at the threshold.","A narrow doorway leading into darkness",
    "Carefully balance small objects on a cluttered wooden table","self"),
];

test("April root cause: a palette in backdrop MUST NOT discard the director's valid scene and action",()=>{
  const scene=opening("wrapped-2","spotlight","Comedy","Recorded entertainment",
    "A distinct theatrical stage with curtains and light","The curtain unfurls before the challenge", "environment");
  const raw={
    ...scene.composition,backdrop:"rose",visualPlan:{
      ...scene.composition!.visualPlan, visualArchetype:"stage-spectacle",
      bannedMotifs:["person juggling objects on a tabletop","<script>alert(1)</script>"],
    },
  };
  const clean=normalizeDynamicScene(raw,scene);
  assert.equal(clean.backdrop,"cinematic");
  assert.match(clean.artConcept||"",/theatrical stage/);
  assert.equal(clean.visualPlan?.castMode,"environment");
  assert.equal(clean.visualPlan?.action,"The curtain unfurls before the challenge");
  assert.deepEqual(clean.visualPlan?.bannedMotifs,["person juggling objects on a tabletop"]);
  assert.throws(()=>normalizeDynamicScene({...raw,backdrop:"javascript:evil"},scene));
});

test("April story: one tabletop only; opening, stage, hotel and train stay recognizable and distinct",()=>{
  const output=stageWrappedVisualSequence(april);
  const plans=output.map(s=>s.composition!.visualPlan!);
  assert.deepEqual(output.map(s=>s.body),april.map(s=>s.body));
  assert.ok(plans.filter(p=>p.propStrategy==="tabletop").length<=1);
  assert.ok(plans.filter(p=>p.castMode==="self" || p.castMode==="in-world-self").length<=2);
  assert.equal(plans[0].settingFamily,"corridor");
  assert.equal(plans[1].settingFamily,"stage");
  assert.equal(plans[2].settingFamily,"hotel");
  assert.equal(plans[3].settingFamily,"train");
  assert.match(plans[3].action,/train|window|landscape/i);
  assert.equal(plans[3].castMode,"environment");
  assert.ok(plans.every((p,i)=>i===0 || p.camera!==plans[i-1].camera));
  assert.ok(plans.every(p=>(p.bannedMotifs||[]).some(s=>/balancing|tabletop/i.test(s))));
  assert.ok(new Set(plans.map(p=>p.visualArchetype)).size>=4);
});

test("the image prompt for a train explicitly forbids another Taskmaster tabletop portrait",()=>{
  const staged=stageWrappedVisualSequence(april);
  const continuity=wrappedVisualContinuityBrief(staged,staged[3].id);
  assert.match(continuity,/TRAIN MUST LOOK LIKE A TRAIN/);
  assert.match(continuity,/OTHER SCENES ALREADY RESERVED/);
  assert.match(continuity,/tabletop contraption|balancing tiny objects/i);
  assert.match(continuity,/no visible account owner/i);
  const prompt=buildWrappedSceneArtPrompt({title:"April",dek:"A month of strange contrasts"},
    staged[3], {visualSelfInsertMode:"never"},null,continuity);
  assert.match(prompt,/TRAIN MUST LOOK LIKE A TRAIN/);
  assert.match(prompt,/Camera:/);
  assert.match(prompt,/no visible account owner/i);
  assert.match(prompt,/moving landscape/i);
  assert.doesNotMatch(prompt,/owner's distinctive beard/i);
});

test("a cover and closing image inherit the SAME series-wide motif context",()=>{
  const staged=stageWrappedVisualSequence(april);
  const story={title:"The Month With a Long Shadow",dek:"The long road home",scenes:staged};
  const cover=buildWrappedCoverPrompt(story,"month","2026-04",[],
    {visualSelfInsertMode:"never"},null,wrappedVisualContinuityBrief(staged,staged[0].id));
  const closing=buildWrappedClosingTableauPrompt(story,staged[4], {visualSelfInsertMode:"never"},
    wrappedVisualContinuityBrief(staged,staged[4].id));
  assert.match(cover,/WHOLE-ISSUE IMAGE CONTINUITY/);
  assert.match(closing,/WHOLE-ISSUE IMAGE CONTINUITY/);
  assert.match(cover,/No account-owner likeness is authorized|HARD CAST RULE/);
  assert.match(closing,/No account-owner likeness is authorized|HARD CAST RULE/);
});

test("older stories without visual plan get valid safe fallback rather than Phil's generic tabletop portrait",()=>{
  const old:StoryScene[]=[
    {id:"wrapped-0",kind:"opening",eyebrow:"OPEN",title:"April",body:"Quiet start",evidenceIds:[]},
    {id:"wrapped-1",kind:"location",eyebrow:"TRAIN",title:"A train through the night",
      body:"Two series on the train",evidenceIds:[]},
    {id:"wrapped-2",kind:"closing",eyebrow:"END",title:"Epilogue",body:"Final thoughts",evidenceIds:[]},
  ];
  const staged=stageWrappedVisualSequence(old);
  assert.ok(staged.every(s=>s.composition?.visualPlan));
  assert.ok(staged.every(s=>normalizeDynamicScene(s.composition,s).visualPlan));
  assert.equal(staged[1].composition?.visualPlan?.settingFamily,"train");
  assert.equal(staged[1].composition?.visualPlan?.castMode,"environment");
  assert.equal(staged[0].composition?.visualPlan?.castMode,"environment");
  assert.equal(stageWrappedVisualSequence(old,{fillMissing:false})[0].composition,undefined);
});

test("source style can preserve live-action aesthetics without leaking Taskmaster contestant clothing",()=>{
  const style=[
    "Named style: live action, theatrical studio",
    "Medium & technique: Live-action video",
    "How its people and creatures look: Phil's close-fitting bright Hawaiian shirt and hair",
    "Palette: rich warm colors with gold accents",
  ].join("\n");
  const clean=sourceStyleWithoutUncastCharacters(style,"environment");
  assert.match(clean,/live action/);
  assert.match(clean,/Palette:/);
  assert.doesNotMatch(clean,/Hawaiian shirt|Phil's/);
  assert.match(sourceStyleWithoutUncastCharacters(style,"canon-character"),/Phil's/);
});


test("April visual plans survive client Director, server validation and the actual image prompt",async()=>{
  const { applyWrappedVisualCompositions } = await import("../services/wrappedVisualDirector");
  const { validateStory } = await import("../../server/routes/wrapped");
  const story={
    version:2 as const,title:"The Month With a Long Shadow",dek:"April in review",
    scenes:april.map(({composition,...scene})=>scene),
  };
  const reply={compositions:april.map(scene=>({
    sceneId:scene.id,
    composition:{ ...scene.composition, backdrop:"rose" },
  }))};
  const proposed=applyWrappedVisualCompositions(story,reply,story.scenes.length,"month");
  assert.ok(proposed.scenes.every(scene=>scene.composition?.visualPlan));
  assert.ok(proposed.scenes.every(scene=>scene.composition?.backdrop==="cinematic"));
  const persisted=validateStory(proposed,"month");
  assert.ok(persisted.scenes.every((scene:any)=>scene.composition?.visualPlan?.action));
  const cinema=stageWrappedVisualSequence(persisted.scenes);
  const train=cinema.find((scene:StoryScene)=>scene.id==="wrapped-5")!;
  const scenePrompt=buildWrappedSceneArtPrompt({title:persisted.title,dek:persisted.dek},
    train,{visualSelfInsertMode:"prefer",visualSelfDescription:"a private appearance description"},
    null,wrappedVisualContinuityBrief(cinema,train.id));
  assert.match(scenePrompt,/TRAIN MUST LOOK LIKE A TRAIN/);
  assert.match(scenePrompt,/APPROVED VISUAL BEAT/);
  assert.match(scenePrompt,/train window|moving landscape/i);
  assert.doesNotMatch(scenePrompt,/private appearance description/);
});
