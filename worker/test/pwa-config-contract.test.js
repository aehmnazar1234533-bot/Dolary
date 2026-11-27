import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const s=fs.readFileSync(new URL("../../docs/dolary/pwa-app.js",import.meta.url),"utf8");
test("PWA supports developer config and preview",()=>{assert.match(s,/dolary-config\.js/);assert.match(s,/dolaryDevPreview/);assert.match(s,/DOLARY_CONFIG/);});
import fs from "node:fs";
const indexHtml = fs.readFileSync(new URL("../../docs/dolary/index.html", import.meta.url), "utf8");
const serviceWorker = fs.readFileSync(new URL("../../docs/dolary/service-worker.js", import.meta.url), "utf8");

test("developer preview JavaScript uses a fresh cache-busted URL", () => {
  assert.match(indexHtml, /pwa-app\\.js\\?v=6/);
  assert.match(serviceWorker, /dolary-pwa-v41/);
  assert.match(serviceWorker, /pwa-app\\.js\\?v=6/);
  assert.doesNotMatch(indexHtml, /pwa-app\\.js\\?v=5/);
  assert.doesNotMatch(serviceWorker, /pwa-app\\.js\\?v=5/);
});
