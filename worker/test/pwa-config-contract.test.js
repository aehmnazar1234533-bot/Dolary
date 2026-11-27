import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pwaApp = fs.readFileSync(new URL("../../docs/dolary/pwa-app.js", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("../../docs/dolary/index.html", import.meta.url), "utf8");
const serviceWorker = fs.readFileSync(new URL("../../docs/dolary/service-worker.js", import.meta.url), "utf8");
const pwaApp = fs.readFileSync(new URL("../../docs/dolary/pwa-app.js", import.meta.url), "utf8");
const workerSource = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

test("PWA supports developer config and preview", () => {
  assert.ok(pwaApp.includes("dolary-config.js"));
  assert.ok(pwaApp.includes("dolaryDevPreview"));
  assert.ok(pwaApp.includes("DOLARY_CONFIG"));
});

test("developer preview JavaScript uses a fresh cache-busted URL", () => {
  assert.ok(indexHtml.includes("./pwa-app.js?v=8"));
  assert.ok(serviceWorker.includes("dolary-pwa-v44"));
  assert.ok(serviceWorker.includes("./pwa-app.js?v=8"));
  assert.ok(!indexHtml.includes("./pwa-app.js?v=7"));
  assert.ok(!serviceWorker.includes("./pwa-app.js?v=7"));
});


test("PWA calculator uses the live rate state and keeps the no-value guard", () => {
  assert.ok(pwaApp.includes("var rate=Number(appState.ratePer100)"));
  assert.ok(pwaApp.includes("amountText===''"));
  assert.ok(pwaApp.includes("appState.ratePer100=rateFor(sel)"));
});

test("PWA rates use the Dolary Worker proxy", () => {
  assert.ok(pwaApp.includes("https://dolary.aehmnazar-1234533.workers.dev/api/rates"));
  assert.ok(workerSource.includes('url.pathname === "/api/rates" && request.method === "GET"'));
  assert.ok(workerSource.includes("const data = await upstream.json();"));
  assert.ok(workerSource.includes('Array.isArray(data.cities)'));
});
