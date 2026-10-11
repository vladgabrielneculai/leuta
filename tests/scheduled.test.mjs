/**
 * Teste pentru programări și detectarea abonamentelor (fără server și fără bază de date).
 *
 *   npm run test:unit
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectSubscriptions, dueDate, dueMonths, nextDue, paymentKey, priceIncrease, today,
} from "../src/lib/scheduled.ts";

const T = { date: "2026-10-11", month: "2026-10", day: 11 };
const base = {
  id: 1, name: "Netflix", category_id: 4, amount: 55, currency: "RON", frequency: "monthly", day: 3, month_of_year: null,
  start_month: "2026-08", end_month: null, last_month: null, is_subscription: 1, active: 1,
};

test("ziua 31 devine ultima zi a lunilor scurte", () => {
  const s = { ...base, day: 31 };
  assert.equal(dueDate(s, "2026-02"), "2026-02-28");
  assert.equal(dueDate(s, "2028-02"), "2028-02-29");
  assert.equal(dueDate(s, "2026-04"), "2026-04-30");
  assert.equal(dueDate(s, "2026-05"), "2026-05-31");
});

test("lunar: intrările scadente de la început, doar până azi", () => {
  assert.deepEqual(dueMonths(base, T).map((x) => x.date), ["2026-08-03", "2026-09-03", "2026-10-03"]);
  // Pe 20 a lunii, scadența de azi încă n-a venit.
  assert.deepEqual(dueMonths({ ...base, day: 20 }, T).map((x) => x.month), ["2026-08", "2026-09"]);
  // Ce s-a creat deja nu se mai creează (chiar dacă utilizatorul a șters intrarea).
  assert.deepEqual(dueMonths({ ...base, last_month: "2026-09" }, T).map((x) => x.month), ["2026-10"]);
  assert.deepEqual(dueMonths({ ...base, last_month: "2026-10" }, T), []);
  // Oprită sau terminată.
  assert.deepEqual(dueMonths({ ...base, active: 0 }, T), []);
  assert.deepEqual(dueMonths({ ...base, end_month: "2026-08" }, T).map((x) => x.month), ["2026-08"]);
});

test("anual: doar în luna aleasă", () => {
  const rca = { ...base, frequency: "yearly", day: 15, month_of_year: 3, start_month: "2025-01" };
  assert.deepEqual(dueMonths(rca, T).map((x) => x.date), ["2025-03-15", "2026-03-15"]);
  assert.equal(nextDue({ ...rca, last_month: "2026-03" }, T), "2027-03-15");
});

test("următoarea scadență", () => {
  assert.equal(nextDue({ ...base, last_month: "2026-10" }, T), "2026-11-03");
  assert.equal(nextDue({ ...base, day: 11, last_month: "2026-09" }, T), "2026-10-11"); // azi, încă necreată
  assert.equal(nextDue({ ...base, day: 11, last_month: "2026-10" }, T), "2026-11-11");
  assert.equal(nextDue({ ...base, active: 0 }, T), null);
  assert.equal(nextDue({ ...base, last_month: "2026-10", end_month: "2026-10" }, T), null);
});

test("ziua din România", () => {
  // 23:30 UTC pe 31 oct. e deja 1 nov. la București.
  assert.deepEqual(today(new Date("2026-10-31T23:30:00Z")), { date: "2026-11-01", month: "2026-11", day: 1 });
});

const e = (id, description, amount, month, day, extra = {}) => ({
  id, description, amount, currency: "RON", month, date: `${month}-${String(day).padStart(2, "0")}`,
  kind: "fixed", category_id: 4, category: "Abonamente", scheduled_id: null, ...extra,
});

test("detectează abonamentele lunare și scumpirea", () => {
  const entries = [
    e(1, "NETFLIX.COM", 49.99, "2026-07", 3), e(2, "NETFLIX.COM", 49.99, "2026-08", 3),
    e(3, "NETFLIX.COM", 49.99, "2026-09", 3), e(4, "NETFLIX.COM", 55.99, "2026-10", 3),
    // Cumpărături repetate la același magazin, de mai multe ori pe lună: nu e abonament.
    e(5, "KAUFLAND 1234", 200, "2026-08", 2, { kind: "variable", category: "Alimente" }),
    e(6, "KAUFLAND 5678", 180, "2026-08", 20, { kind: "variable", category: "Alimente" }),
    e(7, "KAUFLAND 1234", 210, "2026-09", 2, { kind: "variable", category: "Alimente" }),
    e(8, "KAUFLAND 1234", 190, "2026-10", 2, { kind: "variable", category: "Alimente" }),
    // Factură variabilă: suma diferă prea mult.
    e(9, "ENGIE", 280, "2026-08", 10), e(10, "ENGIE", 160, "2026-09", 10), e(11, "ENGIE", 110, "2026-10", 10),
    // Spotify la categoria „Cumpărături” (variabilă) e recunoscut după nume.
    e(12, "Spotify P0ABC", 25.99, "2026-08", 15, { kind: "variable", category: "Cumpărături" }),
    e(13, "Spotify P0XYZ", 25.99, "2026-09", 15, { kind: "variable", category: "Cumpărături" }),
    e(14, "Spotify P0QRS", 25.99, "2026-10", 15, { kind: "variable", category: "Cumpărături" }),
  ];
  const d = detectSubscriptions(entries, T);
  assert.deepEqual(d.map((x) => x.key), ["netflix com", "spotify"]);
  const nf = d[0];
  assert.equal(nf.frequency, "monthly");
  assert.equal(nf.amount, 55.99);
  assert.equal(nf.previous, 49.99);
  assert.equal(nf.day, 3);
  assert.equal(nf.next, "2026-11-03");
  assert.equal(priceIncrease(nf.previous, nf.amount), 6);
  assert.equal(d[1].next, "2026-11-15");
  // Ignorate sau deja programate: nu mai apar.
  assert.deepEqual(detectSubscriptions(entries, T, ["netflix com"]).map((x) => x.key), ["spotify"]);
  const linked = entries.map((x) => (x.description.startsWith("Spotify") ? { ...x, scheduled_id: 9 } : x));
  assert.deepEqual(detectSubscriptions(linked, T).map((x) => x.key), ["netflix com"]);
});

test("detectează abonamentele anuale", () => {
  const entries = [e(1, "Asigurare RCA Groupama", 1180, "2025-03", 15), e(2, "Asigurare RCA Groupama", 1240, "2026-03", 14)];
  const [rca] = detectSubscriptions(entries, T);
  assert.equal(rca.frequency, "yearly");
  assert.equal(rca.month_of_year, 3);
  assert.equal(rca.next, "2027-03-15");
});

test("nu detectează ce s-a oprit sau a apărut de prea puține ori", () => {
  const stopped = [e(1, "HBO MAX", 30, "2026-01", 5), e(2, "HBO MAX", 30, "2026-02", 5), e(3, "HBO MAX", 30, "2026-03", 5)];
  assert.deepEqual(detectSubscriptions(stopped, T), []);
  const twice = [e(1, "HBO MAX", 30, "2026-09", 5), e(2, "HBO MAX", 30, "2026-10", 5)];
  assert.deepEqual(detectSubscriptions(twice, T), []);
});

test("cheia plății ignoră cifrele și semnele", () => {
  assert.equal(paymentKey("NETFLIX.COM 0123"), "netflix com");
  assert.equal(paymentKey("Spotify P0ABC123"), "spotify");
  assert.equal(priceIncrease(55, 55.5), null);
});
