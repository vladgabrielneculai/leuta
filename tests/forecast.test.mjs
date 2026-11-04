/**
 * Teste pentru estimarea la sfârșitul lunii (fără server și fără bază de date).
 *
 *   npm run test:unit
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { forecast } from "../src/lib/forecast.ts";

const base = { day: 10, daysInMonth: 30, income: 8000, fixed: 2000, variable: 1000, loans: 1500, saved: 1000, priorVariable: [3000, 3000, 3000], upcoming: [] };

test("variabilele lunii se termină la media lunilor trecute", () => {
  const f = forecast(base);
  assert.equal(f.daysLeft, 20);
  assert.equal(f.variableLeft, 2000); // media 3000 − 1000 cheltuiți deja
  assert.equal(f.dailyPace, 100); // 2000 / 20 zile
  assert.equal(f.endBalance, 8000 - (2000 + 1000 + 1500 + 2000) - 1000); // 500
  assert.equal(f.safeDaily, 125); // 100 + 500 / 20
});

test("plățile și veniturile programate care mai vin intră în estimare", () => {
  const f = forecast({ ...base, upcoming: [{ name: "Chirie", amount: 1200, kind: "expense", date: "2026-11-15" }, { name: "Bonus", amount: 500, kind: "income", date: "2026-11-20" }] });
  assert.equal(f.upcomingExpense, 1200);
  assert.equal(f.upcomingIncome, 500);
  assert.equal(f.endBalance, 500 - 1200 + 500);
});

test("dacă ai trecut deja de medie (ex. ai trecut toată luna), nu se mai adaugă nimic", () => {
  const f = forecast({ ...base, variable: 3500 });
  assert.equal(f.variableLeft, 0);
  assert.equal(f.endBalance, 8000 - (2000 + 3500 + 1500) - 1000);
});

test("fără istoric, ritmul e cel de luna aceasta", () => {
  const f = forecast({ ...base, priorVariable: [] });
  assert.equal(f.dailyPace, 100); // 1000 / 10 zile
  assert.equal(f.variableLeft, 2000);
});

test("ultima zi a lunii: nimic de estimat pentru zilele rămase", () => {
  const f = forecast({ ...base, day: 30 });
  assert.equal(f.daysLeft, 0);
  assert.equal(f.variableLeft, 0);
  assert.equal(f.safeDaily, 0);
});
