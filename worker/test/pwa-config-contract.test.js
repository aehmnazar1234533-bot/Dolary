import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pwaApp = fs.readFileSync(new URL("../../docs/dolary/pwa-app.js", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("../../docs/dolary/index.html", import.meta.url), "utf8");
const serviceWorker = fs.readFileSync(new URL("../../docs/dolary/service-worker.js", import.meta.url), "utf8");
const workerSource = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

test("PWA supports developer config and preview", () => {
  assert.ok(pwaApp.includes("dolary-config.js"));
  assert.ok(pwaApp.includes("dolaryDevPreview"));
  assert.ok(pwaApp.includes("DOLARY_CONFIG"));
});

test("developer preview JavaScript uses a fresh cache-busted URL", () => {
  assert.ok(indexHtml.includes("./pwa-app.js?v=15"));
  assert.ok(serviceWorker.includes("dolary-pwa-v51"));
  assert.ok(serviceWorker.includes("./pwa-app.js?v=15"));
  assert.ok(!indexHtml.includes("./pwa-app.js?v=7"));
  assert.ok(!serviceWorker.includes("./pwa-app.js?v=7"));
});

test("PWA rates use the Dolary Worker proxy", () => {
  assert.ok(pwaApp.includes("https://dolary.aehmnazar-1234533.workers.dev/api/rates"));
  assert.ok(workerSource.includes('url.pathname === "/api/rates" && request.method === "GET"'));
  assert.ok(workerSource.includes("const data = await upstream.json();"));
  assert.ok(workerSource.includes('Array.isArray(data.cities)'));
});


test("PWA keeps a local last-known rate cache for offline fallback", () => {
  assert.ok(pwaApp.includes("RATES_CACHE_KEY='dolary.pwaRatesCache.v1'"));
  assert.ok(pwaApp.includes("localStorage.setItem(RATES_CACHE_KEY"));
  assert.ok(pwaApp.includes("var cached=readJson(RATES_CACHE_KEY,null)"));
  assert.ok(pwaApp.includes("appState.rateError=true"));
});

test("Main site rates use the same Dolary Worker proxy", () => {
  assert.ok(indexHtml.includes("https://dolary.aehmnazar-1234533.workers.dev/api/rates"));
  assert.ok(!indexHtml.includes("https://xeiqd.com/rates.json"));
});


test("PWA uses the same nested-side rate shape as the main calculator", () => {
  assert.ok(pwaApp.includes("Array.isArray(c.sides)"));
  assert.ok(pwaApp.includes("side.side===null"));
  assert.ok(pwaApp.includes("side.usd_iqd_per_100!=null"));
});


test("PWA is enabled for Android standalone mode", () => {
  assert.ok(pwaApp.includes("if(!devPreview&&!isStandalone)return;"));
  assert.ok(indexHtml.includes("if(standalone)document.documentElement.classList.add('pwa-mode');"));
});
