import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../../docs/dolary/pwa-app.js", import.meta.url), "utf8");
const start = source.indexOf("function calc(){");
const end = source.indexOf("  function renderAlertForm", start);
assert.ok(start >= 0 && end > start, "PWA calculator function must remain present");

function createCalculator(ratePer100, amount, direction = "usd") {
  const values = {
    pwaCalcAmount: { value: amount },
    pwaCalcResult: { textContent: "" },
    pwaCalcResultLabel: { textContent: "" },
    pwaCalcUnit: { textContent: "" },
    pwaCalcBreakdown: { textContent: "" },
    pwaPaperCount: { textContent: "" },
    pwaRemainderUsd: { textContent: "" },
    pwaRemainderIqd: { textContent: "" }
  };
  const context = {
    appState: { ratePer100 },
    calcDir: direction,
    window: { matchMedia() { return { matches: false }; } },
    performance: { now() { return 0; } },
    cancelAnimationFrame() {},
    requestAnimationFrame() {},
    calcFrames: new WeakMap(),
    fmt(value, digits) {
      return new Intl.NumberFormat("ar-IQ", {
        minimumFractionDigits: digits || 0,
        maximumFractionDigits: digits || 0
      }).format(value);
    },
    fmtCalc(value, digits) {
      return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: digits ? Math.min(digits, 2) : 0,
        maximumFractionDigits: digits || 0
      }).format(value);
    },
    animateCalcNumber(element, target, suffix, fractionDigits, prefix) {
      element.textContent = (prefix || "") + context.fmtCalc(Number(target), fractionDigits || 0) + (suffix || "");
    },
    document: {
      getElementById(id) { return values[id]; }
    }
  };
  vm.runInNewContext(source.slice(start, end), context);
  assert.equal(typeof context.calc, "function");
  context.calc();
  return values;
}

test("USD to IQD calculation returns the expected formatted amount", () => {
  const values = createCalculator(169450, "100", "usd");
  assert.equal(values.pwaCalcResult.textContent, "169,450 د.ع");
  assert.equal(values.pwaPaperCount.textContent, "1");
  assert.equal(values.pwaRemainderUsd.textContent, "0.00 USD");
});

test("IQD to USD calculation returns a whole-dollar result by default", () => {
  const values = createCalculator(169450, "169450", "iqd");
  assert.equal(values.pwaCalcResult.textContent, "USD 100.00");
  assert.match(values.pwaCalcBreakdown.innerHTML, /169,450/);
});

test("Blank calculator input never becomes zero", () => {
  const values = createCalculator(169450, "", "usd");
  assert.equal(values.pwaCalcResult.textContent, "—");
  assert.equal(values.pwaCalcBreakdown.textContent, "أدخل مبلغاً صحيحاً حتى تظهر النتيجة.");
});

test("Calculator waits for a valid rate", () => {
  const values = createCalculator(0, "100", "usd");
  assert.equal(values.pwaCalcResult.textContent, "—");
  assert.equal(values.pwaCalcBreakdown.textContent, "بانتظار سعر الصرف حتى يظهر الحساب.");
});
