import { buildPushPayload } from "@block65/webcrypto-web-push";
import { publishSocialRate, socialPublishingEnabled, socialImageResponse } from "./social-publisher.js";
import { checkAdminPassword, createDevSession, verifyDevSession, destroyDevSession } from "./dev-auth.js";
import { sanitizeDolaryConfig, configToJs, DEFAULT_DOLARY_CONFIG } from "./dev-config.js";
import { normalizeDevIcon, iconChanges, iconManifest, iconDescriptor } from "./dev-icon.js";
import { getDevDraft, putDevDraft, createDevPreviewToken, getDevPreview, listDevHistory, addDevHistory, getDevIcon, putDevIcon, clearDevIcon, getDevPublishedIcon, putDevPublishedIcon } from "./dev-storage.js";
import { publishFilesAtomically, readBranchHead } from "./dev-github.js";
import { renderDevLoginPage, renderDevPage } from "./dev-ui.js";

const RATE_URL = "https://xeiqd.com/rates.json";
const SUB_PREFIX = "sub:";
const ANDROID_PREFIX = "android:";
const BROADCAST_PREFIX = "broadcast:";
const DELIVERY_PREFIX = "delivery:";
const MAX_ANDROID_LIST_SIZE = 1000;
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

function cleanBroadcastId(input) {
  if (typeof input !== "string") return null;
  const id = input.trim();
  if (id.length < 8 || id.length > 120) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(id)) return null;
  return id;
}
function newBroadcastId() {
  return "broadcast-" + crypto.randomUUID();
}
function deliveryKey(broadcastId, recipientKey) {
  return DELIVERY_PREFIX + broadcastId + ":" + recipientKey.replace(/[^A-Za-z0-9._:-]/g, "_");
}
function cleanFcmToken(input) {
  if (typeof input !== "string") return null;
  const token = input.trim();
  if (token.length < 20 || token.length > 4096) return null;
  if (/[^A-Za-z0-9_:\-.~%]+/.test(token)) return null;
  return token;
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeText(text) {
  return base64UrlEncodeBytes(new TextEncoder().encode(text));
}

function base64UrlEncodeBigInt(value) {
  let hex = value.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return base64UrlEncodeBytes(bytes);
}

function parsePemPrivateKey(pem) {
  const body = String(pem || "").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, "");
  return Uint8Array.from(atob(body), c => c.charCodeAt(0));
}

async function fcmAccessToken(env) {
  if (!env.FCM_SERVICE_ACCOUNT_JSON) throw new Error("FCM service account is not configured");
  const account = JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON);
  if (!account.project_id || !account.client_email || !account.private_key) {
    throw new Error("Invalid FCM service account");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };
  const unsigned = base64UrlEncodeText(JSON.stringify(header)) + "." + base64UrlEncodeText(JSON.stringify(claim));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    parsePemPrivateKey(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  const assertion = unsigned + "." + base64UrlEncodeBytes(new Uint8Array(signature));

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + encodeURIComponent(assertion)
  });
  if (!response.ok) throw new Error("Google OAuth token request failed: " + response.status);
  const data = await response.json();
  if (!data.access_token) throw new Error("Google OAuth token missing");
  return { accessToken: data.access_token, projectId: account.project_id };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function deliverFcm(token, data, env, auth = null) {
  const resolvedAuth = auth || await fcmAccessToken(env);
  const response = await fetchWithTimeout(
    "https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(resolvedAuth.projectId) + "/messages:send",
    {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + resolvedAuth.accessToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: {
          token,
          data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value ?? "")]))
        }
      })
    },
    8000
  );
  return response;
}

async function fcmTokenId(token) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, "0")).join("");
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
        topic: String(data.broadcastId || data.id || "dolary-rate")
      }
    },
    subscription,
    vapidConfig(env)
  );
  return fetchWithTimeout(subscription.endpoint, payload, 8000);
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

