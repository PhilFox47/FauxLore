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

/**
 * Loot generation lives on the server (see server/services/loot.ts), next to the
 * Codex it is written from — same as enemies. Rarity, slot and the bonus target
 * are rolled there, the AI writes the item and art-directs its icon in one pass,
 * and the caller here only decides the item's durability before saving it.
 */
export async function generateAiArtifact(item: any, oldArtifact?: any) {
  const res = await apiFetch('/api/artifacts/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mediaId: item.id, oldArtifact }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to generate an artifact.');
  }
  return res.json();
}
