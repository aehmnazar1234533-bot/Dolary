import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDevIcon, iconChanges, iconManifest, iconPreviewAsset } from "../src/dev-icon.js";

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

test("developer icon preview returns safe image bytes for generated and raw assets", () => {
  const generated = normalizeDevIcon({ icon180Base64: tinyPng, icon512Base64: tinyPng });
  const generatedPreview = iconPreviewAsset(generated);
  assert.equal(generatedPreview.mime, "image/png");
  assert.equal(generatedPreview.bytes.byteLength, Buffer.from(tinyPng, "base64").byteLength);

  const raw = normalizeDevIcon({ rawBase64: tinyPng, rawMime: "image/jpeg" });
  const rawPreview = iconPreviewAsset(raw);
  assert.equal(rawPreview.mime, "image/jpeg");
  assert.equal(rawPreview.bytes.byteLength, Buffer.from(tinyPng, "base64").byteLength);
});

test("developer icon preview rejects missing or malformed image data", () => {
  assert.throws(() => iconPreviewAsset(null), /invalid_icon/);
  assert.throws(() => iconPreviewAsset({ kind: "raw", rawBase64: "not base64!", mime: "image/jpeg" }), /invalid_icon/);
});
