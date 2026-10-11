# Changes in this revision

Bugs: Ramadan hub crash (`minutes(new Date())`) that also disabled adhan/alerts; offline fallback now matches Aladhan shape and uses the place's time zone with per-day DST; `load()` try/catch and sound migration actually run; adhan now fires within 60 s after prayer time (previously could be missed); Turkish `compassUnavailable`; Quran fetch errors + out-of-order surah loads; stale refresh results ignored; local notifications go through the service worker (Android); qibla is computed locally (Aladhan call removed); About menu item links to the page.
Security: all third-party text (OSM names, city names, Quran text) escaped; strict CSP + Permissions-Policy.
Privacy: Google Fonts and unpkg removed (self-hosted); privacy/terms text corrected (EN+TR).
Service worker: no 6 MB audio precache, caches only 200 OK same-origin responses, skips Range requests, qibla page cached.
Headers: audio no longer `immutable`.
Added: tests/calc.test.js, qibla.js (extracted inline script), CHANGES.md.
push-alerts.js: settings re-sync to the push worker is debounced (1.5 s) and skipped when the synced payload is unchanged (it previously fired on every save(), e.g. each tasbih tap, causing a worker + Aladhan request each time).
