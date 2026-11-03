/**
 * Provider-specific translation stays server-side: the browser never receives the
 * local gateway token, and unsupported diffusion knobs never reach CLIProxyAPI.
 */
export function cliProxyBaseUrl(value?: string | null): string {
  const raw = String(value || process.env.CLIPROXY_BASE_URL || "http://127.0.0.1:3002/v1").trim();
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("Invalid CLIProxyAPI Base URL.");
  }
  const path = url.pathname.replace(/\/+$/, "");
  return url.origin + (path.endsWith("/v1") ? path : path + "/v1");
}

/** GPT image endpoints accept a fixed size set, not arbitrary diffusion resolutions. */
export function cliProxyImageSize(resolution?: string | null): string {
  const m = String(resolution || "").replace(/[×✕✖]/g, "x").match(/^(\d+)x(\d+)$/i);
  if (!m) return "1024x1024";
  const [width, height] = [Number(m[1]), Number(m[2])];
  if (width === height) return "1024x1024";
  return width > height ? "1536x1024" : "1024x1536";
}

export function cliProxyImagePrompt(prompt: string, negative: string): string {
  if (!negative.trim()) return prompt;
  // CLIProxyAPI has no negative_prompt/CFG field; constraints become best-effort prose.
  return `${prompt}\n\nImage constraints: avoid ${negative}. Do not add unnecessary extra subjects or props.`;
}

/**
 * CLIProxyAPI's GPT Image 2.5 image edit endpoint accepts the original picture
 * as an inline data URL in JSON images[]. Never log this payload: it embeds the
 * actual reference image bytes.
 */
export function cliProxyImageEditBody(model: string, prompt: string, size: string, dataUrl: string) {
  if (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
    throw new Error("A valid locally encoded PNG/JPEG/WebP reference is required for image edits.");
  }
  return {
    model,
    prompt,
    size,
    response_format: "b64_json",
    images: [{ image_url: dataUrl }],
  };
}

/** Only unsupported/invalid edit requests may fall back to ordinary generation. */
export function imageEditSupportsTextFallback(httpStatus: unknown): boolean {
  return [400, 404, 405, 415, 422, 501].includes(Number(httpStatus));
}
