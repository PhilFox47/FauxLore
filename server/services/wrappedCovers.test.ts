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
      "sceneArtJson TEXT, sceneArtStatus TEXT, sceneArtRequestId TEXT, " +
      "PRIMARY KEY(userId,timeframe,timeId));" +
    "CREATE TABLE settings (userId TEXT PRIMARY KEY, visualSelfInsertMode TEXT, visualSelfDescription TEXT);" +
    "CREATE TABLE visual_self_references (userId TEXT PRIMARY KEY, image BLOB NOT NULL, mime TEXT NOT NULL, updatedAt TEXT NOT NULL);" +
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
  db.prepare("INSERT INTO media(id,userId,title,mediaType,genres) VALUES(?,?,?,?,?)")
    .run("background", "user", "A Very Busy Side Quest", "Game", "[]");
  db.prepare("INSERT INTO logs(id,userId,mediaId,timestamp,metricType,delta) VALUES(?,?,?,?,?,?)")
    .run("log-one", "user", "logged", "2026-11-03T12:00:00.000Z", "playtimeHours", 2);
  db.prepare("INSERT INTO logs(id,userId,mediaId,timestamp,metricType,delta) VALUES(?,?,?,?,?,?)")
    .run("log-stranger", "another-user", "stranger", "2026-11-03T12:00:00.000Z", "playtimeHours", 8);
  db.prepare("INSERT INTO logs(id,userId,mediaId,timestamp,metricType,delta) VALUES(?,?,?,?,?,?)")
    .run("log-outside", "user", "unlogged", "2026-10-15T12:00:00.000Z", "pagesRead", 30);
  const insertLog = db.prepare("INSERT INTO logs(id,userId,mediaId,timestamp,metricType,delta) VALUES(?,?,?,?,?,?)");
  for (let i = 0; i < 12; i++) {
    insertLog.run("background-" + i, "user", "background", "2026-11-03T13:00:00.000Z", "playtimeHours", 1);
  }
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
  assert.match(prompt, /ONE memorable visual action/);
  assert.match(prompt, /Only ONE focal action or interaction/);
  assert.doesNotMatch(prompt, /connecting the MOST meaningful two or three themes/);
  assert.match(prompt, /cobalt/);
  assert.match(prompt, /LEFT 55% darker/);
  assert.match(prompt, /toward the RIGHT/);
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
  assert.match(prompt, /never turn it into a lineup of characters/);
  assert.match(prompt, /not a required subject/);
  assert.match(prompt, /One coherent situation can involve a SMALL GROUP/);
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
  assert.match(prompt, /ONE memorable visual action/);
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
    assert.doesNotMatch(prompts[0], /Unlogged Title|Other Person's Game|A Very Busy Side Quest/,
      "The most-logged side title must not crowd out the story's actual focal media.");

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

test("abstract issue with real logs is allowed; a period with no verified activity cannot fabricate a cover", async () => {
  const db = fixture();
  const prompts: string[] = [];
  try {
    db.prepare("UPDATE wrapped_stories SET story=? WHERE userId='user'")
      .run(JSON.stringify({
        title: "Slow Return", dek: "A period of finding balance",
        scenes: [
          { kind: "opening", title: "Return", evidenceIds: [] },
          { kind: "insight", title: "Patience", evidenceIds: ["reflection-0"] },
          { kind: "closing", title: "Afterward", evidenceIds: [] },
        ],
      }));
    const service = createWrappedCoverService({
      db: db as unknown as Db, canSpendTokens: () => true,
      generateImage: async (_, prompt) => {
        prompts.push(prompt);
        return "/uploads/abstract.png";
      },
    });
    assert.equal(service.queue("user", TIMEFRAME, PERIOD), true);
    await settle();
    assert.equal(read(db).coverArtStatus, "done");
    assert.equal(prompts.length, 1);
    assert.doesNotMatch(prompts[0], /Mass Effect|A Very Busy Side Quest/);
    db.prepare("DELETE FROM logs WHERE userId='user'").run();
    db.prepare("UPDATE wrapped_stories SET coverArtStatus=NULL, coverArtUrl=NULL").run();
    assert.equal(service.queue("user", TIMEFRAME, PERIOD), true);
    await settle();
    assert.equal(read(db).coverArtStatus, "failed");
    assert.equal(prompts.length, 1, "No second image request should run without actual logs");
  } finally { db.close(); }
});

