import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { AI_CHAT_JSON_MAX_BYTES, installRequestBodyParsers } from "./requestBodyParsers";

test("long Wrapped research prompts pass the chat proxy but not ordinary APIs", async () => {
  const app = express();
  installRequestBodyParsers(app);
  app.post("/api/nano-gpt/chat/completions", (req, res) => {
    res.json({ received: req.body.messages[0].content.length });
  });
  app.post("/api/ordinary", (req, res) => {
    res.json({ received: req.body.messages[0].content.length });
  });

  const server = app.listen(0);
  try {
    const base = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
    const send = (endpoint: string, content: string) => fetch(base + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-6.1-terra", messages: [{ role: "user", content }] }),
    });

    // Regression for the October Wrapped: multiple months of raw logs and
    // earlier editorials must get past the transport before provider limits.
    const longContext = "Journal Thoughts and older sessions. ".repeat(7000);
    assert.ok(Buffer.byteLength(longContext, "utf8") > 100 * 1024);
    const chatResponse = await send("/api/nano-gpt/chat/completions", longContext);
    assert.equal(chatResponse.status, 200);
    assert.deepEqual(await chatResponse.json(), { received: longContext.length });

    const ordinaryResponse = await send("/api/ordinary", longContext);
    assert.equal(ordinaryResponse.status, 413);
    assert.match((await ordinaryResponse.json()).error, /default request-size limit/);

    const tooBig = await send("/api/nano-gpt/chat/completions", "x".repeat(AI_CHAT_JSON_MAX_BYTES));
    assert.equal(tooBig.status, 413);
    assert.match((await tooBig.json()).error, /4 MiB transport limit/);

    const shortResponse = await send("/api/ordinary", "A normal log");
    assert.equal(shortResponse.status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});
