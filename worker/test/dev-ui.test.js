import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { DEFAULT_DOLARY_CONFIG } from "../src/dev-config.js";
import { renderDevPage } from "../src/dev-ui.js";

test("developer panel renders valid inline JavaScript", async () => {
  const response = renderDevPage(DEFAULT_DOLARY_CONFIG, [], "https://aehamtech.top/dolary/");
  const html = await response.text();
  const start = html.indexOf("<script>");
  const end = html.indexOf("</script>", start);
  assert.ok(start >= 0 && end > start, "developer page must contain its interactive script");
  const script = html.slice(start + 8, end);
  assert.doesNotThrow(() => new Script(script, { filename: "dolary-dev-panel.js" }));
});

test("developer panel includes mobile preview, icon preview and draft recovery controls", async () => {
  const html = await renderDevPage(DEFAULT_DOLARY_CONFIG, [], "https://aehamtech.top/dolary/").text();
  for (const id of ["previewDevice", "previewRefresh", "previewNewTab", "iconPreview", "reloadDraft", "draftStatus"]) {
    assert.ok(html.includes('id="' + id + '"'), "missing control: " + id);
  }
  assert.ok(html.includes('credentials:"same-origin"'));
  assert.ok(html.includes("d.previewUrl"));
});
