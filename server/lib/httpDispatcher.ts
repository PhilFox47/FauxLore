import { Agent } from "undici";

/**
 * Node's own five-minute cap on a request, removed.
 *
 * `fetch` waits 300 seconds for the response headers and then aborts. That is
 * fine for an ordinary API and completely wrong for a non-streamed NanoGPT
 * chat completion: the provider sends nothing at all until the model has
 * finished writing, and a long generation — a Codex's deep search, a yearly
 * recap synthesised from a whole year of logs — routinely takes longer than
 * five minutes to reach that point. First measured on the Codex's own calls,
 * where Node killed the connection at 300,783ms and reported it as a plain
 * "fetch failed"; the same failure, at 300,785ms and 300,808ms, later turned
 * up on the client-facing chat/completions proxy (routes/ai.ts) — the one
 * behind recap generation — which was making its own bare `fetch` and had
 * never been given this fix at all.
 *
 * Both timeouts are disabled so `AbortSignal.timeout` on the call itself is
 * the only clock. `connectTimeout` stays short, because failing to reach the
 * host at all is a genuinely different problem and should still fail fast.
 *
 * Imported statically rather than with `require`, which was the first
 * attempt and silently did nothing: this package is ESM, so `require` is not
 * defined, the construction threw, and the dispatcher stayed unset — the
 * five-minute cap was still in force everywhere the server ran from source.
 * Only the bundled build would have worked, which is the worst kind of
 * half-fix.
 */
export let longRequestDispatcher: Agent | undefined;
try {
  longRequestDispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0, connectTimeout: 30_000 });
} catch (e) {
  console.warn("[http] Could not raise the HTTP timeout; long requests may be cut off at five minutes", e);
}
