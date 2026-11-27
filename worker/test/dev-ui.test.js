import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { DEFAULT_DOLARY_CONFIG } from "../src/dev-config.js";
import { renderDevPage } from "../src/dev-ui.js";

test("developer panel renders valid inline JavaScript", async () => {
  const response = renderDevPage(DEFAULT_DOLARY_CONFIG, [], "https://aehamtech.top/dolary/");
  const html = await response.text();
  const script = html.match(/<script>([\\s\\S]*?)<\\/script>/);
  assert.ok(script, "developer page must contain its interactive script");
  assert.doesNotThrow(() => new Script(script[1], { filename: "dolary-dev-panel.js" }));
});

test("developer panel includes mobile preview, icon preview and draft recovery controls", async () => {
  const html = await renderDevPage(DEFAULT_DOLARY_CONFIG, [], "https://aehamtech.top/dolary/").text();
  for (const id of ["previewDevice", "previewRefresh", "previewNewTab", "iconPreview", "reloadDraft", "draftStatus"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /credentials:"same-origin"/);
  assert.match(html, /api\\/dev\\/icon-preview/);
});
