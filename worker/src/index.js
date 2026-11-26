import { buildPushPayload } from "@block65/webcrypto-web-push";

const RATE_URL = "https://xeiqd.com/rates.json";
const SUB_PREFIX = "sub:";
const CURSOR_KEY = "meta:last-key";
const MAX_SUBSCRIPTIONS_PER_TICK = 4;
const MAX_LIST_SIZE = 1000;

function json(data, status = 200, origin = null, env = {}) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };
  if (origin && origin === (env.APP_ORIGIN || "https://aehamtech.top")) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Vary"] = "Origin";
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function allowedPushEndpoint(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch (_) {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return host === "web.push.apple.com" ||
    host.endsWith(".push.apple.com") ||
    host === "fcm.googleapis.com" ||
    host === "updates.push.services.mozilla.com" ||
    host.endsWith(".push.services.mozilla.com") ||
    host.endsWith(".notify.windows.com");
}

function cleanSubscription(input) {
  if (!input || typeof input !== "object") return null;
  if (typeof input.endpoint !== "string" || !allowedPushEndpoint(input.endpoint)) return null;
  if (!input.keys || typeof input.keys.p256dh !== "string" || typeof input.keys.auth !== "string") return null;
  if (input.keys.p256dh.length < 40 || input.keys.p256dh.length > 200 ||
      input.keys.auth.length < 16 || input.keys.auth.length > 100) return null;
  return {
    endpoint: input.endpoint,
    expirationTime: input.expirationTime || null,
    keys: {
      p256dh: input.keys.p256dh,
      auth: input.keys.auth
    }
  };
}

function cleanRule(input) {
  if (input == null) return null;
  if (typeof input !== "object") return undefined;
  const slug = String(input.slug || "").trim();
  const province = String(input.province || "").trim().slice(0, 60);
  const condition = input.condition === "below" ? "below" : input.condition === "above" ? "above" : "";
  const target = Number(input.target);
  if (!/^[a-z0-9-]{1,40}$/i.test(slug) || !province || !condition ||
      !Number.isFinite(target) || target < 1000 || target > 10000000) return undefined;
  return { slug, province, condition, target: Math.round(target) };
}

async function endpointId(endpoint) {
  const bytes = new TextEncoder().encode(endpoint);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, "0")).join("");
}

function vapidConfig(env) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    throw new Error("VAPID is not configured");
  }
  return {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY
  };
}

async function deliver(subscription, data, env) {
  const payload = await buildPushPayload(
    {
      data,
      options: {
        ttl: 900,
        urgency: "high",
        topic: "dolary-rate"
      }
    },
    subscription,
    vapidConfig(env)
  );
  return fetch(subscription.endpoint, payload);
}

