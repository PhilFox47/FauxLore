/**
 * Server-side book metadata providers. Hardcover's GraphQL token never reaches the browser.
 * Search returns works; edition selection is deliberately a separate operation.
 */
export type BookMetadataProvider = "hardcover" | "googleBooks";

export interface BookSearchResult {
  id: string;
  provider: BookMetadataProvider;
  metadataSource: "hardcover" | "googlebooks";
  metadataSourceId: string;
  sourceUrl: string;
  title: string;
  subtitle?: string;
  creator: string;
  description?: string;
  coverImageUrl?: string;
  year?: number;
  reviewScore?: number;
  totalPages?: number;
  publisher?: string;
  language?: string;
  genres?: string[];
  bookWorkId?: string;
}

export interface BookEdition extends BookSearchResult {
  bookEditionId: string;
  isbn13?: string;
  bookFormat?: string;
  runtimeMinutes?: number;
  imageWidth?: number;
  imageHeight?: number;
}

const HARDCOVER_URL = "https://api.hardcover.app/v1/graphql";

async function hardcoverQuery(token: string, query: string, variables: Record<string, unknown>) {
  const response = await fetch(HARDCOVER_URL, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      "Content-Type": "application/json",
      "Authorization": token.startsWith("Bearer ") ? token : "Bearer " + token,
      "User-Agent": "FauxLore/1.0 (book metadata lookup)"
    },
    body: JSON.stringify({ query, variables })
  });
  if (!response.ok) {
    throw new Error("Hardcover HTTP " + response.status + (response.status === 429 ? " (rate limit)" : ""));
  }
  const payload: any = await response.json();
  if (payload.errors?.length) {
    throw new Error("Hardcover: " + payload.errors.map((error: any) => error.message).join("; "));
  }
  if (!payload.data) throw new Error("Hardcover returned no data");
  return payload.data;
}

function validIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))].slice(0, 25);
}

function coverUrl(image: any): string {
  return typeof image?.url === "string" ? image.url : "";
}

function authors(book: any): string {
  const names = (book.contributions || [])
    .map((entry: any) => entry.author?.name)
    .filter((name: unknown) => typeof name === "string");
  return names.length ? [...new Set(names)].join(", ") : "Unknown Author";
}

export async function searchHardcoverBooks(query: string, token: string): Promise<BookSearchResult[]> {
  const result = await hardcoverQuery(token,
    "query FindBooks($query: String!) { search(query: $query, query_type: \"Book\", per_page: 20, page: 1) { ids results } }",
    { query }
  );
  const search = result.search || {};
  const records: any[] = Array.isArray(search.results) ? search.results : [];
  const ids = validIds(search.ids?.length ? search.ids : records.map(record => record.id));
  if (!ids.length) return [];
  const details = await hardcoverQuery(token,
    "query BookMatches($ids: [Int!]!) { books(where: {id: {_in: $ids}}) { id title subtitle description release_year rating slug image {url} default_cover_edition {image {url}} contributions(where: {contributor_role: {slug: {_eq: \"author\"}}}) {author {name}} } }",
    { ids }
  );
  const books = new Map<number, any>((details.books || []).map((book: any) => [book.id, book]));
  return ids.flatMap(id => {
    const book = books.get(id);
    if (!book) return [];
    const searchInfo = records.find(record => Number(record.id) === id) || {};
    return [{
      id: "hc_" + id,
      bookWorkId: String(id),
      provider: "hardcover" as const,
      metadataSource: "hardcover" as const,
      metadataSourceId: String(id),
      sourceUrl: "https://hardcover.app/books/" + (book.slug || id),
      title: book.title || searchInfo.title || "Unknown Title",
      subtitle: book.subtitle || "",
      creator: authors(book),
      description: book.description || searchInfo.description || "",
      year: book.release_year || searchInfo.release_year || undefined,
      reviewScore: book.rating == null ? undefined : Number(book.rating),
      coverImageUrl: coverUrl(book.default_cover_edition?.image) || coverUrl(book.image),
      // The FauxLore taxonomy is managed by auto-tagging, not external categories.
      genres: []
    }];
  });
}

function googleCover(imageLinks: any): string {
  if (!imageLinks) return "";
  const url = imageLinks.extraLarge || imageLinks.large || imageLinks.medium ||
    imageLinks.small || imageLinks.thumbnail || imageLinks.smallThumbnail || "";
  return typeof url === "string" ? url.replace(/^http:/, "https:") : "";
}