async function developerRoutes(request, env) {
  const url = new URL(request.url);
  const requestOriginHeader = request.headers.get("Origin");
  const sameOrigin = requestOriginHeader === url.origin || requestOriginHeader === (env.APP_ORIGIN || "https://aehamtech.top");
  if (url.pathname === "/dev" && request.method === "GET") {
    const session = await verifyDevSession(request, env);
    if (!session) return renderDevLoginPage();
    const draft = await getDevDraft(env);
    return renderDevPage(draft || DEFAULT_DOLARY_CONFIG, await listDevHistory(env), env.APP_URL || "https://aehamtech.top/dolary/");
  }
  if (url.pathname === "/api/dev/login" && request.method === "POST") {
    let password = "";
    const type = request.headers.get("Content-Type") || "";
    try {
      if (type.includes("application/json")) password = String((await request.json()).password || "");
      else password = String((await request.formData()).get("password") || "");
    } catch (_) {}
    if (!await checkAdminPassword(password, env)) return renderDevLoginPage("كلمة المرور غير صحيحة.");
    const session = await createDevSession(env);
    return new Response(null, { status: 302, headers: { "Location": "/dev", "Set-Cookie": session.setCookie, "Cache-Control": "no-store" } });
  }
  if (url.pathname === "/api/dev/preview-config" && request.method === "GET") {
    const config = await getDevPreview(env, url.searchParams.get("token"));
    return config ? json({ ok: true, config }, 200, null, env) : json({ ok: false, error: "preview_expired" }, 404);
  }
  if (url.pathname.startsWith("/api/dev/")) {
    const session = await verifyDevSession(request, env);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);
    if (!sameOrigin && request.method !== "GET") return json({ ok: false, error: "origin_not_allowed" }, 403);
    if (url.pathname === "/api/dev/logout" && request.method === "POST") {
      const result = await destroyDevSession(request, env);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Set-Cookie": result.cookie } });
    }
    if (url.pathname === "/api/dev/session" && request.method === "GET") return json({ ok: true }, 200, null, env);
    if (url.pathname === "/api/dev/draft" && request.method === "GET") return json({ ok: true, config: (await getDevDraft(env)) || DEFAULT_DOLARY_CONFIG }, 200, null, env);
    if (url.pathname === "/api/dev/draft" && request.method === "POST") {
      let body; try { body = await request.json(); } catch (_) { return json({ ok: false, error: "invalid_json" }, 400); }
      try { const config = sanitizeDolaryConfig(body?.config); await putDevDraft(env, config); return json({ ok: true, config }, 200, null, env); }
      catch (_) { return json({ ok: false, error: "invalid_config" }, 400); }
    }
    if (url.pathname === "/api/dev/icon" && request.method === "GET") {
      const icon = await getDevIcon(env);
      return json({ ok: true, pending: Boolean(icon) }, 200, null, env);
    }
    if (url.pathname === "/api/dev/icon" && request.method === "POST") {
      let body; try { body = await request.json(); } catch (_) { return json({ ok: false, error: "invalid_json" }, 400); }
      try { const icon = normalizeDevIcon(body); await putDevIcon(env, icon); return json({ ok: true }, 200, null, env); }
      catch (_) { return json({ ok: false, error: "invalid_icon" }, 400, null, env); }
    }
    if (url.pathname === "/api/dev/icon" && request.method === "DELETE") {
      await clearDevIcon(env);
      return json({ ok: true }, 200, null, env);
    }
    if (url.pathname === "/api/dev/preview-token" && request.method === "POST") {
      const draft = await getDevDraft(env); if (!draft) return json({ ok: false, error: "draft_missing" }, 400);
      return json({ ok: true, token: await createDevPreviewToken(env, sanitizeDolaryConfig(draft)) }, 200, null, env);
    }
    if (url.pathname === "/api/dev/history" && request.method === "GET") return json({ ok: true, history: await listDevHistory(env) }, 200, null, env);
    if (url.pathname === "/api/dev/publish" && request.method === "POST") {
      let body; try { body = await request.json(); } catch (_) { return json({ ok: false, error: "invalid_json" }, 400); }
      let config; try { config = sanitizeDolaryConfig(body?.config || await getDevDraft(env)); } catch (_) { return json({ ok: false, error: "invalid_config" }, 400); }
      const previous = await env.PUSH_STORE.get("dev:last-published", "json") || DEFAULT_DOLARY_CONFIG;
      const pendingIcon = await getDevIcon(env);
      const publishedIcon = await getDevPublishedIcon(env);
      const activeIcon = pendingIcon || publishedIcon || { kind: "generated" };
      const manifest = JSON.stringify({id:(env.APP_URL||"https://aehamtech.top/dolary/"),name:config.pwa.name,short_name:config.pwa.shortName,description:config.pwa.description,lang:"ar-IQ",dir:"rtl",start_url:(env.APP_URL||"https://aehamtech.top/dolary/"),scope:(env.APP_URL||"https://aehamtech.top/dolary/"),display:"standalone",display_override:["standalone","minimal-ui"],background_color:config.pwa.backgroundColor,theme_color:config.pwa.themeColor,orientation:"portrait-primary",prefer_related_applications:false,icons:iconManifest(activeIcon)},null,2)+"\n";
      try {
        const changes = [
          {path:"docs/dolary/dolary-config.js",content:configToJs(config)},
          {path:"docs/dolary/manifest.webmanifest",content:manifest}
        ];
        if (pendingIcon) changes.push(...iconChanges(pendingIcon));
        const result = await publishFilesAtomically(env,changes,String(body?.message||"chore: update Dolary PWA settings").slice(0,120));
        await env.PUSH_STORE.put("dev:last-published",JSON.stringify(config));
        if (pendingIcon) { await putDevPublishedIcon(env, iconDescriptor(pendingIcon)); await clearDevIcon(env); }
        await addDevHistory(env,{commitSha:result.commitSha,parentSha:result.parentSha,paths:result.paths,summary:"تحديث إعدادات دولاري",previousConfig:previous});
        await putDevDraft(env,config);
        return json({ ok: true, ...result }, 200, null, env);
      } catch (error) {
        const code = error?.code || "publish_failed";
        const detail = String(error?.message || "").slice(0, 220);
        return json({ ok: false, error: code, detail }, 409, null, env);
      }
    }
    if (url.pathname === "/api/dev/rollback" && request.method === "POST") {
      const history = await listDevHistory(env), id = String((await request.json()).id || ""), item = history.find(x => x.id === id);
      if (!item?.previousConfig) return json({ ok: false, error: "history_not_found" }, 404);
      const rollbackPrevious = await env.PUSH_STORE.get("dev:last-published", "json") || DEFAULT_DOLARY_CONFIG;
      const config = sanitizeDolaryConfig(item.previousConfig);
      try {
        const publishedIcon = await getDevPublishedIcon(env);
        const manifest = JSON.stringify({id:(env.APP_URL||"https://aehamtech.top/dolary/"),name:config.pwa.name,short_name:config.pwa.shortName,description:config.pwa.description,lang:"ar-IQ",dir:"rtl",start_url:(env.APP_URL||"https://aehamtech.top/dolary/"),scope:(env.APP_URL||"https://aehamtech.top/dolary/"),display:"standalone",background_color:config.pwa.backgroundColor,theme_color:config.pwa.themeColor,icons:iconManifest(publishedIcon || { kind: "generated" })},null,2)+"\n";
        const result=await publishFilesAtomically(env,[{path:"docs/dolary/dolary-config.js",content:configToJs(config)},{path:"docs/dolary/manifest.webmanifest",content:manifest}],"chore: rollback Dolary developer settings");
        await env.PUSH_STORE.put("dev:last-published",JSON.stringify(config));
        await putDevDraft(env,config);
        await addDevHistory(env,{commitSha:result.commitSha,parentSha:result.parentSha,paths:result.paths,summary:"تراجع عن تحديث سابق",previousConfig:rollbackPrevious});
        return json({ ok: true, ...result }, 200, null, env);
      } catch (error) { return json({ ok: false, error: error?.code || "rollback_failed" }, 409, null, env); }
    }
  }
  return null;
}

