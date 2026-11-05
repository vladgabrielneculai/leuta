/**
 * Carduri de credit, descoperit de cont și cumpărături în rate. Fără bază de date, ca să poată fi testat.
 *
 * - Card / descoperit: plata minimă = max(minimul în lei, procentul din sold), dar nu mai mult decât soldul;
 *   dobânda pe lună = sold × dobânda anuală / 12.
 * - Rate (BNPL): o programare cu lună de sfârșit; ce mai ai de plătit = ratele rămase × suma ratei.
 */

export type CardDebt = {
  id: number;
  name: string;
  kind: "card" | "overdraft";
  credit_limit: number;
  balance: number;
  rate: number;
  min_payment_pct: number;
  min_payment_amount: number;
  due_day: number | null;
  active: number;
};

export function minPayment(d: Pick<CardDebt, "balance" | "min_payment_pct" | "min_payment_amount">) {
  if (d.balance <= 0) return 0;
  const pct = (d.balance * d.min_payment_pct) / 100;
  return Math.round(Math.min(d.balance, Math.max(d.min_payment_amount, pct)) * 100) / 100;
}

export const monthlyInterest = (d: Pick<CardDebt, "balance" | "rate">) => Math.round(((d.balance * d.rate) / 1200) * 100) / 100;

/** Cât din limită e folosit, în % (0 dacă nu are limită). */
export const utilization = (d: Pick<CardDebt, "balance" | "credit_limit">) => (d.credit_limit > 0 ? (d.balance / d.credit_limit) * 100 : 0);

export type Installments = { name: string; amount: number; start_month: string; end_month: string; next: string | null };

/** Câte rate mai sunt (inclusiv cea următoare) și cât mai ai de plătit. */
export function installmentsLeft(p: Installments): { count: number; left: number } {
  if (!p.next) return { count: 0, left: 0 };
  const [ny, nm] = p.next.slice(0, 7).split("-").map(Number);
  const [ey, em] = p.end_month.split("-").map(Number);
  const count = Math.max(0, (ey - ny) * 12 + (em - nm) + 1);
  return { count, left: Math.round(count * p.amount * 100) / 100 };
}

/** Rata lunară și ultima lună pentru o cumpărătură de `total` lei în `n` rate, începând cu `start` (YYYY-MM). */
export function planInstallments(total: number, n: number, start: string): { amount: number; end_month: string } {
  if (!(total > 0)) throw new Error("Scrie prețul.");
  if (!Number.isInteger(n) || n < 2 || n > 60) throw new Error("Numărul de rate e între 2 și 60.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(start)) throw new Error("Alege luna primei rate.");
  const [y, m] = start.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n - 1, 1));
  return { amount: Math.round((total / n) * 100) / 100, end_month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}` };
}
