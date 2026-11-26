import test from "node:test";
import assert from "node:assert/strict";
import { cleanBroadcastId, newBroadcastId } from "../src/index.js";

test("broadcast IDs are accepted when stable and rejected when unsafe", () => {
  assert.equal(cleanBroadcastId("broadcast-20261127-001"), "broadcast-20261127-001");
  assert.equal(cleanBroadcastId(""), null);
  assert.equal(cleanBroadcastId("bad id"), null);
});

test("new broadcast IDs are unique and not time-only", () => {
  const a = newBroadcastId();
  const b = newBroadcastId();
  assert.match(a, /^broadcast-[0-9a-f-]{36}$/);
  assert.match(b, /^broadcast-[0-9a-f-]{36}$/);
  assert.notEqual(a, b);
});

test("the worker source keeps broadcast identity and delivery idempotency", async () => {
  const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("../src/index.js", import.meta.url), "utf8"));
  assert.match(source, /BROADCAST_PREFIX/);
  assert.match(source, /deliveryKey\(notification\.broadcastId, key\)/);
  assert.match(source, /broadcastId: notification\.broadcastId/);
  assert.doesNotMatch(source, /id:\s*"broadcast-"\s*\+\s*Date\.now\(\)/);
});
