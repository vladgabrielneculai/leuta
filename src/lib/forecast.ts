/**
 * Estimarea la sfârșitul lunii (beta): cât îți rămâne pe 31, din ce știm azi.
 * - intrările de până azi (venituri, cheltuieli, economii) și ratele creditelor pe toată luna;
 * - plățile și veniturile programate care mai vin luna aceasta;
 * - cheltuielile variabile: luna se încheie la media ta lunară din ultimele luni cu date (sau la cât ai cheltuit
 *   deja, dacă ai trecut de medie). Fără istoric: ritmul de luna aceasta, prelungit până la final.
 *   Așa nu se numără de două ori cheltuielile trecute dinainte pentru toată luna.
 * Logica e fără bază de date, ca să poată fi testată direct.
 */

export type ForecastInput = {
  day: number; // ziua de azi din lună (1–31)
  daysInMonth: number;
  income: number; // veniturile trecute până azi
  fixed: number;
  variable: number; // cheltuielile variabile de până azi
  loans: number; // ratele (și asigurările) creditelor pe toată luna
  saved: number; // economii și investiții trecute până azi
  /** variabilele lunilor anterioare cu date (cel mult ultimele 3) */
  priorVariable: number[];
  /** ce mai vine luna aceasta din programări: + venit, − plată */
  upcoming: { name: string; amount: number; kind: "income" | "expense"; date: string }[];
};

export type Forecast = {
  endBalance: number; // cât rămâne la final: venituri − cheltuieli − economii
  incomeExpected: number;
  spentExpected: number;
  variableLeft: number; // cheltuieli zilnice estimate pentru zilele rămase
  upcomingIncome: number;
  upcomingExpense: number;
  dailyPace: number; // lei pe zi, folosiți pentru zilele rămase
  daysLeft: number;
  /** cât poți cheltui pe zi, în plus față de ritmul obișnuit, ca să termini luna pe zero */
  safeDaily: number;
};

export function forecast(i: ForecastInput): Forecast {
  const daysLeft = Math.max(0, i.daysInMonth - i.day);
  const prior = i.priorVariable.filter((v) => v > 0).slice(-3);
  const avg = prior.length ? prior.reduce((s, v) => s + v, 0) / prior.length : 0;
  const variableLeft = daysLeft === 0
    ? 0 // ultima zi: luna e ce s-a trecut
    : prior.length
    ? Math.max(0, avg - Math.max(0, i.variable))
    : i.day > 0
      ? (Math.max(0, i.variable) / i.day) * daysLeft
      : 0;
  const dailyPace = daysLeft > 0 ? variableLeft / daysLeft : 0;
  const upcomingIncome = i.upcoming.filter((u) => u.kind === "income").reduce((s, u) => s + u.amount, 0);
  const upcomingExpense = i.upcoming.filter((u) => u.kind === "expense").reduce((s, u) => s + u.amount, 0);
  const incomeExpected = i.income + upcomingIncome;
  const spentExpected = i.fixed + i.variable + i.loans + upcomingExpense + variableLeft;
  const endBalance = incomeExpected - spentExpected - i.saved;
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    endBalance: r(endBalance),
    incomeExpected: r(incomeExpected),
    spentExpected: r(spentExpected),
    variableLeft: r(variableLeft),
    upcomingIncome: r(upcomingIncome),
    upcomingExpense: r(upcomingExpense),
    dailyPace: r(dailyPace),
    daysLeft,
    safeDaily: daysLeft > 0 ? r(dailyPace + endBalance / daysLeft) : 0,
  };
}
