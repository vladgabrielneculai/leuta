/**
 * Teste pentru programări și detectarea abonamentelor (fără server și fără bază de date).
 *
 *   npm run test:unit
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectSubscriptions, dueDate, duesBetween, dueMonths, nextDue, paymentKey, priceIncrease, today,
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

// ---------- Beta: trimestrial, bani de pus deoparte, mementouri ----------

test("trimestrial: din 3 în 3 luni pornind de la luna din ciclu", async () => {
  const { dueDate: due } = await import("../src/lib/scheduled.ts");
  const q = { ...base, frequency: "quarterly", day: 15, month_of_year: 3 };
  assert.deepEqual(["2026-03", "2026-04", "2026-06", "2026-09", "2026-12", "2027-01"].map((m) => due(q, m)), ["2026-03-15", null, "2026-06-15", "2026-09-15", "2026-12-15", null]);
  // luna din ciclu poate fi și după luna curentă (11 → februarie, mai, august, noiembrie)
  assert.equal(due({ ...q, month_of_year: 11 }, "2026-02"), "2026-02-15");
});

test("costul lunar: anual / 12, trimestrial / 3", async () => {
  const { monthlyCost } = await import("../src/lib/scheduled.ts");
  assert.equal(monthlyCost({ amount: 1200, frequency: "yearly" }), 100);
  assert.equal(monthlyCost({ amount: 300, frequency: "quarterly" }), 100);
  assert.equal(monthlyCost({ amount: 55, frequency: "monthly" }), 55);
});

test("de pus deoparte: suma lunară și cât ar trebui strâns până azi", async () => {
  const { setAside } = await import("../src/lib/scheduled.ts");
  // RCA 1200 lei pe 15 martie; azi 11 octombrie 2026 → următoarea plată în martie 2027, peste 5 luni
  const rca = { ...base, name: "RCA", amount: 1200, frequency: "yearly", day: 15, month_of_year: 3, start_month: "2026-01" };
  const a = setAside(rca, T);
  assert.equal(a.monthly, 100);
  assert.equal(a.next, "2027-03-15");
  assert.equal(a.shouldHave, 700); // 7 luni din 12 au trecut din ciclu
  assert.equal(setAside(base, T), null); // lunar: nimic de strâns
  assert.equal(setAside({ ...rca, active: 0 }, T), null);
});

test("mementoul vine exact cu remind_days înainte de scadență", async () => {
  const { remindersDue } = await import("../src/lib/scheduled.ts");
  const chirie = { ...base, id: 7, name: "Chirie", day: 14, remind_days: 3 };
  assert.deepEqual(remindersDue([chirie], T).map((r) => [r.schedule.id, r.date, r.days]), [[7, "2026-10-14", 3]]);
  assert.equal(remindersDue([{ ...chirie, remind_days: 2 }], T).length, 0);
  assert.equal(remindersDue([{ ...chirie, remind_days: null }], T).length, 0);
  assert.equal(remindersDue([{ ...chirie, day: 11, remind_days: 0 }], T).length, 1); // în ziua scadenței
});

test("scadențele dintr-o lună de buget care trece peste două luni calendaristice", () => {
  // salariul pe 5, plata pe 4: luna de buget decembrie (4 dec – 4 ian) cuprinde două scadențe
  const s = { ...base, day: 4, start_month: "2026-01" };
  assert.deepEqual(duesBetween(s, "2026-12-04", "2027-01-04"), [
    { month: "2026-12", date: "2026-12-04" },
    { month: "2027-01", date: "2027-01-04" },
  ]);
  assert.deepEqual(duesBetween(s, "2026-11-05", "2026-12-03"), []); // noiembrie: nicio scadență
  assert.deepEqual(duesBetween({ ...s, end_month: "2026-12" }, "2026-12-04", "2027-01-04"), [{ month: "2026-12", date: "2026-12-04" }]);
});
