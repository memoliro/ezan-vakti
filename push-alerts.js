/* push-alerts.js — Web Push prayer alerts (works when tab is closed).
   One-time opt-in: user enables -> browser permission -> subscription stored
   in the Cloudflare Worker with their prayer settings. No account needed. */
(function () {
'use strict';

// Filled in after worker deploy:
var PUSH_API = 'https://push.dailydeenhub.com';

function $(id) { return document.getElementById(id); }

function supported() {
  return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
}

function b64ToBytes(b64) {
  b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  var bin = atob(b64);
  var b = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

async function getReg() {
  if (!supported()) return null;
  try { return await navigator.serviceWorker.ready; }
  catch (e) { return null; }
}

async function currentSub() {
  var reg = await getReg();
  if (!reg || !reg.pushManager) return null;
  try { return await reg.pushManager.getSubscription(); }
  catch (e) { return null; }
}

/* Refresh the toggle UI to match actual subscription state. */
async function refreshUI() {
  var chk = $('pushChk');
  var note = $('pushNote');
  if (!chk) return;
  if (!supported()) {
    chk.disabled = true;
    if (note) note.textContent = t('pushUnsupported');
    return;
  }
  var sub = await currentSub();
  chk.checked = !!sub;
  if (note) note.textContent = sub ? t('pushOn') : t('pushOff');
  refreshInstallHint();
}

/* ---- Install prompt: show only when the app is NOT installed ---- */
var deferredPrompt = null;

function isInstalled() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
         (window.navigator && window.navigator.standalone === true);
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
}

function refreshInstallHint() {
  var row = $('installRow'), hint = $('installHint'), btn = $('installBtn');
  if (!row) return;
  if (isInstalled()) { row.classList.add('hidden'); row.classList.remove('ios-install-box'); return; }
  if (deferredPrompt) {
    // Android/Chrome: show hint + Install button
    if (hint) hint.textContent = t('installHint');
    if (btn) { btn.textContent = t('installBtn'); btn.classList.remove('hidden'); }
    row.classList.remove('hidden');
    row.classList.remove('ios-install-box');
  } else if (isIOS()) {
    // iPhone/iPad: no install prompt API — show prominent manual steps
    // (iOS web push requires the PWA on the home screen)
    if (hint) { hint.innerHTML = t('installIOS'); }
    if (btn) btn.classList.add('hidden');
    row.classList.remove('hidden');
    row.classList.add('ios-install-box');
  } else {
    row.classList.add('hidden');
    row.classList.remove('ios-install-box');
  }
}

async function doInstall() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  try { await deferredPrompt.userChoice; } catch (e) {}
  deferredPrompt = null;
  refreshInstallHint();
}

window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  deferredPrompt = e;
  refreshInstallHint();
});
window.addEventListener('appinstalled', function () {
  deferredPrompt = null;
  refreshInstallHint();
  hideInstallPopup(true);
});


/* ---- Install popup on page load (not only in Settings) ---- */
function hideInstallPopup(remember) {
  var pop = $('installPopup');
  if (pop) pop.classList.add('hidden');
  if (remember) { try { localStorage.setItem('ddh_install_popup', String(Date.now())); } catch (e) {} }
}
function maybeShowInstallPopup() {
  if (isInstalled()) return;
  try {
    var last = localStorage.getItem('ddh_install_popup');
    if (last && Date.now() - (+last) < 7 * 24 * 3600 * 1000) return; // at most once a week
  } catch (e) {}
  // give beforeinstallprompt a moment to fire
  setTimeout(function () {
    if (isInstalled()) return;
    if (!deferredPrompt && !isIOS()) return; // nothing useful to offer
    var pop = $('installPopup');
    if (!pop || !pop.classList.contains('hidden')) return;
    var btn = $('installPopBtn'), ios = $('installPopIOS');
    if (isIOS() && !deferredPrompt) {
      if (btn) btn.classList.add('hidden');
      if (ios) { ios.innerHTML = t('installIOS'); ios.classList.remove('hidden'); }
    } else {
      if (btn) { btn.textContent = t('installBtn'); btn.classList.remove('hidden'); }
    }
    var later = $('installPopLater');
    if (later) later.textContent = t('installPopLater');
    var title = pop.querySelector('[data-i="installPopTitle"]');
    if (title) title.textContent = t('installPopTitle');
    var body = pop.querySelector('[data-i="installPopBody"]');
    if (body) body.textContent = t('installPopBody');
    pop.classList.remove('hidden');
  }, 2500);
}

