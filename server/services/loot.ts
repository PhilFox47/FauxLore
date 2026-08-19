import type { Db } from "../context";
import { getAiConfig, nanoGenerateText, parseJsonLoose } from "../lib/ai";
import { AUTHENTICITY, SHARPNESS, rarityArt } from "../lib/artDirection";
import { codexPromptBlock, type CodexService } from "./codex";

/**
 * Loot generation — the item counterpart to services/worldBoss.ts.
 *
 * The app fixes only the numbers a reward has to obey: how rare it is, which
 * slot it fills, what it grants a bonus to. Everything else is written in one
 * pass from the media's Codex: what the object actually IS in that world, how it
 * reads in that world's voice, and how it should be drawn so the icon looks like
 * it was lifted out of the source rather than out of generic fantasy stock.
 *
 * Writing the item and art-directing it together is the point. The prompt knows
 * the object is a cassette tape and not a rune-carved orb, so the picture does
 * too — which is exactly what the split-brained version kept getting wrong.
 */

export interface LootAttributes {
  rarity: string;
  slot: string;
  targetType: string;
  targetValue: string;
  bonusPercent: number;
}

export interface GeneratedLoot extends LootAttributes {
  name: string;
  description: string;
  type: string;
  imagePrompt: string;
}

const SLOTS = ["Head", "Body", "Legs", "Primary", "Secondary", "Accessory"];
const ALL_MEDIA_TYPES = ["Game", "Visual Novel", "Book", "Manga", "Series", "Comic", "Movie"];

/** What each slot means in physical terms, so the AI picks a wearable shape. */
const SLOT_BRIEF: Record<string, string> = {
  Head: "worn on the head — a helmet, mask, hat, crown, visor, headphones, hairpin",
  Body: "worn on the torso — armour, a coat, a uniform, a jacket, robes, a harness",
  Legs: "worn below the waist — greaves, boots, trousers, a skirt, shoes",
  Primary: "held in the main hand — the principal weapon or tool",
  Secondary: "held in the off hand — a shield, a sidearm, a tome, a companion device",
  Accessory: "carried or worn as a trinket — a charm, a badge, a ring, a keepsake, a gadget",
};

const RARITY_BONUS: Record<string, number> = {
  Mythic: 300,
  Legendary: 150,
  Epic: 125,
  "Super Rare": 100,
  Rare: 75,
  Uncommon: 40,
  Common: 20,
};

/**
 * Rolls the mechanical attributes of a drop: rarity, slot and what it buffs.
 * Regenerating an existing artifact keeps its attributes, so only its wording
 * and artwork change.
 */
export function rollLootAttributes(mediaItem: any, oldArtifact?: any): LootAttributes {
  if (oldArtifact) {
    const rarity = oldArtifact.rarity || "Common";
    return {
      rarity,
      slot: oldArtifact.slot || "Accessory",
      targetType: oldArtifact.targetType || "MediaType",
      targetValue: oldArtifact.targetValue || "",
      bonusPercent: oldArtifact.bonusPercent ?? RARITY_BONUS[rarity] ?? 20,
    };
  }

  const rand = Math.random() * 100;
  let rarity = "Common";
  if (rand < 5) rarity = "Mythic";
  else if (rand < 15) rarity = "Legendary";
  else if (rand < 30) rarity = "Super Rare";
  else if (rand < 50) rarity = "Rare";
  else if (rand < 75) rarity = "Uncommon";

  const slot = SLOTS[Math.floor(Math.random() * SLOTS.length)];

  // Bonus target: prefer something specific to this entry, fall back to a
  // cross-media-type bonus.
  const genres: string[] = mediaItem.genres || [];
  const tags: string[] = mediaItem.tags || [];
  const franchises: string[] = mediaItem.franchises || [];

  const pool: { type: string; weight: number }[] = [];
  if (genres.length) pool.push({ type: "Genre", weight: 25 });
  if (tags.length) pool.push({ type: "Tag", weight: 25 });
  if (franchises.length) pool.push({ type: "Franchise", weight: 30 });
  pool.push({ type: "MediaType", weight: 20 });

  const totalWeight = pool.reduce((acc, curr) => acc + curr.weight, 0);
  const roll = Math.random() * totalWeight;
  let running = 0;
  let targetType = "MediaType";
  for (const option of pool) {
    running += option.weight;
    if (roll <= running) {
      targetType = option.type;
      break;
    }
  }

  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  let targetValue = "";
  if (targetType === "Genre") targetValue = pick(genres);
  else if (targetType === "Tag") targetValue = pick(tags);
  else if (targetType === "Franchise") targetValue = pick(franchises);
  else targetValue = pick(ALL_MEDIA_TYPES.filter((m) => m !== mediaItem.mediaType));

  return { rarity, slot, targetType, targetValue, bonusPercent: RARITY_BONUS[rarity] ?? 20 };
}