async function api(request, env) {
  const developerResponse = await developerRoutes(request, env);
  if (developerResponse) return developerResponse;
  const origin = request.headers.get("Origin");
  const expectedOrigin = env.APP_ORIGIN || "https://aehamtech.top";
  const requestUrl = new URL(request.url);
  const requestOrigin = requestUrl.origin;
  const allowedOrigins = new Set([expectedOrigin, requestOrigin]);
  if (origin && !allowedOrigins.has(origin)) {
    return json({ ok: false, error: "origin_not_allowed" }, 403);
  }
  // The protected admin broadcast form may arrive without an Origin header
  // (for example from a native HTML form or the Worker's internal handoff).
  // Authentication is still enforced by ADMIN_PASSWORD below.
  if (!origin && request.method !== "GET" &&
      requestUrl.pathname !== "/api/broadcast-form" &&
      requestUrl.pathname !== "/api/broadcast") {
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
      androidPushReady: Boolean(env.FCM_SERVICE_ACCOUNT_JSON),
      schedule: "every 10 minutes"
    }, 200, origin, env);
  }

  if (url.pathname === "/api/config" && request.method === "GET") {
    return json({
      ok: true,
      publicKey: env.VAPID_PUBLIC_KEY || "",
      pushReady: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.PUSH_STORE)
    }, 200, origin, env);
  }

  if (url.pathname === "/api/android/register" && request.method === "POST") {
    let body;
    try { body = await request.json(); }
    catch (_) { return json({ ok: false, error: "invalid_json" }, 400, origin, env); }
    const token = cleanFcmToken(body && body.token);
    if (!token) return json({ ok: false, error: "invalid_fcm_token" }, 400, origin, env);
    const id = await fcmTokenId(token);
    await env.PUSH_STORE.put(ANDROID_PREFIX + id, JSON.stringify({
      token,
      app: "dolary-android",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
    return json({ ok: true, registered: true }, 201, origin, env);
  }

  if (url.pathname === "/api/android/unregister" && request.method === "POST") {
    let body;
    try { body = await request.json(); }
    catch (_) { return json({ ok: false, error: "invalid_json" }, 400, origin, env); }
    const token = cleanFcmToken(body && body.token);
    if (!token) return json({ ok: false, error: "invalid_fcm_token" }, 400, origin, env);
    await env.PUSH_STORE.delete(ANDROID_PREFIX + await fcmTokenId(token));
    return json({ ok: true, removed: true }, 200, origin, env);
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


  if (url.pathname === "/admin-icon.svg" && request.method === "GET") {
    return new Response("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"bg\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop stop-color=\"#073b8f\"/><stop offset=\"1\" stop-color=\"#06142f\"/></linearGradient><linearGradient id=\"gold\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop stop-color=\"#fff1a8\"/><stop offset=\".45\" stop-color=\"#ffc72c\"/><stop offset=\"1\" stop-color=\"#e58a00\"/></linearGradient><linearGradient id=\"blue\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop stop-color=\"#43a5ff\"/><stop offset=\"1\" stop-color=\"#0759db\"/></linearGradient><filter id=\"shadow\"><feDropShadow dx=\"0\" dy=\"10\" stdDeviation=\"12\" flood-opacity=\".35\"/></filter></defs><rect width=\"512\" height=\"512\" rx=\"104\" fill=\"url(#bg)\"/><rect x=\"18\" y=\"18\" width=\"476\" height=\"476\" rx=\"92\" fill=\"none\" stroke=\"url(#gold)\" stroke-width=\"10\"/><circle cx=\"370\" cy=\"145\" r=\"74\" fill=\"#0b5bcf\" opacity=\".5\"/><path d=\"M328 145c38-42 93-50 133-18M319 165c46-24 91-20 124 7\" fill=\"none\" stroke=\"#6fc2ff\" stroke-width=\"8\" stroke-linecap=\"round\" opacity=\".8\"/><g filter=\"url(#shadow)\"><path d=\"M82 205 L275 130 L340 235 L146 311 Z\" fill=\"#fff\"/><path d=\"M82 205 L146 311 L116 330 L55 226 Z\" fill=\"url(#blue)\"/><path d=\"M275 130 L340 235 L316 258 L249 153 Z\" fill=\"url(#gold)\"/><path d=\"M143 305 L190 287 L224 364 L174 383 Z\" fill=\"url(#blue)\" stroke=\"#fff\" stroke-width=\"8\"/></g><path d=\"M349 207c27 10 43 32 47 61M373 187c42 15 67 47 73 91M394 168c57 20 91 61 99 120\" fill=\"none\" stroke=\"url(#gold)\" stroke-width=\"13\" stroke-linecap=\"round\"/><g filter=\"url(#shadow)\"><path d=\"M346 310c0-31 18-54 44-66v-12c0-10 8-18 18-18s18 8 18 18v12c26 12 44 35 44 66v17l13 20H333l13-20z\" fill=\"url(#gold)\"/><circle cx=\"408\" cy=\"365\" r=\"16\" fill=\"#e89500\"/><circle cx=\"458\" cy=\"281\" r=\"27\" fill=\"#ef3d2f\" stroke=\"#fff\" stroke-width=\"5\"/><text x=\"458\" y=\"291\" text-anchor=\"middle\" font-family=\"Arial,sans-serif\" font-size=\"25\" font-weight=\"800\" fill=\"#fff\">1</text></g><rect x=\"72\" y=\"392\" width=\"368\" height=\"76\" rx=\"30\" fill=\"#071b49\" stroke=\"url(#gold)\" stroke-width=\"4\"/><text x=\"256\" y=\"438\" text-anchor=\"middle\" direction=\"rtl\" font-family=\"Tahoma,Arial,sans-serif\" font-size=\"48\" font-weight=\"900\" fill=\"#fff\">دولاري</text></svg>", {headers: {"Content-Type":"image/svg+xml; charset=utf-8","Cache-Control":"public, max-age=31536000, immutable"}});
  }

  if (url.pathname === "/admin-manifest.webmanifest" && request.method === "GET") {
    return new Response("{\"name\":\"دولاري | لوحة الإشعار العام\",\"short_name\":\"دولاري أدمن\",\"start_url\":\"/admin\",\"scope\":\"/admin\",\"display\":\"standalone\",\"background_color\":\"#0b0b0f\",\"theme_color\":\"#071b49\",\"lang\":\"ar\",\"dir\":\"rtl\",\"icons\":[{\"src\":\"/admin-icon.svg\",\"sizes\":\"512x512\",\"type\":\"image/svg+xml\",\"purpose\":\"any maskable\"}]}", {headers: {"Content-Type":"application/manifest+json; charset=utf-8","Cache-Control":"public, max-age=3600"}});
  }

  if (url.pathname === "/admin" && request.method === "GET") {
    return new Response(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#071b49"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><link rel="manifest" href="/admin-manifest.webmanifest"><link rel="icon" type="image/svg+xml" href="/admin-icon.svg"><link rel="apple-touch-icon" href="/admin-icon.svg"><title>دولاري | الإشعار العام</title><style>
      *{box-sizing:border-box}body{margin:0;background:#0b0b0f;color:#f7f7fb;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;min-height:100vh;display:grid;place-items:center;padding:20px}
      .card{width:min(560px,100%);background:#17171d;border:1px solid #2b2b35;border-radius:24px;padding:24px;box-shadow:0 20px 60px #0008}.brand{font-size:26px;font-weight:800;margin-bottom:6px}.sub{color:#a7a7b2;margin-bottom:22px}
      label{display:block;font-weight:700;margin:14px 0 7px}input,textarea{width:100%;border:1px solid #343440;background:#101016;color:#fff;border-radius:14px;padding:13px;font:inherit;outline:none}textarea{min-height:130px;resize:vertical}
      button{width:100%;border:0;border-radius:14px;padding:14px;margin-top:18px;background:#fff;color:#111;font-weight:800;font-size:16px;cursor:pointer}.status{margin-top:16px;padding:12px;border-radius:12px;background:#101016;color:#bfc0ca;white-space:pre-wrap}
      .hint{font-size:12px;color:#888995;margin-top:12px;line-height:1.6}
    </style></head><body><main class="card"><div class="brand">دولاري</div><div class="sub">لوحة الإشعار العام — Android + iPhone</div>
    <form id="broadcastForm" method="POST" action="/api/broadcast-form"><input id="broadcastId" name="broadcastId" type="hidden" value=""><label>كلمة مرور الإدارة</label><input id="p" name="password" type="password" autocomplete="current-password" placeholder="كلمة مرور الإدارة" required>
    <label>عنوان الإشعار</label><input id="t" name="title" maxlength="120" placeholder="مثلاً: تنبيه مهم" required>
    <label>نص الإشعار</label><textarea id="b" name="body" maxlength="1000" placeholder="اكتب الرسالة التي تريد إرسالها للمستخدمين..." required></textarea>
    <button id="send" type="submit">إرسال الإشعار للجميع</button><div id="s" class="status">جاهز للإرسال.</div>
    <div class="hint">المفتاح لا يُحفظ في الصفحة. الإرسال يتم عبر Worker آمن باستخدام Secret.</div>
    </main><script>
      (() => {
        const p=document.getElementById("p"),t=document.getElementById("t"),b=document.getElementById("b");
        const s=document.getElementById("s"),send=document.getElementById("send");
        if(!p||!t||!b||!s||!send)return;
        try { p.value=sessionStorage.getItem("dolary_admin_password")||""; } catch (_) { p.value=""; }
        send.addEventListener("click",async(e)=>{
          e.preventDefault();
          send.disabled=true;
          send.textContent="جاري الإرسال...";
          s.textContent="جاري الإرسال...";
          const password=p.value.trim(),title=t.value.trim(),body=b.value.trim();
          if(!password||!title||!body){
            s.textContent="أكمل كلمة المرور والعنوان والنص.";
            send.disabled=false;
            send.textContent="إرسال الإشعار للجميع";
            return;
          }
          try{
            let pending=null;
            try { pending=JSON.parse(sessionStorage.getItem("dolary_pending_broadcast")||"null"); } catch (_) {}
            if(!pending || pending.title!==title || pending.body!==body || !pending.id){
              pending={id:"broadcast-"+crypto.randomUUID(),title,body};
              try { sessionStorage.setItem("dolary_pending_broadcast",JSON.stringify(pending)); } catch (_) {}
            }
            const r=await fetch("/api/broadcast",{method:"POST",headers:{"Content-Type":"application/json","X-Dolary-Admin-Password":password},body:JSON.stringify({title,body,broadcastId:pending.id}),cache:"no-store"});
            const d=await r.json().catch(()=>({}));
            if(r.status===401){s.textContent="كلمة مرور الإدارة غير صحيحة.";return}
            if(!r.ok||!d.ok){s.textContent="فشل الإرسال: "+(d.error||r.status);return}
            try {
              sessionStorage.setItem("dolary_admin_password",password);
              sessionStorage.removeItem("dolary_pending_broadcast");
            } catch (_) {}
            s.textContent="تم الإرسال بنجاح.\nBroadcast ID: "+(d.broadcastId||pending.id)+"\nAndroid: "+d.androidSent+"\niPhone/Web Push: "+d.webSent+"\nغير صالحة وحُذفت: "+(d.androidRemoved+d.webRemoved);
            b.value="";
          }catch(e){s.textContent="تعذر الاتصال بالـWorker."}
          finally{send.disabled=false;send.textContent="إرسال الإشعار للجميع"}
        });
      })();
    </script></body></html>`, {headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}});
  }

  if (url.pathname === "/api/broadcast-form" && request.method === "POST") {
    let form;
    try { form = await request.formData(); } catch (_) { return new Response("بيانات غير صالحة", {status:400, headers:{"Content-Type":"text/plain; charset=utf-8"}}); }
    const password = String(form.get("password") || "");
    const title = String(form.get("title") || "");
    const body = String(form.get("body") || "");
    const broadcastId = cleanBroadcastId(form.get("broadcastId")) || newBroadcastId();
    const internal = new Request(new URL("/api/broadcast", request.url), {
      method:"POST",
      headers:{"Content-Type":"application/json","X-Dolary-Admin-Password":password},
      body:JSON.stringify({title,body,broadcastId})
    });
    const result = await api(internal, env);
    const data = await result.text();
    let parsed = {};
    try { parsed = JSON.parse(data); } catch (_) {}
    const msg = result.ok && parsed.ok
      ? "تم الإرسال بنجاح. Android: "+parsed.androidSent+" | iPhone/Web Push: "+parsed.webSent
      : "فشل الإرسال: "+(parsed.error || result.status);
    return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>دولاري</title><body style="font-family:system-ui;background:#0b0b0f;color:white;display:grid;place-items:center;min-height:100vh"><div style="background:#17171d;padding:28px;border-radius:20px;text-align:center"><h2>'+msg+'</h2><p><a href="/admin" style="color:white">العودة للوحة الإشعار</a></p></div></body>', {status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}});
  }

  if (url.pathname === "/api/broadcast" && request.method === "POST") {
    const suppliedPassword = request.headers.get("X-Dolary-Admin-Password") || "";
    if (!env.ADMIN_PASSWORD || suppliedPassword !== env.ADMIN_PASSWORD) {
      return json({ ok: false, error: "broadcast_not_authorized" }, 401, origin, env);
    }

    let body;
    try { body = await request.json(); }
    catch (_) { return json({ ok: false, error: "invalid_json" }, 400, origin, env); }

    const title = String(body && body.title || "").trim().slice(0, 120);
    const message = String(body && (body.body ?? body.message) || "").trim().slice(0, 1000);
    if (!title || !message) return json({ ok: false, error: "title_and_body_required" }, 400, origin, env);

    const requestedBroadcastId =
      cleanBroadcastId(body && (body.broadcastId ?? body.notificationId)) || newBroadcastId();
    const broadcastKey = BROADCAST_PREFIX + requestedBroadcastId;
    let broadcastRecord = await env.PUSH_STORE.get(broadcastKey, "json");
    if (!broadcastRecord) {
      broadcastRecord = {
        id: requestedBroadcastId,
        title,
        body: message,
        url: (env.APP_URL || "https://aehamtech.top/dolary/") + "?pwa-notifications=1#pwa-notifications",
        createdAt: new Date().toISOString()
      };
      await env.PUSH_STORE.put(broadcastKey, JSON.stringify(broadcastRecord));
    }
    const notification = {
      title: broadcastRecord.title,
      body: broadcastRecord.body,
      url: broadcastRecord.url,
      id: broadcastRecord.id,
      broadcastId: broadcastRecord.id
    };

    const webListed = await env.PUSH_STORE.list({ prefix: SUB_PREFIX, limit: MAX_LIST_SIZE });
    const androidListed = await env.PUSH_STORE.list({ prefix: ANDROID_PREFIX, limit: MAX_ANDROID_LIST_SIZE });
    let webSent = 0, webRemoved = 0, androidSent = 0, androidRemoved = 0, failed = 0;

    for (const item of webListed.keys) {
      const key = item.name;
      const record = await env.PUSH_STORE.get(key, "json");
      if (!record || !record.subscription) continue;
      try {
        const deliveryMarker = deliveryKey(notification.broadcastId, key);
        if (await env.PUSH_STORE.get(deliveryMarker)) continue;
        const result = await deliver(record.subscription, notification, env);
        if (result.status === 404 || result.status === 410) {
          await env.PUSH_STORE.delete(key);
          webRemoved++;
        } else if (result.ok) {
          await env.PUSH_STORE.put(deliveryMarker, JSON.stringify({
            broadcastId: notification.broadcastId,
            recipient: key,
            deliveredAt: new Date().toISOString()
          }));
          webSent++;
        } else {
          failed++;
        }
      } catch (_) { failed++; }
    }

    if (env.FCM_SERVICE_ACCOUNT_JSON && androidListed.keys.length) {
      try {
        const auth = await fcmAccessToken(env);
        for (let i = 0; i < androidListed.keys.length; i += 20) {
          const batch = androidListed.keys.slice(i, i + 20);
          const results = await Promise.all(batch.map(async (item) => {
            const key = item.name;
            const record = await env.PUSH_STORE.get(key, "json");
            if (!record || !record.token) return { skipped: true };
            try {
              const deliveryMarker = deliveryKey(notification.broadcastId, key);
              if (await env.PUSH_STORE.get(deliveryMarker)) return { skipped: true };
              const result = await deliverFcm(record.token, notification, env, auth);
              if (result.status === 404 || result.status === 400) {
                await env.PUSH_STORE.delete(key);
                return { removed: true };
              }
              if (result.ok) {
                await env.PUSH_STORE.put(deliveryMarker, JSON.stringify({
                  broadcastId: notification.broadcastId,
                  recipient: key,
                  deliveredAt: new Date().toISOString()
                }));
                return { sent: true };
              }
              return { failed: true };
            } catch (_) {
              return { failed: true };
            }
          }));
          for (const result of results) {
            if (result.sent) androidSent++;
            else if (result.removed) androidRemoved++;
            else if (result.failed) failed++;
          }
        }
      } catch (_) {
        failed += androidListed.keys.length;
      }
    }

    return json({
      ok: true,
      webSent,
      androidSent,
      webRemoved,
      androidRemoved,
      failed,
      androidPushReady: Boolean(env.FCM_SERVICE_ACCOUNT_JSON),
      broadcastId: notification.broadcastId
    }, 200, origin, env);
  }

  return json({ ok: false, error: "not_found" }, 404, origin, env);
}

async function checkRates(env) {
  const pushReady = Boolean(env.PUSH_STORE && env.VAPID_PRIVATE_KEY && env.VAPID_PUBLIC_KEY);
  const socialReady = socialPublishingEnabled(env);
  if (!pushReady && !socialReady) return;

  const response = await fetch(RATE_URL, {
    headers: { "Accept": "application/json" },
    cf: { cacheTtl: 0 }
  });
  if (!response.ok) throw new Error("XEIQD returned " + response.status);
  const data = await response.json();
  if (!data || !Array.isArray(data.cities)) throw new Error("Invalid XEIQD rates response");

  if (socialReady) {
    const slug = env.SOCIAL_RATE_SLUG || "baghdad";
    const city = data.cities.find(item => item && item.slug === slug);
    const rate = city ? currentRate(city) : null;
    if (Number.isFinite(rate)) {
      await publishSocialRate(env, city, rate);
    } else {
      console.warn("Dolary social publishing skipped: canonical rate unavailable");
    }
  }

  if (!pushReady) return;

  const listed = await env.PUSH_STORE.list({ prefix: SUB_PREFIX, limit: MAX_LIST_SIZE });
  const keys = listed.keys.map(item => item.name).sort();
  if (!keys.length) return;

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
        id: "rate-" + key.slice(-24) + "-" + record.rule.condition + "-" + Math.round(previous) + "-" + Math.round(rate),
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
    const image = await socialImageResponse(request, env);
    if (image) return image;
    return api(request, env);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(checkRates(env).catch(error => {
      console.error("Dolary scheduled price check failed:", error && error.message ? error.message : "unknown");
    }));
  }
};

export { cleanBroadcastId, newBroadcastId };