test("original interior chapter artworks are generated once and stored independently", async () => {
  const db = fixture();
  const imageCalls: string[] = [];
  try {
    const staged = {
      title: "The Geography of Improbable Taste",
      dek: "A train and a hotel reveal a weird mix.",
      scenes: [
        { id: "wrapped-0", kind: "opening", title: "Your map", body: "Beginning." },
        { id: "wrapped-1", kind: "location", title: "A train on a train", body: "Thriller and train.",
          media: { id: "logged", title: "Mass Effect" } },
        { id: "wrapped-2", kind: "location", title: "Eight titles at one hotel", body: "Many genres shared a hotel." },
        { id: "wrapped-3", kind: "closing", title: "Continue", body: "An ending." },
      ],
    };
    db.prepare("UPDATE wrapped_stories SET story=?").run(JSON.stringify(staged));
    const service = createWrappedCoverService({
      db: db as unknown as Db, canSpendTokens: () => true,
      generateImage: async () => "/uploads/cover.png",
      generateSceneImage: async (_, prompt) => {
        imageCalls.push(prompt);
        return "/uploads/ai-images/chapter-" + imageCalls.length + ".png";
      },
    });
    assert.equal(service.queueScenes("user", TIMEFRAME, PERIOD), true);
    assert.equal(service.queueScenes("user", TIMEFRAME, PERIOD), false, "Opening repeatedly must not spend tokens twice");
    await settle();
    const row = db.prepare("SELECT sceneArtJson,sceneArtStatus FROM wrapped_stories").get() as {
      sceneArtJson: string; sceneArtStatus: string;
    };
    const artwork = JSON.parse(row.sceneArtJson);
    assert.equal(row.sceneArtStatus, "done");
    assert.deepEqual(Object.keys(artwork), ["wrapped-1", "wrapped-2", "wrapped-3", "achievement-finale"]);
    assert.equal(imageCalls.length, 4);
    assert.match(imageCalls[2], /FULL-BLEED CLOSING SCENE/);
    assert.match(imageCalls[2], /EDITORIAL MODE/);
    assert.match(imageCalls[3], /Dungeon System Verdict/);
    assert.match(imageCalls[0], /A train on a train/);
    assert.match(imageCalls[1], /Eight titles at one hotel/);
    assert.doesNotMatch(imageCalls[0], /draw all media titles/i);
    assert.equal(service.queueScenes("user", TIMEFRAME, PERIOD, true), true, "Manual redraw regenerates chapter art only");
    await settle();
    assert.equal(imageCalls.length, 8);
    assert.equal(JSON.parse((db.prepare("SELECT story FROM wrapped_stories").get() as any).story).title, staged.title);
  } finally { db.close(); }
});

