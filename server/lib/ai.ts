import type { Db } from "../context";

/**
 * Server-side text generation via NanoGPT's OpenAI-compatible endpoint.
 *
 * Two models are configurable per user (falling back to the system settings):
 * `nanoGptModel` for ordinary generation and `nanoGptWebModel` for tasks that
 * need to look something up. NanoGPT enables web search by appending `:online`
 * to the model name, which is what `webSearch` does here.
 */
const NANO_GPT_CHAT_URL = "https://nano-gpt.com/api/v1/chat/completions";

export interface AiConfig {
  apiKey: string;
  model: string;
  webModel: string;
}

/** Reads the NanoGPT key/models for a user, falling back to the system-wide settings. */
export function getAiConfig(db: Db, userId: string): AiConfig | null {
  const userSettings: any = db
    .prepare("SELECT nanoGptApiKey, nanoGptModel, nanoGptWebModel FROM settings WHERE userId = ?")
    .get(userId);
  const sysSettings: any = db
    .prepare("SELECT nanoGptApiKey, nanoGptModel, nanoGptWebModel FROM system_settings WHERE id = 'system'")
    .get();

  const apiKey = userSettings?.nanoGptApiKey || sysSettings?.nanoGptApiKey || process.env.NANO_GPT_API_KEY;
  if (!apiKey) return null;

  const model = userSettings?.nanoGptModel || sysSettings?.nanoGptModel || "gpt-4o-mini";
  const webModel = userSettings?.nanoGptWebModel || sysSettings?.nanoGptWebModel || model;
  return { apiKey, model, webModel };
}

function resolveModel(config: AiConfig, webSearch: boolean): string {
  const base = (webSearch ? config.webModel : config.model).trim();
  if (!webSearch) return base;
  // Don't double-suffix if the configured name already opts in.
  return /:online\b/.test(base) ? base : `${base}:online`;
}

/** Single-turn completion. Returns the trimmed assistant message, or "" on failure. */
export async function nanoGenerateText(
  config: AiConfig,
  prompt: string,
  opts: { temperature?: number; webSearch?: boolean; systemPrompt?: string } = {},
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
      model: resolveModel(config, !!opts.webSearch),
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
