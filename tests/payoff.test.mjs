/**
 * Teste pentru strategiile de rambursare (fără server și fără bază de date).
 *
 *   npm run test:unit
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareStrategies, MAX_MONTHS, payoff } from "../src/lib/payoff.ts";

const card = { id: 1, name: "Card", balance: 3000, rate: 24, payment: 300 };
const auto = { id: 2, name: "Auto", balance: 20000, rate: 9, payment: 650 };
const nevoi = { id: 3, name: "Nevoi personale", balance: 8000, rate: 14, payment: 400 };

test("o singură datorie fără dobândă se închide în sold / rată luni", () => {
  const r = payoff([{ id: 1, name: "BNPL", balance: 1200, rate: 0, payment: 200 }], 0, "minimum");
  assert.equal(r.months, 6);
  assert.equal(r.totalInterest, 0);
  assert.deepEqual(r.order.map((o) => o.month), [6]);
  assert.equal(r.stuck, false);
});

test("suma în plus scurtează perioada și scade dobânda", () => {
  const base = payoff([nevoi], 0, "minimum");
  const fast = payoff([nevoi], 200, "avalanche");
  assert.ok(fast.months < base.months);
  assert.ok(fast.totalInterest < base.totalInterest);
});

test("avalanșa plătește cel mult la fel de multă dobândă ca bulgărele", () => {
  const r = compareStrategies([auto, card, nevoi], 300);
  assert.ok(r.avalanche.totalInterest <= r.snowball.totalInterest + 0.01);
  assert.ok(r.snowball.totalInterest < r.minimum.totalInterest);
});

test("bulgărele închide întâi cea mai mică datorie, avalanșa pe cea mai scumpă", () => {
  const small = { id: 10, name: "Mică, ieftină", balance: 1000, rate: 5, payment: 100 };
  const pricey = { id: 11, name: "Mare, scumpă", balance: 5000, rate: 30, payment: 200 };
  assert.equal(payoff([pricey, small], 500, "snowball").order[0].id, 10);
  // la avalanșă suma în plus merge la cea scumpă, deci cea mică se închide mai târziu decât la bulgăre
  const av = payoff([pricey, small], 500, "avalanche");
  const sb = payoff([pricey, small], 500, "snowball");
  assert.ok(av.order.find((o) => o.id === 10).month > sb.order.find((o) => o.id === 10).month);
});

test("rata care nu acoperă dobânda e semnalată, fără buclă infinită", () => {
  const r = payoff([{ id: 1, name: "Prea mică", balance: 10000, rate: 36, payment: 100 }], 0, "minimum");
  assert.equal(r.stuck, true);
  assert.ok(r.totalInterest > 0);
  assert.equal(r.order.length, 0);
  assert.ok(MAX_MONTHS >= 600);
});

test("datoriile deja închise sunt ignorate", () => {
  const r = payoff([{ ...card, balance: 0 }], 100, "snowball");
  assert.equal(r.months, 0);
  assert.deepEqual(r.order, []);
});