export async function searchGoogleBooks(query: string, lang: string | undefined, apiKey?: string): Promise<BookSearchResult[]> {
  const params = new URLSearchParams({ q: query, maxResults: "30", printType: "books" });
  if (lang) params.set("langRestrict", lang.toLowerCase());
  if (apiKey) params.set("key", apiKey);
  const response = await fetch("https://www.googleapis.com/books/v1/volumes?" + params, {
    signal: AbortSignal.timeout(12000),
    headers: { "User-Agent": "FauxLore/1.0" }
  });
  if (!response.ok) throw new Error("Google Books HTTP " + response.status);
  const data: any = await response.json();
  return (data.items || []).flatMap((item: any) => {
    const info = item.volumeInfo || {};
    const language = String(info.language || "").toLowerCase();
    if (lang && language !== lang.toLowerCase()) return [];
    if (!lang && language !== "en" && language !== "de") return [];
    return [{
      id: "gb_" + item.id,
      provider: "googleBooks" as const,
      metadataSource: "googlebooks" as const,
      metadataSourceId: String(item.id),
      sourceUrl: info.infoLink || info.canonicalVolumeLink || "https://books.google.com/books?id=" + encodeURIComponent(item.id),
      title: info.title || "Unknown Title",
      subtitle: info.subtitle || "",
      creator: info.authors?.join(", ") || "Unknown Author",
      description: info.description || "",
      publisher: info.publisher || "",
      coverImageUrl: googleCover(info.imageLinks),
      year: info.publishedDate ? Number.parseInt(info.publishedDate.slice(0, 4), 10) || undefined : undefined,
      reviewScore: info.averageRating == null ? undefined : Number(info.averageRating),
      totalPages: info.pageCount || undefined,
      language: language.toUpperCase(),
      genres: []
    }];
  });
}

export async function searchBookProviders(
  query: string, lang: string | undefined, providers: BookMetadataProvider[],
  hardcoverToken?: string, googleApiKey?: string
): Promise<BookSearchResult[]> {
  if (!providers.length) throw new Error("Enable at least one book metadata provider in Settings.");
  const results = await Promise.allSettled(providers.map(provider => {
    if (provider === "hardcover") {
      if (!hardcoverToken) return Promise.reject(new Error("Hardcover API key not configured in System & Keys."));
      return searchHardcoverBooks(query, hardcoverToken);
    }
    return searchGoogleBooks(query, lang, googleApiKey);
  }));
  const success = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
  if (results.every(result => result.status === "rejected")) {
    const messages = results.map(result => result.status === "rejected" ? String(result.reason?.message || result.reason) : "").join("; ");
    throw new Error(messages);
  }
  return success;
}

export async function getHardcoverEditions(
  workId: number, token: string, mediaType: "Book" | "Audiobook"
): Promise<BookEdition[]> {
  if (!Number.isSafeInteger(workId) || workId <= 0) throw new Error("Invalid Hardcover book ID");
  const query = "query BookEditions($id: Int!, $offset: Int!) { editions(where: {book_id: {_eq: $id}}, order_by: {users_count: desc}, limit: 100, offset: $offset) { id title subtitle edition_format reading_format_id pages audio_seconds isbn_13 isbn_10 release_year publisher {name} language {code2 code3 language} image {url width height} } }";
  const all: any[] = [];
  for (let offset = 0; offset < 500; offset += 100) {
    const data = await hardcoverQuery(token, query, { id: workId, offset });
    const page: any[] = data.editions || [];
    all.push(...page);
    if (page.length < 100) break;
  }
  const unique = new Set<number>();
  return all.flatMap(edition => {
    if (unique.has(edition.id)) return [];
    unique.add(edition.id);
    const format = String(edition.edition_format || "").toLowerCase();
    const isAudio = edition.reading_format_id === 2 || format.includes("audio");
    if ((mediaType === "Audiobook") !== isAudio) return [];
    const language = edition.language?.code2 || edition.language?.code3 || "und";
    return [{
      id: "hc_edition_" + edition.id,
      bookEditionId: String(edition.id),
      bookWorkId: String(workId),
      provider: "hardcover" as const,
      metadataSource: "hardcover" as const,
      metadataSourceId: String(workId),
      sourceUrl: "https://hardcover.app/books/" + workId,
      title: edition.title || "",
      subtitle: edition.subtitle || "",
      creator: "",
      publisher: edition.publisher?.name || "",
      year: edition.release_year || undefined,
      isbn13: edition.isbn_13 || undefined,
      bookFormat: edition.edition_format || (isAudio ? "Audiobook" : "Book"),
      language: String(language).toUpperCase(),
      totalPages: !isAudio ? edition.pages || undefined : undefined,
      runtimeMinutes: isAudio && edition.audio_seconds ? Math.round(edition.audio_seconds / 60) : undefined,
      coverImageUrl: coverUrl(edition.image),
      imageWidth: edition.image?.width || undefined,
      imageHeight: edition.image?.height || undefined,
      genres: []
    }];
  });
}