test("a previously finished three-image Wrapped backfills only missing full-bleed slides", async () => {
  const db = fixture();
  const generated: string[] = [];
  try {
    const old = {
      title: "October's stronger stories", dek: "One event mattered more",
      scenes: [
        { id: "wrapped-0", kind: "opening", title: "Welcome", body: "Intro" },
        { id: "wrapped-1", kind: "spotlight", title: "Already painted", body: "An older scene" },
        { id: "wrapped-2", kind: "outlier", title: "A real comparison", body: "The clean chart",
          editorialJob: "data-reveal", design: { layout: "infographic", visual: "bars" } },
        { id: "wrapped-3", kind: "journal", title: "The missing story", body: "A personal observation" },
        { id: "wrapped-4", kind: "closing", title: "End of the Line", body: "A quiet ending" },
      ],
    };
    db.prepare("UPDATE wrapped_stories SET story=?,sceneArtJson=?,sceneArtStatus='done'")
      .run(JSON.stringify(old), JSON.stringify({ "wrapped-1": "/uploads/previous-art.png" }));
    const service = createWrappedCoverService({
      db: db as unknown as Db, canSpendTokens: () => true,
      generateImage: async () => "/uploads/title.png",
      generateSceneImage: async (_userId, prompt) => {
        generated.push(prompt);
        return "/uploads/new-" + generated.length + ".png";
      },
    });
    assert.equal(service.queueScenes("user", TIMEFRAME, PERIOD), true,
      "An older done status is not proof every narrative slide has original art");
    await settle();
    const result = db.prepare("SELECT sceneArtJson,sceneArtStatus FROM wrapped_stories").get() as any;
    const images = JSON.parse(result.sceneArtJson);
    assert.equal(result.sceneArtStatus, "done");
    assert.equal(images["wrapped-1"], "/uploads/previous-art.png",
      "Already painted chapters must not incur a duplicate paid call");
    assert.equal(images["wrapped-2"], undefined, "Infographics stay clean");
    assert.deepEqual(Object.keys(images),
      ["wrapped-1", "wrapped-3", "wrapped-4", "achievement-finale"]);
    assert.equal(generated.length, 3);
    assert.match(generated[1], /FULL-BLEED CLOSING SCENE/);
    assert.match(generated[2], /Dungeon System Verdict/);
    assert.equal(service.queueScenes("user", TIMEFRAME, PERIOD), false);
  } finally { db.close(); }
});

test("failed image batches keep finished art, stop extra calls and allow explicit retry", async () => {
  const db = fixture();
  let calls = 0;
  let fail = true;
  try {
    const staged = {
      title: "A month with a finale", dek: "A meaningful series of events",
      scenes: [
        { id: "wrapped-0", kind: "opening", title: "Start", body: "Intro" },
        { id: "wrapped-1", kind: "insight", title: "First", body: "First chapter" },
        { id: "wrapped-2", kind: "insight", title: "Second", body: "Second chapter" },
        { id: "wrapped-3", kind: "closing", title: "Finish", body: "Conclusion" },
      ],
    };
    db.prepare("UPDATE wrapped_stories SET story=?").run(JSON.stringify(staged));
    const service = createWrappedCoverService({
      db: db as unknown as Db, canSpendTokens: () => true,
      generateImage: async () => "/uploads/title.png",
      generateSceneImage: async (_userId, prompt) => {
        calls++;
        if (fail && prompt.includes("Second chapter")) throw Error("image provider offline");
        return "/uploads/art-" + calls + ".png";
      },
    });
    assert.equal(service.queueScenes("user", TIMEFRAME, PERIOD), true);
    await settle();
    assert.equal(calls, 2, "Stop after the first bounded batch fails");
    const first = db.prepare("SELECT sceneArtJson,sceneArtStatus FROM wrapped_stories").get() as any;
    assert.equal(first.sceneArtStatus, "failed");
    assert.equal(JSON.parse(first.sceneArtJson)["wrapped-1"], "/uploads/art-1.png");
    assert.equal(service.queueScenes("user", TIMEFRAME, PERIOD), false,
      "GET must not endlessly retry paid failures");
    fail = false;
    assert.equal(service.queueScenes("user", TIMEFRAME, PERIOD, true), true);
    await settle();
    const retried = db.prepare("SELECT sceneArtJson,sceneArtStatus FROM wrapped_stories").get() as any;
    assert.equal(retried.sceneArtStatus, "done");
    assert.equal(Object.keys(JSON.parse(retried.sceneArtJson)).length, 4);
  } finally { db.close(); }
});

