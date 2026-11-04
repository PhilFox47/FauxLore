import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initSchema } from "../db/schema";
import { readUserFaceReference, shouldAttachFaceReference, validateFacePhoto } from "./visualSelfReference";
import type { WrappedVisualPlan } from "../../src/lib/dynamicScenes";

const png = (width=300, height=300) => {
  const bytes = Buffer.alloc(64);
  Buffer.from("89504e470d0a1a0a", "hex").copy(bytes);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
};
const makePlan = (castMode: WrappedVisualPlan["castMode"]): WrappedVisualPlan => ({
  activityMode: "action", castMode, camera: "wide",
  action: "Run into a fictional world and join its adventures",
});

test("reference is only permitted for explicitly cast self and in-world counterpart", () => {
  for (const mode of ["auto", "prefer"] as const) {
    assert.equal(shouldAttachFaceReference(mode, makePlan("self")), true);
    assert.equal(shouldAttachFaceReference(mode, makePlan("in-world-self")), true);
    assert.equal(shouldAttachFaceReference(mode, makePlan("canon-character")), false);
    assert.equal(shouldAttachFaceReference(mode, makePlan("environment")), false);
    assert.equal(shouldAttachFaceReference(mode, undefined), false);
  }
  for (const castMode of ["self","in-world-self","canon-character","environment"] as const) {
    assert.equal(shouldAttachFaceReference("never", makePlan(castMode)), false);
  }
  assert.equal(shouldAttachFaceReference("malicious", makePlan("self")), false);
});

test("upload validation uses actual bytes, not untrusted MIME or extension", () => {
  assert.deepEqual(validateFacePhoto(png(), "image/png"), {mime:"image/png",width:300,height:300});
  assert.throws(() => validateFacePhoto(png(), "image/jpeg"), /does not match/);
  assert.throws(() => validateFacePhoto(png(5000,200), "image/png"), /dimensions/);
  assert.throws(() => validateFacePhoto(png(100,100), "image/png"), /dimensions/);
  assert.throws(() => validateFacePhoto(Buffer.from("<svg>evil</svg>"), "image/svg+xml"), /PNG, JPEG, or WebP/);
  assert.throws(() => validateFacePhoto(Buffer.alloc(4 * 1024 * 1024 + 1), "image/png"), /4 MB/);
});

test("the image adapter reads only the requesting user's stored photo", () => {
  const db = new Database(":memory:");
  try {
    initSchema(db);
    for (const id of ["alice", "bob"]) db.prepare("INSERT INTO users(id,username,passwordHash) VALUES (?,?,?)")
      .run(id,id,"hash");
    db.prepare("INSERT INTO visual_self_references(userId,image,mime,updatedAt) VALUES(?,?,?,?)")
      .run("alice",png(),"image/png",new Date().toISOString());
    assert.equal(readUserFaceReference(db,"bob"),null);
    assert.equal(readUserFaceReference(db,"alice"),"data:image/png;base64,"+png().toString("base64"));
    db.prepare("DELETE FROM visual_self_references WHERE userId=?").run("alice");
    assert.equal(readUserFaceReference(db,"alice"),null);
  } finally {db.close();}
});
