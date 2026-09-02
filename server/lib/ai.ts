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
  /** Upstream provider to pin, or "" to let NanoGPT route. */
  provider?: string;
  webModel: string;
  creativeModel: string;
}

/** Which job a call is doing, and therefore which model it should land on. */
export type AiTier = "analytical" | "creative";

/** Reads the NanoGPT key/models for a user, falling back to the system-wide settings. */
export function getAiConfig(db: Db, userId: string): AiConfig | null {
  const cols = "nanoGptApiKey, nanoGptModel, nanoGptWebModel, nanoGptCreativeModel, nanoGptProvider";
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
  /**
   * Which upstream provider serves the model, when the choice has been made.
   *
   * Optional by design: empty means NanoGPT routes the request itself, which is
   * what every install did before this existed and remains the default. It earns
   * its place when a model is popular enough that one of its providers is
   * struggling — pinning a healthy one is the difference between a dossier and a
   * row of timeouts.
   */
  const provider = (userSettings?.nanoGptProvider || sysSettings?.nanoGptProvider || "").trim();
  const webModel = userSettings?.nanoGptWebModel || sysSettings?.nanoGptWebModel || model;
  const creativeModel = userSettings?.nanoGptCreativeModel || sysSettings?.nanoGptCreativeModel || model;
  return { apiKey, model, webModel, creativeModel, provider };
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
  opts: { temperature?: number; webSearch?: boolean; systemPrompt?: string; tier?: AiTier; timeoutMs?: number } = {},
): Promise<string> {
  const messages: { role: string; content: string }[] = [];
  if (opts.systemPrompt) messages.push({ role: "system", content: opts.systemPrompt });
  messages.push({ role: "user", content: prompt });

  const res = await fetch(NANO_GPT_CHAT_URL, {
    method: "POST",
    // Without this a stalled generation blocks a Codex indefinitely: the facets
    // run under Promise.allSettled, which waits for every one of them.
    //
    // A retrieval call gets far longer than a plain one, because it is doing two
    // jobs: the provider searches and injects results BEFORE the model writes a
    // word, and the facets then ask for pages of prose. On a slow model that
    // combination is minutes, and 240s was cutting off work that would have
    // finished — the sections came back empty and looked like failed research.
    signal: AbortSignal.timeout(opts.timeoutMs ?? (opts.webSearch ? 600_000 : 180_000)),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      // Only sent when one has been chosen. The header is the documented
      // per-request override and is ignored by models that do not support
      // provider selection, so an unsupported pairing degrades to today's
      // behaviour rather than failing.
      //
      // Note this is the CHAT call only. The image API documents provider
      // options as unsupported and answers `unsupported_provider_options`, so
      // nothing like this belongs on that route.
      ...(config.provider ? { "X-Provider": config.provider } : {}),
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
/**
 * Pulls a JSON document out of a model reply.
 *
 * The old version took everything from the first bracket to the last one. That
 * is right for a model that answers with JSON and wrong for a reasoning model,
 * which thinks out loud first — and reasoning about a JSON schema is full of
 * braces. One `{` in the preamble and the slice started in the middle of a
 * sentence, `JSON.parse` threw, and the whole facet was recorded as failed
 * research when the model had in fact answered correctly.
 *
 * So candidates are found by scanning for a BALANCED document instead, and each
 * is tried in turn. Strings are tracked while scanning, because a brace inside
 * one closes nothing.
 */
export function parseJsonLoose<T = any>(text: string): T {
  let body = (text || "").trim();

  // Reasoning models emit their working in a think block. It is not an answer
  // and it is the single richest source of stray brackets.
  body = body.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<\/?think>/gi, "").trim();

  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) {
    const inner = fenced[1].trim();
    try { return JSON.parse(inner) as T; } catch { body = inner; }
  }

  try { return JSON.parse(body) as T; } catch { /* fall through to scanning */ }

  for (const candidate of balancedCandidates(body)) {
    try { return JSON.parse(candidate) as T; } catch { /* try the next one */ }
  }
  throw new Error("The model did not return parseable JSON.");
}

/**
 * Every balanced `{...}` or `[...]` in the text, longest first.
 *
 * Longest first because the document we want is almost always the biggest one:
 * a preamble that mentions `{"characters": [...]}` should never win over the
 * real answer that follows it.
 */
function balancedCandidates(text: string): string[] {
  const found: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const open = text[i];
    if (open !== "{" && open !== "[") continue;
    const close = open === "{" ? "}" : "]";

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (escaped) { escaped = false; continue; }
      if (c === "\\" && inString) { escaped = true; continue; }
      if (c === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) { found.push(text.slice(i, j + 1)); break; }
      }
    }
  }

  return found.sort((a, b) => b.length - a.length).slice(0, 8);
}
