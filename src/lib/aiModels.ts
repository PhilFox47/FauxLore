import { Settings } from '../types/schema';

/**
 * Which model a client-side AI call should run on.
 *
 * The app asks for two different things and no one model is good at both. An
 * analytical model is tuned to classify, extract and invent nothing — which is
 * exactly what makes it write flat, lifeless copy. A creative model is tuned for
 * voice and improvisation — which is exactly what makes it invent facts. Sending
 * every call to one slot meant one of those failures was always happening.
 *
 * The server has the same split in `server/lib/ai.ts`; these are the client's
 * half of it, and both fall back to the analytical model so an install that
 * never fills the creative slot in behaves exactly as it did before.
 */

const FALLBACK = 'gpt-4o-mini';

/** Classifying, extracting, summarising, converting to JSON. Invent nothing. */
export function analyticalModel(settings?: Partial<Settings> | null): string {
  return settings?.nanoGptModel || FALLBACK;
}

/** Anything the user reads as prose: titles, quests, recaps, flavour text. */
export function creativeModel(settings?: Partial<Settings> | null): string {
  return settings?.nanoGptCreativeModel || settings?.nanoGptModel || FALLBACK;
}
