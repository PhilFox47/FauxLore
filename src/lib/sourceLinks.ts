import { MediaItem, MetadataSource, METADATA_SOURCE_LABELS } from '../types/schema';

/**
 * Resolves the public page a media item's metadata came from.
 *
 * Prefers the URL captured at import time. Falls back to deriving one from the
 * source + id, so items added before source links were stored still get a link
 * wherever the URL is reconstructable.
 */
export function getSourceUrl(item: Pick<MediaItem, 'sourceUrl' | 'metadataSource' | 'metadataSourceId'>): string | null {
  if (item.sourceUrl && /^https?:\/\//i.test(item.sourceUrl)) return item.sourceUrl;

  const id = item.metadataSourceId;
  if (!id || !item.metadataSource) return null;

  switch (item.metadataSource) {
    case 'vndb':
      // VNDB ids already carry their "v" prefix (e.g. "v17")
      return `https://vndb.org/${id}`;
    case 'gsl':
      return `https://gamestorylog.com/games/${id}`;
    case 'mangadex':
      return `https://mangadex.org/title/${id}`;
    case 'googlebooks':
      return `https://books.google.com/books?id=${encodeURIComponent(id.replace(/^gb_/, ''))}`;
    // IGDB and TMDB need a slug / media-type that a bare id doesn't provide, so
    // they rely on the stored URL rather than a guess.
    case 'igdb':
    case 'tmdb':
    default:
      return null;
  }
}

/** Human-readable name of the source, for button labels and tooltips. */
export function getSourceLabel(source?: MetadataSource | string | null): string {
  if (!source) return 'Source';
  return METADATA_SOURCE_LABELS[source as MetadataSource] || String(source);
}
