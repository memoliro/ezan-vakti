# Ezan Vakti

Ad-free prayer times, qibla, a monthly timetable, and a Quran reader. Static site for Cloudflare Pages. No accounts, no tracking.

Montreal is the default place, with ISNA timings. Any city works, including Diyanet for Turkey.

## Deploy

Cloudflare Pages, connected to this repo:

- Framework: None
- Build command: empty
- Output directory: `/`

## Data

- Prayer times and qibla: Aladhan API v1 (`prayer-api.js`). Monthly calendar is cached for 18 hours. Diyanet is calculation method 13; ISNA is method 2. This is not the credentialed Diyanet Awqat Salah feed.
- Qibla map: `qibla.html` can be embedded. Dragging the map redraws the direction line from the center.
- Quran text and audio: Quran.com API v4

## Offline fallback

If Aladhan is unreachable, `prayer-calc.js` computes times on the device for the selected place and its time zone (DST handled per day). Output matches the Aladhan response shape that `app.js` reads. Qibla bearing is always computed locally.

## Self-hosted assets

Fonts (`/fonts`, `fonts.css`) and MapLibre (`/vendor/maplibre`) are served from this site, so no request goes to Google or unpkg. Only the qibla map tiles still come from `tiles.openfreemap.org`. The Content-Security-Policy in `_headers` lists every external host the app may contact; update it if you add one.

## Tests

`node --test tests/` runs the calculator tests (response shape, time zones, DST, Hanafi Asr).
