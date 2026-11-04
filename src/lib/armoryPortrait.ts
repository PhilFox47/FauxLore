import type { Artifact } from "../types/schema";

/** One stable order across the UI, renderer prompt, and snapshot fingerprint. */
export const ARMORY_SLOTS = ["Head", "Body", "Legs", "Primary", "Secondary", "Accessory"] as const;
export type ArmorySlot = typeof ARMORY_SLOTS[number];

export type ArmoryPortraitItem = Pick<Artifact,
  "id" | "slot" | "name" | "description" | "rarity" | "type" | "imageUrl" | "imagePrompt">;

export function equippedPortraitItems(items: ArmoryPortraitItem[]): ArmoryPortraitItem[] {
  return [...items].filter(item => ARMORY_SLOTS.includes(item.slot as ArmorySlot))
    .sort((a,b) => ARMORY_SLOTS.indexOf(a.slot as ArmorySlot) - ARMORY_SLOTS.indexOf(b.slot as ArmorySlot))
    .filter((item,index,ordered) => ordered.findIndex(other => other.slot === item.slot) === index);
}

/** Compact stable input identity: durable while merely browsing the Armory. */
export function portraitLoadoutKey(items: ArmoryPortraitItem[], faceRevision = ""): string {
  return JSON.stringify({
    faceRevision,
    items: equippedPortraitItems(items).map(({id,slot,name,description,rarity,type,imageUrl,imagePrompt}) =>
      ({id,slot,name,description,rarity,type,imageUrl: imageUrl||null,imagePrompt:imagePrompt||null})),
  });
}

export function buildArmoryPortraitPrompt(
  items: ArmoryPortraitItem[], appearanceDescription: string,
  faceReference: boolean,
  referencedSlots: ArmorySlot[] = [],
  ownerAllowed = true,
): string {
  const sorted = equippedPortraitItems(items);
  if (!sorted.length) throw new Error("Equip at least one item to create a character portrait.");
  const itemDescriptions = sorted.map((item, index) => [
    `[${index + 1}] SLOT: ${item.slot.toUpperCase()} | ${item.name} (${item.rarity} ${item.type})`,
    `Visual description: ${String(item.description||"").slice(0,650)}`,
    item.imagePrompt ? `Visual item identity notes (materials, shape and colors ONLY; disregard isolated-object, no-human, square-icon or background instructions): ${String(item.imagePrompt).replace(/\s+/g," ").slice(0,260)}` : "",
    referencedSlots.includes(item.slot as ArmorySlot)
      ? `REFERENCE IMAGE #${referencedSlots.indexOf(item.slot as ArmorySlot) + (faceReference ? 2 : 1)} IS THE EXACT ITEM FOR SLOT ${item.slot}. Keep its silhouette, colors and materials. No standalone panel.`
      : "",
  ].filter(Boolean).join("\n")).join("\n\n");

  const empty = ARMORY_SLOTS.filter(slot=>!sorted.some(item=>item.slot===slot));
  return [
    "CHARACTER PORTRAIT: a coherent SINGLE full-body RPG paper-doll illustration, VERTICAL 2:3 canvas (1024x1536).",
    ownerAllowed
      ? "Depict exactly ONE account owner as an adventurer posing confidently and naturally. Full body, face clearly recognizable and sharp, all equipped visible gear in frame, including footwear and held equipment. Sophisticated fantasy/RPG illustration, unified materials, lighting and a subtle evocative backdrop. The user is a real person imagined in an invented RPG setting, not a named franchise protagonist."
      : "Depict ONE original anonymous fantasy RPG avatar in a coherent full-body portrait, wearing the equipped gear. The account has disabled appearance sharing: do not guess or depict the account owner's real likeness.",
    faceReference
      ? "REFERENCE IMAGE #1 is the owner's ACTUAL FACE. Preserve the face shape, distinguishing features and hair while stylizing into the coherent RPG illustration. Do not copy the selfie pose, clothing or backdrop."
      : "No face photograph is supplied. Rely on the private appearance description below if present; do not claim exact facial likeness.",
    appearanceDescription.trim()
      ? 'OWNER APPEARANCE (private text description, appearance facts only): ' + appearanceDescription.slice(0,700)
      : "No separate text description recorded.",
    "EQUIPPED OBJECTS (use their attached images as object references, and their descriptions as shape/material guidance):",
    itemDescriptions,
    "SLOT PLACEMENT IS MANDATORY: Head items on the head; Body as torso clothing or armor; Legs on legs or feet; Primary as the dominant weapon or tool held in the primary hand; Secondary in the off hand or clearly attached to the opposite side; Accessory as jewelry or a small worn ornament. Respect each item's silhouette, real materials, color and scale. The loadout can deliberately mix different source worlds; blend them into ONE wearable outfit without redesigning every item into generic plate armor.",
    empty.length ? 'UNFILLED SLOTS: ' + empty.join(", ") + ". Do not invent additional iconic equipment to fill these slots." : "",
    "The reference images must NEVER be drawn as floating thumbnails, inventory UI, a collage, posters or split panels. The depicted character actually WEARS/HOLDS the objects. No item labels, captions, text, logos, extra characters or scenery covering the equipment.",
    "Prioritize readable face and the recognizable silhouette of every equipped item; avoid awkward overlaps, amputated limbs or crowded framing.",
  ].filter(Boolean).join("\n\n");
}
