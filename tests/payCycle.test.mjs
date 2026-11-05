/**
 * Teste pentru luna de buget legată de ziua salariului (fără server și fără bază de date).
 *
 *   npm run test:unit
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CALENDAR_CYCLE, budgetMonthOf, budgetMonthProgress, budgetMonthRange, currentBudgetMonth, defaultDayIn, nextPayday, parseSortedCycle,
  payCycleFrom, paydayDate, rangeLabel, resortMoves, sameCycle,
} from "../src/lib/payCycle.ts";

const C5 = { enabled: true, payday: 5, weekend: "split" };

test("ziua salariului în timpul săptămânii rămâne pe loc", () => {
  assert.equal(paydayDate("2026-11", 5), "2026-11-05"); // joi
});

test("sâmbătă → vinerea dinainte, duminică → lunea de după (regula implicită)", () => {
  assert.equal(paydayDate("2026-12", 5), "2026-12-04"); // 5 dec 2026 e sâmbătă
  assert.equal(paydayDate("2026-04", 5), "2026-04-06"); // 5 apr 2026 e duminică
});

test("regulile „mereu vineri” și „mereu luni”", () => {
  assert.equal(paydayDate("2026-12", 5, "after"), "2026-12-07");
  assert.equal(paydayDate("2026-04", 5, "before"), "2026-04-03");
});

test("ziua 31 devine ultima zi a lunilor scurte, apoi se aplică weekendul", () => {
  assert.equal(paydayDate("2026-02", 31), "2026-02-27"); // 28 feb 2026 e sâmbătă → vineri 27
  assert.equal(paydayDate("2026-04", 31), "2026-04-30");
});

test("salariul poate trece în luna dinainte (pe 1, sâmbătă)", () => {
  assert.equal(paydayDate("2026-08", 1), "2026-07-31"); // 1 aug 2026 e sâmbătă
  assert.equal(budgetMonthOf("2026-07-31", { ...C5, payday: 1 }), "2026-08");
});

test("cheltuielile dinainte de salariu intră în luna dinainte", () => {
  assert.equal(budgetMonthOf("2026-11-03", C5), "2026-10");
  assert.equal(budgetMonthOf("2026-11-04", C5), "2026-10");
  assert.equal(budgetMonthOf("2026-11-05", C5), "2026-11");
  assert.equal(budgetMonthOf("2026-11-30", C5), "2026-11");
});

test("salariul venit vineri (5 = sâmbătă) deschide deja luna nouă", () => {
  assert.equal(budgetMonthOf("2026-12-03", C5), "2026-11");
  assert.equal(budgetMonthOf("2026-12-04", C5), "2026-12");
});

test("trecerea dintre ani", () => {
  assert.equal(budgetMonthOf("2027-01-02", C5), "2026-12");
  assert.equal(budgetMonthOf("2027-01-05", C5), "2027-01"); // marți
  assert.deepEqual(budgetMonthRange("2026-12", C5), { start: "2026-12-04", end: "2027-01-04" });
});

test("fără opțiune sau fără zi de salariu: luna calendaristică", () => {
  assert.equal(budgetMonthOf("2026-11-03", CALENDAR_CYCLE), "2026-11");
  assert.equal(budgetMonthOf("2026-11-03", { ...C5, enabled: false }), "2026-11");
  assert.equal(budgetMonthOf("2026-11-03", { ...C5, payday: null }), "2026-11");
  assert.deepEqual(budgetMonthRange("2026-02", CALENDAR_CYCLE), { start: "2026-02-01", end: "2026-02-28" });
});

test("intervalul lunii și eticheta", () => {
  assert.deepEqual(budgetMonthRange("2026-11", C5), { start: "2026-11-05", end: "2026-12-03" });
  assert.equal(rangeLabel("2026-11", C5), "5 nov – 3 dec");
});

test("luna curentă și ziua implicită pentru o intrare nouă", () => {
  assert.equal(currentBudgetMonth(C5, "2026-11-03"), "2026-10");
  assert.equal(defaultDayIn("2026-10", C5, "2026-11-03"), "2026-11-03");
  assert.equal(defaultDayIn("2026-09", C5, "2026-11-03"), "2026-10-04"); // ultima zi a lunii de buget trecute
  assert.equal(defaultDayIn("2026-12", C5, "2026-11-03"), "2026-12-04"); // prima zi a lunii viitoare
});

test("următorul salariu ține cont de weekend", () => {
  assert.equal(nextPayday(5, "split", "2026-11-03"), "2026-11-05");
  assert.equal(nextPayday(5, "split", "2026-11-05"), "2026-11-05");
  assert.equal(nextPayday(5, "split", "2026-11-06"), "2026-12-04");
  assert.equal(nextPayday(5, "split", "2026-12-31"), "2027-01-05");
});

test("setările din baza de date", () => {
  assert.deepEqual(payCycleFrom({ budget_from_payday: "1", payday_weekend: "before" }, 10), { enabled: true, payday: 10, weekend: "before" });
  assert.deepEqual(payCycleFrom({}, null), CALENDAR_CYCLE);
  assert.deepEqual(payCycleFrom({ budget_from_payday: "1", payday_weekend: "x" }, 40), { enabled: true, payday: null, weekend: "split" });
  assert.deepEqual(parseSortedCycle(JSON.stringify(C5)), C5);
  assert.deepEqual(parseSortedCycle("{nu e json"), CALENDAR_CYCLE);
  assert.equal(sameCycle(CALENDAR_CYCLE, { ...C5, enabled: false }), true);
  assert.equal(sameCycle(C5, { ...C5, weekend: "after" }), false);
});

const rows = [
  { id: 1, month: "2026-11", date: "2026-11-03", recurring: 0 }, // înainte de salariu → octombrie
  { id: 2, month: "2026-11", date: "2026-11-10", recurring: 0 }, // după salariu, rămâne
  { id: 3, month: "2026-11", date: "2026-11-02", recurring: 1 }, // recurentă („lunar”): rămâne în luna ei
  { id: 4, month: "2026-11", date: "2026-11-01", recurring: 0 }, // din programare, scadentă pe 1: trece în octombrie
  { id: 5, month: "2026-10", date: "2026-11-02", recurring: 0 }, // trecută intenționat în altă lună: rămâne
  { id: 6, month: "2026-12", date: "2026-12-04", recurring: 0 }, // salariul vine vineri 4 dec: rămâne în decembrie
  { id: 7, month: "2026-11", date: null, recurring: 0 }, // fără dată: rămâne
];

test("reorganizarea intrărilor vechi la pornire", () => {
  assert.deepEqual(resortMoves(rows, CALENDAR_CYCLE, C5), [
    { id: 1, from: "2026-11", to: "2026-10" },
    { id: 4, from: "2026-11", to: "2026-10" },
  ]);
});

test("reorganizarea e reversibilă la oprire", () => {
  // Intrarea 5 (2 noiembrie, în octombrie) stă acum exact unde o pune luna de buget, deci revine și ea în noiembrie.
  const after = rows.map((r) => (r.id === 1 || r.id === 4 ? { ...r, month: "2026-10" } : r));
  assert.deepEqual(resortMoves(after, C5, CALENDAR_CYCLE), [
    { id: 1, from: "2026-10", to: "2026-11" },
    { id: 4, from: "2026-10", to: "2026-11" },
    { id: 5, from: "2026-10", to: "2026-11" },
  ]);
});

test("schimbarea zilei de salariu mută doar ce e între zile", () => {
  const after = [{ id: 1, month: "2026-10", date: "2026-11-03", recurring: 0 }, { id: 2, month: "2026-11", date: "2026-11-07", recurring: 0 }];
  assert.deepEqual(resortMoves(after, C5, { ...C5, payday: 10 }), [{ id: 2, from: "2026-11", to: "2026-10" }]);
});

test("progresul în luna de buget, pentru estimarea la final de lună", () => {
  // octombrie de la salariu: 5 oct – 4 nov (31 de zile); pe 3 noiembrie e ziua 30
  assert.deepEqual(budgetMonthProgress("2026-10", C5, "2026-11-03"), { day: 30, length: 31, start: "2026-10-05", end: "2026-11-04" });
  // decembrie: 4 dec (vineri) – 4 ian (33 de zile)
  assert.deepEqual(budgetMonthProgress("2026-12", C5, "2026-12-04"), { day: 1, length: 32, start: "2026-12-04", end: "2027-01-04" });
  // fără ciclu: luna calendaristică
  assert.deepEqual(budgetMonthProgress("2026-11", CALENDAR_CYCLE, "2026-11-10"), { day: 10, length: 30, start: "2026-11-01", end: "2026-11-30" });
});
