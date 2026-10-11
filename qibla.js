const KAABA = { lat: 21.4225, lon: 39.8262 };
const params = new URLSearchParams(location.search);
if (params.get("embed") === "1") document.body.classList.add("embed");
const start = {
  lat: Number(params.get("lat")) || 45.5017,
  lon: Number(params.get("lon")) || -73.5673,
  name: params.get("name") || "Montreal"
};

function bearing(lat, lon) {
  const φ1 = lat * Math.PI / 180, λ1 = lon * Math.PI / 180;
  const φ2 = KAABA.lat * Math.PI / 180, λ2 = KAABA.lon * Math.PI / 180;
  const y = Math.sin(λ2 - λ1);
  const x = Math.cos(φ1) * Math.tan(φ2) - Math.sin(φ1) * Math.cos(λ2 - λ1);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function distanceKm(lat, lon) {
  const R = 6371;
  const φ1 = lat * Math.PI / 180, φ2 = KAABA.lat * Math.PI / 180;
  const dφ = (KAABA.lat - lat) * Math.PI / 180;
  const dλ = (KAABA.lon - lon) * Math.PI / 180;
  const a = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
function geodesic(lat1, lon1, lat2, lon2, steps = 96) {
  const φ1 = lat1 * Math.PI / 180, λ1 = lon1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180, λ2 = lon2 * Math.PI / 180;
  const d = 2 * Math.asin(Math.min(1, Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2)));
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    if (d === 0) { coords.push([lon1, lat1]); continue; }
    const a = Math.sin((1 - f) * d) / Math.sin(d);
    const b = Math.sin(f * d) / Math.sin(d);
    const x = a * Math.cos(φ1) * Math.cos(λ1) + b * Math.cos(φ2) * Math.cos(λ2);
    const y = a * Math.cos(φ1) * Math.sin(λ1) + b * Math.cos(φ2) * Math.sin(λ2);
    const z = a * Math.sin(φ1) + b * Math.sin(φ2);
    coords.push([Math.atan2(y, x) * 180 / Math.PI, Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI]);
  }
  const parts = [];
  let part = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    if (Math.abs(coords[i][0] - coords[i - 1][0]) > 180) { parts.push(part); part = []; }
    part.push(coords[i]);
  }
  parts.push(part);
  return parts.filter(p => p.length > 1);
}
let origin = { lat: start.lat, lon: start.lon, name: start.name };
function lineData() {
  const b = bearing(origin.lat, origin.lon);
  const km = distanceKm(origin.lat, origin.lon);
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { kind: "line" }, geometry: { type: "MultiLineString", coordinates: geodesic(origin.lat, origin.lon, KAABA.lat, KAABA.lon) } },
      { type: "Feature", properties: { kind: "you" }, geometry: { type: "Point", coordinates: [origin.lon, origin.lat] } },
      { type: "Feature", properties: { kind: "kaaba" }, geometry: { type: "Point", coordinates: [KAABA.lon, KAABA.lat] } }
    ],
    bearing: b,
    km
  };
}
function fitPath() {
  const path = geodesic(origin.lat, origin.lon, KAABA.lat, KAABA.lon).flat();
  const bounds = path.reduce((box, p) => box.extend(p), new maplibregl.LngLatBounds(path[0], path[0]));
  map.fitBounds(bounds, { padding: 36, maxZoom: 4, duration: 0 });
}
function setOrigin(lat, lon, name) {
  origin = { lat, lon, name: name || origin.name };
  if (name) document.getElementById("q").value = name;
  redraw();
  if (map.isStyleLoaded()) map.easeTo({ center: [lon, lat], zoom: 12, duration: 450 });
}

const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: [start.lon, start.lat],
  zoom: 13
});
map.addControl(new maplibregl.NavigationControl(), "bottom-right");

function redraw() {
  const data = lineData();
  const source = map.getSource("qibla");
  if (source) source.setData(data);
  document.getElementById("bearing").textContent = data.km < 1 ? "Kaaba" : data.bearing.toFixed(2) + "°";
  document.getElementById("distance").textContent = data.km.toFixed(0) + " km";
  document.getElementById("coords").textContent = origin.lat.toFixed(4) + ", " + origin.lon.toFixed(4);
  document.getElementById("status").textContent = origin.name || "Live";
}

map.on("load", () => {
  map.addSource("qibla", { type: "geojson", data: lineData() });
  map.addLayer({ id: "qibla-line", type: "line", source: "qibla", filter: ["==", ["get", "kind"], "line"], paint: { "line-color": "#8d5e32", "line-width": 3 } });
  map.addLayer({ id: "qibla-you", type: "circle", source: "qibla", filter: ["==", ["get", "kind"], "you"], paint: { "circle-radius": 7, "circle-color": "#d4a574", "circle-stroke-width": 2, "circle-stroke-color": "#8d5e32" } });
  map.addLayer({ id: "qibla-kaaba", type: "circle", source: "qibla", filter: ["==", ["get", "kind"], "kaaba"], paint: { "circle-radius": 6, "circle-color": "#1a1a1a", "circle-stroke-width": 2, "circle-stroke-color": "#8d5e32" } });
  redraw();
});

function goTo(lat, lon, label) { setOrigin(lat, lon, label); }
function locate() {
  if (!navigator.geolocation) {
    document.getElementById("status").textContent = "Location unavailable";
    return;
  }
  document.getElementById("status").textContent = "Locating…";
  navigator.geolocation.getCurrentPosition(pos => {
    goTo(pos.coords.latitude, pos.coords.longitude, "My location");
  }, err => {
    document.getElementById("status").textContent = err.code === 1 ? "Location blocked" : "Location unavailable";
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
}

document.getElementById("locate").onclick = locate;
document.getElementById("back").onclick = event => {
  if (history.length > 1) { event.preventDefault(); history.back(); }
};
if (params.get("embed") !== "1") map.once("load", locate);
let timer = 0;
document.getElementById("q").addEventListener("input", e => {
  clearTimeout(timer);
  const q = e.target.value.trim();
  if (q.length < 2) return;
  timer = setTimeout(async () => {
    const list = document.getElementById("results");
    let results = [];
    try {
      const res = await fetch("https://geocoding-api.open-meteo.com/v1/search?count=5&name=" + encodeURIComponent(q));
      if (res.ok) results = (await res.json()).results || [];
    } catch { /* offline: show no results */ }
    const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    list.innerHTML = results.map((r, i) => `<li><button type="button" data-i="${i}">${esc(r.name)}<br><small>${esc([r.admin1, r.country].filter(Boolean).join(" · "))}</small></button></li>`).join("");
    list.querySelectorAll("button").forEach(btn => btn.onclick = () => {
      const r = results[+btn.dataset.i];
      list.innerHTML = "";
      setOrigin(r.latitude, r.longitude, r.name);
    });
  }, 280);
});
document.getElementById("q").value = start.name;
document.getElementById("q").addEventListener("keydown", event => {
  if (event.key !== "Enter") return;
  const first = document.querySelector("#results button");
  if (first) first.click();
});
