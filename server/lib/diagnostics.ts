import type { Db } from "../context";

/**
 * The diagnostic log: what the server was actually doing when something broke.
 *
 * This exists because of how the Codex was debugged. A dossier came back with
 * three sections missing, another failed outright, and the only evidence
 * available was a screenshot of NanoGPT's billing page — from which the search
 * depth had to be reverse-engineered by subtracting token costs from the total.
 * That worked, and it should never have been necessary.
 *
 * So there are two channels, because the questions are different:
 *
 *   INTERNAL  what the app did. Jobs starting and finishing, things being
 *             skipped, anything that threw. This is the console output the
 *             server has always produced, captured instead of scrolling away.
 *   AI        one row per request to the model, with everything the billing page
 *             would have told us and several things it would not: the resolved
 *             model name including its search suffix, the depth requested, the
 *             tokens in and out, how long it took, which attempt it was, and
 *             whether the retrieval actually came back with anything.
 *
 * Deliberately not a file on disk. It is in the database because the person who
 * needs it is an admin looking at a settings page, not someone with a shell on
 * the box — and because half the point is being able to export the thing and
 * read it somewhere else.
 */

export type LogChannel = "internal" | "ai";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface DiagnosticRecord {
  channel: LogChannel;
  level: LogLevel;
  /** The subsystem: codex, images, autotag, http, boot… */
  scope?: string;
  message: string;
  userId?: string | null;
  /** Anything structured worth keeping. Serialised to JSON, secrets stripped. */
  detail?: any;
}

/**
 * How many rows are kept.
 *
 * Enough to cover a few days of ordinary use and every call of a long debugging
 * session, small enough that nobody has to think about it. The table is trimmed
 * on a schedule rather than on every insert, because logging must never be the
 * expensive part of the thing it is watching.
 */
const MAX_ROWS = 20_000;
const TRIM_EVERY = 200;

/**
 * How many prompt/reply pairs are kept, and how big each may be.
 *
 * Far fewer than log rows, because they are thousands of times larger. The reply
 * cap is deliberately generous: the question these exist to answer is "was this
 * cut off or just malformed", and a reply trimmed by the log on its way in
 * cannot answer it — the end is exactly the part that matters. A full Codex
 * dossier is around 120KB, so 512KB holds one whole with room to spare.
 */
const MAX_PAYLOADS = 300;
const MAX_PROMPT_BYTES = 128 * 1024;
const MAX_REPLY_BYTES = 512 * 1024;

let db: Db | null = null;
let insert: any = null;
let insertPayload: any = null;
let sinceTrim = 0;
let sincePayloadTrim = 0;

/**
 * Re-entrancy guard.
 *
 * Console output is captured, and this module writes to the database, and a
 * database error would be reported to the console. Without this flag that is an
 * infinite loop that takes the server with it.
 */
let writing = false;

/**
 * Whether a field name means the value is a credential.
 *
 * "token" needs care and was originally wrong here: a bare substring match
 * redacted `promptTokens` and `completionTokens`, silently blanking the two
 * numbers the AI log exists to record. So it counts as a credential only when it
 * stands alone or is qualified by something that makes it one — `accessToken`
 * yes, `promptTokens` no.
 */
function isSecretKey(key: string): boolean {
  const k = key.toLowerCase();
  if (/(api[-_]?key|apikey|secret|password|passwd|passphrase|credential|authorization|cookie)/.test(k)) return true;
  return /^(token|bearer|auth)$/.test(k) || /(access|refresh|auth|api|bearer|session|csrf|id)[-_]?token$/.test(k);
}

