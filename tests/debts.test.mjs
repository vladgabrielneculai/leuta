/**
 * Teste pentru carduri de credit, descoperit și cumpărături în rate (fără server și fără bază de date).
 *
 *   npm run test:unit
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installmentsLeft, minPayment, monthlyInterest, planInstallments, utilization } from "../src/lib/debts.ts";

test("plata minimă: procentul din sold, dar cel puțin minimul în lei și cel mult soldul", () => {
  assert.equal(minPayment({ balance: 4000, min_payment_pct: 5, min_payment_amount: 50 }), 200);
  assert.equal(minPayment({ balance: 600, min_payment_pct: 5, min_payment_amount: 50 }), 50);
  assert.equal(minPayment({ balance: 30, min_payment_pct: 5, min_payment_amount: 50 }), 30);
  assert.equal(minPayment({ balance: 0, min_payment_pct: 5, min_payment_amount: 50 }), 0);
});

test("dobânda pe lună și limita folosită", () => {
  assert.equal(monthlyInterest({ balance: 3000, rate: 24 }), 60);
  assert.equal(utilization({ balance: 4500, credit_limit: 5000 }), 90);
  assert.equal(utilization({ balance: 100, credit_limit: 0 }), 0);
});

test("rate: suma ratei și ultima lună", () => {
  assert.deepEqual(planInstallments(1200, 6, "2026-11"), { amount: 200, end_month: "2027-04" });
  assert.equal(planInstallments(1000, 3, "2026-01").amount, 333.33);
  assert.throws(() => planInstallments(1000, 1, "2026-01"), /2 și 60/);
  assert.throws(() => planInstallments(0, 6, "2026-01"), /prețul/);
});

test("rate rămase: de la următoarea până la ultima, inclusiv", () => {
  assert.deepEqual(installmentsLeft({ name: "Telefon", amount: 200, start_month: "2026-09", end_month: "2027-02", next: "2026-11-15" }), { count: 4, left: 800 });
  assert.deepEqual(installmentsLeft({ name: "Gata", amount: 200, start_month: "2026-01", end_month: "2026-06", next: null }), { count: 0, left: 0 });
});
