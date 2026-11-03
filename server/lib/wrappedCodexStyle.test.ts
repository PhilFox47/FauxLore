import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import type { Db } from "../context";
import type { CodexRow, CodexService } from "../services/codex";
import { wrappedStyleFromCodex, createWrappedCodexStyleResolver } from "./wrappedCodexStyle";

const row = (artStyle: NonNullable<NonNullable<CodexRow["data"]>["artStyle"]>,
  status: CodexRow["status"] = "ready"): CodexRow => ({
  id: "codex-1", userId: "owner", mediaId: "avatar",
  titleKey: "avatar::game", title: "Avatar: Seven Havens",
  mediaType: "Game", status, error: null,
  data: { premise: "A journey", artStyle },
  model: "codex-v3", createdAt: "2026-11-01", updatedAt: "2026-11-01",
});

test("completed Codex provides specific form, color and rendering instructions", () => {
  const result = wrappedStyleFromCodex(row({
    form: "stylized 2D animation",
    summary: "A hand-painted animated world with strong readable silhouettes",
    medium: "cel-shaded illustrated animation",
    palette: "jade, ochre and deep indigo",
    lighting: "soft painted dusk",
    linework: "clean expressive contours",
    characterDesign: "expressive animated faces",
    styleKeywords: ["painted backgrounds", "cel animation"],
    notLike: "generic photorealistic game stills",
  }), "avatar", "Avatar: Seven Havens");
  assert.equal(result?.mediaId, "avatar");
  assert.match(result?.style || "", /Named style: painted backgrounds, cel animation/);
  assert.match(result?.style || "", /Form: stylized 2D animation/);
  assert.match(result?.style || "", /Palette: jade, ochre and deep indigo/);
  assert.match(result?.style || "", /generic photorealistic game stills/);
  assert.ok((result?.style.length || 0) <= 1700);
});

test("no ready or useful source visual language means no forced art direction", () => {
  const strong = {
    form: "live action",
    summary: "A grounded, warmly shot road-trip comedy with naturally textured locations",
    medium: "cinematic live-action filming",
    linework: "subtle film grain and natural lens falloff",
  };
  assert.equal(wrappedStyleFromCodex(null, "id", "Work"), null);
  assert.equal(wrappedStyleFromCodex(row(strong, "generating"), "id", "Work"), null);
  assert.equal(wrappedStyleFromCodex(row({ form: "none",
    summary: "A text-only book with no native moving-image rendering",
    medium: "no visual medium" }), "id", "Book"), null);
  assert.equal(wrappedStyleFromCodex(row({ palette: "blue" }), "id", "Work"), null);
  assert.match(wrappedStyleFromCodex(row(strong), "id", "Work")?.style || "", /live.action/i);
});

test("Codex retrieval verifies account ownership and never researches new dossiers", () => {
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE media (id TEXT PRIMARY KEY,userId TEXT,title TEXT,mediaType TEXT,year INTEGER,season INTEGER)");
    db.prepare("INSERT INTO media VALUES(?,?,?,?,?,?)")
      .run("avatar", "owner", "Avatar: Seven Havens", "Game", 2026, null);
    let reads = 0;
    const codex = {
      getCodexRow(userId: string, opts: { mediaId?: string | null }) {
        reads++;
        assert.equal(userId, "owner");
        assert.equal(opts.mediaId, "avatar");
        return row({
          form: "3D stylized game animation",
          summary: "Expressive stylized fantasy painted in clean, bold colors",
          medium: "stylized CGI",
        });
      },
    } as Pick<CodexService, "getCodexRow">;
    const resolve = createWrappedCodexStyleResolver(db as unknown as Db, codex);
    assert.equal(resolve("other-account", "avatar"), null);
    assert.equal(resolve("owner", "missing"), null);
    assert.equal(reads, 0, "Never query Codex for another user's media");
    assert.match(resolve("owner", "avatar")?.style || "", /stylized CGI/);
    assert.equal(reads, 1);
  } finally {
    db.close();
  }
});
