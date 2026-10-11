/* Offline prayer-time calculation (PrayTimes-style algorithm, public domain math).
 * Fallback when the Aladhan API is unreachable. Supports Diyanet, MWL, ISNA,
 * Umm al-Qura and other standard methods. Times are approximate (+/-1 min vs API). */
const PrayerCalc = (() => {
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;

  // method: [fajrAngle, ishaAngle|'min', maghribAngle|'min', ishaIntervalMin]
  const METHODS = {
    2:  { name: 'ISNA',            fajr: 15,   isha: 15 },              // ISNA
    3:  { name: 'MWL',             fajr: 18,   isha: 17 },              // Muslim World League
    13: { name: 'Diyanet',         fajr: 18,   isha: 17 },              // Diyanet (Turkey)
    4:  { name: 'Umm al-Qura',     fajr: 18.5, isha: '90 min' },        // Makkah
    5:  { name: 'Egyptian',        fajr: 19.5, isha: 17.5 },
    7:  { name: 'Tehran',          fajr: 17.7, isha: 14, maghrib: 4.5 },
    8:  { name: 'Gulf',            fajr: 19.5, isha: '90 min' },
    9:  { name: 'Kuwait',          fajr: 18,   isha: 17.5 },
    10: { name: 'Qatar',           fajr: 18,   isha: '90 min' },
    11: { name: 'Singapore',       fajr: 20,   isha: 18 },
    12: { name: 'France',          fajr: 12,   isha: 12 },
    14: { name: 'Russia',          fajr: 16,   isha: 15 },
    15: { name: 'Moonsighting',    fajr: 18,   isha: 18 },
    16: { name: 'Dubai',           fajr: 18.2, isha: '90 min' },
  };

  function julianDay(year, month, day) {
    if (month <= 2) { year -= 1; month += 12; }
    const A = Math.floor(year / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
  }

  function sunPosition(jd) {
    const d = jd - 2451545.0;
    const g = (357.529 + 0.98560028 * d) % 360;
    const q = (280.459 + 0.98564736 * d) % 360;
    const L = (q + 1.915 * Math.sin(g * D2R) + 0.020 * Math.sin(2 * g * D2R)) % 360;
    const e = 23.439 - 0.00000036 * d;
    const RA = Math.atan2(Math.cos(e * D2R) * Math.sin(L * D2R), Math.cos(L * D2R)) * R2D / 15;
    const decl = Math.asin(Math.sin(e * D2R) * Math.sin(L * D2R)) * R2D;
    const eqt = q / 15 - (RA < 0 ? RA + 24 : RA);
    return { decl, eqt };
  }

  function hourAngle(angle, lat, decl) {
    const cosH = (Math.sin(angle * D2R) - Math.sin(lat * D2R) * Math.sin(decl * D2R)) /
                 (Math.cos(lat * D2R) * Math.cos(decl * D2R));
    return Math.acos(Math.min(1, Math.max(-1, cosH))) * R2D / 15;
  }

  function fmt(h) {
    h = ((h % 24) + 24) % 24;
    const H = Math.floor(h), M = Math.floor((h - H) * 60 + 0.5);
    return String(H).padStart(2, '0') + ':' + String(M === 60 ? '00' : M).padStart(2, '0');
  }

  // school: 0 = Shafi (Standard), 1 = Hanafi
  function dayTimes(year, month, day, lat, lon, tzOffset, methodId = 13, school = 0) {
    const m = METHODS[methodId] || METHODS[13];
    const jd = julianDay(year, month, day) - lon / 360;
    const { decl, eqt } = sunPosition(jd);
    const noon = 12 + tzOffset - lon / 15 - eqt;

    const t = (angle) => noon - hourAngle(angle, lat, decl);       // morning events
    const tEve = (angle) => noon + hourAngle(angle, lat, decl);   // afternoon/evening events
    const tIsha = typeof m.isha === 'string'
      ? tEve(-(m.maghrib || 0.833)) + parseInt(m.isha) / 60
      : tEve(-m.isha);
    const asrAlt = school === 1 ? 2 : 1;
    const asrAngle = Math.atan(1 / (asrAlt + Math.tan(Math.abs(lat - decl) * D2R))) * R2D;

    const fajr = t(-m.fajr);
    const sunrise = t(-0.833);
    const dhuhr = noon;
    const asr = tEve(asrAngle);
    const maghrib = tEve(-(m.maghrib || 0.833));
    const isha = tIsha;

    return {
      Fajr: fmt(fajr), Sunrise: fmt(sunrise), Dhuhr: fmt(dhuhr),
      Asr: fmt(asr), Maghrib: fmt(maghrib), Isha: fmt(isha),
    };
  }

  // UTC offset (hours) of an IANA zone on a given calendar day, via Intl.
  // Falls back to the device zone when tz is missing/invalid.
  function tzOffsetHours(tz, year, month, day) {
    try {
      if (tz) {
        const at = new Date(Date.UTC(year, month - 1, day, 12));
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric',
          hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23'
        }).formatToParts(at);
        const g = {};
        parts.forEach(p => { if (p.type !== 'literal') g[p.type] = +p.value; });
        const asUTC = Date.UTC(g.year, g.month - 1, g.day, g.hour, g.minute, g.second);
        return (asUTC - at.getTime()) / 3600000;
      }
    } catch (e) { /* fall through */ }
    return -new Date(year, month - 1, day, 12).getTimezoneOffset() / 60;
  }

  const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const GREG_MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // Whole-month table matching the Aladhan shape that app.js consumes
  // (date.gregorian.{date,day,weekday,month,year}, date.hijri, timings).
  function month({ lat, lon, year, month, method = 13, school = 0, tz = '' }) {
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const tzOffset = tzOffsetHours(tz, year, month, d);
      const dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
      days.push({
        date: {
          gregorian: {
            date: String(d).padStart(2, '0') + '-' + String(month).padStart(2, '0') + '-' + year,
            day: String(d),
            weekday: { en: WEEKDAYS_EN[dow] },
            month: { number: month, en: GREG_MONTHS_EN[month - 1] },
            year: String(year)
          },
          hijri: gToH(year, month, d)
        },
        timings: dayTimes(year, month, d, lat, lon, tzOffset, method, school)
      });
    }
    const m = METHODS[method] || METHODS[13];
    return { source: 'offline', methodName: m.name + ' (offline calc.)', timezone: tz || '', school: school === 1 ? 'HANAFI' : 'STANDARD', days };
  }

  // Gregorian -> Hijri (standard Kuwaiti algorithm)
  const HIJRI_MONTHS = ['Muharram','Safar',"Rabiʿ al-awwal","Rabiʿ al-thani",'Jumada al-awwal','Jumada al-thani','Rajab',"Shaʿban",'Ramadan','Shawwal',"Dhu al-Qaʿdah",'Dhu al-Hijjah'];
  function gToH(y, m, d) {
    let yy = y, mm = m;
    if (mm < 3) { yy -= 1; mm += 12; }
    let a = Math.floor(yy / 100), b = 2 - a + Math.floor(a / 4);
    if (yy < 1583) b = 0;
    const jd = Math.floor(365.25 * (yy + 4716)) + Math.floor(30.6001 * (mm + 1)) + d + b - 1524;
    const iyear = 10631 / 30, epochastro = 1948084, shift1 = 8.01 / 60;
    let z = jd - epochastro;
    const cyc = Math.floor(z / 10631);
    z -= 10631 * cyc;
    const j = Math.floor((z - shift1) / iyear);
    const iy = 30 * cyc + j;
    z -= Math.floor(j * iyear + shift1);
    let im = Math.floor((z + 28.5001) / 29.5);
    if (im === 13) im = 12;
    const id = Math.floor(z - Math.floor(29.5001 * im - 29) + 1);
    return { day: String(id), month: { number: im, en: HIJRI_MONTHS[im - 1] }, year: String(iy) };
  }

  return { month, dayTimes, METHODS, gToH, tzOffsetHours };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PrayerCalc;
