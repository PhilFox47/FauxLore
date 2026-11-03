import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import type { Db } from "../context";
import {
  wrappedCoverBounds, buildWrappedCoverPrompt, selectWrappedCoverFocus, createWrappedCoverService,
  type WrappedCoverStory,
} from "./wrappedCovers";

const TIMEFRAME = "week" as const;
const PERIOD = "2026-W45";
const story: WrappedCoverStory = {
  title: "Strange Days in a Familiar Universe",
  dek: "A week of odd encounters and new discoveries.",
  scenes: [
    { kind: "opening", title: "The curtain rises", evidenceIds: [], design: { palette: "cobalt" } },
    { kind: "spotlight", title: "The journey continues", evidenceIds: ["media-0"],
      media: { id: "logged" }, artworks: [{ id: "logged" }, { id: "unlogged" }] },
    { kind: "closing", title: "A quiet epilogue", evidenceIds: [] },
  ],
};

function fixture() {
  const db = new Database(":memory:");
  db.exec(
    "CREATE TABLE wrapped_stories (userId TEXT, timeframe TEXT, timeId TEXT, story TEXT, " +
      "coverArtUrl TEXT, coverArtStatus TEXT, coverArtRequestId TEXT, coverArtTimeZone TEXT, " +
      "PRIMARY KEY(userId,timeframe,timeId));" +
    "CREATE TABLE media (id TEXT, userId TEXT, title TEXT, mediaType TEXT, genres TEXT);" +
    "CREATE TABLE logs (id TEXT, userId TEXT, mediaId TEXT, timestamp TEXT, metricType TEXT, delta REAL);",
  );
  db.prepare("INSERT INTO wrapped_stories(userId,timeframe,timeId,story) VALUES(?,?,?,?)")
    .run("user", TIMEFRAME, PERIOD, JSON.stringify(story));
  db.prepare("INSERT INTO media(id,userId,title,mediaType,genres) VALUES(?,?,?,?,?)")
    .run("logged", "user", "Mass Effect", "Game", JSON.stringify(["Sci-Fi", "RPG"]));
  db.prepare("INSERT INTO media(id,userId,title,mediaType,genres) VALUES(?,?,?,?,?)")
    .run("unlogged", "user", "Unlogged Title", "Book", "[]");
  db.prepare("INSERT INTO media(id,userId,title,mediaType,genres) VALUES(?,?,?,?,?)")
    .run("stranger", "another-user", "Other Person's Game", "Game", "[]");
  db.prepare("INSERT INTO logs(id,userId,mediaId,timestamp,metricType,delta) VALUES(?,?,?,?,?,?)")
    .run("log-one", "user", "logged", "2026-11-03T12:00:00.000Z", "playtimeHours", 2);
  db.prepare("INSERT INTO logs(id,userId,mediaId,timestamp,metricType,delta) VALUES(?,?,?,?,?,?)")
    .run("log-stranger", "another-user", "stranger", "2026-11-03T12:00:00.000Z", "playtimeHours", 8);
  db.prepare("INSERT INTO logs(id,userId,mediaId,timestamp,metricType,delta) VALUES(?,?,?,?,?,?)")
    .run("log-outside", "user", "unlogged", "2026-10-15T12:00:00.000Z", "pagesRead", 30);
  return db;
}
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
const read = (db: Database.Database) => db.prepare(
  "SELECT story,coverArtUrl,coverArtStatus,coverArtRequestId FROM wrapped_stories WHERE userId='user'",
).get() as { story: string; coverArtUrl: string | null; coverArtStatus: string | null; coverArtRequestId: string | null };