test("superseded Wrapped image jobs cannot overwrite newer artwork", async () => {
  const db = fixture();
  let releaseOld: ((url: string) => void) | undefined;
  try {
    const staged = {
      title: "A strange week", dek: "The big moment",
      scenes: [
        { id: "wrapped-0", kind: "opening", title: "Start", body: "Intro" },
        { id: "wrapped-1", kind: "location", title: "The train", body: "Train." },
        { id: "wrapped-2", kind: "closing", title: "Finish", body: "Outro" },
      ],
    };
    db.prepare("UPDATE wrapped_stories SET story=?").run(JSON.stringify(staged));
    let calls = 0;
    const service = createWrappedCoverService({
      db: db as unknown as Db, canSpendTokens: () => true,
      generateImage: async () => "/uploads/cover.png",
      generateSceneImage: async () => {
        calls++;
        if (calls === 1) return new Promise<string>(resolve => { releaseOld = resolve; });
        return "/uploads/new-chapter.png";
      },
    });
    assert.equal(service.queueScenes("user", TIMEFRAME, PERIOD), true);
    db.prepare("UPDATE wrapped_stories SET sceneArtStatus=NULL,sceneArtRequestId=NULL,sceneArtJson=NULL").run();
    assert.equal(service.queueScenes("user", TIMEFRAME, PERIOD), true);
    await settle();
    assert.deepEqual(JSON.parse((db.prepare("SELECT sceneArtJson FROM wrapped_stories").get() as any).sceneArtJson), {
      "wrapped-1": "/uploads/new-chapter.png",
      "wrapped-2": "/uploads/new-chapter.png",
      "achievement-finale": "/uploads/new-chapter.png",
    });
    releaseOld?.("/uploads/obsolete-chapter.png");
    await settle();
    assert.deepEqual(JSON.parse((db.prepare("SELECT sceneArtJson FROM wrapped_stories").get() as any).sceneArtJson), {
      "wrapped-1": "/uploads/new-chapter.png",
      "wrapped-2": "/uploads/new-chapter.png",
      "achievement-finale": "/uploads/new-chapter.png",
    });
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

test("Wrapped imagery respects ONLY its account's opt-in appearance and covers never use a different user's description", async () => {
  const db = fixture();
  const prompts: string[] = [];
  try {
    // A deliberate self-cast is necessary. Merely selecting Prefer must NOT
    // override the environment-only directive of an unrelated chapter.
    db.prepare("UPDATE wrapped_stories SET story=? WHERE userId='user'").run(JSON.stringify({
      ...story, scenes: [
        { ...story.scenes[0], composition: { visualPlan: {
          activityMode: "action", castMode: "self", camera: "wide",
          action: "Climb a fictional bridge above a vast cinematic landscape",
        } } }, ...story.scenes.slice(1),
      ],
    }));
    db.prepare("INSERT INTO settings(userId,visualSelfInsertMode,visualSelfDescription) VALUES(?,?,?)")
      .run("user", "never", "short ginger hair, very distinctive nose");
    db.prepare("INSERT INTO settings(userId,visualSelfInsertMode,visualSelfDescription) VALUES(?,?,?)")
      .run("another-user", "prefer", "bright-purple hair, face tattoos");
    const service = createWrappedCoverService({
      db: db as unknown as Db,
      canSpendTokens: () => true,
      generateImage: async (_, prompt) => {
        prompts.push(prompt);
        return "/uploads/ai-images/user-" + prompts.length + ".png";
      },
    });
    assert.equal(service.queue("user", TIMEFRAME, PERIOD), true);
    await settle();
    assert.doesNotMatch(prompts[0], /short ginger hair|bright-purple hair|OPTIONAL USER LIKENESS/);
    db.prepare("UPDATE settings SET visualSelfInsertMode='auto' WHERE userId='user'").run();
    assert.equal(service.queue("user", TIMEFRAME, PERIOD, true), true);
    await settle();
    assert.match(prompts[1], /short ginger hair/);
    assert.match(prompts[1], /ONLY WHEN a human protagonist naturally/);
    assert.doesNotMatch(prompts[1], /bright-purple hair|face tattoos/);
    db.prepare("UPDATE settings SET visualSelfInsertMode='prefer' WHERE userId='user'").run();
    assert.equal(service.queue("user", TIMEFRAME, PERIOD, true), true);
    await settle();
    assert.match(prompts[2], /PREFER the account owner/);
    assert.match(prompts[2], /short ginger hair/);
  } finally { db.close(); }
});

test("chapter illustrations receive the same account-scoped optional likeness instructions", async () => {
  const db = fixture();
  const prompts: string[] = [];
  try {
    db.prepare("INSERT INTO settings(userId,visualSelfInsertMode,visualSelfDescription) VALUES(?,?,?)")
      .run("user", "prefer", "short brown hair and blue glasses");
    const staged = {
      title: "This week's detours", dek: "A quiet train ride between worlds.",
      scenes: [
        { id: "wrapped-0", kind: "opening", title: "A journey", body: "Intro." },
        { id: "wrapped-1", kind: "location", title: "A train on a train",
          body: "Some travel memories from a train.",
          composition: { visualPlan: {
            activityMode: "exploration", castMode: "self", camera: "wide",
            action: "Walk through the train carriage toward the bright passing window",
          } } },
        { id: "wrapped-2", kind: "closing", title: "Home", body: "Ending." },
      ],
    };
    db.prepare("UPDATE wrapped_stories SET story=? WHERE userId='user'").run(JSON.stringify(staged));
    const service = createWrappedCoverService({
      db: db as unknown as Db,
      canSpendTokens: () => true,
      generateImage: async () => "/uploads/unused.png",
      generateSceneImage: async (_, prompt) => {
        prompts.push(prompt);
        return "/uploads/ai-images/personal-chapter.png";
      },
    });
    assert.equal(service.queueScenes("user", TIMEFRAME, PERIOD), true);
    await settle();
    assert.equal(prompts.length, 3);
    assert.match(prompts[0], /short brown hair and blue glasses/);
    assert.match(prompts[0], /PREFER the account owner/);
    assert.match(prompts[0], /A train on a train/);
    assert.match(prompts[0], /not a requirement/);
  } finally { db.close(); }
});

test("opening cover respects the same focal/typography plan and visual idea as the slide", () => {
  const directed = {
    ...story,
    scenes: story.scenes.map((scene, i) => i === 0 ? {
      ...scene,
      composition: {
        artConcept: "A lone astronaut standing in an enormous silent archive",
        direction: {
          presentation: "cinematic" as const,
          textSide: "right" as const,
          textPosition: "middle" as const,
          imageFocus: "left" as const,
        },
      },
    } : scene),
  };
  const prompt = buildWrappedCoverPrompt(directed, TIMEFRAME, PERIOD, []);
  assert.match(prompt, /lone astronaut standing in an enormous silent archive/);
  assert.match(prompt, /RIGHT 55% darker/);
  assert.match(prompt, /toward the LEFT/);
  assert.doesNotMatch(prompt, /LEFT 55% darker/);
});


test("specific Wrapped chapter art uses one matching ready Codex style, not an unrelated multi-work collage", async () => {
  const db = fixture();
  const prompts: string[] = [];
  const lookups: string[] = [];
  try {
    const staged = {
      title: "October's biggest surprise", dek: "A revealing review",
      scenes: [
        { id: "wrapped-0", kind: "opening", title: "Welcome", body: "A summary" },
        { id: "wrapped-1", kind: "spotlight", title: "A second season is wanted",
          body: "Mass Effect was worth every minute.",
          media: { id: "logged", title: "Mass Effect" },
          artworks: [{ id: "logged", title: "Mass Effect" }] },
        { id: "wrapped-2", kind: "location", title: "Many worlds in one place",
          body: "The hotel had several works going at once.",
          media: { id: "logged", title: "Mass Effect" },
          artworks: [
            { id: "logged", title: "Mass Effect" },
            { id: "unlogged", title: "Unlogged Title" },
          ] },
        { id: "wrapped-3", kind: "closing", title: "End", body: "Until next month" },
      ],
    };
    db.prepare("UPDATE wrapped_stories SET story=?").run(JSON.stringify(staged));
    const service = createWrappedCoverService({
      db: db as unknown as Db, canSpendTokens: () => true,
      generateImage: async () => "/uploads/cover.png",
      generateSceneImage: async (_, prompt) => {
        prompts.push(prompt);
        return "/uploads/art-" + prompts.length + ".png";
      },
      getCodexStyle: (userId, mediaId) => {
        assert.equal(userId, "user");
        lookups.push(mediaId);
        return { mediaId, mediaTitle: "Mass Effect",
          style: "Form: cinematic 3D game rendering\nPalette: desaturated blue\nCharacter models: recognizable armor" };
      },
    });
    assert.equal(service.queueScenes("user", TIMEFRAME, PERIOD), true);
    await settle();
    assert.equal(prompts.length, 4);
    assert.deepEqual(lookups, ["logged"], "Mixed scenes do not request arbitrary Codex styles");
    assert.match(prompts[0], /CODEX VISUAL IDENTITY/);
    assert.match(prompts[0], /desaturated blue/);
    assert.match(prompts[0], /A second season is wanted/);
    assert.doesNotMatch(prompts[1], /CODEX VISUAL IDENTITY|desaturated blue/);
    assert.match(prompts[2], /FULL-BLEED CLOSING SCENE/);
    assert.match(prompts[3], /Dungeon System Verdict/);
  } finally { db.close(); }
});

test("single-media cover may inherit the correct style without making it a media-cover mosaic", async () => {
  const db = fixture();
  const prompts: string[] = [];
  try {
    const service = createWrappedCoverService({
      db: db as unknown as Db, canSpendTokens: () => true,
      generateImage: async (_, prompt) => { prompts.push(prompt); return "/uploads/cover.png"; },
      getCodexStyle: (_userId, mediaId) => ({
        mediaId, mediaTitle: "Mass Effect",
        style: "Form: visually stylized 3D sci-fi game\nPalette: midnight blue and icy silver",
      }),
    });
    assert.equal(service.queue("user", TIMEFRAME, PERIOD), true);
    await settle();
    assert.match(prompts[0], /ONE-WORK CODEX VISUAL STYLE/);
    assert.match(prompts[0], /midnight blue and icy silver/);
    assert.match(prompts[0], /Only ONE focal action or interaction/);
    assert.doesNotMatch(prompts[0], /Unlogged Title|A Very Busy Side Quest/);
  } finally { db.close(); }
});

test("missing or throwing Codex resolvers never prevent image creation or retry with extra paid calls", async () => {
  const db = fixture();
  let imageCalls = 0;
  try {
    const staged = {
      title: "One memorable work", dek: "The main experience",
      scenes: [
        { id: "wrapped-0", kind: "opening", title: "Begin", body: "A beginning" },
        { id: "wrapped-1", kind: "spotlight", title: "Mass Effect stands out",
          body: "Your Mass Effect review was emphatic.",
          media: { id: "logged", title: "Mass Effect" } },
        { id: "wrapped-2", kind: "closing", title: "Finish", body: "A conclusion" },
      ],
    };
    db.prepare("UPDATE wrapped_stories SET story=?").run(JSON.stringify(staged));
    const service = createWrappedCoverService({
      db: db as unknown as Db, canSpendTokens: () => true,
      generateImage: async () => "/uploads/cover.png",
      generateSceneImage: async (_, prompt) => {
        imageCalls++;
        assert.doesNotMatch(prompt, /CODEX VISUAL IDENTITY/);
        return "/uploads/normal.png";
      },
      getCodexStyle: () => { throw new Error("Codex unavailable"); },
    });
    assert.equal(service.queueScenes("user", TIMEFRAME, PERIOD), true);
    await settle();
    assert.equal(imageCalls, 3);
    assert.equal((db.prepare("SELECT sceneArtStatus FROM wrapped_stories").get() as any).sceneArtStatus, "done");
  } finally { db.close(); }
});

test("only planned owner and in-world owner images receive a private face reference", async () => {
  const db = fixture();
  const sceneCalls: Array<{prompt:string;useFaceReference:boolean}> = [];
  const coverCalls: Array<{prompt:string;useFaceReference:boolean}> = [];
  try {
    db.prepare("INSERT INTO settings(userId,visualSelfInsertMode,visualSelfDescription) VALUES(?,?,?)")
      .run("user", "prefer", "short brown hair and a trimmed beard");
    db.prepare("INSERT INTO settings(userId,visualSelfInsertMode,visualSelfDescription) VALUES(?,?,?)")
      .run("another-user", "prefer", "a very different face");
    db.prepare("INSERT INTO visual_self_references(userId,image,mime,updatedAt) VALUES(?,?,?,?)")
      .run("user", Buffer.alloc(80), "image/png", new Date().toISOString());
    db.prepare("INSERT INTO visual_self_references(userId,image,mime,updatedAt) VALUES(?,?,?,?)")
      .run("another-user", Buffer.alloc(80, 8), "image/png", new Date().toISOString());
    const plan = (castMode: string) => ({
      activityMode: "action", castMode, camera: "wide",
      action: "Actively navigate and interact with the fictional world's setting",
    });
    const issue = {
      title: "Portrait as Participant", dek: "The user becomes part of the story.",
      scenes: [
        { id:"wrapped-0",kind:"opening",title:"Here I am",body:"A fictional gateway",
          composition:{visualPlan:plan("self")} },
        { id:"wrapped-1",kind:"spotlight",title:"Into the world",body:"The owner joins the action.",
          composition:{visualPlan:plan("in-world-self")} },
        { id:"wrapped-2",kind:"spotlight",title:"The hero",body:"A known fictional hero instead.",
          composition:{visualPlan:plan("canon-character")} },
        { id:"wrapped-3",kind:"closing",title:"Come home",body:"A personal final scene.",
          composition:{visualPlan:plan("self")} },
      ],
    };
    db.prepare("UPDATE wrapped_stories SET story=? WHERE userId='user'").run(JSON.stringify(issue));
    const service = createWrappedCoverService({
      db: db as unknown as Db, canSpendTokens:()=>true,
      generateImage: async (_,prompt,options) => {
        coverCalls.push({prompt,useFaceReference:!!options?.useFaceReference});
        return "/uploads/cover-self.png";
      },
      generateSceneImage: async (_,prompt,options) => {
        sceneCalls.push({prompt,useFaceReference:!!options?.useFaceReference});
        return "/uploads/scene-" + sceneCalls.length + ".png";
      },
    });
    assert.equal(service.queue("user",TIMEFRAME,PERIOD),true);
    assert.equal(service.queueScenes("user",TIMEFRAME,PERIOD),true);
    for (let n=0; n<10 && sceneCalls.length<4; n++) await settle();
    assert.deepEqual(coverCalls.map(c=>c.useFaceReference),[true]);
    assert.deepEqual(sceneCalls.map(c=>c.useFaceReference),[true,false,true,false],
      "Original source hero and achievement art must never get the account owner's face");
    assert.doesNotMatch(sceneCalls[1].prompt,/short brown hair|very different face/);
    assert.doesNotMatch(sceneCalls[3].prompt,/short brown hair|very different face/);
    db.prepare("UPDATE settings SET visualSelfInsertMode='never' WHERE userId='user'").run();
    assert.equal(service.queueScenes("user",TIMEFRAME,PERIOD,true),true);
    for (let n=0; n<10 && sceneCalls.length<8; n++) await settle();
    assert.deepEqual(sceneCalls.slice(4).map(c=>c.useFaceReference),[false,false,false,false]);
  } finally {db.close();}
});


test("only an explicitly named, opted-in friend is supplied to their Wrapped artwork", async()=>{
  const db=fixture();
  const coverCalls:Array<{prompt:string;ids:string[]}>=[];
  const sceneCalls:Array<{prompt:string;ids:string[]}>=[];
  try {
    db.exec("CREATE TABLE important_people (id TEXT,userId TEXT,name TEXT,aliases TEXT,relationship TEXT,notes TEXT,appearance TEXT,allowImages INTEGER,image BLOB,mime TEXT);");
    db.prepare("INSERT INTO important_people(id,userId,name,aliases,relationship,notes,appearance,allowImages,image,mime) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run("leo","user","Leonie",'["Leo"]',"partner","Plays FFXIV together","brown hair and a warm smile",1,Buffer.alloc(80),"image/png");
    db.prepare("INSERT INTO important_people(id,userId,name,aliases,relationship,notes,appearance,allowImages,image,mime) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run("secret","another-user","Alex",'[]',"friend","","distinctive hidden face",1,Buffer.alloc(80),"image/png");
    const human={activityMode:"social",castMode:"self",camera:"wide",action:"Share a cooperative game session",interaction:"Leo"};
    const canon={...human,castMode:"canon-character"};
    const issue={
      title:"The Week With Leo",dek:"A shared fictional adventure.",
      scenes:[
        {id:"wrapped-0",kind:"opening",title:"Leo was there",body:"A genuinely shared session with Leo.",
          composition:{visualPlan:human}},
        {id:"wrapped-1",kind:"spotlight",title:"Playing with Leo",body:"Leo and the player shared the evening.",
          composition:{visualPlan:human}},
        {id:"wrapped-2",kind:"spotlight",title:"Leo is mentioned only as context",body:"A fictional hero instead.",
          composition:{visualPlan:canon}},
        {id:"wrapped-3",kind:"closing",title:"Quiet landscape",body:"No human protagonist.",
          composition:{visualPlan:{...human,castMode:"environment"}}},
      ],
    };
    db.prepare("UPDATE wrapped_stories SET story=? WHERE userId='user'").run(JSON.stringify(issue));
    const service=createWrappedCoverService({
      db: db as unknown as Db,canSpendTokens:()=>true,
      generateImage:async(_,prompt,options)=>{
        coverCalls.push({prompt,ids:options?.personReferenceIds||[]});return "/uploads/cover-people.png";
      },
      generateSceneImage:async(_,prompt,options)=>{
        sceneCalls.push({prompt,ids:options?.personReferenceIds||[]});
        return "/uploads/scene-people-"+sceneCalls.length+".png";
      },
    });
    assert.equal(service.queue("user",TIMEFRAME,PERIOD),true);
    assert.equal(service.queueScenes("user",TIMEFRAME,PERIOD),true);
    for(let i=0;i<15&&sceneCalls.length<4;i++)await settle();
    assert.deepEqual(coverCalls[0].ids,["leo"]);
    assert.match(coverCalls[0].prompt,/brown hair and a warm smile/);
    assert.ok(sceneCalls.some(c=>c.ids.includes("leo")));
    assert.ok(sceneCalls.some(c=>c.ids.length===0));
    assert.ok(sceneCalls.every(c=>!c.ids.includes("secret")));
    assert.ok(sceneCalls.every(c=>!c.prompt.includes("distinctive hidden face")));
    db.prepare("UPDATE important_people SET allowImages=0 WHERE id='leo'").run();
    assert.equal(service.queueScenes("user",TIMEFRAME,PERIOD,true),true);
    for(let i=0;i<15&&sceneCalls.length<8;i++)await settle();
    assert.ok(sceneCalls.slice(4).every(c=>c.ids.length===0));
    assert.ok(sceneCalls.slice(4).every(c=>!c.prompt.includes("brown hair and a warm smile")));
  }finally{db.close();}
});