/** Anything shaped like a credential, wherever it turns up in free text. */
const SECRET_VALUE = [
  /\bsk-[A-Za-z0-9-]{16,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi,
  /\b[A-Za-z0-9._-]{8,}\.[A-Za-z0-9._-]{8,}\.[A-Za-z0-9._-]{8,}\b/g,
];

/**
 * Strips credentials out of anything on its way into the log.
 *
 * Not optional politeness. This log is exportable by design — the whole point is
 * being able to send it somewhere — and a NanoGPT key has already been leaked
 * once in this project by sharing a debugging artefact that quietly contained
 * one. A log that cannot be shared safely is a log nobody shares, and a log that
 * can be shared unsafely is worse.
 */
export function redact(value: any, depth = 0): any {
  if (depth > 6) return "[deep]";
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    let out = value;
    for (const pattern of SECRET_VALUE) out = out.replace(pattern, "[redacted]");
    return out.length > 4000 ? `${out.slice(0, 4000)}… [${out.length} chars]` : out;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (value instanceof Error) {
    return { name: value.name, message: redact(value.message, depth + 1), stack: redact(value.stack, depth + 1) };
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));

  if (typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = isSecretKey(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

/** Wires the log to the database. Until this runs, everything is a no-op. */
export function initDiagnostics(database: Db) {
  db = database;
  insert = db.prepare(
    `INSERT INTO diagnostics (ts, channel, level, scope, message, userId, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  insertPayload = db.prepare(
    `INSERT INTO diagnostics_payloads
       (callId, ts, scope, prompt, reply, promptBytes, replyBytes, promptTruncated, replyTruncated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(callId) DO UPDATE SET
       reply = excluded.reply,
       replyBytes = excluded.replyBytes,
       replyTruncated = excluded.replyTruncated`,
  );

  /**
   * The failures nobody catches.
   *
   * A rejected promise with no handler prints to stderr and is gone — and a
   * background job (a Codex, an image, an auto-tag) is exactly the kind of thing
   * that produces one, because nobody is awaiting it. These are the events most
   * likely to explain "it just stopped working" and the least likely to have
   * been seen by anyone.
   */
  process.on("unhandledRejection", (reason: any) => {
    record({
      channel: "internal", level: "error", scope: "crash",
      message: `Unhandled promise rejection: ${reason?.message || reason}`,
      detail: reason,
    });
  });
  process.on("uncaughtException", (err: any) => {
    record({
      channel: "internal", level: "error", scope: "crash",
      message: `Uncaught exception: ${err?.message || err}`,
      detail: err,
    });
  });
}

/**
 * Records every failed HTTP response.
 *
 * Almost every route in this app ends `catch (e) { res.status(500).json({ error:
 * String(e) }) }`. That is a real error, it reaches the browser, and until now
 * it left no trace anywhere on the server — so a user reporting "it didn't work"
 * left nothing to look at. This hooks the response rather than relying on an
 * error-handling middleware, because the routes never call `next(err)`.
 */
export function httpDiagnostics() {
  return (req: any, res: any, next: any) => {
    const startedAt = Date.now();
    const originalJson = res.json.bind(res);

    res.json = (body: any) => {
      try {
        if (res.statusCode >= 400) {
          record({
            channel: "internal",
            level: res.statusCode >= 500 ? "error" : "warn",
            scope: "http",
            message: `${res.statusCode} ${req.method} ${req.path} — ${String(body?.error || "").slice(0, 300)}`,
            detail: {
              method: req.method,
              path: req.path,
              status: res.statusCode,
              durationMs: Date.now() - startedAt,
              // The body is where a route's own error text lives; the query is
              // often what made it fail. Both go through the redactor.
              query: req.query,
              response: body,
            },
          });
        }
      } catch {
        /* never break a response to log it */
      }
      return originalJson(body);
    };

    next();
  };
}

/** Writes one row. Never throws — a broken log must not break the app. */
export function record(entry: DiagnosticRecord): void {
  if (!db || !insert || writing) return;
  writing = true;
  try {
    let detail: string | null = null;
    if (entry.detail !== undefined && entry.detail !== null) {
      try {
        detail = JSON.stringify(redact(entry.detail));
      } catch {
        detail = null;
      }
    }
    insert.run(
      new Date().toISOString(),
      entry.channel,
      entry.level,
      entry.scope || null,
      String(redact(entry.message ?? "")),
      entry.userId || null,
      detail,
    );

    if (++sinceTrim >= TRIM_EVERY) {
      sinceTrim = 0;
      db.prepare(
        `DELETE FROM diagnostics WHERE id <= (
           SELECT id FROM diagnostics ORDER BY id DESC LIMIT 1 OFFSET ?
         )`,
      ).run(MAX_ROWS);
    }
  } catch {
    // Swallowed on purpose. There is nowhere to report a logging failure to
    // that would not itself be logging.
  } finally {
    writing = false;
  }
}

/**
 * Scrubs credentials without shortening anything.
 *
 * `redact` caps every string at 4,000 characters, which is right for a log
 * message and destroys the one thing a stored reply is for: whether it ends
 * mid-sentence. This applies the same credential patterns and leaves the length
 * alone, so the end of the document is still there to look at.
 */
function scrub(text: string): string {
  let out = text;
  for (const pattern of SECRET_VALUE) out = out.replace(pattern, "[redacted]");
  return out;
}

/** Cuts a string to a byte budget, saying whether it had to. */
function cap(text: string, maxBytes: number): { text: string; bytes: number; truncated: boolean } {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= maxBytes) return { text, bytes, truncated: false };
  // Cut from the MIDDLE, not the end. Both ends carry the evidence — the start
  // says what was asked and the last characters say whether the answer finished
  // — and dropping the tail would defeat the point.
  const keep = Math.floor(maxBytes / 2);
  const head = Buffer.from(text, "utf8").subarray(0, keep).toString("utf8");
  const tail = Buffer.from(text, "utf8").subarray(bytes - keep).toString("utf8");
  return {
    text: `${head}\n\n… [${(bytes - maxBytes).toLocaleString()} bytes omitted from the middle] …\n\n${tail}`,
    bytes,
    truncated: true,
  };
}

/**
 * Stores what was actually sent and what actually came back.
 *
 * The log could say a reply was 14,572 tokens and would not say whether those
 * tokens were a complete document or one that stopped mid-array — which is the
 * difference between "ask for more room" and "the model wrote bad JSON", and
 * those have opposite fixes.
 */
export function recordPayload(
  callId: string,
  scope: string | undefined,
  parts: { prompt?: string; reply?: string },
): void {
  if (!db || !insertPayload || writing) return;
  writing = true;
  try {
    const p = parts.prompt !== undefined ? cap(scrub(parts.prompt), MAX_PROMPT_BYTES) : null;
    const r = parts.reply !== undefined ? cap(scrub(parts.reply), MAX_REPLY_BYTES) : null;

    insertPayload.run(
      callId,
      new Date().toISOString(),
      scope || null,
      p?.text ?? null,
      r?.text ?? null,
      p?.bytes ?? null,
      r?.bytes ?? null,
      p?.truncated ? 1 : 0,
      r?.truncated ? 1 : 0,
    );

    if (++sincePayloadTrim >= 25) {
      sincePayloadTrim = 0;
      db.prepare(
        `DELETE FROM diagnostics_payloads WHERE ts <= (
           SELECT ts FROM diagnostics_payloads ORDER BY ts DESC LIMIT 1 OFFSET ?
         )`,
      ).run(MAX_PAYLOADS);
    }
  } catch {
    // As everywhere else here: a failure to log must not become a failure.
  } finally {
    writing = false;
  }
}

/** One AI request, as it actually went out and came back. */
export interface AiCallRecord {
  /**
   * Ties the "started" row to the "finished" row.
   *
   * Without a pair there is no way to tell a call that is still running from one
   * that died without a word — the process was killed, the container restarted,
   * the machine went to sleep. Both look identical from a log that only writes a
   * row when an answer arrives: nothing at all.
   */
  callId?: string;
  /** Which half of the pair this row is. */
  phase?: "start" | "end";
  /** The resolved model name, including any `:online/...` suffix. */
  model: string;
  scope?: string;
  tier?: string;
  webSearch?: boolean;
  /** The depth asked for, whether or not the provider honoured it. */
  searchDepth?: string;
  searchProvider?: string;
  /** Whether the `webSearch` body object was sent alongside the suffix. */
  searchBody?: boolean;
  json?: boolean;
  attempt: number;
  durationMs: number;
  httpStatus?: number;
  promptChars: number;
  promptTokens?: number;
  completionTokens?: number;
  /**
   * How much of the output was the model thinking rather than answering.
   *
   * Billed as output and spent from the same ceiling, so on a thinking model it
   * competes with the answer. When a reply comes back truncated this is the
   * number that says which of the two ran out of room.
   */
  reasoningTokens?: number;
  /** "stop" when the model finished; "length" when it was cut off. */
  finishReason?: string;
  /**
   * Roughly how much retrieved material came back injected.
   *
   * The single most useful number here, and the one that took a billing
   * screenshot and a spreadsheet to work out the first time. Retrieval is
   * injected into the prompt before the model sees it, so the gap between the
   * prompt this app built and the prompt the provider billed for IS the search
   * result. A deep pass showed 39,000 prompt tokens against a 7,700-token
   * prompt; the runs that silently degraded to a shallow search showed almost
   * none, and looked identical in every other respect.
   */
  injectedTokens?: number;
  error?: string;
  /** Whether the reply was streamed. */
  stream?: boolean;
  /** Set when an unsupported option was dropped and the call retried without it. */
  downgraded?: string;
  userId?: string | null;
}

/** Short, readable, and unique enough to pair two rows minutes apart. */
let callSeq = 0;
export function nextCallId(): string {
  callSeq = (callSeq + 1) % 100000;
  return `${Date.now().toString(36)}-${callSeq.toString(36)}`;
}

/**
 * Records that a request has gone out, before anything comes back.
 *
 * The log used to write one row per call, at the end. That answers "what
 * happened" and cannot answer "is it still going" — which is the question
 * actually being asked while a Codex sits there for five minutes, and the only
 * question that matters when a call never returns at all.
 */
export function recordAiCallStart(call: Omit<AiCallRecord, "durationMs">): void {
  const label = [
    call.model,
    call.searchDepth && call.webSearch ? `search:${call.searchDepth}` : call.webSearch ? "search" : "",
    call.json ? "json" : "",
    call.stream ? "streamed" : "",
    (call.attempt ?? 1) > 1 ? `attempt ${call.attempt}` : "",
  ].filter(Boolean).join(" · ");

  record({
    // Debug, so "Info and above" hides the starts and shows only outcomes. The
    // in-flight view reads them regardless of level.
    channel: "ai",
    level: "debug",
    scope: call.scope || "ai",
    message: `${label} — started, ${call.promptChars.toLocaleString()} chars sent`,
    userId: call.userId,
    detail: { ...call, phase: "start" },
  });
}

export function recordAiCall(call: AiCallRecord): void {
  const failed = !!call.error;
  const label = [
    call.model,
    call.searchDepth && call.webSearch ? `search:${call.searchDepth}` : call.webSearch ? "search" : "",
    call.json ? "json" : "",
    call.stream ? "streamed" : "",
    call.attempt > 1 ? `attempt ${call.attempt}` : "",
  ].filter(Boolean).join(" · ");

  record({
    channel: "ai",
    level: failed ? "error" : "info",
    scope: call.scope || "ai",
    message: failed
      ? `${label} — failed after ${Math.round(call.durationMs)}ms: ${call.error}`
      : `${label} — ${call.promptTokens ?? "?"} in / ${call.completionTokens ?? "?"} out in ${Math.round(call.durationMs / 100) / 10}s`,
    userId: call.userId,
    detail: { ...call, phase: "end" },
  });
}

/** The shorthand the rest of the server uses. */
export const diag = {
  debug: (scope: string, message: string, detail?: any) =>
    record({ channel: "internal", level: "debug", scope, message, detail }),
  info: (scope: string, message: string, detail?: any) =>
    record({ channel: "internal", level: "info", scope, message, detail }),
  warn: (scope: string, message: string, detail?: any) =>
    record({ channel: "internal", level: "warn", scope, message, detail }),
  error: (scope: string, message: string, detail?: any) =>
    record({ channel: "internal", level: "error", scope, message, detail }),
};

/**
 * Turns one console argument into something printable and storable.
 *
 * Errors keep their stack, because the stack is usually the whole answer and
 * `String(err)` throws it away.
 */
function stringifyArg(arg: any): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack || ""}`;
  try {
    return JSON.stringify(redact(arg));
  } catch {
    return String(arg);
  }
}

/** A leading `[tag]` names the subsystem, which is a convention already in use. */
function scopeFrom(text: string): { scope: string; message: string } {
  const m = text.match(/^\[([a-z0-9_.-]{1,24})\]\s*/i);
  if (!m) return { scope: "app", message: text };
  return { scope: m[1].toLowerCase(), message: text.slice(m[0].length) };
}

/**
 * Captures everything already written to the console.
 *
 * The alternative was adding explicit logging calls to several hundred existing
 * sites, which would have been mostly mechanical, entirely error-prone, and
 * would have missed every one added afterwards. The console output was already
 * the diagnostic record; it was just being thrown away when the terminal
 * scrolled. This keeps it, and still prints it, so nothing about running the
 * server in a terminal changes.
 */
export function captureConsole(): void {
  const levels: [LogLevel, "log" | "info" | "warn" | "error"][] = [
    ["info", "log"],
    ["info", "info"],
    ["warn", "warn"],
    ["error", "error"],
  ];

  for (const [level, method] of levels) {
    const original = (console as any)[method].bind(console);
    (console as any)[method] = (...args: any[]) => {
      original(...args);
      try {
        const text = args.map(stringifyArg).join(" ");
        if (!text.trim()) return;
        const { scope, message } = scopeFrom(text);
        // `[ai]` lines are about a model call and belong with the model calls.
        record({ channel: scope === "ai" ? "ai" : "internal", level, scope, message });
      } catch {
        /* never let logging break the thing it is logging */
      }
    };
  }
}
