import type { Db } from "../context";
import { Agent } from "undici";
import { searchProviderById, SEARCH_PROVIDERS } from "../../src/lib/searchProviders";
import { recordAiCall, recordAiCallStart, nextCallId, recordPayload } from "./diagnostics";

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
  /** Which deep-search backend the Codex researches with. See SEARCH_PROVIDERS. */
  searchProvider?: string;
}

/** Which job a call is doing, and therefore which model it should land on. */
export type AiTier = "analytical" | "creative";

/** Reads the NanoGPT key/models for a user, falling back to the system-wide settings. */
export function getAiConfig(db: Db, userId: string): AiConfig | null {
  const cols = "nanoGptApiKey, nanoGptModel, nanoGptWebModel, nanoGptCreativeModel, nanoGptProvider, nanoGptSearchProvider";
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
  const searchProvider = (userSettings?.nanoGptSearchProvider || sysSettings?.nanoGptSearchProvider || "").trim();
  return { apiKey, model, webModel, creativeModel, provider, searchProvider };
}

export function resolveModel(
  config: AiConfig,
  webSearch: boolean,
  tier: AiTier = "analytical",
  /** The actual search options THIS call is making, not the account default. */
  search?: SearchOptions,
): string {
  // Search wins over tier: a creative call that still needs to look something up
  // has to run on the model the search results are being injected into.
  if (webSearch) {
    const base = config.webModel.trim();
    // Don't double-suffix if the configured name already opts in.
    if (/:online\b/.test(base)) return base;
    if (!search?.depth || search.depth === "standard") return `${base}:online`;
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
     *
     * THE MATCH IS ON `search`, NOT ON THE ACCOUNT DEFAULT. This used to look up
     * the suffix from `config.searchProvider` regardless of what was actually
     * being asked for, so a caller that deliberately picked a DIFFERENT backend
     * for one call — the whole point of a retry that switches to a fallback
     * after the primary one retrieved nothing — got a request whose body asked
     * for the fallback and whose model suffix still named the one that had just
     * failed. Whichever the provider actually honours, sending a mismatched pair
     * defeats the fallback outright.
     */
    const matched = search.provider
      ? SEARCH_PROVIDERS.find((p) => p.provider === search.provider && p.depth === search.depth)
      : undefined;
    const chosen = matched || searchProviderById(config.searchProvider);
    return `${base}:online/${chosen.suffix}`;
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
  /**
   * A plain string rather than a union, because the providers do not agree on
   * the vocabulary: most take "standard" or "deep", and Exa's deepest mode is
   * called "deep-reasoning". Which values are valid is the provider's business,
   * and SEARCH_PROVIDERS is where the correct pairings live.
   */
  depth?: string;
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
   * Ceiling on generated tokens.
   *
   * Not optional in practice, whatever the API says. Omitting it hands the
   * decision to the provider, and the provider's answer for this model was
   * 15,000 — which truncated a Codex mid-document, mid-array, with a 200 and no
   * error anywhere. The reply came back exactly 15000 tokens long, which is not
   * a number a model stops on by itself.
   */
  maxTokens?: number;
  /**
   * Receive the reply as it is written, rather than in one piece at the end.
   *
   * Nothing here displays a stream — the reason is that the connection survives.
   * A non-streamed request sends no bytes at all while the model works, and
   * something in the path between here and the model hangs up on a silent
   * connection after 340 seconds: three Codex attempts failed at 340,029ms,
   * 340,029ms and 340,062ms with `UND_ERR_SOCKET: other side closed`, while the
   * one that succeeded took 319 seconds. Twenty seconds of headroom is not a
   * margin, it is a coin toss.
   *
   * Streaming keeps tokens flowing the whole time, so there is no silence to
   * time out, and the request is bounded by our own clock again.
   */
  stream?: boolean;
  /**
   * none | minimal | low | medium | high | xhigh.
   *
   * Reasoning tokens are billed as output AND count against `maxTokens`, so on a
   * thinking model they compete directly with the answer for the same budget.
   * Left unset by default, which keeps whatever the model does normally.
   */
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
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
  /**
   * Told how much of the search actually landed, once the call succeeds.
   *
   * Added after a dossier came back thin twice in a row for The Grand Tour, and
   * the only way to find out why was to export the raw log and manually subtract
   * token counts by hand: `injectedTokens` was 0 on both attempts, meaning the
   * deep search retrieved nothing at all — not "found only official sources",
   * actually nothing. A caller that can see this number can react to it (retry
   * with a different depth, say so on the record) instead of every future
   * instance of this needing the same manual arithmetic again.
   */
  onUsage?: (usage: { promptTokens?: number; completionTokens?: number; reasoningTokens?: number; injectedTokens?: number; finishReason?: string }) => void;
}

/**
 * Reads a Server-Sent Events reply, assembling the answer from its deltas.
 *
 * `delta.reasoning_content` is deliberately not collected. A thinking model
 * streams its working on that field and the answer on `content`, so taking only
 * `content` keeps the reasoning out of what gets parsed as JSON — the problem
 * `parseJsonLoose` had to strip `<think>` blocks for.
 */
async function readEventStream(res: Response): Promise<{ text: string; finishReason: string; usage: any }> {
  const reader = (res.body as any)?.getReader?.();
  if (!reader) throw new Error("The streamed reply had no body.");

  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let finishReason = "";
  let usage: any = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Events are newline-delimited, and a chunk can end mid-line, so whatever is
    // left after the last newline stays in the buffer for the next read.
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;

      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const chunk = JSON.parse(payload);
        const choice = chunk.choices?.[0];
        if (typeof choice?.delta?.content === "string") text += choice.delta.content;
        if (choice?.finish_reason) finishReason = String(choice.finish_reason);
        // Sent once at the end when stream_options.include_usage is set.
        if (chunk.usage) usage = chunk.usage;
      } catch {
        // A keepalive or a comment line. Not every `data:` is a chunk.
      }
    }
  }

  return { text: text.trim(), finishReason, usage };
}

