import { apiFetch, DatabaseService } from './db';

/**
 * All AI text generation goes through NanoGPT's OpenAI-compatible endpoint.
 *
 * Two models are configurable: one for ordinary generation and one for tasks that
 * must look things up. Web search is enabled by appending ":online" to the model
 * name, which is how NanoGPT exposes it.
 *
 * These days the lookup happens once, in the Codex (see server/services/codex.ts):
 * the first AI task to touch a media entry researches it, and tagging and loot are
 * then written from that dossier plus the model's own knowledge. So the calls in
 * here are creative, not investigative, and run on the cheaper model.
 */
export interface AiSettings {
  nanoGptApiKey?: string;
  nanoGptModel?: string;
  nanoGptWebModel?: string;
}

function resolveModel(settings: AiSettings | undefined, webSearch: boolean): string {
  const base = webSearch
    ? (settings?.nanoGptWebModel || settings?.nanoGptModel)
    : settings?.nanoGptModel;
  const model = (base || 'gpt-4o-mini').trim();
  if (!webSearch) return model;
  // Don't double-suffix if the configured name already opts in.
  return /:online\b/.test(model) ? model : `${model}:online`;
}

async function nanoChat(
  settings: AiSettings | undefined,
  systemPrompt: string,
  userPrompt: string,
  opts: { temperature?: number; webSearch?: boolean } = {},
): Promise<string> {
  const apiKey = settings?.nanoGptApiKey;
  if (!apiKey) {
    throw new Error('Nano-GPT API key is not configured. Set it in Settings -> API Integrations.');
  }
  const res = await apiFetch('/api/nano-gpt/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-nano-gpt-key': apiKey },
    body: JSON.stringify({
      model: resolveModel(settings, !!opts.webSearch),
      temperature: opts.temperature ?? 0.9,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Nano-GPT error (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

/** Strips fences/prose and returns the JSON object a reply contains. */
function parseJsonLoose(text: string): any {
  let body = (text || '').trim();
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) body = fenced[1].trim();
  try {
    return JSON.parse(body);
  } catch (e) {
    const start = body.search(/[{[]/);
    const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
    if (start !== -1 && end > start) return JSON.parse(body.slice(start, end + 1));
    throw new Error('The model did not return parseable JSON.');
  }
}

/**
 * The media's Codex, researched now if it does not exist yet.
 *
 * Returns an empty string rather than failing: a Codex that could not be compiled
 * (no network, a title nothing is written about) should degrade the prompt, not
 * block the feature.
 */
async function getCodexContext(item: any): Promise<string> {
  try {
    const codex = await DatabaseService.ensureCodex({
      mediaId: item?.id,
      title: item?.title,
      mediaType: item?.mediaType,
    });
    return codex?.promptBlock || '';
  } catch (e) {
    console.warn('Codex unavailable, continuing without it:', e);
    return '';
  }
}

/** Creative text (titles, flavour). No lookup needed, so no web search. */
export async function generateAiText(settings: AiSettings | undefined, systemPrompt: string, userPrompt: string, temperature: number = 0.9) {
  try {
    return await nanoChat(settings, systemPrompt, userPrompt, { temperature });
  } catch (error) {
    console.error("AI text generation failed:", error);
    throw error;
  }
}

export async function generateAiTags(settings: AiSettings | undefined, item: any, taxonomies: any[]) {

  const validGenres = taxonomies.filter(t => t.type === 'genre').map(t => t.name);
  const validTags = taxonomies.filter(t => t.type === 'tag').map(t => t.name);

  // Researches the title if this is the first AI task to touch it.
  const codexBlock = await getCodexContext(item);

  const gptSystem = `You are FauxLore, an expert taxonomy system. Your job is to classify media.
Existing Genres: ${validGenres.join(', ')}
Existing Tags: ${validTags.join(', ')}

Rules:
1. Strongly prefer using exact matches from the Existing lists above.
2. ONLY invent a new Genre or Tag if it is ABSOLUTELY ESSENTIAL and the media cannot be properly described without it. Do not do this lightly.
3. Select between 1 and 3 core Genres. ONLY use up to 5 if absolutely essential. Order them from most defining/important to least.
4. Select between 3 and 10 highly relevant Tags. ONLY use more (up to 15) if absolutely essential. Be strict and focused - less is often more. Order them from most defining/important to least.
5. NO DUPLICATES: A term can be a Genre OR a Tag, never both. Do not use an existing Genre as a Tag, or an existing Tag as a Genre.
6. ${codexBlock
    ? `Base your classification on the Codex supplied with the request — it is the researched record of this work — mapped onto the vocabulary above. The Codex's own genre and tag suggestions are raw material, not answers: translate them into the Existing lists wherever a match exists.`
    : `USE YOUR WEB SEARCH CAPABILITIES to confirm details about "${item.title}" (${item.mediaType}).`}
7. Return ONLY a pure JSON object in this exact format:
{"genres": ["Genre1", "Genre2"], "tags": ["Tag1", "Tag2"]}
Do not wrap it in markdown. Do not include any explanations.`;

  const gptUser = `Please tag the following media:
Title: ${item.title}
Type: ${item.mediaType}
Description: ${item.description || 'N/A'}
Legacy Context genres: ${item.genres?.join(', ') || 'N/A'}
Legacy Context tags: ${item.tags?.join(', ') || 'N/A'}
Legacy Context platforms: ${item.platforms?.join(', ') || 'N/A'}${codexBlock ? `\n\n${codexBlock}` : ''}`;

  try {
    // With a Codex in hand the facts are already settled, so this is a plain
    // classification call. Without one, fall back to searching the web here.
    const jsonText = await nanoChat(settings, gptSystem, gptUser, { temperature: 0.1, webSearch: !codexBlock });
    if (!jsonText) throw new Error("The model returned an empty response.");

    const parsed = parseJsonLoose(jsonText);

    // Cross-contamination cleanup: ensure known genres aren't tags, and known tags aren't genres
    const finalGenres = new Set<string>();
    const finalTags = new Set<string>();

    const getKnownGenre = (val: string) => validGenres.find(g => g.toLowerCase() === val.toLowerCase());
    const getKnownTag = (val: string) => validTags.find(t => t.toLowerCase() === val.toLowerCase());

    if (Array.isArray(parsed.genres)) {
      for (let g of parsed.genres) {
        g = g.trim();
        const knownTag = getKnownTag(g);
        const knownGenre = getKnownGenre(g);

        if (knownTag && !knownGenre) {
          finalTags.add(knownTag);
        } else {
          finalGenres.add(knownGenre || g);
        }
      }
    }

    if (Array.isArray(parsed.tags)) {
      for (let t of parsed.tags) {
        t = t.trim();
        const knownGenre = getKnownGenre(t);
        const knownTag = getKnownTag(t);

        if (knownGenre && !knownTag) {
          finalGenres.add(knownGenre);
        } else {
          finalTags.add(knownTag || t);
        }
      }
    }

    parsed.genres = Array.from(finalGenres);
    parsed.tags = Array.from(finalTags);

    return parsed;
  } catch (error) {
    console.error("AI Auto-Tag Error:", error);
    throw error;
  }
}

export async function generateAiArtifact(settings: AiSettings | undefined, item: any, oldArtifact?: any) {

  // Generate rarity and slot based on distribution (consistent with the app's RPG system)
  let rarity = oldArtifact?.rarity || 'Common';
  let slot = oldArtifact?.slot;
  if (!oldArtifact) {
    const rand = Math.random() * 100;
    if (rand < 5) rarity = 'Mythic';
    else if (rand < 15) rarity = 'Legendary';
    else if (rand < 30) rarity = 'Super Rare';
    else if (rand < 50) rarity = 'Rare';
    else if (rand < 75) rarity = 'Uncommon';
    else rarity = 'Common';

    const slots = ['Head', 'Body', 'Legs', 'Primary', 'Secondary', 'Accessory'];
    slot = slots[Math.floor(Math.random() * slots.length)];
  }

  // Pre-determine Bonus Effect via software-level RNG
  let targetType = oldArtifact?.targetType || 'MediaType';
  let targetValue = oldArtifact?.targetValue || '';

  if (!oldArtifact) {
    const hasGenre = item.genres && item.genres.length > 0;
    const hasTag = item.tags && item.tags.length > 0;
    const hasFranchise = item.franchises && item.franchises.length > 0;

    let pool = [];
    if (hasGenre) pool.push({ type: 'Genre', weight: 25 });
    if (hasTag) pool.push({ type: 'Tag', weight: 25 });
    if (hasFranchise) pool.push({ type: 'Franchise', weight: 30 });
    pool.push({ type: 'MediaType', weight: 20 });

    let totalWeight = pool.reduce((acc, curr) => acc + curr.weight, 0);
    let r = Math.random() * totalWeight;
    let currentWeight = 0;
    for (const option of pool) {
      currentWeight += option.weight;
      if (r <= currentWeight) {
        targetType = option.type;
        break;
      }
    }

    if (targetType === 'Genre') {
      targetValue = item.genres[Math.floor(Math.random() * item.genres.length)];
    } else if (targetType === 'Tag') {
      targetValue = item.tags[Math.floor(Math.random() * item.tags.length)];
    } else if (targetType === 'Franchise') {
      targetValue = item.franchises[Math.floor(Math.random() * item.franchises.length)];
    } else if (targetType === 'MediaType') {
      const allMediaTypes = ['Game', 'Visual Novel', 'Book', 'Manga', 'Series', 'Comic', 'Movie'];
      const otherMediaTypes = allMediaTypes.filter(m => m !== item.mediaType);
      targetValue = otherMediaTypes[Math.floor(Math.random() * otherMediaTypes.length)];
    }
  }

  // Researches the title if this is the first AI task to touch it.
  const codexBlock = await getCodexContext(item);

  const contextSnippet = `
Title: ${item.title}
Type: ${item.mediaType}
Creator/Author: ${item.creator || item.publisher || 'Unknown'}
Synopsis/Description: ${item.description || 'No description provided.'}
Genres (ordered by importance): ${item.genres?.join(", ") || 'N/A'}
Tags (ordered by importance): ${item.tags?.join(", ") || 'N/A'}
`;

  const legacySnippet = oldArtifact ? `\nThe item is a legacy artifact! You MUST incorporate its essence.
Legacy Name: ${oldArtifact.name}
Legacy Description: ${oldArtifact.description}` : '';

  const prompt = `You are a legendary RPG Loot Master. The user has just finished or made significant progress in a piece of media.
Your task is to generate a unique, flavor-rich Artifact that deeply references the lore, characters, themes, or signature items of this media.${legacySnippet}

${codexBlock
    ? `The Codex below is the researched record of this work — its cast, its equipment, its vocabulary and its look. Treat it as ground truth, then invent freely on top of it, so the loot feels "inside-baseball" for fans.\n\n${codexBlock}`
    : `USE YOUR WEB SEARCH CAPABILITIES to confirm details about "${item.title}" (${item.mediaType}) so the loot feels authentic and "inside-baseball" for fans.`}

Media Context:
${contextSnippet}

PRE-DETERMINED ATTRIBUTES (fixed by the game — honour them exactly):
- Rarity: ${rarity}
- Slot: ${slot} (Conceptually fit this slot. Head=hat/helmet, Body=armor/clothing, etc.)
- Bonus Effect: Grants a bonus to ${targetType}: "${targetValue}"

REQUIREMENTS:
1. Ensure the Item Name and Description perfectly match the specified Rarity, Slot, and Bonus Effect.
2. Target Rarity: ${rarity} (Adjust the "epicness". Common is mundane, Legendary/Mythic are world-altering).
3. The item name should be clever, thematic (max 4 words), and sound like a tangible item you would equip in the "${slot}" slot. Let the rarity guide how grand the name sounds.
4. The description should be 1-2 sentences of high-quality RPG flavor text drawing on real lore details. It MUST subtly hint at the Bonus Effect (${targetType}: "${targetValue}").
5. The type should be a logical RPG category that fits the slot (e.g., Weapon, Relic, Armor, Helmet, Trinket, Consumable, etc.).
6. Art-direct the item's inventory icon yourself, as a single ready-to-use text-to-image prompt of 2-4 natural sentences for the "Z-Image-Turbo" diffusion model. It must:
   - Keep the object literal and correct — if it is a sword it is a sword, if it is a cassette it is a cassette. Never substitute a generic ring, gem or orb.
   - Render it in the ACTUAL art style, medium and material language of "${item.title}"${codexBlock ? ' (the Codex records that style — name it explicitly)' : ''}, referencing the franchise by name, and borrowing its authentic emblems, insignia and motifs where they belong.
   - Show ONE item only, centered, as a polished inventory icon / studio product shot with a soft contact shadow, on a background that suits ${rarity} rarity.
   - Describe its exact materials, shape, engravings and wear, with sharp focus, crisp detail and even lighting — no bokeh, no heavy vignette.
   - Include no hands, no people, no extra props, no lettering and no watermarks.

Return EXACTLY and ONLY a pure JSON object with the following keys:
{
  "name": "The item name",
  "description": "The flavor text",
  "type": "The RPG item type",
  "imagePrompt": "The complete image prompt"
}`;

  try {
    // Creative call: the Codex already did the looking-up, so no web search unless
    // there is no Codex to lean on.
    const jsonText = await nanoChat(settings, 'You are an RPG Loot Master for the FauxLore media tracker.', prompt, { temperature: 0.9, webSearch: !codexBlock });
    if (!jsonText) {
      throw new Error("The model returned an empty response.");
    }

    const parsed = parseJsonLoose(jsonText);

    let bonusPercent = 20;
    if (rarity === 'Mythic') bonusPercent = 300;
    else if (rarity === 'Legendary') bonusPercent = 150;
    else if (rarity === 'Epic') bonusPercent = 125;
    else if (rarity === 'Super Rare') bonusPercent = 100;
    else if (rarity === 'Rare') bonusPercent = 75;
    else if (rarity === 'Uncommon') bonusPercent = 40;

    return {
      name: parsed.name || "Mysterious Artifact",
      description: parsed.description || "An item of unknown origin.",
      type: parsed.type || "Trinket",
      imagePrompt: typeof parsed.imagePrompt === 'string' ? parsed.imagePrompt.trim() : '',
      slot: slot || "Accessory",
      targetType: targetType,
      targetValue: targetValue,
      bonusPercent,
      rarity
    };
  } catch (error) {
    console.error("AI Artifact Generation Error:", error);
    throw error;
  }
}
