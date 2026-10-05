// Utilitare folosite atât pe server cât și în browser.

export type Currency = "RON" | "EUR";
export type Kind = "income" | "fixed" | "variable" | "saving";
export type Bucket = "needs" | "wants" | "savings";
export type Strategy = "term" | "installment";
export type ScheduleType = "annuity" | "declining";

export const KIND_LABEL: Record<Kind, string> = {
  income: "Venituri",
  fixed: "Costuri fixe",
  variable: "Cheltuieli variabile",
  saving: "Economii și investiții",
};

export const BUCKET_LABEL: Record<Bucket, string> = {
  needs: "Nevoi",
  wants: "Dorințe",
  savings: "Economii",
};

const MONTHS_RO = [
  "ianuarie", "februarie", "martie", "aprilie", "mai", "iunie",
  "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie",
];
const MONTHS_SHORT = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"];

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function monthDiff(from: string, to: string): number {
  const [y1, m1] = from.split("-").map(Number);
  const [y2, m2] = to.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

export function monthLabel(month: string, short = false): string {
  const [y, m] = month.split("-").map(Number);
  if (short) return `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}`;
  return `${MONTHS_RO[m - 1]} ${y}`;
}

export function lastMonths(end: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(end, i - count + 1));
}

// Sumele se afișează mereu cu 2 zecimale (bani), ca să se vadă exact, la ban.
const ronFmt2 = new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Rotunjire la ban (2 zecimale), pentru datele graficelor și valorile din formulare. */
export const r2 = (n: number) => Math.round(n * 100) / 100;

/** „1.234,56 lei”. Parametrul `decimals` e păstrat pentru compatibilitate: zecimalele apar oricum. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function lei(n: number, decimals = true): string {
  return `${ronFmt2.format(r2(n))} lei`;
}

/** Sumă de bani fără monedă: „1.234,56”. */
export function money(n: number): string {
  return ronFmt2.format(r2(n));
}

export function eur(n: number): string {
  return `${ronFmt2.format(r2(n))} €`;
}

export function pct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "–";
  return `${n.toLocaleString("ro-RO", { maximumFractionDigits: digits, minimumFractionDigits: 0 })}%`;
}

/** Durata în ani și luni: 360 → „30 ani”, 340 → „28 ani 4 luni”. */
export function termLabel(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const ys = y === 1 ? "1 an" : `${y} ani`;
  if (!m) return ys;
  const ms = m === 1 ? "1 lună" : `${m} luni`;
  return y ? `${ys} ${ms}` : ms;
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
