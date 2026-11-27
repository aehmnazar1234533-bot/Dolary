'use strict';
const CACHE_NAME = 'dolary-pwa-v38';
const APP_SHELL = './';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.add(new Request(APP_SHELL, { cache: 'reload' })).catch(() => {});
    await cache.add(new Request('./manifest.webmanifest?v=19', { cache: 'reload' })).catch(() => {});
    await cache.add(new Request('./pwa-app.css?v=4', { cache: 'reload' })).catch(() => {});
    await cache.add(new Request('./pwa-app.js?v=5', { cache: 'reload' })).catch(() => {});
    await cache.add(new Request('./pwa-push-config.js?v=2', { cache: 'reload' })).catch(() => {});
    await cache.add(new Request('./pwa-push.js?v=5', { cache: 'reload' })).catch(() => {});
    await cache.add(new Request('./privacy_policy.html', { cache: 'reload' })).catch(() => {});
    await cache.add(new Request('./dolary-mark.svg?v=2', { cache: 'reload' })).catch(() => {});
    await cache.add(new Request('./apple-touch-icon.png?v=7', { cache: 'reload' })).catch(() => {});
    await cache.add(new Request('./pwa-icon.svg?v=1', { cache: 'reload' })).catch(() => {});
    await cache.add(new Request('./dolary-notification.png', { cache: 'reload' })).catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('dolary-pwa-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(APP_SHELL, response.clone()).catch(() => {});
        }
        return response;
      } catch (_) {
        return (await caches.match(APP_SHELL)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (_) {
      return cached || Response.error();
    }
  })());
});

function openPushDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dolary-push-history', 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('processed')) db.createObjectStore('processed', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function claimPushId(id) {
  if (!id) return false;
  const db = await openPushDb();
  let claimed = false;
  await new Promise((resolve) => {
    try {
      const tx = db.transaction('processed', 'readwrite');
      tx.objectStore('processed').add({ id: String(id), at: Date.now() });
      tx.oncomplete = () => { claimed = true; resolve(); };
      tx.onerror = () => { resolve(); };
      tx.onabort = () => { resolve(); };
    } catch (_) {
      resolve();
    }
  });
  if (claimed) {
    try {
      await new Promise((resolve) => {
        const cleanup = db.transaction('processed', 'readwrite');
        const store = cleanup.objectStore('processed');
        const getAll = store.getAll();
        getAll.onsuccess = () => {
          const rows = (getAll.result || []).sort((a, b) => (b.at || 0) - (a.at || 0));
          for (let i = 200; i < rows.length; i++) store.delete(rows[i].id);
        };
        cleanup.oncomplete = () => resolve();
        cleanup.onerror = () => resolve();
        cleanup.onabort = () => resolve();
      });
    } catch (_) {}
  }
  db.close();
  return claimed;
}

async function setSystemBadge(count) {
  try {
    const registration = self.registration;
    if (typeof registration.setAppBadge === 'function') {
      if (count > 0) await registration.setAppBadge(count);
      else if (typeof registration.clearAppBadge === 'function') await registration.clearAppBadge();
    }
  } catch (_) {}
}

async function changeBadgeCount(delta) {
  return new Promise((resolve) => {
    const request = indexedDB.open('dolary-push-history', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    request.onsuccess = () => {
      const db = request.result;
      try {
        const tx = db.transaction('meta', 'readwrite');
        const store = tx.objectStore('meta');
        const get = store.get('unread');
        get.onsuccess = () => {
          const current = Math.max(0, Number(get.result && get.result.value) || 0);
          const next = Math.max(0, current + delta);
          store.put({ key: 'unread', value: next });
          tx.oncomplete = () => {
            db.close();
            setSystemBadge(next).finally(() => resolve(next));
          };
        };
        get.onerror = () => { db.close(); resolve(0); };
        tx.onerror = () => { db.close(); resolve(0); };
      } catch (_) {
        db.close();
        resolve(0);
      }
    };
    request.onerror = () => resolve(0);
  });
}

function storePushHistory(record) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dolary-push-history', 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('events')) {
        request.result.createObjectStore('events', { keyPath: 'id' });
      }
      if (!request.result.objectStoreNames.contains('meta')) {
        request.result.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      try {
        const tx = db.transaction('events', 'readwrite');
        tx.objectStore('events').put(record);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      } catch (error) {
        db.close();
        reject(error);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data = {};
    try {
      data = event.data ? event.data.json() : {};
    } catch (_) {
      data = { title: 'دولاري', body: event.data ? event.data.text() : 'لديك تنبيه جديد.' };
    }

    const title = data.title || 'دولاري';
    const broadcastId = String(data.broadcastId || data.notificationId || data.id || '');
    if (!broadcastId || !(await claimPushId(broadcastId))) return;

    const options = {
      body: data.body || 'لديك تنبيه جديد من دولاري.',
      icon: './apple-touch-icon.png?v=7',
      badge: './dolary-notification.png',
      tag: broadcastId,
      renotify: false,
      data: {
        url: data.url || new URL('./?pwa-notifications=1#pwa-notifications', self.location.href).href
      }
    };

    await self.registration.showNotification(title, options);
    await changeBadgeCount(1);

    if (data.province && Number.isFinite(Number(data.rate)) && data.at) {
      const record = {
        id: broadcastId,
        province: String(data.province),
        rate: Number(data.rate),
        message: String(data.message || data.body || 'تنبيه سعر من دولاري'),
        at: String(data.at)
      };
      try {
        await storePushHistory(record);
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clients) {
          client.postMessage({ type: 'DOLARY_PUSH_RECEIVED', record });
        }
      } catch (_) {}
    }
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    await changeBadgeCount(-1);
    let target = new URL('./?pwa-notifications=1#pwa-notifications', self.location.href).href;
    try {
      const requested = event.notification.data && event.notification.data.url;
      if (requested) {
        const candidate = new URL(requested, self.location.href);
        if (candidate.origin === self.location.origin) target = candidate.href;
      }
    } catch (_) {}

    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(target);
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
