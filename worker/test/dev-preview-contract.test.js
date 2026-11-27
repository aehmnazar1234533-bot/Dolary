import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const worker = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const pwa = fs.readFileSync(new URL("../../docs/dolary/pwa-app.js", import.meta.url), "utf8");

test("developer preview config returns CORS only through the configured app origin", () => {
  assert.ok(worker.includes("json({ ok: true, config }, 200, requestOriginHeader, env)"));
});

test("current developer icon preview follows the active published icon format", () => {
  assert.ok(worker.includes('published?.kind === "generated" ? "pwa-icon-512.png" : "pwa-icon.svg"'));
});

test("pending icon preview route stays behind developer session authentication", () => {
  const gate = worker.indexOf("const session = await verifyDevSession(request, env);");
  const route = worker.indexOf("/api/dev/icon-preview");
  assert.ok(gate >= 0 && route > gate, "the icon preview route must follow the session gate");
  assert.ok(worker.includes('Cache-Control": "no-store, max-age=0"'));
  assert.ok(worker.includes("iconPreviewAsset(icon)"));
});

test("PWA preview bypasses installed iPhone-only checks when a preview token is supplied", () => {
  assert.ok(pwa.includes("var devPreview=Boolean(previewParams.get('dolaryDevPreview'));"));
  assert.ok(pwa.includes("if(devPreview)document.documentElement.dataset.dolaryPreviewDevice"));
  assert.ok(pwa.includes("if(!devPreview&&!isStandalone)return;"));
  assert.ok(pwa.includes('credentials:"omit",mode:"cors"'));
  assert.ok(pwa.includes("function bootWithConfig(){ start(); }"));
});
