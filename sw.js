const CACHE = "dailydeenhub-v35";
const SHELL = ["/", "/index.html", "/tr/", "/tr/index.html", "/styles.css", "/app.js", "/prayer-calc.js", "/prayer-api.js", "/push-alerts.js", "/manifest.json", "/favicon.png", "/audio/adhan-prayer-call.mp3", "/audio/adhan-prayer-call-trimmed.mp3",
  "/audio/alarm.mp3", "/audio/alert-on-mobile.wav", "/audio/bell.wav",
  "/audio/double-car-honk.mp3", "/audio/nikin-short-chick-sound.mp3", "/audio/nostalgia.wav",
  "/about.html", "/terms.html", "/privacy.html", "/tr/about.html", "/tr/terms.html", "/tr/privacy.html"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return res;
  }).catch(() => caches.match(event.request)));
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
