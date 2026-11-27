import test from "node:test";
import assert from "node:assert/strict";

test("social rate normalization and dedupe marker are deterministic", async () => {
  const m = await import("../src/social-card.js");
  assert.equal(m.normalizeSocialRate("151500"),151500);
  assert.equal(m.socialRateKey(151500),"151500");
  assert.equal(m.socialMarker(151500),"[DOLARY-RATE:151500]");
  assert.match(m.socialCaption(151500,"بغداد"),/151,500/);
});

test("social card HTML contains the rate and dark Dolary template", async () => {
  const m = await import("../src/social-card.js");
  const html=m.buildSocialCardHtml(151500,"بغداد");
  assert.match(html,/151,500/);
  assert.match(html,/دولاري/);
  assert.match(html,/#06142f/);
});
