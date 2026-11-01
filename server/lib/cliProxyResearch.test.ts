import test from "node:test";
import assert from "node:assert/strict";
import { createResearchAccumulator, readResearchEvents } from "./cliProxyResearch";

const citation = "https://docs.example.org/verified/source";
const completed = {
  status: "completed",
  output: [
    { type: "web_search_call", status: "completed", action: { sources: [{ url: citation }] } },
    { type: "message", content: [{ type: "output_text", text: '{"premise":"Verified fact"}',
      annotations: [{ type: "url_citation", url: citation }] }] },
  ],
  usage: { input_tokens: 230, output_tokens: 140 },
};

test("requires a completed response and records native searched sources", () => {
  const a = createResearchAccumulator();
  a.onEvent({ type: "response.output_item.done", item: completed.output[0] });
  a.onEvent({ type: "response.completed", response: completed });
  assert.deepEqual(a.finish(), {
    text: '{"premise":"Verified fact"}',
    searched: true, sources: [citation], promptTokens: 230, completionTokens: 140,
  });
});

test("memory-only completion is explicitly marked as not searched", () => {
  const a = createResearchAccumulator();
  a.onEvent({ type: "response.completed", response: { ...completed, output: [completed.output[1]] } });
  assert.equal(a.finish().searched, false);
});

test("aborted or incomplete research cannot be treated as a successful dossier", () => {
  const a = createResearchAccumulator();
  a.onEvent({ type: "response.incomplete", response: { incomplete_details: { reason: "max_output_tokens" } } });
  assert.throws(() => a.finish(), /max_output_tokens/);
});

test("parses SSE frames split across multiple chunks", async () => {
  const frame = 'data: ' + JSON.stringify({ type: "response.completed", response: completed }) + '\n\n';
  const bytes = new TextEncoder().encode(frame);
  const chunks = [bytes.slice(0, 9), bytes.slice(9, 26), bytes.slice(26)];
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  const value = await readResearchEvents(new Response(stream, { headers: { "content-type": "text/event-stream" } }));
  assert.equal(value.searched, true);
  assert.equal(value.sources[0], citation);
});
