import test from "node:test";
import assert from "node:assert/strict";
import type { ArmoryPortraitItem } from "./armoryPortrait";
import { buildArmoryPortraitPrompt, equippedPortraitItems, portraitLoadoutKey } from "./armoryPortrait";
import { imageFrameSize, imageFrameMatches, withImageFrame } from "./imageFraming";
import { redactVisualSelfForDiagnostics } from "./visualSelf";

const item = (id:string,slot:any,imageUrl?:string):ArmoryPortraitItem => ({
  id, slot, name: "Gear "+id, description: "An unusual polished metallic "+slot+" object.",
  rarity: "Epic", type:"armor",imageUrl,
});

test("vertical paper-doll frames have correct GPT and NanoGPT geometry",()=>{
  assert.equal(imageFrameSize("portrait-2:3","cliProxy"),"1024x1536");
  assert.equal(imageFrameSize("portrait-2:3","nanoGpt"),"768x1152");
  assert.equal(imageFrameMatches("portrait-2:3",1024,1536),true);
  assert.equal(imageFrameMatches("portrait-2:3",1536,1024),false);
  assert.match(withImageFrame("Equipment portrait","portrait-2:3"),/VERTICAL 2:3/);
});

test("the prompt places all equipped images in the right slot, not as a collage",()=>{
  const items = [item("s","Secondary","/uploads/ai-images/01234567.png"),item("b","Body","/uploads/ai-images/23456789.webp"),item("h","Head")];
  const ordered = equippedPortraitItems(items);
  assert.deepEqual(ordered.map(x=>x.slot),["Head","Body","Secondary"]);
  const prompt = buildArmoryPortraitPrompt(items,"Short hair, trimmed beard",true,["Body","Secondary"]);
  assert.match(prompt,/1024x1536/);
  assert.match(prompt,/FACE REFERENCE INPUT|REFERENCE IMAGE #1/);
  assert.match(prompt,/REFERENCE IMAGE #2 IS THE EXACT ITEM FOR SLOT Body/);
  assert.match(prompt,/REFERENCE IMAGE #3 IS THE EXACT ITEM FOR SLOT Secondary/);
  assert.match(prompt,/HEAD/);
  assert.match(prompt,/Primary/);
  assert.match(prompt,/Do not invent additional iconic equipment/);
  assert.doesNotMatch(prompt,/Reference image #4/);
  assert.equal(equippedPortraitItems([item("a","Body"),item("b","Body")]).length,1);
  assert.notEqual(portraitLoadoutKey(items),portraitLoadoutKey([item("s","Secondary")]));
});

test("Never disables identifying owner guidance, and diagnostics redact the private text",()=>{
  const items = [item("h","Head")];
  const prompt = buildArmoryPortraitPrompt(items,"",false,[],false);
  assert.match(prompt,/anonymous fantasy RPG avatar/i);
  assert.doesNotMatch(prompt,/preserve the face shape/i);
  const personal = buildArmoryPortraitPrompt(items,"Distinctive heterochromia, short beard",true,[]);
  assert.match(personal,/Distinctive heterochromia/);
  const redacted = redactVisualSelfForDiagnostics(personal);
  assert.doesNotMatch(redacted,/Distinctive heterochromia/);
  assert.match(redacted,/private account appearance guidance redacted/i);
});
