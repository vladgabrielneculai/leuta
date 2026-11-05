/**
 * Ordinea în care merită rambursate datoriile: „bulgărele de zăpadă” (cea mai mică datorie întâi)
 * față de „avalanșă” (cea mai scumpă dobândă întâi) și față de plata doar a ratelor.
 *
 * Model simplificat, lună de lună, la rata dobânzii de azi:
 * - fiecare datorie primește rata ei lunară (principal + dobândă);
 * - suma în plus pe lună merge la datoria aleasă de strategie; când o datorie se închide, rata ei se adaugă
 *   la suma în plus (de aici „bulgărele”);
 * - nu ține cont de schimbarea dobânzii variabile, de comisioanele de rambursare anticipată sau de asigurări.
 */

export type Debt = {
  id: number;
  name: string;
  balance: number; // sold rămas, lei
  rate: number; // dobânda anuală, %
  payment: number; // rata lunară (principal + dobândă), lei
};

export type PayoffStrategy = "minimum" | "snowball" | "avalanche";

export type PayoffResult = {
  strategy: PayoffStrategy;
  /** luni până la ultima datorie închisă */
  months: number;
  totalInterest: number;
  /** ordinea închiderii, cu luna (1 = luna viitoare) */
  order: { id: number; name: string; month: number }[];
  /** cel puțin o datorie nu se închide în MAX_MONTHS (rata nu acoperă dobânda) */
  stuck: boolean;
};

export const MAX_MONTHS = 600;
const EPS = 0.005;

/** Datoria pe care strategia o atacă prima (dintre cele încă deschise). */
function target(open: { d: Debt; bal: number }[], strategy: PayoffStrategy) {
  const sorted = [...open].sort((a, b) =>
    strategy === "avalanche" ? b.d.rate - a.d.rate || a.bal - b.bal : a.bal - b.bal || b.d.rate - a.d.rate,
  );
  return sorted[0];
}

export function payoff(debts: Debt[], extra: number, strategy: PayoffStrategy): PayoffResult {
  const state = debts.filter((d) => d.balance > EPS).map((d) => ({ d, bal: d.balance }));
  const order: PayoffResult["order"] = [];
  const freed = { amount: 0 }; // ratele datoriilor închise, mutate spre celelalte (nu la „minimum”)
  let totalInterest = 0;
  let month = 0;
  const bonus = strategy === "minimum" ? 0 : Math.max(0, extra);

  while (state.some((s) => s.bal > EPS) && month < MAX_MONTHS) {
    month += 1;
    let pool = bonus + (strategy === "minimum" ? 0 : freed.amount);
    for (const s of state) {
      if (s.bal <= EPS) continue;
      const interest = (s.bal * s.d.rate) / 1200;
      totalInterest += interest;
      s.bal += interest;
      const pay = Math.min(s.d.payment, s.bal);
      s.bal -= pay;
      // Restul ratei din luna în care datoria se închide merge tot spre celelalte.
      if (strategy !== "minimum") pool += s.d.payment - pay;
    }
    // Suma în plus: la ținta strategiei; dacă o închide, restul trece la următoarea.
    while (pool > EPS) {
      const open = state.filter((s) => s.bal > EPS);
      if (!open.length) break;
      const t = target(open, strategy);
      const pay = Math.min(pool, t.bal);
      t.bal -= pay;
      pool -= pay;
    }
    for (const s of state) {
      if (s.bal <= EPS && !order.some((o) => o.id === s.d.id)) {
        s.bal = 0;
        order.push({ id: s.d.id, name: s.d.name, month });
        freed.amount += s.d.payment;
      }
    }
  }

  return {
    strategy,
    months: order.length ? Math.max(...order.map((o) => o.month)) : 0,
    totalInterest: Math.round(totalInterest * 100) / 100,
    order,
    stuck: state.some((s) => s.bal > EPS),
  };
}

/** Cele trei variante, pentru comparație. */
export function compareStrategies(debts: Debt[], extra: number) {
  return {
    minimum: payoff(debts, 0, "minimum"),
    snowball: payoff(debts, extra, "snowball"),
    avalanche: payoff(debts, extra, "avalanche"),
  };
}