test("weekly, monthly and yearly cover selection respects Wrapped's five-hour reporting shift", () => {
  assert.equal(wrappedCoverBounds("week", "2026-W45").start, "2026-11-02T05:00:00.000Z");
  assert.equal(wrappedCoverBounds("week", "2026-W45").end, "2026-11-09T05:00:00.000Z");
  assert.equal(wrappedCoverBounds("month", "2026-11").start, "2026-11-01T05:00:00.000Z");
  // Local midnight moves from UTC+2 to UTC+1 across European DST.
  assert.equal(wrappedCoverBounds("month", "2026-10", "Europe/Berlin").start, "2026-10-01T03:00:00.000Z");
  assert.equal(wrappedCoverBounds("month", "2026-10", "Europe/Berlin").end, "2026-11-01T04:00:00.000Z");
  assert.equal(wrappedCoverBounds("year", "2026").end, "2027-01-01T05:00:00.000Z");
  assert.throws(() => wrappedCoverBounds("month", "2026-13"));
});

test("cover prompt reflects the actual saved issue, reserves text overlay space and keeps spoilers out", () => {
  const prompt = buildWrappedCoverPrompt(story, TIMEFRAME, PERIOD, [
    { id: "logged", title: "Mass Effect", type: "Game", genres: ["Sci-Fi", "RPG"] },
  ]);
  assert.match(prompt, /Strange Days in a Familiar Universe/);
  assert.match(prompt, /Mass Effect/);
  assert.match(prompt, /journey continues/);
  assert.match(prompt, /ONE clear hero motif/);
  assert.match(prompt, /Only ONE focal subject/);
  assert.doesNotMatch(prompt, /connecting the MOST meaningful two or three themes/);
  assert.match(prompt, /cobalt/);
  assert.match(prompt, /LEFT 45 percent/);
  assert.match(prompt, /NO text/);
  assert.doesNotMatch(prompt, /Unlogged Title/);
});

test("one editorial image must not become an all-media lineup even when several sources are supplied", () => {
  const prompt = buildWrappedCoverPrompt(story, TIMEFRAME, PERIOD, [
    { id: "logged", title: "Mass Effect", type: "Game", genres: ["Sci-Fi"] },
    { id: "secondary", title: "Dungeon Crawler Carl", type: "Book", genres: ["Fantasy"] },
    { id: "third", title: "Final Fantasy XIV", type: "Game", genres: ["MMORPG"] },
  ]);
  assert.match(prompt, /Mass Effect/);
  assert.doesNotMatch(prompt, /Dungeon Crawler Carl|Final Fantasy XIV/);
  assert.match(prompt, /Do not illustrate each logged title/);
  assert.match(prompt, /not a required subject/);
  assert.match(prompt, /No lineup of characters/);
  assert.doesNotMatch(prompt, /These works were actually logged/);
});

test("editorial prominence beats raw activity volume when choosing ONE primary media influence", () => {
  const chosen = selectWrappedCoverFocus(story, [
    { id: "background", title: "A Very Busy Side Quest", type: "Game", count: 60, sceneScore: 0 },
    { id: "logged", title: "Mass Effect", type: "Game", count: 2, sceneScore: 12 },
    { id: "other", title: "Another Novel", type: "Book", count: 20, sceneScore: 5 },
  ]);
  assert.equal(chosen?.title, "Mass Effect");
  assert.deepEqual(Object.keys(chosen || {}).sort(), ["genres", "id", "title", "type"].sort());
});

test("abstract period thesis may generate key art with no named franchise", () => {
  const abstractStory = {
    ...story, title: "The Long Way Home", dek: "A period about patience and coming back",
    scenes: [
      { kind: "opening", title: "Begin", evidenceIds: [] },
      { kind: "insight", title: "Finding your feet", evidenceIds: ["reflection-0"] },
      { kind: "closing", title: "End", evidenceIds: [] },
    ],
  };
  assert.equal(selectWrappedCoverFocus(abstractStory, [
    { id: "one", title: "Mass Effect", type: "Game", count: 3, sceneScore: 0 },
    { id: "two", title: "Another Book", type: "Book", count: 20, sceneScore: 0 },
  ]), null);
  const prompt = buildWrappedCoverPrompt(abstractStory, TIMEFRAME, PERIOD, []);
  assert.match(prompt, /The Long Way Home/);
  assert.match(prompt, /no single media title is the dominant visual anchor/i);
  assert.doesNotMatch(prompt, /Mass Effect|Another Book/);
  assert.match(prompt, /ONE memorable visual metaphor/);
});

