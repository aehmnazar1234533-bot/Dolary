import { buildPushPayload } from "@block65/webcrypto-web-push";

const RATE_URL = "https://xeiqd.com/rates.json";
const SUB_PREFIX = "sub:";
const ANDROID_PREFIX = "android:";
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
        topic: "dolary-rate"
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

async function api(request, env) {
  const origin = request.headers.get("Origin");
  const expectedOrigin = env.APP_ORIGIN || "https://aehamtech.top";
  const requestOrigin = new URL(request.url).origin;
  const allowedOrigins = new Set([expectedOrigin, requestOrigin]);
  if (origin && !allowedOrigins.has(origin)) {
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

  if (url.pathname === "/admin" && request.method === "GET") {
    return new Response(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>دولاري | الإشعار العام</title><style>
      *{box-sizing:border-box}body{margin:0;background:#0b0b0f;color:#f7f7fb;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;min-height:100vh;display:grid;place-items:center;padding:20px}
      .card{width:min(560px,100%);background:#17171d;border:1px solid #2b2b35;border-radius:24px;padding:24px;box-shadow:0 20px 60px #0008}.brand{font-size:26px;font-weight:800;margin-bottom:6px}.sub{color:#a7a7b2;margin-bottom:22px}
      label{display:block;font-weight:700;margin:14px 0 7px}input,textarea{width:100%;border:1px solid #343440;background:#101016;color:#fff;border-radius:14px;padding:13px;font:inherit;outline:none}textarea{min-height:130px;resize:vertical}
      button{width:100%;border:0;border-radius:14px;padding:14px;margin-top:18px;background:#fff;color:#111;font-weight:800;font-size:16px;cursor:pointer}.status{margin-top:16px;padding:12px;border-radius:12px;background:#101016;color:#bfc0ca;white-space:pre-wrap}
      .hint{font-size:12px;color:#888995;margin-top:12px;line-height:1.6}
    </style></head><body><main class="card"><div class="brand">دولاري</div><div class="sub">لوحة الإشعار العام — Android + iPhone</div>
    <form id="broadcastForm" method="POST" action="/api/broadcast-form"><label>كلمة مرور الإدارة</label><input id="p" name="password" type="password" autocomplete="current-password" placeholder="كلمة مرور الإدارة" required>
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
            const r=await fetch("/api/broadcast",{method:"POST",headers:{"Content-Type":"application/json","X-Dolary-Admin-Password":password},body:JSON.stringify({title,body}),cache:"no-store"});
            const d=await r.json().catch(()=>({}));
            if(r.status===401){s.textContent="كلمة مرور الإدارة غير صحيحة.";return}
            if(!r.ok||!d.ok){s.textContent="فشل الإرسال: "+(d.error||r.status);return}
            try { sessionStorage.setItem("dolary_admin_password",password); } catch (_) {}
            s.textContent="تم الإرسال بنجاح.\nAndroid: "+d.androidSent+"\niPhone/Web Push: "+d.webSent+"\nغير صالحة وحُذفت: "+(d.androidRemoved+d.webRemoved);
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
    const internal = new Request(new URL("/api/broadcast", request.url), {
      method:"POST",
      headers:{"Content-Type":"application/json","X-Dolary-Admin-Password":password},
      body:JSON.stringify({title,body})
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

    const notification = {
      title,
      body: message,
      url: (env.APP_URL || "https://aehamtech.top/dolary/") + "?pwa-notifications=1#pwa-notifications",
      id: "broadcast-" + Date.now()
    };

    const webListed = await env.PUSH_STORE.list({ prefix: SUB_PREFIX, limit: MAX_LIST_SIZE });
    const androidListed = await env.PUSH_STORE.list({ prefix: ANDROID_PREFIX, limit: MAX_ANDROID_LIST_SIZE });
    let webSent = 0, webRemoved = 0, androidSent = 0, androidRemoved = 0, failed = 0;

    for (const item of webListed.keys) {
      const key = item.name;
      const record = await env.PUSH_STORE.get(key, "json");
      if (!record || !record.subscription) continue;
      try {
        const result = await deliver(record.subscription, notification, env);
        if (result.status === 404 || result.status === 410) {
          await env.PUSH_STORE.delete(key);
          webRemoved++;
        } else if (result.ok) {
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
              const result = await deliverFcm(record.token, notification, env, auth);
              if (result.status === 404 || result.status === 400) {
                await env.PUSH_STORE.delete(key);
                return { removed: true };
              }
              if (result.ok) return { sent: true };
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
      androidPushReady: Boolean(env.FCM_SERVICE_ACCOUNT_JSON)
    }, 200, origin, env);
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