function currentRate(city) {
  const candidates = [
    city && city.usd_iqd_per_100,
    city && city.usd_iqd_per_1 != null ? Number(city.usd_iqd_per_1) * 100 : null,
    city && city.rate,
    city && city.sell_rate,
    city && city.market_rate
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function crossing(rule, previous, current) {
  if (rule.condition === "above") return previous < rule.target && current >= rule.target;
  return previous > rule.target && current <= rule.target;
}

async function api(request, env) {
  const origin = request.headers.get("Origin");
  const expectedOrigin = env.APP_ORIGIN || "https://aehamtech.top";
  if (origin && origin !== expectedOrigin) {
    return json({ ok: false, error: "origin_not_allowed" }, 403);
  }
  if (!origin && request.method !== "GET") {
    return json({ ok: false, error: "origin_required" }, 403);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": expectedOrigin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin"
      }
    });
  }

  const url = new URL(request.url);
  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({
      ok: true,
      service: "dolary-push",
      storageReady: Boolean(env.PUSH_STORE),
      vapidReady: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT),
      schedule: "every 5 minutes"
    }, 200, origin, env);
  }

  if (url.pathname === "/api/config" && request.method === "GET") {
    return json({
      ok: true,
      publicKey: env.VAPID_PUBLIC_KEY || "",
      pushReady: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.PUSH_STORE)
    }, 200, origin, env);
  }

  if (!env.PUSH_STORE) {
    return json({ ok: false, error: "storage_not_configured" }, 503, origin, env);
  }

  if (url.pathname === "/api/subscribe" && request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch (_) {
      return json({ ok: false, error: "invalid_json" }, 400, origin, env);
    }

    const subscription = cleanSubscription(body && body.subscription);
    if (!subscription) {
      return json({ ok: false, error: "invalid_subscription" }, 400, origin, env);
    }
    const rule = cleanRule(body.rule);
    if (rule === undefined) {
      return json({ ok: false, error: "invalid_price_rule" }, 400, origin, env);
    }

    const id = await endpointId(subscription.endpoint);
    const key = SUB_PREFIX + id;
    const previous = await env.PUSH_STORE.get(key, "json");
    const sameRule = previous && JSON.stringify(previous.rule || null) === JSON.stringify(rule || null);
    const record = {
      subscription,
      rule,
      lastRate: sameRule ? previous.lastRate : null,
      createdAt: previous && previous.createdAt ? previous.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await env.PUSH_STORE.put(key, JSON.stringify(record));
    return json({ ok: true, subscriptionId: id, ruleEnabled: Boolean(rule) }, 201, origin, env);
  }

  if (url.pathname === "/api/remove-rule" && request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch (_) {
      return json({ ok: false, error: "invalid_json" }, 400, origin, env);
    }
    const subscription = cleanSubscription(body && body.subscription);
    if (!subscription) return json({ ok: false, error: "invalid_subscription" }, 400, origin, env);
    const id = await endpointId(subscription.endpoint);
    const key = SUB_PREFIX + id;
    const record = await env.PUSH_STORE.get(key, "json");
    if (!record) return json({ ok: true, removed: false }, 200, origin, env);
    record.rule = null;
    record.lastRate = null;
    record.updatedAt = new Date().toISOString();
    await env.PUSH_STORE.put(key, JSON.stringify(record));
    return json({ ok: true, removed: true }, 200, origin, env);
  }

  if (url.pathname === "/api/unsubscribe" && request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch (_) {
      return json({ ok: false, error: "invalid_json" }, 400, origin, env);
    }
    const subscription = cleanSubscription(body && body.subscription);
    if (!subscription) return json({ ok: false, error: "invalid_subscription" }, 400, origin, env);
    const id = await endpointId(subscription.endpoint);
    await env.PUSH_STORE.delete(SUB_PREFIX + id);
    return json({ ok: true, removed: true }, 200, origin, env);
  }

  if (url.pathname === "/api/test" && request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch (_) {
      return json({ ok: false, error: "invalid_json" }, 400, origin, env);
    }
    const subscription = cleanSubscription(body && body.subscription);
    if (!subscription) return json({ ok: false, error: "invalid_subscription" }, 400, origin, env);
    const id = await endpointId(subscription.endpoint);
    const record = await env.PUSH_STORE.get(SUB_PREFIX + id, "json");
    if (!record) return json({ ok: false, error: "subscription_not_found" }, 404, origin, env);

    try {
      const result = await deliver(subscription, {
        title: "دولاري",
        body: "تم تفعيل إشعارات دولاري على هذا الجهاز بنجاح.",
        url: (env.APP_URL || "https://aehamtech.top/dolary/") + "?pwa-notifications=1#pwa-notifications",
        id: "test-" + Date.now()
      }, env);
      if (result.status === 404 || result.status === 410) {
        await env.PUSH_STORE.delete(SUB_PREFIX + id);
        return json({ ok: false, error: "subscription_expired" }, 410, origin, env);
      }
      if (!result.ok) {
        return json({ ok: false, error: "push_service_rejected", status: result.status }, 502, origin, env);
      }
      return json({ ok: true, delivered: true }, 200, origin, env);
    } catch (error) {
      return json({ ok: false, error: "push_send_failed" }, 500, origin, env);
    }
  }

  return json({ ok: false, error: "not_found" }, 404, origin, env);
}

