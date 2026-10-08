/** „10.080,00” — formatul românesc folosit și în aplicație. */
export const money = (v: number, decimals = 2) =>
  v.toLocaleString("ro-RO", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: "always" } as Intl.NumberFormatOptions);

/**
 * Credit cu rate egale (anuități), opțional cu o plată anticipată lunară care scurtează durata.
 * Aceeași metodă ca în aplicație (pagina Credite). Întoarce soldul la finalul fiecărei luni.
 */
export function amortize(principal: number, annualRate: number, months: number, extra = 0) {
  const r = annualRate / 12;
  const rate = (principal * r) / (1 - Math.pow(1 + r, -months));
  const balances: number[] = [principal];
  let bal = principal;
  let interest = 0;
  while (bal > 0.005 && balances.length <= months) {
    const i = bal * r;
    interest += i;
    bal = Math.max(0, bal - (rate - i) - extra);
    balances.push(bal);
  }
  return { rate, interest, months: balances.length - 1, balances };
}
