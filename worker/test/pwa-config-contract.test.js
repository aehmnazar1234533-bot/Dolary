import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pwaApp = fs.readFileSync(new URL("../../docs/dolary/pwa-app.js", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("../../docs/dolary/index.html", import.meta.url), "utf8");
const serviceWorker = fs.readFileSync(new URL("../../docs/dolary/service-worker.js", import.meta.url), "utf8");

test("PWA supports developer config and preview", () => {
  assert.ok(pwaApp.includes("dolary-config.js"));
  assert.ok(pwaApp.includes("dolaryDevPreview"));
  assert.ok(pwaApp.includes("DOLARY_CONFIG"));
});

test("developer preview JavaScript uses a fresh cache-busted URL", () => {
  assert.ok(indexHtml.includes("./pwa-app.js?v=6"));
  assert.ok(serviceWorker.includes("dolary-pwa-v41"));
  assert.ok(serviceWorker.includes("./pwa-app.js?v=6"));
  assert.ok(!indexHtml.includes("./pwa-app.js?v=5"));
  assert.ok(!serviceWorker.includes("./pwa-app.js?v=5"));
});
