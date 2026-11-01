import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type AiProvider = 'nanogpt' | 'cliproxy';

export interface AiProviderConfig {
  provider: AiProvider;
  nanoGptApiKey?: string;
  nanoGptModel?: string;
  cliProxyBaseUrl?: string;
  cliProxyApiKey?: string;
  cliProxyTextModel?: string;
  cliProxyImageModel?: string;
  cliProxyImageSize?: string;
}

function cliBase(config: AiProviderConfig): string {
  const raw = (config.cliProxyBaseUrl || 'http://host.docker.internal:3002/v1').trim();
  const parsed = new URL(raw);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password ||
      parsed.search || parsed.hash || !parsed.hostname) {
    throw new Error('Invalid CLIProxyAPI Base URL. Use an http(s) URL ending in /v1.');
  }
  const basePath = parsed.pathname.replace(/\/+$/, '');
  return parsed.origin + (basePath.endsWith('/v1') ? basePath : basePath + '/v1');
}

export function hasAiProvider(config: AiProviderConfig): boolean {
  return config.provider === 'cliproxy'
    ? Boolean(config.cliProxyApiKey && config.cliProxyTextModel)
    : Boolean(config.nanoGptApiKey);
}

async function upstream(
  url: string, key: string | undefined, body: Record<string, unknown>, timeoutMs: number
): Promise<Response> {
  if (!key) throw new Error('The selected AI provider is missing its API key.');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    // Do not log or expose credentials or the full prompt.
    const message = (await response.text()).slice(0, 1200);
    throw new Error(`AI provider returned HTTP ${response.status}: ${message}`);
  }
  return response;
}

export async function requestAiText(
  config: AiProviderConfig, input: Record<string, any>
): Promise<any> {
  if (config.provider === 'cliproxy') {
    // Codex-backed models do not consistently support temperature or response_format.
    const response = await upstream(
      `${cliBase(config)}/chat/completions`, config.cliProxyApiKey,
      {
        model: config.cliProxyTextModel || 'gpt-6.1-sol',
        messages: input.messages,
        stream: false
      }, 240_000
    );
    return response.json();
  }
  const response = await upstream(
    'https://nano-gpt.com/api/v1/chat/completions', config.nanoGptApiKey,
    { ...input, model: input.model || config.nanoGptModel || 'gpt-4o-mini', stream: false },
    240_000
  );
  return response.json();
}

/**
 * CLIProxyAPI's image endpoint accepts a single natural-language prompt. Legacy
 * structured/negative prompts are translated into instructions; diffusion-only
 * knobs (CFG, sampler, steps, seed) are intentionally not forwarded.
 */
export function imagePrompt(prompt: string, negativePrompt?: string): string {
  let positive = prompt.trim();
  let negative = negativePrompt || '';
  if (positive.startsWith('{')) {
    try {
      const parsed = JSON.parse(positive);
      if (parsed && typeof parsed.prompt === 'string') {
        positive = parsed.prompt;
        if (!negative && typeof parsed.negative_prompt === 'string') negative = parsed.negative_prompt;
      }
    } catch { /* A literal prompt beginning with { is fine. */ }
  }
  return negative.trim() ? `${positive}\n\nAvoid in the image: ${negative.trim()}` : positive;
}

const IMAGE_SIZES = new Set(['1024x1024', '1536x1024', '1024x1536']);

export async function createAiImage(
  config: AiProviderConfig, prompt: string, imagesDir: string,
  options: { negativePrompt?: string } = {}
): Promise<string> {
  if (!prompt || !prompt.trim()) throw new Error('An image prompt is required.');
  const isCli = config.provider === 'cliproxy';
  const body = isCli ? {
    model: config.cliProxyImageModel || 'gpt-image-2',
    prompt: imagePrompt(prompt, options.negativePrompt),
    size: IMAGE_SIZES.has(config.cliProxyImageSize || '') ? config.cliProxyImageSize : '1024x1024',
    n: 1,
    response_format: 'b64_json'
  } : {
    model: 'chroma',
    prompt,
    size: '1536x1536',
    response_format: 'url'
  };
  const response = await upstream(
    isCli ? `${cliBase(config)}/images/generations` : 'https://nano-gpt.com/api/v1/images/generations',
    isCli ? config.cliProxyApiKey : config.nanoGptApiKey, body, 600_000
  );
  const data: any = await response.json();
  const image = data?.data?.[0];
  if (typeof image?.b64_json === 'string' && image.b64_json.length) {
    const bytes = Buffer.from(image.b64_json, 'base64');
    if (!bytes.length) throw new Error('AI image response was empty.');
    fs.mkdirSync(imagesDir, { recursive: true });
    const filename = `${randomUUID()}.png`;
    fs.writeFileSync(path.join(imagesDir, filename), bytes);
    return `/uploads/ai-images/${filename}`;
  }
  if (typeof image?.url === 'string' && image.url) {
    // Preserve NanoGPT's original remote URL fallback, but store locally where possible.
    try {
      const remote = new URL(image.url);
      if (remote.protocol !== 'https:' && remote.protocol !== 'http:') throw new Error('Invalid image URL.');
      const imageResponse = await fetch(remote, { signal: AbortSignal.timeout(60_000) });
      if (!imageResponse.ok) throw new Error('Image download failed.');
      const bytes = Buffer.from(await imageResponse.arrayBuffer());
      if (bytes.length > 20 * 1024 * 1024) throw new Error('Image exceeds 20 MB.');
      const mime = imageResponse.headers.get('content-type') || '';
      const ext = mime.includes('png') ? 'png' : mime.includes('jpeg') ? 'jpg' : 'webp';
      fs.mkdirSync(imagesDir, { recursive: true });
      const filename = `${randomUUID()}.${ext}`;
      fs.writeFileSync(path.join(imagesDir, filename), bytes);
      return `/uploads/ai-images/${filename}`;
    } catch (error) {
      console.warn('Could not persist AI image locally; returning upstream URL:', error);
      return image.url;
    }
  }
  throw new Error('The selected AI provider did not return a supported image.');
}
