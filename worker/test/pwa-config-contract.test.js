import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const s=fs.readFileSync(new URL("../../docs/dolary/pwa-app.js",import.meta.url),"utf8");
test("PWA supports developer config and preview",()=>{assert.match(s,/dolary-config\.js/);assert.match(s,/dolaryDevPreview/);assert.match(s,/DOLARY_CONFIG/);});