/** One chat request. Throws on a non-OK response or an empty completion. */
async function postChat(
  config: AiConfig,
  messages: { role: string; content: string }[],
  opts: GenerateOptions,
  attempt = 1,
): Promise<string> {
  const model = resolveModel(config, !!opts.webSearch, opts.tier, opts.search);
  const promptChars = messages.reduce((n, m) => n + m.content.length, 0);
  const startedAt = Date.now();
  const callId = nextCallId();

  /** Everything both rows share, so the pair cannot describe different calls. */
  const shape = {
    callId,
    model,
    scope: opts.scope,
    tier: opts.tier,
    webSearch: !!opts.webSearch,
    searchDepth: opts.webSearch ? opts.search?.depth || "standard" : undefined,
    searchProvider: opts.search?.provider,
    searchBody: opts.webSearch ? opts.searchBody !== false && !!opts.search : undefined,
    json: !!opts.json,
    stream: !!opts.stream,
    attempt,
    promptChars,
    userId: opts.userId,
  };

  // Written before the request goes out, so a call that never comes back still
  // left a mark. Until this existed, a killed process looked exactly like a
  // process that had never been asked to do anything.
  recordAiCallStart(shape);

  // The prompt is stored the moment it goes out, so a call that never comes back
  // still leaves behind what it was asked to do.
  recordPayload(callId, opts.scope, {
    prompt: messages.map((m) => `[${m.role}]\n${m.content}`).join("\n\n"),
  });

  /**
   * Every exit from this function goes through here.
   *
   * The whole reason the diagnostic log exists is that a run's search depth once
   * had to be reverse-engineered from a billing page, so the row is written
   * whether the call succeeded, was rejected, or threw — a failure with no row
   * would leave exactly the gap this is meant to close.
   */
  const report = (extra: Partial<Parameters<typeof recordAiCall>[0]>) =>
    recordAiCall({ ...shape, durationMs: Date.now() - startedAt, ...extra });

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
      model: resolveModel(config, !!opts.webSearch, opts.tier, opts.search),
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
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      ...(opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}),
      // Streaming is not about showing progress here; it is about the connection
      // staying alive. See `stream` in GenerateOptions.
      ...(opts.stream ? { stream: true, stream_options: { include_usage: true } } : {}),
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
    const body = await res.text().catch(() => "");
    const err: any = new Error(`NanoGPT error (${res.status}): ${body.slice(0, 300)}`);
    // Carried so the retry decision can read the status rather than parse it
    // back out of the message.
    err.httpStatus = res.status;
    // The error body in full, not the 300 characters the message can hold —
    // a provider's explanation of a rejection is usually longer than that.
    recordPayload(callId, opts.scope, { reply: body });
    report({ httpStatus: res.status, error: err.message });
    throw err;
  }

  /**
   * A streamed reply and a plain one are both accepted, whatever was asked for.
   *
   * The content type decides, not the request: a provider that quietly ignores
   * `stream` sends ordinary JSON, and that has to keep working rather than
   * failing to parse.
   */
  let text: string;
  let finishReasonRaw: string;
  let usage: any;

  if (/text\/event-stream/i.test(res.headers.get("content-type") || "")) {
    const streamed = await readEventStream(res);
    text = streamed.text;
    finishReasonRaw = streamed.finishReason;
    usage = streamed.usage;
  } else {
    const data: any = await res.json();
    const choice = data.choices?.[0] || {};
    text = (choice.message?.content || "").trim();
    finishReasonRaw = String(choice.finish_reason || "");
    usage = data.usage;
  }

  /**
   * The provider says outright when it ran out of room, and this used to ignore
   * it.
   *
   * `finish_reason: "length"` means the reply is cut off mid-sentence. Handed to
   * a lenient JSON parser that answer does not fail — it yields whichever
   * fragment happens to be balanced, which for a truncated dossier was a single
   * character object. That parsed, satisfied every check, and was written to the
   * database as a Codex containing nothing at all.
   */
  const finishReason = finishReasonRaw;

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
  const promptTokens = Number(usage?.prompt_tokens) || undefined;
  const ownPromptTokens = Math.round(promptChars / 4);
  const truncated = finishReason === "length";
  report({
    httpStatus: res.status,
    promptTokens,
    completionTokens: Number(usage?.completion_tokens) || undefined,
    // Reasoning is billed as output and spends the same budget as the answer, so
    // when a reply is truncated this is the number that says whether the model
    // ran out of room to think or ran out of room to answer.
    reasoningTokens: Number(usage?.completion_tokens_details?.reasoning_tokens) || undefined,
    finishReason: finishReason || undefined,
    injectedTokens: promptTokens ? Math.max(0, promptTokens - ownPromptTokens) : undefined,
    error: truncated ? "truncated (finish_reason=length)" : text ? undefined : "empty reply",
  });

  opts.onUsage?.({
    promptTokens,
    completionTokens: Number(usage?.completion_tokens) || undefined,
    reasoningTokens: Number(usage?.completion_tokens_details?.reasoning_tokens) || undefined,
    injectedTokens: promptTokens ? Math.max(0, promptTokens - ownPromptTokens) : undefined,
    finishReason: finishReason || undefined,
  });

  recordPayload(callId, opts.scope, { reply: text });

  if (truncated) {
    const err: any = new Error(
      `The reply was cut off at the token limit (${usage?.completion_tokens ?? "?"} tokens` +
      `${opts.maxTokens ? `, asked for up to ${opts.maxTokens}` : ", no max_tokens was sent"}).`,
    );
    // Not transient: asking again produces the same length. The caller has to
    // ask for more room, or for less output.
    err.truncated = true;
    throw err;
  }

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
function rejectsOptionalField(err: any, opts: GenerateOptions): "json" | "search" | "maxTokens" | null {
  if (err?.httpStatus !== 400 && err?.httpStatus !== 422) return null;
  const message = String(err?.message || "").toLowerCase();
  if (opts.json && /response_format|json_schema|json_object|structured output/.test(message)) return "json";
  // A ceiling above what the model will accept. Asking for less is always
  // possible, so this degrades rather than failing — a shorter dossier beats
  // none, and the alternative is picking a number timid enough to be safe
  // everywhere, which is what truncated one in the first place.
  if (opts.maxTokens && /max_tokens|max tokens|maximum.{0,20}tokens|too large|exceeds/.test(message)) return "maxTokens";
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
    const attemptStartedAt = Date.now();
    try {
      return await postChat(config, messages, active, attempt);
    } catch (e: any) {
      // Drop the unsupported field and try again on the same attempt budget.
      // The request still does its job without it; only the safety net is lost.
      const unsupported = rejectsOptionalField(e, active);
      if (unsupported === "maxTokens") {
        const halved = Math.max(8_000, Math.floor((active.maxTokens || 16_000) / 2));
        console.warn(`[ai] the model rejected max_tokens=${active.maxTokens}; retrying with ${halved}`);
        active = { ...active, maxTokens: halved };
        continue;
      }
      if (unsupported) {
        console.warn(`[ai] the model rejected ${unsupported === "json" ? "JSON mode" : "the search options"}; retrying without`);
        // Only the rejected half is dropped. `search` stays, so the depth still
        // reaches the model suffix and the request does not silently become a
        // shallower search than the caller asked for.
        active = unsupported === "json" ? { ...active, json: false } : { ...active, searchBody: false };
        continue;
      }
      /**
       * A failure that took minutes is not a blip, whatever it says.
       *
       * `fetch failed` reads as transient and gets retried, which is right for a
       * connection refused in 20ms and badly wrong for one dropped after five
       * and a half minutes of work: three of those turned a doomed Codex into a
       * seventeen-minute wait, and every attempt failed at the same 340 seconds.
       * If the request got far enough to spend real time, repeating it verbatim
       * is not the answer.
       */
      const spent = Date.now() - attemptStartedAt;
      if (spent > 120_000) {
        console.warn(`[ai] not retrying — the attempt already ran for ${Math.round(spent / 1000)}s before failing`);
        throw e;
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
