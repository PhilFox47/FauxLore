// IGDB (Twitch) OAuth token helper. Extracted verbatim from the original server.ts.

let igdbToken: { access_token: string, expires_at: number } | null = null;
async function getIgdbToken(clientId: string, clientSecret: string) {
  if (!clientId || !clientSecret) {
    throw new Error("IGDB_CLIENT_ID or IGDB_CLIENT_SECRET missing. Please configure them in Settings.");
  }

  if (igdbToken && Date.now() < igdbToken.expires_at) {
    return igdbToken.access_token;
  }

  const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, {
    method: 'POST'
  });

  if (!res.ok) {
    throw new Error("Failed to authenticate with Twitch for IGDB: " + res.statusText);
  }

  const data = await res.json();
  igdbToken = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in * 1000) - 60000 // 1 minute buffer
  };

  return igdbToken.access_token;
}

export { getIgdbToken };

/**
 * How big a cover IGDB is asked for.
 *
 * Their URLs carry the size in the path, and the default everyone copies from
 * the docs — `t_cover_big` — is 227x320. That is smaller than the box the app
 * draws it in before any of it reaches a retina screen: a library card is around
 * 200-300 CSS pixels wide and the Release Radar draws one at 288, so a phone at
 * 2x or 3x is upscaling a 227px image to 576 or 864. Hence the softness.
 *
 * `_2x` is IGDB's documented retina suffix (their pixel ratios are 1 and 2 and
 * nothing else), so this is 454x640 — four times the pixels, the same 5:7 crop,
 * and no guessing about how a portrait image would land inside a size intended
 * for screenshots.
 *
 * `t_720p` and `t_1080p` exist and are larger still, but they are landscape
 * boxes and this environment cannot reach images.igdb.com to find out what a
 * portrait cover actually comes back as. Worth trying from a machine that can:
 * if it letterboxes, `looksLikeCover` rejects the result as not cover-shaped and
 * the entry quietly keeps its remote URL, so a failed experiment costs a local
 * copy rather than a broken cover.
 *
 * Size here is close to free at runtime. Every cover is fetched once when the
 * entry is saved and served from disk forever after, so this is one larger
 * download per game, not one per view.
 */
const IGDB_COVER_SIZE = "t_cover_big_2x";

export function igdbCoverUrl(imageId?: string | null): string {
  return imageId ? `https://images.igdb.com/igdb/image/upload/${IGDB_COVER_SIZE}/${imageId}.jpg` : "";
}