/* Build the settings payload the worker needs. */
function settingsPayload() {
  // state is the app's global settings object (app.js)
  var st = (typeof state !== 'undefined') ? state : {};
  var place = st.place || {};
  return {
    lat: place.lat, lon: place.lon, tz: place.tz || 'America/Toronto',
    method: st.method != null ? st.method : 2,
    madhab: st.school != null ? st.school : 0,
    remind: st.remind || { Fajr: 15, Dhuhr: 15, Asr: 15, Maghrib: 15, Isha: 15 },
    lang: st.lang || 'en',
  };
}

async function enable() {
  var note = $('pushNote');
  try {
    if (Notification.permission === 'denied') {
      if (note) note.textContent = t('pushBlocked');
      $('pushChk').checked = false;
      return;
    }
    var perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      if (note) note.textContent = t('pushOff');
      $('pushChk').checked = false;
      return;
    }
    var reg = await getReg();
    if (!reg) throw new Error('no sw');
    // VAPID public key from worker
    var kr = await fetch(PUSH_API + '/api/vapid-key');
    var kj = await kr.json();
    var sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToBytes(kj.key),
    });
    var sj = sub.toJSON();
    var res = await fetch(PUSH_API + '/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: { endpoint: sj.endpoint, keys: sj.keys },
        settings: settingsPayload(),
      }),
    });
    if (!res.ok) throw new Error('subscribe ' + res.status);
    lastSynced = JSON.stringify(settingsPayload());
    try { localStorage.setItem('ddh-push', '1'); } catch (e) {}
    if (note) note.textContent = t('pushOn');
    toast(t('pushEnabled'));
  } catch (e) {
    if (note) note.textContent = t('pushError');
    var c = $('pushChk'); if (c) c.checked = false;
  }
}

async function disable() {
  var note = $('pushNote');
  try {
    var sub = await currentSub();
    if (sub) {
      var endpoint = sub.endpoint;
      try { await sub.unsubscribe(); } catch (e) {}
      await fetch(PUSH_API + '/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: endpoint }),
      }).catch(function () {});
    }
    try { localStorage.removeItem('ddh-push'); } catch (e) {}
    if (note) note.textContent = t('pushOff');
  } catch (e) {
    if (note) note.textContent = t('pushError');
  }
}

/* Re-sync settings when the user changes location/method/reminders while subscribed.
   save() fires on EVERY state change (even tasbih taps), so: debounce, and skip when the
   payload the server cares about hasn't actually changed. */
var lastSynced = '';
var syncTimer = 0;
function resync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(doResync, 1500);
}
async function doResync() {
  var sub = await currentSub();
  if (!sub) return;
  var payload = JSON.stringify(settingsPayload());
  if (payload === lastSynced) return;
  try {
    var sj = sub.toJSON();
    var res = await fetch(PUSH_API + '/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: { endpoint: sj.endpoint, keys: sj.keys },
        settings: settingsPayload(),
      }),
    });
    if (res.ok) lastSynced = payload;
  } catch (e) {}
}

function boot() {
  var chk = $('pushChk');
  if (!chk) return;
  chk.addEventListener('change', function () {
    if (chk.checked) enable(); else disable();
  });
  var ibtn = $('installBtn');
  if (ibtn) ibtn.addEventListener('click', doInstall);
  var popBtn = $('installPopBtn');
  if (popBtn) popBtn.addEventListener('click', function () { doInstall(); hideInstallPopup(true); });
  var popLater = $('installPopLater');
  if (popLater) popLater.addEventListener('click', function () { hideInstallPopup(true); });
  refreshUI();
  maybeShowInstallPopup();
  // expose for app.js to call after settings change
  window.DDHPush = { refresh: refreshUI, resync: resync };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
})();
