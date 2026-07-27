import { apiFetch } from './db';

/**
 * What is left of the client's AI surface.
 *
 * Generation itself moved to the server, next to the Codex it reads: tagging
 * lives in server/services/autoTag.ts, loot in server/services/loot.ts and
 * enemies in server/services/worldBoss.ts. Doing it there means one
 * implementation per feature, and work that survives the tab being closed.
 * This file is now just the call that asks for a drop.
 */

/**
 * Rolls and writes a piece of loot for a media entry. Rarity, slot and the bonus
 * target are decided server-side; the AI names it, writes its flavour and
 * art-directs its icon from the media's Codex.
 */
export async function generateAiArtifact(item: any, oldArtifact?: any) {
  const res = await apiFetch('/api/artifacts/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mediaId: item.id, oldArtifact }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to generate an artifact.');
  }
  return res.json();
}
