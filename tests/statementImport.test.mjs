/**
 * Teste pentru citirea extraselor de cont (fără server și fără bază de date).
 *
 *   npm run test:unit
 *
 * Fișierele din tests/fixtures sunt inventate, după formatele publice ale exporturilor ING Home'Bank și BCR George.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decodeText, parseAmount, parseCsv, parseDate, parseStatement, applyMapping, merchantFrom,
} from "../src/lib/statementImport.ts";
import { suggestCategory, learnPattern } from "../src/lib/importRules.ts";

const fixture = (name) => parseCsv(decodeText(readFileSync(new URL(`./fixtures/${name}`, import.meta.url))));

test("sume în formatele băncilor", () => {
  assert.equal(parseAmount("1.234,56"), 1234.56);
  assert.equal(parseAmount("1,234.56"), 1234.56);
  assert.equal(parseAmount("-100,00"), -100);
  assert.equal(parseAmount("100,00 RON"), 100);
  assert.equal(parseAmount("(45.10)"), -45.1);
  assert.equal(parseAmount("1.000"), 1000);
  assert.equal(parseAmount("12,5"), 12.5);
  assert.equal(parseAmount("9200"), 9200);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("Sold"), null);
});

test("date în formatele băncilor", () => {
  assert.equal(parseDate("30 septembrie 2013"), "2013-09-30");
  assert.equal(parseDate("1 mai 2026"), "2026-05-01");
  assert.equal(parseDate("05 oct. 2026"), "2026-10-05");
  assert.equal(parseDate("31.10.2026"), "2026-10-31");
  assert.equal(parseDate("31/10/2026 14:22"), "2026-10-31");
  assert.equal(parseDate("2026-10-31"), "2026-10-31");
  assert.equal(parseDate("31.02.2026"), null);
  assert.equal(parseDate("Sold initial"), null);
});

test("ING Home'Bank: tranzacții pe mai multe rânduri, fără soldurile de la final", () => {
  const r = parseStatement(fixture("ing-homebank.csv"));
  assert.equal(r.status, "ok");
  assert.equal(r.bank, "ING");
  const t = r.transactions;
  assert.equal(t.length, 6);
  assert.deepEqual(t.map((x) => x.amount), [-215.4, 9200, -12.5, -12.5, -1000, -120.19]);
  assert.equal(t[0].date, "2026-09-02");
  assert.equal(t[0].description, "KAUFLAND 1234");
  assert.equal(t[1].description, "ACME SOFTWARE SRL");
  assert.equal(t[5].description, "RCS AND RDS SA");
  assert.match(t[5].details, /Referinta: 70979872/);
  // Două cafele identice în aceeași zi rămân două tranzacții, cu amprente diferite.
  assert.notEqual(t[2].hash, t[3].hash);
  // Același fișier citit din nou dă aceleași amprente (importul nu se dublează).
  const again = parseStatement(fixture("ing-homebank.csv"));
  assert.deepEqual(again.transactions.map((x) => x.hash), t.map((x) => x.hash));
});

test("BCR George: UTF-16, separator „;”, sumă cu semn", () => {
  const r = parseStatement(fixture("bcr-george.csv"));
  assert.equal(r.status, "ok");
  assert.equal(r.bank, "BCR");
  const t = r.transactions;
  assert.equal(t.length, 5);
  assert.deepEqual(t.map((x) => x.amount), [-215.4, -89.99, 9200, -310.25, -1250]);
  assert.equal(t[0].description, "MEGA IMAGE 0123");
  assert.equal(t[2].date, "2026-09-05");
  assert.match(t[2].details, /salariu; luna august/);
  assert.equal(t[0].currency, "RON");
});

test("antet necunoscut: cere alegerea coloanelor, apoi folosește alegerea salvată", () => {
  const table = fixture("salt-necunoscut.csv");
  const r = parseStatement(table);
  assert.equal(r.status, "needs-mapping");
  assert.deepEqual(r.headers, ["Ziua", "Info", "Total", "Sold dupa"]);
  const mapping = { header: 0, date: 0, amount: 2, description: [1] };
  const txs = applyMapping(table, mapping);
  assert.deepEqual(txs.map((x) => [x.date, x.amount]), [["2026-09-03", -87.3], ["2026-09-04", 250]]);
  const saved = parseStatement(table, { [r.signature]: mapping });
  assert.equal(saved.status, "ok");
  assert.equal(saved.transactions.length, 2);
});

test("numele comerciantului din textul băncii", () => {
  assert.equal(merchantFrom(["Cumparare POS", "Terminal: OMV 1900 RO BUCURESTI"]), "OMV 1900");
  assert.equal(merchantFrom(["Tranzactie comerciant - Locatie: ORO2050B RO OMV 1900/ BUCURESTI"]), "OMV 1900");
  assert.equal(merchantFrom(["Plata intretinere"]), "Plata intretinere");
});

const CATEGORIES = [
  { id: 1, name: "Alimente", kind: "variable" },
  { id: 2, name: "Salariu", kind: "income" },
  { id: 3, name: "Transport și mașină", kind: "variable" },
  { id: 4, name: "Abonamente", kind: "fixed" },
  { id: 5, name: "Internet și telefon", kind: "fixed" },
  { id: 6, name: "Restaurante și ieșiri", kind: "variable" },
];

test("categorii propuse: regulile utilizatorului au prioritate, apoi cuvintele cunoscute", () => {
  const tx = (details, amount = -10) => ({ details, description: details, amount });
  assert.deepEqual(suggestCategory(tx("Terminal: KAUFLAND 1234 RO BUCURESTI"), [], CATEGORIES), { categoryId: 1, source: "auto" });
  assert.deepEqual(suggestCategory(tx("Plata card NETFLIX.COM"), [], CATEGORIES), { categoryId: 4, source: "auto" });
  assert.deepEqual(suggestCategory(tx("Beneficiar: RCS AND RDS SA"), [], CATEGORIES), { categoryId: 5, source: "auto" });
  assert.deepEqual(suggestCategory(tx("Ordonator: ACME | Detalii: salariu august", 9200), [], CATEGORIES), { categoryId: 2, source: "auto" });
  // O plată nu primește o categorie de venit și invers.
  assert.equal(suggestCategory(tx("salariu", -50), [], CATEGORIES).categoryId, null);
  // Regula proprie bate cuvântul cunoscut („starbucks” ar fi la restaurante).
  const rules = [{ pattern: "starbucks unirii", category_id: 1 }];
  assert.deepEqual(suggestCategory(tx("Terminal: STARBUCKS UNIRII RO BUCURESTI"), rules, CATEGORIES), { categoryId: 1, source: "rule" });
  assert.deepEqual(suggestCategory(tx("Terminal: STARBUCKS AFI RO BUCURESTI"), rules, CATEGORIES), { categoryId: 6, source: "auto" });
  assert.deepEqual(suggestCategory(tx("ceva necunoscut"), [], CATEGORIES), { categoryId: null, source: null });
});

test("tiparul învățat din comerciant ignoră cifrele variabile", () => {
  assert.equal(learnPattern("KAUFLAND 1234"), "kaufland");
  assert.equal(learnPattern("MEGA IMAGE 0123"), "mega image");
  assert.equal(learnPattern("STARBUCKS UNIRII"), "starbucks unirii");
  assert.equal(learnPattern("12"), null);
});
