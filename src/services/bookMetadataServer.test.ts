import test from "node:test";
import assert from "node:assert/strict";
import { getHardcoverEditions, searchBookProviders } from "./bookMetadataServer";

test("Hardcover searches works and returns edition-specific metadata", async () => {
  const previous = globalThis.fetch;
  const requests: any[] = [];
  globalThis.fetch = (async (url: any, init: any) => {
    const body = JSON.parse(init.body);
    requests.push({ url, body, authorization: init.headers.Authorization });
    let data: any;
    if (body.query.includes("FindBooks")) {
      data = { search: { ids: [42], results: [{ id: 42, genres: ["Science Fiction"] }] } };
    } else if (body.query.includes("BookMatches")) {
      data = { books: [{ id: 42, title: "A Test Book", description: "A summary",
        release_year: 2024, rating: 4.2, default_cover_edition: {image: {url: "https://example.test/cover.jpg"}},
        contributions: [{author: {name: "Writer"}}] }] };
    } else {
      data = { editions: [
        { id: 15, title: "Das Testbuch", edition_format: "Paperback", reading_format_id: 1,
          language: {code2: "de"}, pages: 321, isbn_13: "9781234567890",
          image: {url: "https://example.test/german.jpg", width: 800, height: 1200},
          publisher: {name: "Test Verlag"}, release_year: 2025 },
        { id: 16, title: "A Test Book", edition_format: "Audiobook", reading_format_id: 2,
          language: {code2: "en"}, audio_seconds: 7200 }
      ] };
    }
    return { ok: true, json: async () => ({data}) } as Response;
  }) as typeof fetch;
  try {
    const books = await searchBookProviders("A Test Book", undefined, ["hardcover"], "test-secret");
    assert.equal(books.length, 1);
    assert.equal(books[0].id, "hc_42");
    assert.equal(books[0].creator, "Writer");
    assert.equal(books[0].reviewScore, 4.2);
    const printEditions = await getHardcoverEditions(42, "test-secret", "Book");
    assert.equal(printEditions.length, 1);
    assert.equal(printEditions[0].isbn13, "9781234567890");
    assert.equal(printEditions[0].language, "DE");
    assert.equal(printEditions[0].totalPages, 321);
    const audioEditions = await getHardcoverEditions(42, "test-secret", "Audiobook");
    assert.equal(audioEditions.length, 1);
    assert.equal(audioEditions[0].runtimeMinutes, 120);
    assert.ok(requests.every(r => r.authorization === "Bearer test-secret"));
  } finally { globalThis.fetch = previous; }
});

test("Provider errors do not hide successful Google Books fallback", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true, json: async () => ({items: [{id: "google123", volumeInfo: {
      title: "Example", language: "de", imageLinks: {thumbnail: "http://example.test/cover.jpg"}
    }}]})
  })) as unknown as typeof fetch;
  try {
    const books = await searchBookProviders("Example", "de", ["hardcover", "googleBooks"]);
    assert.equal(books.length, 1);
    assert.equal(books[0].provider, "googleBooks");
    assert.equal(books[0].coverImageUrl, "https://example.test/cover.jpg");
  } finally { globalThis.fetch = previous; }
});

test("Disabled providers cannot search", async () => {
  await assert.rejects(searchBookProviders("Example", undefined, []), /Enable at least one/);
});