export function createLootService({ db, codex }: { db: Db; codex: CodexService }) {
  /**
   * Writes one piece of loot for a media entry, including its own image prompt.
   * Returns null when AI is unconfigured or the model could not be parsed, so
   * the caller can decide whether that is fatal.
   */
  async function generateLoot(userId: string, mediaItem: any, oldArtifact?: any): Promise<GeneratedLoot | null> {
    const aiConfig = getAiConfig(db, userId);
    if (!aiConfig) return null;

    const attrs = rollLootAttributes(mediaItem, oldArtifact);
    const codexRow = await codex.tryEnsureCodex(userId, {
      mediaId: mediaItem.id,
      title: mediaItem.title,
      mediaType: mediaItem.mediaType,
    });
    const codexBlock = codexPromptBlock(codexRow);
    const art = rarityArt(attrs.rarity);
    const artStyle = codexRow?.data?.artStyle?.summary;

    const legacyBrief = oldArtifact
      ? `\nTHIS IS A REFORGE. An older artifact called "${oldArtifact.name}" (${oldArtifact.description}) is being rewritten. Keep its essence and its identity recognisable, but tell it properly this time.`
      : "";

    const prompt = `You are the Loot Master of FauxLore. The player has just finished, or made real progress in, a piece of media, and it owes them a trophy. Your job is to pull ONE object out of that world — something a fan would recognise or instantly believe in — and write it up as equippable loot.

THE SOURCE: "${mediaItem.title}" (${mediaItem.mediaType})${mediaItem.creator ? `, by ${mediaItem.creator}` : ""}

${codexBlock || `(No Codex is on record for this title — rely on your own knowledge of it and stay faithful to what you actually know.)`}${legacyBrief}

THE DROP (fixed by the game — honour it exactly):
- Rarity: ${attrs.rarity}. At this tier the object should read as ${art.grandeur}.
- Slot: ${attrs.slot} — ${SLOT_BRIEF[attrs.slot] || "equipped gear"}. The object must physically make sense in that slot.
- Bonus: it grants a bonus to ${attrs.targetType}: "${attrs.targetValue}".

HOW TO CHOOSE THE OBJECT:
1. Reach into this specific world first. The Codex is a reference on the work — its objects, its factions, its vocabulary, its materials — and nothing in it has been sorted by rarity or reserved for any tier. The best drop is usually something it records, or a variant of one that a character in this world would plausibly own.
2. If nothing there fits the slot or the rarity, invent one — but build it out of this work's own material culture: its technology level, its craft, its named organizations, its slang. A drop from a 90s office comedy is a laminated badge or a stapler, not an enchanted amulet. A drop from a hard sci-fi series is hardware, not a rune.
3. Let rarity decide the stature of what you pick. Common is a genuinely mundane, everyday object from that world. Mythic is the artifact the entire plot revolves around.

HOW TO WRITE IT:
4. Name it in 4 words or fewer, in the naming style of this work — its language, its honorifics, its brand names, its jargon. Not generic fantasy unless the source is generic fantasy.
5. Record what it is, factually — no voice, no atmosphere, no flourish. A writer takes this brief and turns it into flavour text afterwards, and can only use what you give them, so give them real specifics: who owned it, what it survived, where it came from, what it is made of and how worn it is. State the facts; do not perform them.
6. Give it an RPG item type that fits both the object and the slot (Weapon, Armor, Helmet, Relic, Trinket, Consumable, Tool, Document, ...).
7. Art-direct its inventory icon yourself, as ONE ready-to-use text-to-image prompt.

THE IMAGE PROMPT MUST:
- Be 2-4 natural sentences that stand entirely on their own, written for the "Z-Image-Turbo" diffusion model (it follows natural language and renders any art style, including real text and logos).
- Open by naming the object literally and plainly, so the model cannot mistake what it is. If it is a sword it is a sword; a cassette tape a cassette; a book a book; a sandwich a sandwich. NEVER substitute a generic ring, gem, orb or "magic trinket" for the real object.
- Render it in the ACTUAL art style, medium and material language of "${mediaItem.title}"${artStyle ? ` — the Codex records it as: ${artStyle}` : ""}. Name that style explicitly and reference the franchise by name to anchor the look. Never default to generic flat cartoon or vector icon art unless the source really is that.
- ${AUTHENTICITY(mediaItem.title)}
- Describe its exact materials, shape, construction, engravings, labels and wear, so it looks like a used object from that world rather than a showroom prop.
- Show ONE hero item only, centered, as a polished game-inventory icon / studio product shot with a soft contact shadow, carrying ${art.aura}, on this rarity-specific background: ${art.background}.
- ${SHARPNESS}
- Include no hands, no people, no extra props and no watermarks.

Return ONLY a pure JSON object, no markdown fence, no commentary:
{
  "name": "the item name",
  "brief": "1-2 plain sentences on what the object is and why it fits this rarity",
  "provenance": "who owned it, what it survived, where it came from",
  "look": "its materials, shape, markings and wear",
  "type": "the RPG item type",
  "imagePrompt": "the complete image prompt"
}`;

    try {
      // STAGE 1 — analytical. Which object, what it is made of, what it is for.
      // The Codex already did the research, so no search is needed — unless there
      // is no Codex, in which case fall back to looking the title up here.
      const raw = await nanoGenerateText(aiConfig, prompt, {
        temperature: 0.95,
        webSearch: !codexBlock,
        tier: "analytical",
      });
      if (!raw) throw new Error("The model returned an empty item.");
      const spec = parseJsonLoose<any>(raw);

      const clean = (v: any) => String(v || "").replace(/\*\*/g, "").trim();
      const name = clean(spec.name);
      if (!name) throw new Error("The item has no name.");

      // STAGE 2 — creative. The card in the Armory is one sentence long, and it
      // is the only part of this the player ever reads.
      const written = await writeLootFlavour(aiConfig, mediaItem, attrs, art, spec, codexRow);

      return {
        ...attrs,
        name,
        description: clean(written) || clean(spec.brief) || "An item of unknown origin.",
        type: clean(spec.type) || "Trinket",
        imagePrompt: String(spec.imagePrompt || "").trim(),
      };
    } catch (e) {
      console.error("Loot generation failed", e);
      return null;
    }
  }

  /**
   * Turns an item brief into the line that shows on the card.
   *
   * Given the brief and nothing else — no Codex, no item list — so it cannot
   * research and therefore cannot contradict the research. Its job is voice.
   */
  async function writeLootFlavour(
    aiConfig: NonNullable<ReturnType<typeof getAiConfig>>,
    mediaItem: any,
    attrs: { rarity: string; slot: string; targetType: string; targetValue: string },
    art: { grandeur: string },
    spec: any,
    codexRow: any,
  ): Promise<string> {
    const d = codexRow?.data;
    const voice = [
      d?.tone ? `Tone of the source: ${d.tone}` : "",
      d?.premise ? `What the work is: ${d.premise}` : "",
    ].filter(Boolean).join("\n");

    const prompt = `You are the Loot Master of FauxLore, writing the card for one piece of loot. Another archivist has already chosen it and handed you this brief. Your only job is to make it read well.

THE SOURCE: "${mediaItem.title}" (${mediaItem.mediaType})
${voice}

THE BRIEF — every fact below is settled. Do not add to it, do not contradict it, and do not invent owners, powers or history it does not mention:
- Name: ${spec.name}
- What it is: ${spec.brief || ""}
- Where it came from: ${spec.provenance || ""}
- What it looks like: ${spec.look || ""}
- Rarity: ${attrs.rarity} — it should read as ${art.grandeur}.

WRITE 1-2 sentences of flavour text in the VOICE of this work — its tone, its humour or its dread, its vocabulary. Use the real specifics from the brief rather than vague mysticism. It must also hint, without ever stating it outright, at a bonus to ${attrs.targetType}: "${attrs.targetValue}".

Write it as the world would describe the object, not as a stat block. Do not restate the brief. Do not open with the name and a colon. No markdown, no surrounding quotation marks.

Return ONLY the flavour text, nothing else.`;

    try {
      const raw = await nanoGenerateText(aiConfig, prompt, { temperature: 1.0, tier: "creative" });
      return String(raw || "").replace(/^["']|["']$/g, "").trim();
    } catch (e) {
      // A plain description beats no drop: the caller falls back to the brief.
      console.error("Loot flavour pass failed; falling back to the brief", e);
      return "";
    }
  }

  return { generateLoot };
}

export type LootService = ReturnType<typeof createLootService>;
