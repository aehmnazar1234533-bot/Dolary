import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDevIcon, iconChanges, iconManifest } from "../src/dev-icon.js";

const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("developer icon accepts two PNG variants and maps them to PWA assets", () => {
  const icon = normalizeDevIcon({ icon180Base64: tinyPng, icon512Base64: tinyPng });
  assert.equal(icon.icon180Base64, tinyPng);
  assert.equal(icon.icon512Base64, tinyPng);
  const changes = iconChanges(icon);
  assert.deepEqual(changes.map(x => [x.path, x.encoding]), [
    ["docs/dolary/dolary-card-logo-180.png", "base64"],
    ["docs/dolary/pwa-icon-512.png", "base64"]
  ]);
});

test("developer icon rejects missing or oversized payloads", () => {
  assert.throws(() => normalizeDevIcon({ icon180Base64: "", icon512Base64: tinyPng }), /invalid_icon/);
  assert.throws(() => normalizeDevIcon({ icon180Base64: tinyPng, icon512Base64: "x".repeat(3_000_001) }), /invalid_icon/);
});


test("developer icon accepts raw JPEG fallback", () => {
  const icon = normalizeDevIcon({ rawBase64: tinyPng, rawMime: "image/jpeg" });
  assert.equal(icon.kind, "raw");
  assert.equal(icon.mime, "image/jpeg");
  assert.equal(icon.path, "docs/dolary/pwa-icon-uploaded.jpg");
  assert.equal(iconChanges(icon)[0].path, icon.path);
  assert.equal(iconManifest(icon)[0].type, "image/jpeg");
});
