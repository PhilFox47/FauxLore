/**
 * Loading is not the same as missing. Never start an AI job while the saved
 * Wrapped or Deep Dive is still being checked, and never overwrite a saved
 * part as a side effect of generating its missing counterpart.
 */
export type MissingRecapPart = 'deep-dive' | 'wrapped';

export function getMissingRecapParts(
  deepDive: unknown | null | undefined,
  wrapped: unknown | null,
  wrappedLoaded: boolean,
): MissingRecapPart[] {
  if (deepDive === undefined || !wrappedLoaded) return [];
  const missing: MissingRecapPart[] = [];
  if (deepDive === null) missing.push('deep-dive');
  if (wrapped === null) missing.push('wrapped');
  return missing;
}

/** Called only by the explicit Generate Recap click handler, never on mount. */
export async function generateMissingRecapParts(
  parts: readonly MissingRecapPart[],
  handlers: { deepDive: () => Promise<void>; wrapped: () => Promise<void> },
): Promise<void> {
  if (parts.includes('deep-dive')) await handlers.deepDive();
  if (parts.includes('wrapped')) await handlers.wrapped();
}
