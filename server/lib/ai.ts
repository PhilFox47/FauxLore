import type { Db } from "../context";
import { Agent } from "undici";
import { recordAiCall } from "./diagnostics";

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

/**
 * Node's own five-minute cap on a request, removed.
 *
 * `fetch` waits 300 seconds for the response headers and then aborts. That is
 * fine for an ordinary API and completely wrong for this one: the request is not
 * streamed, so the provider sends nothing at all until a deep search and a full
 * dossier are finished, and a Codex for a niche title takes longer than five
 * minutes to reach that point. Our own fifteen-minute budget never got a chance
 * to apply — Node killed the connection at 300,783ms first, reported it as
 * "fetch failed", and the retry logic then spent five more minutes twice over on
 * a failure that could never clear.
 *
 * Both timeouts are disabled so `AbortSignal.timeout` is the only clock, which
 * is the one the caller actually set. `connectTimeout` stays short, because
 * failing to reach the host at all is a genuinely different thing and should
 * still fail fast.
 *
 * Imported statically rather than with `require`, which was the first attempt and
 * silently did nothing: this package is ESM, so `require` is not defined, the
 * construction threw, and the dispatcher stayed unset — the five-minute cap was
 * still in force everywhere the server ran from source. Only the bundled build
 * would have worked, which is the worst kind of half-fix.
 */
let dispatcher: Agent | undefined;
try {
  dispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0, connectTimeout: 30_000 });
} catch (e) {
  console.warn("[ai] Could not raise the HTTP timeout; long requests may be cut off at five minutes", e);
}

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

export function resolveModel(
  config: AiConfig,
  webSearch: boolean,
  tier: AiTier = "analytical",
  depth?: "standard" | "deep",
): string {
  // Search wins over tier: a creative call that still needs to look something up
  // has to run on the model the search results are being injected into.
  if (webSearch) {
    const base = config.webModel.trim();
    // Don't double-suffix if the configured name already opts in.
    if (/:online\b/.test(base)) return base;
    /**
     * The depth goes on the model name as well as in the request body.
     *
     * Belt and braces, and it is not paranoia — it was measured. One run billed
     * a deep search fee and came back with 39,000 tokens of retrieved material;
     * the next four billed a standard fee and came back with none, from the same
     * code sending the same `webSearch` object. The body form is documented as
     * taking precedence when it is honoured, and the suffix is what happens when
     * it is not, so sending both means the request is deep either way instead of
     * silently degrading to a shallower search nobody asked for.
     */
    return depth === "deep" ? `${base}:online/linkup-deep` : `${base}:online`;
  }
  return (tier === "creative" ? config.creativeModel : config.model).trim();
}

/**
 * Whether a failure is worth simply doing again.
 *
 * A rate limit, a gateway error or a dropped socket says the provider was busy,
 * not that the request was wrong — the same call a moment later usually works.
 * A 400 or a 401 says the opposite, and repeating it wastes time and money.
 *
 * A TIMEOUT IS DELIBERATELY NOT IN HERE, even though it is transient in every
 * other sense. The Codex pass is given fifteen minutes; repeating one that has
 * already spent them costs another fifteen to reach the same place, and three
 * attempts turn one slow generation into most of an hour while the user watches
 * a spinner. A timeout is reported as a failure so it can be tried again
 * deliberately, which for a Codex is safe: nothing is written unless the call
 * succeeds, so the previous dossier is still there.
 */
function isTransient(err: any, status?: number): boolean {
  if (status !== undefined) return status === 408 || status === 409 || status === 429 || status >= 500;
  const name = String(err?.name || "");
  if (name === "TimeoutError" || name === "AbortError") return false;

  // A clock that ran out is a timeout however it is dressed. `fetch failed` with
  // a headers-timeout underneath IS one, and it used to be retried three times
  // because the message says nothing and the cause was never read — five minutes
  // of waiting, three times over, for a failure that was never going to clear.
  const code = String(err?.cause?.code || err?.code || "");
  if (code === "UND_ERR_HEADERS_TIMEOUT" || code === "UND_ERR_BODY_TIMEOUT") return false;

  const message = String(err?.message || err || "");
  if (/timeout|aborted/i.test(message)) return false;
  return /network|socket|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|fetch failed|empty reply/i.test(message);
}

/**
 * What actually went wrong, when `fetch` will only say "fetch failed".
 *
 * Node puts the real error on `cause`, and every layer above this was reading
 * `err.message` — so a five-minute headers timeout, a refused connection and a
 * DNS failure all arrived in the log as the same three words. That cost an
 * afternoon: the failure had to be identified by noticing that 300,783ms is
 * suspiciously close to five minutes.
 */
