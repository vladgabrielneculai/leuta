/** „10.080,00” — formatul românesc folosit și în aplicație. */
export const money = (v: number, decimals = 2) =>
  v.toLocaleString("ro-RO", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: "always" } as Intl.NumberFormatOptions);

