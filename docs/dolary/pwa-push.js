(function () {
  "use strict";

  var standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    (window.matchMedia && window.matchMedia("(display-mode: fullscreen)").matches) ||
    window.navigator.standalone === true;
  var apple = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  // إشعارات دولاري مخصصة للتطبيق المثبت PWA فقط، وليس لصفحة الموقع العادية.
  var standaloneRequired = true;
  if (!standalone) return;

  var config = window.DOLARY_PUSH_CONFIG || {};
  var apiBase = String(config.apiBaseUrl || "").trim().replace(/\/$/, "");
  var HISTORY_KEY = "dolary.priceAlertHistory.v1";
  var ALERT_KEY = "dolary.priceAlert.v1";
  var DB_NAME = "dolary-push-history";
  var DB_STORE = "events";
  var UNREAD_KEY = "dolary.pwaUnread.v1";
  var AUTO_PUSH_ENABLED_KEY = "dolary.pwaAutoPushEnabled.v1";
  var AUTO_PUSH_DISABLED_KEY = "dolary.pwaAutoPushDisabled.v1";
  var SUBSCRIPTION_KEY = "dolary.pwaSubscription.v1";
  var VAPID_KEY_STORAGE = "dolary.pwaVapidPublicKey.v1";

  function statusText(text) {
    var el = document.getElementById("pwaAlertStatus");
    if (el) el.textContent = text;
  }

  function permissionText(text) {
    var el = document.getElementById("pwaPermissionStatus");
    if (el) el.textContent = text;
  }

  function localRule() {
    try { return JSON.parse(localStorage.getItem(ALERT_KEY) || "null"); }
    catch (_) { return null; }
  }

  function localPreference() {
    try {
      var slug = String(localStorage.getItem("dolary.pwaSelectedProvince.v1") || "baghdad").trim() || "baghdad";
      var select = document.getElementById("pwaProvinceSelect");
      if (select && select.value) slug = String(select.value);
      var option = select && select.options ? select.options[select.selectedIndex] : null;
      var province = option && option.textContent ? option.textContent.trim() : "";
      return {
        slug: slug.slice(0, 40),
        province: (province || slug).slice(0, 60)
      };
    } catch (_) {
      return { slug: "baghdad", province: "بغداد" };
    }
  }

  function b64ToBytes(value) {
    var padding = "=".repeat((4 - value.length % 4) % 4);
    var base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    var raw = atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function api(path, payload, method) {
    var response = await fetch(apiBase + path, {
      method: method || (payload ? "POST" : "GET"),
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
      cache: "no-store"
    });
    var result = {};
    try { result = await response.json(); } catch (_) {}
    if (!response.ok || result.ok === false) {
      var error = new Error(result.error || ("HTTP " + response.status));
      error.status = response.status;
      throw error;
    }
    return result;
  }

  async function registration() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error("هذا المتصفح لا يدعم إشعارات Web Push.");
    }
    try {
      await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
    } catch (error) {
      throw new Error("تعذر تشغيل خدمة إشعارات دولاري. تأكد من فتح دولاري من التطبيق المثبت على الشاشة الرئيسية.");
    }
    return navigator.serviceWorker.ready;
  }

  async function getOrCreateSubscription() {
    if (!apiBase) throw new Error("خدمة الإشعارات الخلفية لم تُربط بالخادم بعد.");
    if (!("Notification" in window)) throw new Error("إشعارات النظام غير مدعومة على هذا الجهاز.");
    if (!("PushManager" in window)) throw new Error("إشعارات Web Push غير مدعومة على هذا الجهاز.");

    if (Notification.permission !== "granted") {
      var permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("لم يتم السماح بإشعارات دولاري من إعدادات الجهاز.");
    }

    // مهم لـ iOS/Safari: لا نعتمد على fetch إلى الخادم قبل إنشاء الاشتراك.
    // المفتاح العام موجود مسبقاً في إعدادات PWA، لذلك يبقى subscribe() مباشرة ضمن مسار الزر.
    var publicKey = String(config.vapidPublicKey || "").trim();
    if (!publicKey) throw new Error("مفتاح الإشعارات العام غير مضبوط داخل التطبيق.");

    var reg = await registration();
    var sub = await reg.pushManager.getSubscription();
    var storedVapid = null;
    try { storedVapid = localStorage.getItem(VAPID_KEY_STORAGE) || null; } catch (_) { storedVapid = null; }

    if (sub && storedVapid && storedVapid !== publicKey) {
      try { await api("/api/unsubscribe", { subscription: sub.toJSON() }); } catch (_) {}
      try { await sub.unsubscribe(); } catch (_) {}
      sub = null;
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToBytes(publicKey)
      });
    }

    try { localStorage.setItem(VAPID_KEY_STORAGE, publicKey); } catch (_) {}
    return { reg: reg, subscription: sub };
  }

  async function saveSubscription(rule, sendTest) {
    var pair = await getOrCreateSubscription();
    var current = pair.subscription.toJSON();
    var previous = null;
    try { previous = JSON.parse(localStorage.getItem(SUBSCRIPTION_KEY) || "null"); } catch (_) { previous = null; }

    if (previous && previous.endpoint && previous.endpoint !== current.endpoint && apiBase) {
      try { await api("/api/unsubscribe", { subscription: previous }); } catch (_) {}
    }

    await api("/api/subscribe", {
      subscription: current,
      rule: rule || null,
      preference: localPreference(),
      clientType: "pwa",
      displayMode: "standalone"
    });
    try { localStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(current)); } catch (_) {}

    if (sendTest) {
      await api("/api/test", { subscription: current });
    }
    return pair.subscription;
  }

  async function importPushHistory() {
    if (!("indexedDB" in window)) return;
    var db = await new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 3);
      req.onupgradeneeded = function () {
        var database = req.result;
        if (!database.objectStoreNames.contains(DB_STORE)) {
          database.createObjectStore(DB_STORE, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains("meta")) {
          database.createObjectStore("meta", { keyPath: "key" });
        }
        if (!database.objectStoreNames.contains("processed")) {
          database.createObjectStore("processed", { keyPath: "id" });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    }).catch(function () { return null; });
    if (!db) return;

    var events = await new Promise(function (resolve) {
      try {
        var tx = db.transaction(DB_STORE, "readonly");
        var req = tx.objectStore(DB_STORE).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { resolve([]); };
      } catch (_) { resolve([]); }
    });

    var unreadCount = await new Promise(function (resolve) {
      try {
        var tx = db.transaction("meta", "readonly");
        var req = tx.objectStore("meta").get("unread");
        req.onsuccess = function () { resolve(Math.max(0, Number(req.result && req.result.value) || 0)); };
        req.onerror = function () { resolve(null); };
      } catch (_) { resolve(null); }
    });
    db.close();

    var existing;
    try {
      existing = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      if (!Array.isArray(existing)) existing = [];
    } catch (_) { existing = []; }

    var byId = new Map();
    existing.forEach(function (item) {
      if (item && item.id) byId.set(String(item.id), item);
    });
    events.forEach(function (item) {
      if (item && item.id) byId.set(String(item.id), item);
    });

    var combined = Array.from(byId.values()).sort(function (a, b) {
      return new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime();
    }).slice(0, 50);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(combined)); } catch (_) {}

    if (unreadCount !== null) {
      try { localStorage.setItem(UNREAD_KEY, String(unreadCount)); } catch (_) {}
    }

    try {
      window.dispatchEvent(new CustomEvent("dolary-push-history-updated", {
        detail: { unread: unreadCount === null ? null : unreadCount }
      }));
    } catch (_) {}
  }

  async function syncIfAlreadySubscribed() {
    if (!apiBase || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    try {
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (isAutoPushDisabledLocally()) return;
      if (sub) {
        var current = sub.toJSON();
        var previous = null;
        try { previous = JSON.parse(localStorage.getItem(SUBSCRIPTION_KEY) || "null"); } catch (_) { previous = null; }
        if (previous && previous.endpoint && previous.endpoint !== current.endpoint) {
          try { await api("/api/unsubscribe", { subscription: previous }); } catch (_) {}
        }
        await api("/api/subscribe", {
          subscription: current,
          rule: localRule(),
          preference: localPreference(),
          clientType: "pwa",
          displayMode: "standalone"
        });
        try { localStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(current)); } catch (_) {}
        permissionText("إشعارات دولاري مفعّلة على هذا الجهاز.");
      }
    } catch (_) {
      /* The local app remains usable while the backend is unavailable. */
    }
  }

  var permissionButton = document.getElementById("pwaPermissionBtn");
  if (permissionButton) {
    permissionButton.addEventListener("click", async function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      permissionButton.disabled = true;
      var label = permissionButton.querySelector("span");
      if (label) label.textContent = "جارٍ التفعيل…";
      try {
        if (standaloneRequired && !standalone) throw new Error("افتح دولاري من أيقونته على الشاشة الرئيسية أولاً، ثم فعّل الإشعارات.");
        if (!apiBase) throw new Error("خدمة الإشعارات الخلفية غير مربوطة بالخادم حالياً.");
        clearAutoPushDisabledLocally();
        await saveSubscription(localRule(), true);
        permissionText("تم تفعيل إشعارات دولاري وإرسال إشعار تجريبي لهذا الجهاز.");
        statusText(localRule() ? "تنبيه السعر محفوظ، وسيُفحص حتى عند إغلاق التطبيق." :
          "الإشعارات مفعّلة. حدد سعراً مستهدفاً حتى يصلك تنبيه عند تجاوزه.");
      } catch (error) {
        permissionText(error.message || "تعذر تفعيل الإشعارات.");
        statusText(error.message || "تعذر ربط إشعارات الخلفية.");
      } finally {
        permissionButton.disabled = false;
        if (label) label.textContent = "تفعيل إشعارات دولاري";
      }
    }, true);
  }

  var saveButton = document.getElementById("pwaSaveAlert");
  if (saveButton && apiBase) {
    saveButton.addEventListener("click", async function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      var province = document.getElementById("pwaAlertProvince");
      var targetInput = document.getElementById("pwaAlertTarget");
      var conditionInput = document.getElementById("pwaAlertCondition");
      var target = Number(targetInput && targetInput.value);
      if (!province || !province.value || !Number.isFinite(target) || target <= 0) {
        statusText("اختر المحافظة واكتب سعراً مستهدفاً صحيحاً أولاً.");
        return;
      }
      var cityText = province.options[province.selectedIndex] ?
        province.options[province.selectedIndex].textContent : province.value;
      var rule = {
        slug: province.value,
        province: cityText,
        condition: conditionInput && conditionInput.value === "below" ? "below" : "above",
        target: Math.round(target)
      };
      saveButton.disabled = true;
      try {
        await saveSubscription(rule, false);
        localStorage.setItem(ALERT_KEY, JSON.stringify(rule));
        statusText("تم حفظ التنبيه على الخادم. سيُفحص السعر كل 10 دقائق حتى إذا كان دولاري مغلقاً.");
      } catch (error) {
        statusText(error.message || "تعذر حفظ التنبيه على الخادم.");
      } finally {
        saveButton.disabled = false;
      }
    }, true);
  }

  var disableButton = document.getElementById("pwaDisableNotifications");
  if (disableButton) {
    disableButton.addEventListener("click", async function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      disableButton.disabled = true;
      disableButton.textContent = "جارٍ إيقاف الإشعارات…";
      try {
        localStorage.removeItem(ALERT_KEY);
        setAutoPushDisabledLocally();
        var serverRemoved = !apiBase;
        if ("serviceWorker" in navigator && "PushManager" in window) {
          var reg = await navigator.serviceWorker.ready;
          var sub = await reg.pushManager.getSubscription();
          if (sub) {
            if (apiBase) {
              try {
                await api("/api/unsubscribe", { subscription: sub.toJSON() });
                serverRemoved = true;
              } catch (_) {
                serverRemoved = false;
              }
            }
            await sub.unsubscribe();
          } else {
            serverRemoved = true;
          }
        }
        try { localStorage.removeItem(SUBSCRIPTION_KEY); } catch (_) {}
        permissionText("تم إلغاء اشتراك الإشعارات لهذا الجهاز.");
        statusText(serverRemoved ?
          "تم إيقاف التنبيهات وحذف اشتراك هذا الجهاز من خادم دولاري." :
          "تم إلغاء الإشعارات على هذا الجهاز، لكن تعذر حذف سجل الاشتراك من الخادم. سيُزال عندما يرفض مزود الإشعارات عنوانه.");
      } catch (error) {
        permissionText("تمت محاولة إلغاء الإشعارات. راجع إعدادات الجهاز إذا بقي الإذن مفعّلاً.");
        statusText("تعذر تأكيد حذف الاشتراك من الخادم. أعد المحاولة عند توفر الاتصال.");
      } finally {
        disableButton.disabled = false;
        disableButton.textContent = "إلغاء اشتراك إشعارات هذا الجهاز";
      }
    }, true);
  }

  var removeButton = document.getElementById("pwaRemoveAlert");
  if (removeButton && apiBase) {
    removeButton.addEventListener("click", async function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        localStorage.removeItem(ALERT_KEY);
        var reg = await navigator.serviceWorker.ready;
        var sub = await reg.pushManager.getSubscription();
        if (sub) await api("/api/remove-rule", { subscription: sub.toJSON() });
        statusText("تم إيقاف تنبيه السعر. تبقى صلاحية الإشعارات مفعّلة حتى تختار إيقافها من إعدادات الجهاز.");
      } catch (error) {
        statusText("تم إيقاف التنبيه على الجهاز، لكن تعذر مزامنة الإيقاف مع الخادم.");
      }
    }, true);
  }

  function isAutoPushDisabledLocally() {
    try { return localStorage.getItem(AUTO_PUSH_DISABLED_KEY) === "1"; }
    catch (_) { return false; }
  }

  function setAutoPushDisabledLocally() {
    try {
      localStorage.setItem(AUTO_PUSH_DISABLED_KEY, "1");
      localStorage.removeItem(AUTO_PUSH_ENABLED_KEY);
    } catch (_) {}
  }

  function clearAutoPushDisabledLocally() {
    try { localStorage.removeItem(AUTO_PUSH_DISABLED_KEY); } catch (_) {}
  }

  function isAutoPushEnabledLocally() {
    try { return localStorage.getItem(AUTO_PUSH_ENABLED_KEY) === "1"; }
    catch (_) { return false; }
  }

  function setAutoPushEnabledLocally() {
    try { localStorage.setItem(AUTO_PUSH_ENABLED_KEY, "1"); } catch (_) {}
  }

  function buildAutoPermissionPrompt() {
    if ((standaloneRequired && !standalone) || !apiBase || !("Notification" in window) || Notification.permission !== "default") return null;
    if (isAutoPushEnabledLocally()) return null;
    var existing = document.getElementById("pwaAutoPushPrompt");
    if (existing) return existing;
    var overlay = document.createElement("div");
    overlay.id = "pwaAutoPushPrompt";
    overlay.className = "pwa-auto-push-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML =
      '<div class="pwa-auto-push-card">' +
        '<div class="pwa-auto-push-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg></div>' +
        '<div class="pwa-auto-push-title">فعّل إشعارات دولاري</div>' +
        '<div class="pwa-auto-push-text">حتى يصلك تنبيه مباشرةً عند ارتفاع أو انخفاض سعر الدولار، حتى لو دولاري مغلق.</div>' +
        '<button type="button" class="pwa-auto-push-btn" id="pwaAutoPushBtn">تفعيل الإشعارات الآن</button>' +
        '<div class="pwa-auto-push-note">بعد الضغط سيظهر طلب السماح الرسمي من الجهاز.</div>' +
      '</div>';
    document.body.appendChild(overlay);
    var button = document.getElementById("pwaAutoPushBtn");
    if (!button) return overlay;
    button.addEventListener("click", async function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      button.disabled = true;
      button.textContent = "جارٍ التفعيل…";
      try {
        clearAutoPushDisabledLocally();
        await saveSubscription(localRule(), true);
        setAutoPushEnabledLocally();
        permissionText("إشعارات دولاري مفعّلة على هذا الجهاز.");
        statusText(localRule() ? "تم تفعيل الإشعارات وحفظ تنبيه السعر." : "تم تفعيل الإشعارات. ستوصلك تنبيهات ارتفاع وانخفاض السعر.");
        overlay.remove();
      } catch (error) {
        permissionText(error.message || "تعذر تفعيل الإشعارات.");
        button.disabled = false;
        button.textContent = "تفعيل الإشعارات الآن";
      }
    }, true);
    return overlay;
  }

    function initAutomaticPushPrompt() {
    if ((standaloneRequired && !standalone) || !apiBase || !("Notification" in window)) return;
    if (Notification.permission === "denied") {
      permissionText("إشعارات دولاري موقوفة من إعدادات الجهاز.");
      return;
    }
    if (Notification.permission === "granted") {
      if (isAutoPushDisabledLocally()) {
        permissionText("إشعارات دولاري موقوفة على هذا الجهاز. فعّلها من زر التفعيل عند الحاجة.");
        return;
      }
      // لا ننشئ Push Subscription تلقائياً عند فتح التطبيق.
      // إذا كان الاشتراك موجوداً مسبقاً فـ syncIfAlreadySubscribed() يتكفّل بالمزامنة.
      return;
    }
    window.setTimeout(function () { buildAutoPermissionPrompt(); }, 180);
  }

  if (apiBase) {
    statusText("تنبيهات الخلفية متاحة. فعّل الإشعارات واحفظ سعرك المستهدف.");
    syncIfAlreadySubscribed();
    initAutomaticPushPrompt();
  }

  navigator.serviceWorker && navigator.serviceWorker.addEventListener("message", function (event) {
    if (event.data && event.data.type === "DOLARY_PUSH_RECEIVED") {
      importPushHistory();
    }
    if (event.data && event.data.type === "DOLARY_BADGE_CHANGED") {
      var count = Math.max(0, Number(event.data.count) || 0);
      try { localStorage.setItem(UNREAD_KEY, String(count)); } catch (_) {}
      try { window.dispatchEvent(new CustomEvent("dolary-push-history-updated", { detail: { unread: count } })); } catch (_) {}
    }
  });

  importPushHistory().then(function () {
    if (location.hash === "#pwa-notifications" ||
        new URLSearchParams(location.search).get("pwa-notifications") === "1") {
      var bell = document.getElementById("pwaNotificationBell");
      if (bell) bell.click();
    }
  });

  if (!apiBase) {
    var note = document.getElementById("pwaAlertStatus");
    if (note) note.textContent = "التنبيه المحلي يعمل أثناء تشغيل دولاري. الإرسال عند إغلاق التطبيق يتفعّل بعد نشر خدمة Web Push وربط رابطها.";
  }
})();
