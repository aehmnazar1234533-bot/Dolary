'use strict';
const CACHE_NAME = 'dolary-pwa-v19';
const APP_SHELL = './';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.add(new Request(APP_SHELL, { cache: 'reload' })).catch(() => {});
    await cache.add(new Request('./manifest.webmanifest?v=14', { cache: 'reload' })).catch(() => {});
    await cache.add(new Request('./pwa-app.css?v=1', { cache: 'reload' })).catch(() => {});
    await cache.add(new Request('./pwa-app.js?v=1', { cache: 'reload' })).catch(() => {});
    await cache.add(new Request('./dolary-icon.svg', { cache: 'reload' })).catch(() => {});
    await cache.add(new Request('./dolary-icon.svg?v=14', { cache: 'reload' })).catch(() => {});
    await cache.add(new Request('./dolary-icon.svg', { cache: 'reload' })).catch(() => {});
    await cache.add(new Request('./dolary-icon.svg', { cache: 'reload' })).catch(() => {});
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

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL('./#pwa-notifications', self.location.href).href;
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