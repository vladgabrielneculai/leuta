/**
 * Teste pentru căutarea în intrări și exportul CSV (fără server și fără bază de date).
 *
 *   npm run test:unit
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { csvText, filtersSql, likePattern, parseFilters, toCsv, totalsOf } from "../src/lib/entrySearch.ts";

const qs = (s) => new URLSearchParams(s);

test("filtrele goale nu pun nicio condiție", () => {
  assert.deepEqual(filtersSql(parseFilters(qs(""))), { where: "", params: [] });
});

test("toate filtrele devin parametri, în ordinea semnelor ?", () => {
  const f = parseFilters(qs("q=lidl&kind=variable&category_id=7&tag_id=3&from=2026-01&to=2026-06&min=10&max=500&refunds=1"));
  const { where, params } = filtersSql(f);
  assert.equal((where.match(/\?/g) ?? []).length, params.length);
  assert.deepEqual(params, ["%lidl%", "%lidl%", "variable", 7, 7, 3, "2026-01", "2026-06", 10, 500]);
  assert.match(where, /e\.amount < 0/);
});

test("perioada și sumele inversate se îndreaptă singure", () => {
  const f = parseFilters(qs("from=2026-09&to=2026-02&min=900&max=100"));
  assert.equal(f.from, "2026-02");
  assert.equal(f.to, "2026-09");
  assert.equal(f.min, 100);
  assert.equal(f.max, 900);
});

test("valorile greșite sunt refuzate cu mesaj", () => {
  assert.throws(() => parseFilters(qs("kind=drop")), /Tip/);
  assert.throws(() => parseFilters(qs("from=2026-13")), /AAAA-LL/);
  assert.throws(() => parseFilters(qs("category_id=1;drop")), /Categorie/);
  assert.throws(() => parseFilters(qs("min=-5")), /pozitiv/);
});

test("%, _ și \\ din textul căutat se potrivesc literal", () => {
  assert.equal(likePattern("50%_a\\b"), "%50\\%\\_a\\\\b%");
});

test("CSV: separator ;, virgulă zecimală, BOM și protecție la formule", () => {
  const csv = toCsv([
    { id: 1, month: "2026-10", day: "2026-10-03", kind: "variable", category_id: 1, goal_id: null, investment_id: null, category: "Mâncare", description: 'Lidl; "promo"', amount: 45.5, currency: "RON", recurring: 0, created_at: null, ron: 45.5 },
    { id: 2, month: "2026-10", day: null, kind: "variable", category_id: 1, goal_id: null, investment_id: null, category: "Mâncare", description: "=HYPERLINK(1)", amount: -20, currency: "EUR", recurring: 1, created_at: null, tags: "vacanță, cadou", ron: -99.5 },
  ]);
  assert.ok(csv.startsWith("﻿Data;Luna;Tip"));
  const lines = csv.trim().split("\r\n");
  assert.equal(lines[1], '2026-10-03;2026-10;Cheltuială;Mâncare;"Lidl; ""promo""";45,50;RON;45,50;nu;');
  assert.equal(lines[2], ";2026-10;Cheltuială;Mâncare;'=HYPERLINK(1);-20,00;EUR;-99,50;da;vacanță, cadou");
  assert.equal(csvText("+40 lei"), "'+40 lei");
});

test("totalurile scad retururile din cheltuieli și le arată separat", () => {
  const t = totalsOf([
    { kind: "variable", ron: 100 },
    { kind: "variable", ron: -30 },
    { kind: "income", ron: 5000 },
  ]);
  assert.equal(t.variable, 70);
  assert.equal(t.refunds, 30);
  assert.equal(t.income, 5000);
  assert.equal(t.count, 3);
});

test("etichetele: fără #, fără dubluri, cel mult 10", async () => {
  const { cleanTagNames } = await import("../src/lib/entrySearch.ts");
  assert.deepEqual(cleanTagNames(["#Vacanță", "vacanță", "  cadou  ", ""]), ["Vacanță", "cadou"]);
  assert.throws(() => cleanTagNames("x"), /listă/);
  assert.throws(() => cleanTagNames(Array.from({ length: 11 }, (_, i) => `t${i}`)), /10/);
});

test("plata împărțită: suma părților trebuie să fie totalul", async () => {
  const { checkSplit } = await import("../src/lib/entrySearch.ts");
  assert.deepEqual(checkSplit(280, [{ category_id: 1, amount: 200 }, { category_id: 2, amount: "80" }]).map((p) => p.amount), [200, 80]);
  assert.throws(() => checkSplit(280, [{ category_id: 1, amount: 200 }, { category_id: 2, amount: 70 }]), /suma totală/);
  assert.throws(() => checkSplit(100, [{ category_id: 1, amount: 100 }]), /două/);
  assert.throws(() => checkSplit(100, [{ category_id: 1, amount: 50 }, { category_id: 1, amount: 50 }]), /singură dată/);
  // zecimalele nu strică egalitatea (0,1 + 0,2)
  assert.equal(checkSplit(0.3, [{ category_id: 1, amount: 0.1 }, { category_id: 2, amount: 0.2 }]).length, 2);
});
