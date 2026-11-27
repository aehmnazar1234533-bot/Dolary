/* Dolary PWA hotfix: resilient rate loading + calculator rendering.
   Keeps the existing UI/animation and does not replace the app's stored data. */
(function () {
  "use strict";

  function isPwa() {
    return !!document.getElementById("pwaApp") ||
      !!(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true;
  }

  function waitForApp(tries) {
    if (!isPwa()) return;
    if (document.getElementById("pwaApp")) {
      init();
      return;
    }
    if (tries > 0) setTimeout(function () { waitForApp(tries - 1); }, 100);
  }

  function init() {
    var amount = document.getElementById("pwaCalcAmount");
    var result = document.getElementById("pwaCalcResult");
    var breakdown = document.getElementById("pwaCalcBreakdown");
    var unit = document.getElementById("pwaCalcUnit");
    var direction = "usd";
    var state = {
      cities: [],
      slug: localStorage.getItem("dolary.pwaSelectedProvince.v1") || "baghdad",
      rate: null,
      updatedAt: null
    };

    function cityName(city) {
      var name = city && (city.name_ar || city.city_ar || city.name);
      if (name && typeof name === "object") name = name.ar || name.en || name.ku;
      return String(name || (city && city.slug) || "العراق");
    }

    function rateFor(city) {
      if (!city || typeof city !== "object") return null;
      var sides = Array.isArray(city.sides) ? city.sides : [];
      for (var i = 0; i < sides.length; i++) {
        var side = sides[i];
        if (side && (side.side === null || typeof side.side === "undefined")) {
          var sideRate = Number(side.usd_iqd_per_100);
          if (Number.isFinite(sideRate) && sideRate > 0) return sideRate;
        }
      }
      var value = Number(city.usd_iqd_per_100);
      if (Number.isFinite(value) && value > 0) return value;
      value = Number(city.rate);
      return Number.isFinite(value) && value > 0 ? value : null;
    }

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

    function currentCity() {
      return state.cities.find(function (c) { return c.slug === state.slug; }) ||
        state.cities.find(function (c) { return c.slug === "baghdad"; }) ||
        state.cities[0] || null;
    }

    function calculate() {
      if (!amount || !result) return;
      var raw = amount.value.trim();
      var value = Number(raw);
      var rate = Number(state.rate);
      var perDollar = rate / 100;

      if (unit) unit.textContent = direction === "usd" ? "USD $" : "IQD د.ع";
      setText("pwaCalcResultLabel",
        direction === "usd" ? "القيمة التقريبية بالدينار العراقي" : "القيمة التقريبية بالدولار الأمريكي");

      result.style.display = "block";
      result.style.visibility = "visible";
      result.style.opacity = "1";
      result.style.direction = "ltr";
      result.style.unicodeBidi = "plaintext";

      if (!raw || !Number.isFinite(value) || value < 0 || !Number.isFinite(perDollar) || perDollar <= 0) {
        result.textContent = "—";
        if (breakdown) breakdown.textContent = perDollar > 0
          ? "أدخل مبلغاً صحيحاً حتى تظهر العملية والنتيجة."
          : "بانتظار سعر الصرف حتى يظهر الحساب.";
        setText("pwaPaperCount", "—");
        setText("pwaRemainderUsd", "— USD");
        setText("pwaRemainderIqd", "— د.ع");
        return;
      }

      var converted = direction === "usd" ? value * perDollar : value / perDollar;
      if (!Number.isFinite(converted)) {
        result.textContent = "—";
        return;
      }

      var resultDigits = direction === "usd" ? 0 : 2;
      result.textContent = (direction === "usd" ? num(converted, 0) + " د.ع" : num(converted, 2) + " USD");
      if (breakdown) {
        breakdown.innerHTML = direction === "usd"
          ? "<b>" + num(value, 2) + " USD</b> × <b>" + num(perDollar, 0) +
            " د.ع / USD</b> = <b>" + num(converted, 0) + "</b> <span class=\"unit\">د.ع</span>"
          : "<b>" + num(value, 0) + " د.ع</b> ÷ <b>" + num(perDollar, 2) +
            " د.ع / USD</b> = <b>" + num(converted, resultDigits) + "</b> <span class=\"unit\">USD</span>";
      }

      var usd = direction === "usd" ? value : converted;
      var papers = Math.floor((usd + 1e-9) / 100);
      var remainder = Math.max(0, usd - papers * 100);
      setText("pwaPaperCount", num(papers, 0));
      setText("pwaRemainderUsd", num(remainder, 2) + " USD");
      setText("pwaRemainderIqd", num(remainder * perDollar, 0) + " د.ع");
    }

    function apply(data, stale) {
      if (!data || !Array.isArray(data.cities)) throw new Error("invalid_rates");
      var cities = data.cities.filter(function (c) { return c && rateFor(c) !== null; });
      if (!cities.length) throw new Error("empty_rates");

      state.cities = cities;
      try { window.__dolaryRatesData = data; } catch (_) {}
      var selected = cities.find(function (c) { return c.slug === state.slug; }) ||
        cities.find(function (c) { return c.slug === "baghdad"; }) || cities[0];
      state.slug = selected.slug;
      state.rate = rateFor(selected);
      state.updatedAt = selected.updated_at || data.updated_at || null;

      try { localStorage.setItem("dolary.pwaSelectedProvince.v1", state.slug); } catch (_) {}
      try {
        localStorage.setItem("dolary.pwaRatesCache.v1", JSON.stringify({
          data: data,
          savedAt: new Date().toISOString()
        }));
      } catch (_) {}

      var select = document.getElementById("pwaProvinceSelect");
      if (select) {
        select.value = state.slug;
        if (select.value !== state.slug) {
          select.replaceChildren();
          cities.forEach(function (city) {
            var option = document.createElement("option");
            option.value = city.slug;
            option.textContent = cityName(city);
            if (city.slug === state.slug) option.selected = true;
            select.appendChild(option);
          });
        }
      }

      setText("pwaProvinceName", cityName(selected));
      var rateEl = document.getElementById("pwaRateValue");
      if (rateEl) rateEl.innerHTML = num(state.rate, 0) + " <small>د.ع / 100 USD</small>";
      setText("pwaUpdatedText", stale
        ? "آخر سعر محفوظ محلياً — غير محدث"
        : state.updatedAt
          ? "آخر تحديث: " + new Date(state.updatedAt).toLocaleString("ar-IQ", { dateStyle: "short", timeStyle: "short" })
          : "تم جلب السعر الآن");

      calculate();
    }

    async function fetchJson(url) {
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, 10000);
      try {
        var response = await fetch(url + (url.indexOf("?") >= 0 ? "&" : "?") + "_=" + Date.now(), {
          method: "GET",
          cache: "no-store",
          headers: { "Accept": "application/json" },
          mode: "cors",
          credentials: "omit"
        });
        if (!response.ok) throw new Error("HTTP_" + response.status);
        var data = await response.json();
        if (!data || !Array.isArray(data.cities)) throw new Error("INVALID_DATA");
        return data;
      } finally {
        clearTimeout(timer);
      }
    }

    async function load() {
      try {
        var data = await fetchJson("https://dolary.aehmnazar-1234533.workers.dev/api/rates");
        apply(data, false);
        return true;
      } catch (_) {}

      try {
        var cached = JSON.parse(localStorage.getItem("dolary.pwaRatesCache.v1") || "null");
        if (cached && cached.data) {
          apply(cached.data, true);
          return true;
        }
      } catch (_) {}

      setText("pwaUpdatedText", "تعذر جلب السعر — اضغط تحديث وحاول مرة ثانية");
      if (result) result.textContent = "—";
      if (breakdown) breakdown.textContent = "تعذر جلب سعر الصرف حالياً.";
      return false;
    }

    if (amount) amount.addEventListener("input", calculate);
    document.querySelectorAll("#pwaCalcDirection button").forEach(function (button) {
      button.addEventListener("click", function () {
        direction = button.getAttribute("data-dir") === "iqd" ? "iqd" : "usd";
        calculate();
      });
    });

    var select = document.getElementById("pwaProvinceSelect");
    if (select) {
      select.addEventListener("change", function () {
        state.slug = this.value;
        var city = currentCity();
        if (city) {
          state.rate = rateFor(city);
          state.updatedAt = city.updated_at || state.updatedAt;
          try { localStorage.setItem("dolary.pwaSelectedProvince.v1", state.slug); } catch (_) {}
          setText("pwaProvinceName", cityName(city));
          var rateEl = document.getElementById("pwaRateValue");
          if (rateEl) rateEl.innerHTML = num(state.rate, 0) + " <small>د.ع / 100 USD</small>";
          calculate();
        }
      });
    }

    var refresh = document.getElementById("pwaRefreshBtn");
    if (refresh) refresh.addEventListener("click", function () { load(); });

    calculate();
    load();
    setInterval(load, 5 * 60 * 1000);
  }

  waitForApp(100);
})();
