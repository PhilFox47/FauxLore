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
