import test from "node:test";
import assert from "node:assert/strict";
import { cliProxyBaseUrl, cliProxyImagePrompt, cliProxyImageSize } from "./cliProxy";

test("gateway URL normalization keeps one /v1 suffix", () => {
  assert.equal(cliProxyBaseUrl("http://cli-proxy-api:8317"), "http://cli-proxy-api:8317/v1");
  assert.equal(cliProxyBaseUrl("http://cli-proxy-api:8317/v1/"), "http://cli-proxy-api:8317/v1");
  assert.equal(cliProxyBaseUrl("https://example.org/proxy/v1"), "https://example.org/proxy/v1");
  assert.throws(() => cliProxyBaseUrl("file:///etc/passwd"), /Invalid/);
  assert.throws(() => cliProxyBaseUrl("http://person:secret@localhost:3002"), /Invalid/);
});

test("GPT image sizes preserve aspect ratio rather than passing arbitrary diffusion dimensions", () => {
  assert.equal(cliProxyImageSize("1024x768"), "1536x1024");
  assert.equal(cliProxyImageSize("768x1024"), "1024x1536");
  assert.equal(cliProxyImageSize("1024x1024"), "1024x1024");
  assert.equal(cliProxyImageSize("832×1216"), "1024x1536");
  assert.equal(cliProxyImageSize("invalid"), "1024x1024");
});

test("negative constraints become prompt prose, not unsupported diffusion parameters", () => {
  assert.equal(cliProxyImagePrompt("cat", ""), "cat");
  const prompt = cliProxyImagePrompt("cat", "watermark, extra limbs");
  assert.match(prompt, /^cat/);
  assert.match(prompt, /avoid watermark, extra limbs/);
});