test("one cover per saved Wrapped; media subjects are restricted to user-owned progress logs", async () => {
  const db = fixture();
  const prompts: string[] = [];
  try {
    const service = createWrappedCoverService({
      db: db as unknown as Db,
      canSpendTokens: () => true,
      generateImage: async (_, prompt) => { prompts.push(prompt); return "/uploads/ai-images/cover-a.png"; },
    });
    assert.equal(service.queue("user", TIMEFRAME, PERIOD), true);
    assert.equal(service.queue("user", TIMEFRAME, PERIOD), false, "duplicate fetch must not spend tokens");
    await settle();
    assert.equal(read(db).coverArtStatus, "done");
    assert.equal(read(db).coverArtUrl, "/uploads/ai-images/cover-a.png");
    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /Mass Effect/);
    assert.doesNotMatch(prompts[0], /Unlogged Title|Other Person's Game/);

    assert.equal(service.queue("user", TIMEFRAME, PERIOD, true), true, "manual cover reroll is separate");
    await settle();
    assert.equal(prompts.length, 2);
    assert.equal(JSON.parse(read(db).story).title, story.title);
  } finally { db.close(); }
});

test("an old image render cannot replace a newer Wrapped story or cover", async () => {
  const db = fixture();
  let releaseOld: ((value: string) => void) | undefined;
  let calls = 0;
  try {
    const service = createWrappedCoverService({
      db: db as unknown as Db, canSpendTokens: () => true,
      generateImage: async () => {
        calls++;
        if (calls === 1) return new Promise<string>(resolve => { releaseOld = resolve; });
        return "/uploads/new-version.png";
      },
    });
    assert.equal(service.queue("user", TIMEFRAME, PERIOD), true);
    db.prepare(
      "UPDATE wrapped_stories SET story=?, coverArtStatus=NULL, coverArtRequestId=NULL, coverArtUrl=NULL",
    ).run(JSON.stringify({ ...story, title: "New Issue" }));
    assert.equal(service.queue("user", TIMEFRAME, PERIOD), true);
    await settle();
    assert.equal(read(db).coverArtUrl, "/uploads/new-version.png");
    releaseOld?.("/uploads/old-version.png");
    await settle();
    assert.equal(read(db).coverArtUrl, "/uploads/new-version.png");
    assert.equal(JSON.parse(read(db).story).title, "New Issue");
  } finally { db.close(); }
});

test("image generation failures never delete the story and are not silently auto-retried", async () => {
  const db = fixture();
  try {
    let calls = 0;
    const service = createWrappedCoverService({
      db: db as unknown as Db,
      canSpendTokens: () => true,
      generateImage: async () => { calls++; throw Error("gateway unavailable"); },
    });
    assert.equal(service.queue("user", TIMEFRAME, PERIOD), true);
    await settle();
    assert.equal(read(db).coverArtStatus, "failed");
    assert.equal(JSON.parse(read(db).story).scenes.length, 3);
    assert.equal(service.queue("user", TIMEFRAME, PERIOD), false);
    assert.equal(calls, 1);
  } finally { db.close(); }
});

test("dormant users do not cause automatic image spend", async () => {
  const db = fixture();
  try {
    const service = createWrappedCoverService({
      db: db as unknown as Db,
      canSpendTokens: () => false,
      generateImage: async () => { throw Error("must not run"); },
    });
    assert.equal(service.queue("user", TIMEFRAME, PERIOD), false);
    assert.equal(read(db).coverArtStatus, null);
  } finally { db.close(); }
});
