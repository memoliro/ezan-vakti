// Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert");
const PrayerCalc = require("../prayer-calc.js");

const MONTREAL = { lat: 45.5017, lon: -73.5673, tz: "America/Toronto" };
const ISTANBUL = { lat: 41.0082, lon: 28.9784, tz: "Europe/Istanbul" };
const hm = s => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

test("fallback month has the same shape app.js reads from Aladhan", () => {
  const m = PrayerCalc.month({ ...MONTREAL, year: 2026, month: 10, method: 2 });
  assert.strictEqual(m.days.length, 31);
  const d = m.days[9]; // 10 Oct 2026, a Saturday
  assert.strictEqual(d.date.gregorian.date, "10-10-2026");
  assert.strictEqual(d.date.gregorian.weekday.en, "Saturday");
  assert.strictEqual(d.date.gregorian.month.number, 10);
  assert.strictEqual(d.date.gregorian.month.en, "October");
  assert.ok(+d.date.hijri.month.number >= 1 && +d.date.hijri.month.number <= 12);
  for (const k of ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"]) assert.match(d.timings[k], /^\d\d:\d\d$/, k);
});

test("times are ordered through the day", () => {
  const t = PrayerCalc.month({ ...MONTREAL, year: 2026, month: 10, method: 2 }).days[9].timings;
  const order = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"].map(k => hm(t[k]));
  assert.deepStrictEqual(order, [...order].sort((a, b) => a - b));
});

test("uses the selected place's timezone, not the device's", () => {
  const tzA = PrayerCalc.tzOffsetHours("Europe/Istanbul", 2026, 10, 10);
  const tzB = PrayerCalc.tzOffsetHours("America/Toronto", 2026, 10, 10);
  assert.strictEqual(tzA, 3);
  assert.strictEqual(tzB, -4);
  // Istanbul Dhuhr should be ~13:00 local, regardless of where this test runs
  const t = PrayerCalc.month({ ...ISTANBUL, year: 2026, month: 10, method: 13 }).days[9].timings;
  assert.ok(Math.abs(hm(t.Dhuhr) - hm("13:00")) < 30, "Istanbul Dhuhr " + t.Dhuhr);
});

test("DST change inside a month is applied per day (Toronto, 1 Nov 2026)", () => {
  assert.strictEqual(PrayerCalc.tzOffsetHours("America/Toronto", 2026, 10, 31), -4);
  assert.strictEqual(PrayerCalc.tzOffsetHours("America/Toronto", 2026, 11, 1), -5);
  const days = PrayerCalc.month({ ...MONTREAL, year: 2026, month: 11, method: 2, tz: MONTREAL.tz }).days;
  // Dhuhr moves ~1 minute/day; an hour jump between 31 Oct and 1 Nov would mean a bug.
  const oct = PrayerCalc.month({ ...MONTREAL, year: 2026, month: 10, method: 2, tz: MONTREAL.tz }).days[30].timings.Dhuhr;
  const nov = days[0].timings.Dhuhr;
  assert.ok(Math.abs(hm(oct) - 60 - hm(nov)) < 5, `${oct} -> ${nov}`);
});

test("Asr is later for Hanafi", () => {
  const std = PrayerCalc.month({ ...MONTREAL, year: 2026, month: 6, method: 2, school: 0 }).days[0].timings.Asr;
  const han = PrayerCalc.month({ ...MONTREAL, year: 2026, month: 6, method: 2, school: 1 }).days[0].timings.Asr;
  assert.ok(hm(han) > hm(std));
});