function describeFetchError(err: any): string {
  const base = String(err?.message || err || "unknown error");
  const cause = err?.cause;
  if (!cause) return base;
  const code = cause.code ? ` [${cause.code}]` : "";
  const detail = cause.message && cause.message !== base ? `: ${cause.message}` : "";
  return `${base}${code}${detail}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * How many times a call is tried before it is treated as a real failure.
 *
 * There was one. A single hiccup from a busy provider cost a whole section of a
 * dossier permanently, and six of them at once cost the entire Codex — which is
 * what a popular model on a struggling provider produces all day. Two extra
 * attempts with backoff turn almost all of that into a slower success.
 */
const MAX_ATTEMPTS = 3;

/**
 * How the provider should search, when a plain `:online` is not what is wanted.
 *
 * `deep` costs roughly ten times a standard search and runs its own iterative
 * queries rather than one. That is the whole reason the Codex can be a single
 * call: one deep pass returns the breadth six standard searches were being spent
 * to fake, without six chances to fail on the way.
 */
export interface SearchOptions {
  /** linkup | tavily | brave | sofya | exa | kagi | perplexity | valyu. Empty leaves NanoGPT's default. */
  provider?: string;
  depth?: "standard" | "deep";
}

export interface GenerateOptions {
  temperature?: number;
  webSearch?: boolean;
  systemPrompt?: string;
  tier?: AiTier;
  timeoutMs?: number;
  /** Retrieval provider and depth. Ignored unless `webSearch` is set. */
  search?: SearchOptions;
  /** Ask the provider to constrain the reply to valid JSON. */
  json?: boolean;
  /**
   * Which feature is making this call, and for whom. Diagnostics only.
   *
   * Without it every row in the AI log reads "some model was called", and the
   * question being asked of that log is almost always "what did the Codex do",
   * not "what did anything do".
   */
  scope?: string;
  userId?: string | null;
  /**
   * Internal. Set false after a provider rejects the `webSearch` body object.
   *
   * The depth is requested two ways — in the body and on the model suffix — so
   * that dropping the half a provider refuses does not quietly take the other
   * half with it. An earlier version dropped the whole `search` option here and
   * the request silently became a standard search, which is the exact failure
   * sending it twice was meant to prevent.
   */
  searchBody?: boolean;
}

/** One chat request. Throws on a non-OK response or an empty completion. */
async function postChat(
  config: AiConfig,
  messages: { role: string; content: string }[],
  opts: GenerateOptions,
  attempt = 1,
): Promise<string> {
  const model = resolveModel(config, !!opts.webSearch, opts.tier, opts.search?.depth);
  const promptChars = messages.reduce((n, m) => n + m.content.length, 0);
  const startedAt = Date.now();

  /**
   * Every exit from this function goes through here.
   *
   * The whole reason the diagnostic log exists is that a run's search depth once
   * had to be reverse-engineered from a billing page, so the row is written
   * whether the call succeeded, was rejected, or threw — a failure with no row
   * would leave exactly the gap this is meant to close.
   */
  const report = (extra: Partial<Parameters<typeof recordAiCall>[0]>) =>
    recordAiCall({
      model,
      scope: opts.scope,
      tier: opts.tier,
      webSearch: !!opts.webSearch,
      searchDepth: opts.webSearch ? opts.search?.depth || "standard" : undefined,
      searchProvider: opts.search?.provider,
      searchBody: opts.webSearch ? opts.searchBody !== false && !!opts.search : undefined,
      json: !!opts.json,
      attempt,
      durationMs: Date.now() - startedAt,
      promptChars,
      userId: opts.userId,
      ...extra,
    });

  let res: Response;
  try {
    res = await fetch(NANO_GPT_CHAT_URL, {
    method: "POST",
    // Lifts Node's 300s response cap; see `dispatcher` above.
    ...(dispatcher ? { dispatcher } : {}),
    // Without this a stalled generation blocks a Codex indefinitely: the facets
    // are waited on together, so the slowest one sets the pace for all of them.
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
      model: resolveModel(config, !!opts.webSearch, opts.tier, opts.search?.depth),
      temperature: opts.temperature ?? 0.9,
      messages,
      // The documented body form of the search controls. It takes precedence
      // over the model's `:online` suffix, which stays on the model name so an
      // install whose provider ignores this object still searches.
      ...(opts.webSearch && opts.search && opts.searchBody !== false
        ? {
            webSearch: {
              enabled: true,
              ...(opts.search.provider ? { provider: opts.search.provider } : {}),
              ...(opts.search.depth ? { depth: opts.search.depth } : {}),
            },
          }
        : {}),
      // `json_object` rather than a full `json_schema`: it is the widely
      // supported mode, and the shape is already spelled out in the prompt. What
      // it buys is the one failure it was added for — a model narrating its way
      // to an answer, or fencing it, and the reply being discarded as unparseable.
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
    });
  } catch (e: any) {
    // A timeout or a dropped socket never reaches a status code. The cause is
    // recorded rather than the message, because the message is "fetch failed"
    // for every one of them.
    report({ error: describeFetchError(e) });
    throw e;
  }

  if (!res.ok) {
    const err: any = new Error(`NanoGPT error (${res.status}): ${(await res.text().catch(() => "")).slice(0, 300)}`);
    // Carried so the retry decision can read the status rather than parse it
    // back out of the message.
    err.httpStatus = res.status;
    report({ httpStatus: res.status, error: err.message });
    throw err;
  }

  const data: any = await res.json();
  const text = (data.choices?.[0]?.message?.content || "").trim();

  /**
   * `usage` is what the billing page shows, recorded here so nobody has to go
   * and look at the billing page.
   *
   * `injectedTokens` is the derived one and the most useful: retrieval is
   * injected into the prompt before the model sees it, so prompt tokens minus
   * this app's own prompt is the size of the search result. A deep pass shows
   * tens of thousands; a call that quietly fell back to a shallow search shows
   * almost none, and is otherwise indistinguishable.
   */
  const promptTokens = Number(data.usage?.prompt_tokens) || undefined;
  const ownPromptTokens = Math.round(promptChars / 4);
  report({
    httpStatus: res.status,
    promptTokens,
    completionTokens: Number(data.usage?.completion_tokens) || undefined,
    injectedTokens: promptTokens ? Math.max(0, promptTokens - ownPromptTokens) : undefined,
    error: text ? undefined : "empty reply",
  });

  // A 200 with nothing in it is a provider failure wearing a success code, and
  // it is common enough on a loaded model to be worth naming. Every caller
  // treats "" as a failure anyway; throwing here is what lets it be retried
  // instead of silently costing a section.
  if (!text) throw new Error("NanoGPT returned an empty reply.");
  return text;
}

/**
 * Whether a rejection is the provider saying it does not understand one of the
 * optional fields, rather than that the request was wrong.
 *
 * `response_format` and the `webSearch` object are both documented as
 * provider-dependent — "some provider-specific limitations may apply". A model
 * that has never heard of them answers 400, and without this a perfectly good
 * Codex would fail because of a field that was only ever an optimisation.
 */
function rejectsOptionalField(err: any, opts: GenerateOptions): "json" | "search" | null {
  if (err?.httpStatus !== 400 && err?.httpStatus !== 422) return null;
  const message = String(err?.message || "").toLowerCase();
  if (opts.json && /response_format|json_schema|json_object|structured output/.test(message)) return "json";
  // Deliberately narrow. This matched on the bare word "search" once, which is
  // in the text of a great many unrelated errors, and quietly turned the deep
  // pass into a standard one for the rest of the call. Only an error that names
  // the field itself counts.
  if (opts.search && opts.searchBody !== false && /websearch|web_search|unsupported_provider_options/.test(message)) return "search";
  return null;
}

/** Single-turn completion. Throws if the model cannot be reached or says nothing. */
export async function nanoGenerateText(
  config: AiConfig,
  prompt: string,
  opts: GenerateOptions = {},
): Promise<string> {
  const messages: { role: string; content: string }[] = [];
  if (opts.systemPrompt) messages.push({ role: "system", content: opts.systemPrompt });
  messages.push({ role: "user", content: prompt });

  let active = opts;
  for (let attempt = 1; ; attempt++) {
    try {
      return await postChat(config, messages, active, attempt);
    } catch (e: any) {
      // Drop the unsupported field and try again on the same attempt budget.
      // The request still does its job without it; only the safety net is lost.
      const unsupported = rejectsOptionalField(e, active);
      if (unsupported) {
        console.warn(`[ai] the model rejected ${unsupported === "json" ? "JSON mode" : "the search options"}; retrying without`);
        // Only the rejected half is dropped. `search` stays, so the depth still
        // reaches the model suffix and the request does not silently become a
        // shallower search than the caller asked for.
        active = unsupported === "json" ? { ...active, json: false } : { ...active, searchBody: false };
        continue;
      }
      if (attempt >= MAX_ATTEMPTS || !isTransient(e, e?.httpStatus)) throw e;
      // Exponential, with jitter so calls that failed together do not come back
      // together and recreate the burst that failed.
      const wait = Math.round(1500 * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5));
      console.warn(`[ai] ${String(e?.message || e).slice(0, 120)} — retrying in ${wait}ms (${attempt}/${MAX_ATTEMPTS - 1})`);
      await sleep(wait);
    }
  }
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
