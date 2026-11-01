import { cliProxyBaseUrl } from "./cliProxy";

/**
 * Research through CLIProxyAPI's native Codex Responses API. Chat completions
 * do NOT enable web search merely because a prompt asks for it.
 *
 * This adapter deliberately insists on evidence that the upstream actually
 * executed a web_search_call. A memory-only completion must never masquerade
 * as a sourced Codex.
 */
export interface CliProxyResearchResult {
  text: string;
  searched: boolean;
  sources: string[];
  promptTokens?: number;
  completionTokens?: number;
}

type ResearchEvent = { type?: string; [key: string]: any };

function sourceUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : null;
  } catch { return null; }
}

export function createResearchAccumulator() {
  let deltaText = "";
  let completed: any = null;
  let searchCount = 0;
  let failed = "";
  const urls = new Set<string>();

  const addSource = (entry: any) => {
    const url = sourceUrl(typeof entry === "string" ? entry : entry?.url);
    if (url && urls.size < 100) urls.add(url);
  };

  const examineItem = (item: any) => {
    if (!item || typeof item !== "object") return;
    if (item.type === "web_search_call") {
      // A search call can arrive as added, done, and within response.completed;
      // count only once on completion/status, not per streamed event.
      if (item.status === "completed") searchCount = Math.max(searchCount, 1);
      for (const source of item.action?.sources || []) addSource(source);
      for (const source of item.sources || []) addSource(source);
    }
    if (item.type === "message") {
      for (const content of item.content || []) {
        for (const annotation of content.annotations || []) {
          if (annotation.type === "url_citation" || annotation.url) addSource(annotation);
        }
      }
    }
  };

  return {
    onEvent(event: ResearchEvent) {
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        deltaText += event.delta;
      }
      if (event.type === "response.output_item.done") examineItem(event.item);
      if (event.type === "response.web_search_call.completed") searchCount = Math.max(searchCount, 1);
      if (event.type === "response.completed") {
        completed = event.response;
        for (const item of completed?.output || []) examineItem(item);
      }
      if (event.type === "response.failed" || event.type === "response.incomplete") {
        failed = String(event.response?.error?.message || event.response?.incomplete_details?.reason || event.type);
      }
      if (event.type === "error") {
        failed = String(event.message || event.error?.message || "Codex gateway stream failed.");
      }
    },
    finish(): CliProxyResearchResult {
      if (failed) throw new Error(`CLIProxyAPI web search failed: ${failed}`);
      if (!completed || completed.status && completed.status !== "completed") {
        throw new Error("CLIProxyAPI stream ended without a completed Responses result.");
      }
      const outputText = (completed.output || [])
        .filter((item: any) => item?.type === "message")
        .flatMap((item: any) => (item.content || [])
          .filter((part: any) => part?.type === "output_text").map((part: any) => part.text || ""))
        .join("\n");
      const text = outputText || deltaText;
      if (!text.trim()) throw new Error("CLIProxyAPI returned an empty research response.");
      const usage = completed.usage || {};
      return {
        text,
        searched: searchCount > 0,
        sources: [...urls],
        promptTokens: Number(usage.input_tokens) || undefined,
        completionTokens: Number(usage.output_tokens) || undefined,
      };
    },
  };
}

/** Minimal SSE parser with multiline data and CRLF handling. */
export async function readResearchEvents(res: Response): Promise<CliProxyResearchResult> {
  if (!res.body) throw new Error("CLIProxyAPI returned no response stream.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const accumulator = createResearchAccumulator();
  let pending = "";
  const eventBlock = (block: string) => {
    const lines = block.split("\n");
    const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return;
    try { accumulator.onEvent(JSON.parse(data)); }
    catch (e) {
      if (e instanceof SyntaxError) throw new Error("CLIProxyAPI sent invalid SSE JSON.");
      throw e;
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let index: number;
      while ((index = pending.indexOf("\n\n")) >= 0) {
        eventBlock(pending.slice(0, index));
        pending = pending.slice(index + 2);
      }
    }
    pending += decoder.decode();
    if (pending.trim()) eventBlock(pending);
  } finally {
    reader.releaseLock();
  }
  return accumulator.finish();
}

export async function cliProxyResearch(
  config: { apiKey: string; baseUrl?: string; model: string },
  prompt: string,
  timeoutMs = 1_500_000,
): Promise<CliProxyResearchResult> {
  const url = `${cliProxyBaseUrl(config.baseUrl)}/responses`;
  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
      tools: [{ type: "web_search" }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      stream: true,
      store: false,
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    throw new Error(`CLIProxyAPI Responses web search returned HTTP ${response.status}: ${detail}`);
  }
  if (!/text\/event-stream/i.test(response.headers.get("content-type") || "")) {
    throw new Error("CLIProxyAPI did not return an SSE Responses stream.");
  }
  return readResearchEvents(response);
}