async function checkRates(env) {
  if (!env.PUSH_STORE || !env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) return;

  const listed = await env.PUSH_STORE.list({ prefix: SUB_PREFIX, limit: MAX_LIST_SIZE });
  const keys = listed.keys.map(item => item.name).sort();
  if (!keys.length) return;

  const response = await fetch(RATE_URL, {
    headers: { "Accept": "application/json" },
    cf: { cacheTtl: 0 }
  });
  if (!response.ok) throw new Error("XEIQD returned " + response.status);
  const data = await response.json();
  if (!data || !Array.isArray(data.cities)) throw new Error("Invalid XEIQD rates response");

  const lastKey = await env.PUSH_STORE.get(CURSOR_KEY);
  let start = lastKey ? keys.findIndex(key => key > lastKey) : 0;
  if (start < 0) start = 0;

  const batch = keys.slice(start, start + MAX_SUBSCRIPTIONS_PER_TICK);
  await env.PUSH_STORE.put(CURSOR_KEY, batch[batch.length - 1]);

  for (const key of batch) {
    const record = await env.PUSH_STORE.get(key, "json");
    if (!record || !record.rule || !record.subscription) continue;

    const city = data.cities.find(item => item && item.slug === record.rule.slug);
    const rate = city ? currentRate(city) : null;
    if (!Number.isFinite(rate)) continue;

    const previous = Number(record.lastRate);
    if (!Number.isFinite(previous) || previous <= 0) {
      record.lastRate = rate;
      await env.PUSH_STORE.put(key, JSON.stringify(record));
      continue;
    }
    if (previous === rate) continue;

    if (crossing(record.rule, previous, rate)) {
      const isAbove = record.rule.condition === "above";
      const notification = {
        title: "دولاري | " + (isAbove ? "ارتفاع سعر الدولار" : "انخفاض سعر الدولار"),
        body: record.rule.province + "\nالسعر الحالي: " + Math.round(rate).toLocaleString("en-US") +
          " د.ع لكل 100 دولار\n" + (isAbove ? "تجاوز السعر الحد الذي حددته: " : "انخفض السعر إلى الحد الذي حددته: ") +
          Math.round(record.rule.target).toLocaleString("en-US") + " د.ع",
        url: (env.APP_URL || "https://aehamtech.top/dolary/") + "?pwa-notifications=1#pwa-notifications",
        id: "rate-" + Date.now() + "-" + key.slice(-10),
        province: record.rule.province,
        rate: Math.round(rate),
        message: (isAbove ? "ارتفاع السعر — الحد المحدد " : "انخفاض السعر — الحد المحدد ") +
          Math.round(record.rule.target).toLocaleString("en-US") + " د.ع",
        at: new Date().toISOString()
      };
      try {
        const result = await deliver(record.subscription, notification, env);
        if (result.status === 404 || result.status === 410) {
          await env.PUSH_STORE.delete(key);
          continue;
        }
        if (!result.ok) {
          console.warn("Push service returned", result.status);
          continue;
        }
        record.lastRate = rate;
        record.lastAlertAt = notification.at;
        await env.PUSH_STORE.put(key, JSON.stringify(record));
      } catch (error) {
        console.warn("Push delivery failed:", error && error.message ? error.message : "unknown");
      }
    } else {
      record.lastRate = rate;
      await env.PUSH_STORE.put(key, JSON.stringify(record));
    }
  }
}

export default {
  async fetch(request, env) {
    return api(request, env);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(checkRates(env).catch(error => {
      console.error("Dolary scheduled price check failed:", error && error.message ? error.message : "unknown");
    }));
  }
};
