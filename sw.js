const CACHE = "dailydeenhub-v36";
// Core shell: must all succeed for install. Big audio is NOT precached (cached on first use).
const SHELL = ["/", "/index.html", "/tr/", "/tr/index.html", "/styles.css", "/fonts.css", "/app.js", "/prayer-calc.js", "/prayer-api.js", "/push-alerts.js", "/manifest.json",
  "/favicon.png", "/icon-192.png", "/images/logo.png", "/images/logo-text-en.png", "/images/logo-text-tr.png",
  "/fonts/outfit-latin-wght-normal.woff2", "/fonts/outfit-latin-ext-wght-normal.woff2", "/fonts/fraunces-latin-opsz-normal.woff2", "/fonts/fraunces-latin-ext-opsz-normal.woff2",
  "/fonts/amiri-arabic-400-normal.woff2", "/fonts/amiri-latin-400-normal.woff2",
  "/about.html", "/terms.html", "/privacy.html", "/tr/about.html", "/tr/terms.html", "/tr/privacy.html"];
// Nice-to-have: failures here don't block install.
const OPTIONAL = ["/qibla.html", "/qibla.js", "/vendor/maplibre/maplibre-gl.js", "/vendor/maplibre/maplibre-gl.css", "/audio/bell.wav", "/audio/adhan-prayer-call-trimmed.mp3"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(async cache => {
    await cache.addAll(SHELL);
    await Promise.all(OPTIONAL.map(u => cache.add(u).catch(() => {})));
  }).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.method !== "GET") return;
  if (req.headers.has("range")) return; // let the browser stream audio itself; 206s can't be cached
  event.respondWith(fetch(req).then(res => {
    // Only cache complete, successful same-origin responses (never 404/500 pages).
    if (res.ok && res.status === 200 && res.type === "basic") {
      const copy = res.clone();
      caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
    }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: false }).then(hit => hit || caches.match(req, { ignoreSearch: true }))));
});

// ---- Web Push prayer alerts ----
self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  var title = data.title || 'Prayer time';
  var body = data.body || (data.prayer === 'Test' ? 'Push notifications are working!' : 'Tap to open DailyDeenHub');
  var options = {
    body: body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'prayer-' + (data.prayer || 'now'),
    renotify: true,
    requireInteraction: false,
    data: { url: data.url || '/' },
  };
  // vibrate in a gentle pattern on Android
  try { options.vibrate = [300, 100, 300]; } catch (e) {}
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(url) !== -1) { return list[i].focus(); }
      }
      return clients.openWindow(url);
    })
  );
});
