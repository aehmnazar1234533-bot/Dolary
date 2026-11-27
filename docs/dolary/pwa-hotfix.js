/* Dolary PWA calculator hotfix.
   Uses the rate already loaded by the main PWA (XEIQD via Worker).
   No second rate request is made, preventing duplicate requests and stale/empty province lists. */
(function () {
  "use strict";

  function waitForApp(tries) {
    var app = document.getElementById("pwaApp");
    if (app) {
      init();
      return;
    }
    if (tries > 0) setTimeout(function () { waitForApp(tries - 1); }, 100);
  }

  function readRate() {
    var el = document.getElementById("pwaRateValue");
    if (!el) return null;
    var raw = (el.textContent || "").replace(/[^0-9.]/g, "");
    var rate = Number(raw);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  }

  function init() {
    var amount = document.getElementById("pwaCalcAmount");
    var result = document.getElementById("pwaCalcResult");
    var breakdown = document.getElementById("pwaCalcBreakdown");
    var unit = document.getElementById("pwaCalcUnit");
    if (!amount || !result) return;

    var direction = "usd";

    function num(value, digits) {
      return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: digits || 0,
        maximumFractionDigits: digits || 0
      }).format(value);
    }

    function setText(id, value) {
      var el = document.getElementById(id);
      if (el) el.textContent = value;
    }

    function calculate() {
      var raw = amount.value.trim();
      var value = Number(raw);
      var rate = readRate();
      var perDollar = rate ? rate / 100 : NaN;

      if (unit) unit.textContent = direction === "usd" ? "USD $" : "IQD د.ع";
      setText("pwaCalcResultLabel",
        direction === "usd"
          ? "القيمة التقريبية بالدينار العراقي"
          : "القيمة التقريبية بالدولار الأمريكي");

      result.style.display = "block";
      result.style.visibility = "visible";
      result.style.opacity = "1";
      result.style.direction = "ltr";
      result.style.unicodeBidi = "plaintext";

      if (!raw || !Number.isFinite(value) || value < 0) {
        result.textContent = "—";
        if (breakdown) breakdown.textContent = "أدخل مبلغاً صحيحاً حتى تظهر العملية والنتيجة.";
        setText("pwaPaperCount", "—");
        setText("pwaRemainderUsd", "— USD");
        setText("pwaRemainderIqd", "— د.ع");
        return;
      }

      if (!Number.isFinite(perDollar) || perDollar <= 0) {
        result.textContent = "—";
        if (breakdown) breakdown.textContent = "بانتظار سعر الصرف حتى يظهر الحساب.";
        return;
      }

      var converted = direction === "usd" ? value * perDollar : value / perDollar;
      if (!Number.isFinite(converted)) {
        result.textContent = "—";
        return;
      }

      var resultDigits = direction === "usd" ? 0 : 2;
      result.textContent = direction === "usd"
        ? num(converted, 0) + " د.ع"
        : num(converted, 2) + " USD";

      if (breakdown) {
        breakdown.innerHTML = direction === "usd"
          ? "<b>" + num(value, 2) + " USD</b> × <b>" + num(perDollar, 0) +
            " د.ع / USD</b> = <b>" + num(converted, 0) +
            "</b> <span class=\"unit\">د.ع</span>"
          : "<b>" + num(value, 0) + " د.ع</b> ÷ <b>" + num(perDollar, 2) +
            " د.ع / USD</b> = <b>" + num(converted, resultDigits) +
            "</b> <span class=\"unit\">USD</span>";
      }

      var usd = direction === "usd" ? value : converted;
      var papers = Math.floor((usd + 1e-9) / 100);
      var remainder = Math.max(0, usd - papers * 100);
      setText("pwaPaperCount", num(papers, 0));
      setText("pwaRemainderUsd", num(remainder, 2) + " USD");
      setText("pwaRemainderIqd", num(remainder * perDollar, 0) + " د.ع");
    }

    amount.addEventListener("input", calculate);

    document.querySelectorAll("#pwaCalcDirection button").forEach(function (button) {
      button.addEventListener("click", function () {
        direction = button.getAttribute("data-dir") === "iqd" ? "iqd" : "usd";
        document.querySelectorAll("#pwaCalcDirection button").forEach(function (b) {
          b.classList.toggle("active", b === button);
          b.setAttribute("aria-pressed", b === button ? "true" : "false");
        });
        calculate();
      });
    });

    var select = document.getElementById("pwaProvinceSelect");
    if (select) select.addEventListener("change", function () {
      setTimeout(calculate, 50);
    });

    var refresh = document.getElementById("pwaRefreshBtn");
    if (refresh) refresh.addEventListener("click", function () {
      setTimeout(calculate, 700);
    });

    calculate();
    setInterval(calculate, 1500);
  }

  waitForApp(100);
})();