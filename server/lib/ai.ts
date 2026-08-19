import type { Db } from "../context";

/**
 * Server-side text generation via NanoGPT's OpenAI-compatible endpoint.
 *
 * THREE models are configurable per user (falling back to the system settings),
 * because the app asks for three genuinely different things and no single model
 * is good at all of them:
 *
 *   ANALYTICAL  `nanoGptModel` — classify, extract, convert prose to JSON, draft
 *               a spec. Wants schema adherence and a refusal to invent.
 *   WEB         `nanoGptWebModel` — the same analytical work, but over injected
 *               search results. Split out because retrieval rewards a large
 *               context window, and because NanoGPT enables search by appending
 *               `:online` to the model name.
 *   CREATIVE    `nanoGptCreativeModel` — the text the user actually reads: enemy
 *               and item flavour, level titles, quest copy, recap prose. Wants
 *               voice, and a roleplay-tuned model is genuinely better at it.
 *
 * The split matters in both directions. A model tuned to invent nothing writes
 * flat enemies; a model tuned for persona and improvisation invents characters
 * that were never in the work, and for the Codex that error is permanent.
 */
const NANO_GPT_CHAT_URL = "https://nano-gpt.com/api/v1/chat/completions";

export interface AiConfig {
  apiKey: string;
  model: string;
  webModel: string;
  creativeModel: string;
}

/** Which job a call is doing, and therefore which model it should land on. */
export type AiTier = "analytical" | "creative";

/** Reads the NanoGPT key/models for a user, falling back to the system-wide settings. */
export function getAiConfig(db: Db, userId: string): AiConfig | null {
  const cols = "nanoGptApiKey, nanoGptModel, nanoGptWebModel, nanoGptCreativeModel";
  const userSettings: any = db
    .prepare(`SELECT ${cols} FROM settings WHERE userId = ?`)
    .get(userId);
  const sysSettings: any = db
    .prepare(`SELECT ${cols} FROM system_settings WHERE id = 'system'`)
    .get();

  const apiKey = userSettings?.nanoGptApiKey || sysSettings?.nanoGptApiKey || process.env.NANO_GPT_API_KEY;
  if (!apiKey) return null;

  // Both specialised slots fall back to the analytical model, so an install that
  // never fills them in behaves exactly as it did before.
  const model = userSettings?.nanoGptModel || sysSettings?.nanoGptModel || "gpt-4o-mini";
  const webModel = userSettings?.nanoGptWebModel || sysSettings?.nanoGptWebModel || model;
  const creativeModel = userSettings?.nanoGptCreativeModel || sysSettings?.nanoGptCreativeModel || model;
  return { apiKey, model, webModel, creativeModel };
}

export function resolveModel(config: AiConfig, webSearch: boolean, tier: AiTier = "analytical"): string {
  // Search wins over tier: a creative call that still needs to look something up
  // has to run on the model the search results are being injected into.
  if (webSearch) {
    const base = config.webModel.trim();
    // Don't double-suffix if the configured name already opts in.
    return /:online\b/.test(base) ? base : `${base}:online`;
  }
  return (tier === "creative" ? config.creativeModel : config.model).trim();
}

/** Single-turn completion. Returns the trimmed assistant message, or "" on failure. */
export async function nanoGenerateText(
  config: AiConfig,
  prompt: string,
  opts: { temperature?: number; webSearch?: boolean; systemPrompt?: string; tier?: AiTier } = {},
): Promise<string> {
  const messages: { role: string; content: string }[] = [];
  if (opts.systemPrompt) messages.push({ role: "system", content: opts.systemPrompt });
  messages.push({ role: "user", content: prompt });

  const res = await fetch(NANO_GPT_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: resolveModel(config, !!opts.webSearch, opts.tier),
      temperature: opts.temperature ?? 0.9,
      messages,
    }),
  });

  if (!res.ok) {
    throw new Error(`NanoGPT error (${res.status}): ${(await res.text().catch(() => "")).slice(0, 300)}`);
  }
  const data: any = await res.json();
  return (data.choices?.[0]?.message?.content || "").trim();
}

/**
 * Parses JSON out of a model reply that may be fenced, prefixed with prose, or
 * both. Throws if nothing parseable is in there.
 */
export function parseJsonLoose<T = any>(text: string): T {
  let body = (text || "").trim();
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) body = fenced[1].trim();

  try {
    return JSON.parse(body) as T;
  } catch (_) {
    // Fall back to the outermost {...} / [...] the reply contains.
    const start = body.search(/[{[]/);
    const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
    if (start !== -1 && end > start) {
      return JSON.parse(body.slice(start, end + 1)) as T;
    }
    throw new Error("The model did not return parseable JSON.");
  }
}
