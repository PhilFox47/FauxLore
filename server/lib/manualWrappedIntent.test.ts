import test from "node:test";
import assert from "node:assert/strict";
import { createManualWrappedIntentGate } from "./manualWrappedIntent";

const april = { userId: "phil", timeframe: "month", timeId: "2026-04" };
const may = { ...april, timeId: "2026-05" };
const otherUser = { ...april, userId: "another-user" };

test("navigation and an old automatic /start request cannot authorize generation", () => {
  const gate = createManualWrappedIntentGate();
  assert.equal(gate.begin(april, undefined), null);
  assert.equal(gate.begin(april, ""), null);
  assert.equal(gate.begin(april, "old-client-without-click"), null);
  assert.equal(gate.canSave(april, "legacy-pending-request"), false);
});

test("explicit intent is scoped to one user and period and can only start once", () => {
  const gate = createManualWrappedIntentGate();
  const intent = gate.issue(april);
  assert.equal(gate.begin(may, intent), null);
  assert.equal(gate.begin(otherUser, intent), null);
  const request = gate.begin(april, intent);
  assert.ok(request);
  assert.equal(gate.begin(april, intent), null);
  assert.equal(gate.canSave(april, request), true);
  assert.equal(gate.canSave(may, request), false);
  assert.equal(gate.canSave(otherUser, request), false);
  gate.complete(request!);
  assert.equal(gate.canSave(april, request), false);
});

test("intent expiry and in-flight request expiry fail closed", () => {
  let now = 1_000;
  const gate = createManualWrappedIntentGate(() => now);
  const expiredIntent = gate.issue(april);
  now += 120_001;
  assert.equal(gate.begin(april, expiredIntent), null);
  const fresh = gate.issue(april);
  const request = gate.begin(april, fresh);
  assert.ok(request);
  now += 3_600_001;
  assert.equal(gate.canSave(april, request), false);
});

test("a new manual generation does not inherit authorization from an older month", () => {
  const gate = createManualWrappedIntentGate();
  const aprilIntent = gate.issue(april);
  const mayIntent = gate.issue(may);
  const aprilRequest = gate.begin(april, aprilIntent);
  const mayRequest = gate.begin(may, mayIntent);
  assert.ok(aprilRequest);
  assert.ok(mayRequest);
  assert.notEqual(aprilRequest, mayRequest);
  assert.equal(gate.canSave(april, mayRequest), false);
  assert.equal(gate.canSave(may, aprilRequest), false);
});
