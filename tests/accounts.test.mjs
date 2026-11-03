/**
 * Teste pentru soldurile conturilor și transferuri (fără server și fără bază de date).
 *
 *   npm run test:unit
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { balances, checkTransfer, convert, totalRon } from "../src/lib/accounts.ts";

const rate = () => 5;
const cont = { id: 1, name: "ING", kind: "current", currency: "RON", opening_balance: 1000, opening_date: "2026-11-01", archived: 0 };
const cash = { id: 2, name: "Numerar", kind: "cash", currency: "RON", opening_balance: 0, opening_date: "2026-11-01", archived: 0 };
const euro = { id: 3, name: "Revolut €", kind: "card", currency: "EUR", opening_balance: 100, opening_date: "2026-11-01", archived: 0 };
const e = (o) => ({ account_id: 1, kind: "variable", amount: 0, currency: "RON", month: "2026-11", day: "2026-11-05", ...o });

test("venitul se adună, cheltuiala și economiile se scad, returul adaugă înapoi", () => {
  const [a] = balances([cont], [e({ kind: "income", amount: 5000 }), e({ amount: 300 }), e({ kind: "saving", amount: 700 }), e({ amount: -50 })], [], rate);
  assert.equal(a.balance, 1000 + 5000 - 300 - 700 + 50);
  assert.equal(a.entries, 4);
});

test("intrările dinainte de data de pornire și cele de pe alt cont nu contează", () => {
  const [a] = balances([cont], [e({ amount: 200, day: "2026-10-31" }), e({ amount: 200, account_id: 2 }), e({ amount: 100, day: null, month: "2026-10" })], [], rate);
  assert.equal(a.balance, 1000);
  assert.equal(a.entries, 0);
});

test("transferul mută bani între conturi fără să schimbe totalul", () => {
  const t = { id: 1, from_account_id: 1, to_account_id: 2, amount: 400, to_amount: null, date: "2026-11-03", note: "bancomat" };
  const list = balances([cont, cash], [], [t], rate);
  assert.equal(list[0].balance, 600);
  assert.equal(list[1].balance, 400);
  assert.equal(totalRon(list, "2026-11", rate), 1000);
});

test("schimb valutar: suma primită e cea trecută, în moneda contului", () => {
  const t = { id: 2, from_account_id: 1, to_account_id: 3, amount: 510, to_amount: 100, date: "2026-11-03", note: "" };
  const [ron, , eurAcc] = balances([cont, cash, euro], [], [t], rate);
  assert.equal(ron.balance, 490);
  assert.equal(eurAcc.balance, 200);
  // totalul în lei: 490 + 200 € × 5
  assert.equal(totalRon([ron, eurAcc], "2026-11", rate), 1490);
});

test("o cheltuială în euro pe un cont în lei se convertește la cursul lunii", () => {
  const [a] = balances([cont], [e({ amount: 20, currency: "EUR" })], [], rate);
  assert.equal(a.balance, 900);
  assert.equal(convert(10, "RON", "EUR", "2026-11", rate), 2);
});

test("conturile arhivate nu intră în total", () => {
  const list = balances([cont, { ...cash, opening_balance: 300, archived: 1 }], [], [], rate);
  assert.equal(totalRon(list, "2026-11", rate), 1000);
});

test("transferul greșit e refuzat cu mesaj", () => {
  assert.throws(() => checkTransfer({ from_account_id: 1, to_account_id: 1, amount: 10 }), /diferite/);
  assert.throws(() => checkTransfer({ from_account_id: 1, to_account_id: 2, amount: 0 }), /mai mare/);
  assert.throws(() => checkTransfer({ from_account_id: "x", to_account_id: 2, amount: 5 }), /conturile/);
  assert.deepEqual(checkTransfer({ from_account_id: "1", to_account_id: "2", amount: "5", to_amount: "" }), { from_account_id: 1, to_account_id: 2, amount: 5, to_amount: null });
});
