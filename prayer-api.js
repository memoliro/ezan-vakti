/* Aladhan prayer-times client. https://aladhan.com/prayer-times-api */
const PrayerAPI = (() => {
  const BASE = "https://api.aladhan.com/v1";

  function clean(value) {
    return String(value || "").slice(0, 5);
  }

  function readCache(key) {
    try {
      const hit = JSON.parse(localStorage.getItem(key) || "null");
      if (!hit || Date.now() - hit.savedAt > 1000 * 60 * 60 * 18) return null;
      return hit.payload;
    } catch {
      return null;
    }
  }

  function writeCache(key, payload) {
    try {
      localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), payload }));
    } catch { /* private mode or full storage */ }
  }

  function normalize(day) {
    const timings = {};
    for (const key of Object.keys(day.timings || {})) timings[key] = clean(day.timings[key]);
    return { date: day.date, timings };
  }

  async function getJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Aladhan ${res.status}`);
    const json = await res.json();
    if (json.code && json.code !== 200) throw new Error(json.status || "Aladhan error");
    return json;
  }

  async function month({ lat, lon, year, month, method = 2, school = 0, tz = "" }) {
    const key = `ezan-aladhan:${lat.toFixed(3)}:${lon.toFixed(3)}:${year}:${month}:${method}:${school}`;
    const cached = readCache(key);
    if (cached) return cached;
    const url = `${BASE}/calendar/${year}/${month}?latitude=${lat}&longitude=${lon}&method=${method}&school=${school}`;
    try {
      const json = await getJson(url);
      const days = (json.data || []).map(normalize);
      const meta = json.data?.[0]?.meta || {};
      const payload = {
        source: "Aladhan",
        methodName: meta.method?.name || `Method ${method}`,
        timezone: meta.timezone || "",
        school: meta.school || (school === 1 ? "HANAFI" : "STANDARD"),
        days
      };
      writeCache(key, payload);
      return payload;
    } catch (e) {
      // Offline fallback: compute locally so the app never shows "could not load times"
      if (typeof PrayerCalc !== "undefined") return PrayerCalc.month({ lat, lon, year, month, method, school, tz });
      throw e;
    }
  }

  async function qibla(lat, lon) {
    const key = `ezan-qibla:${lat.toFixed(3)}:${lon.toFixed(3)}`;
    const cached = readCache(key);
    if (cached) return cached;
    const json = await getJson(`${BASE}/qibla/${lat}/${lon}`);
    const payload = { source: "Aladhan", direction: json.data?.direction };
    if (typeof payload.direction === "number") writeCache(key, payload);
    return payload;
  }

  return { month, qibla };
})();
