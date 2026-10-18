// Vacanțe: tipuri, categorii, monede și calculele comune paginilor (fără cod de server).
// Sumele rămân în moneda în care au fost plătite; leii sunt doar o informație la final.

import { money } from "./util";

export type Trip = {
  id: number;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  currency: string;
  budget: number;
  notes: string;
};

export type TripFund = { id: number; trip_id: number; label: string; amount: number; currency: string; rate_ron: number | null };

export type TripExpense = {
  id: number;
  trip_id: number;
  date: string;
  category: string;
  description: string;
  amount: number;
  currency: string;
};

/** O vacanță din listă: banii avuți și cheltuiți, adunați pe monede. */
export type TripListItem = Trip & { funds: Record<string, number>; spent: Record<string, number> };

export type RateInfo = { rate: number; date: string | null; estimated: boolean };

export type TripDetail = {
  trip: Trip;
  funds: TripFund[];
  expenses: TripExpense[];
  /** Cursul BNR al fiecărei monede folosite; null = moneda nu e cotată de BNR. */
  rates: Record<string, RateInfo | null>;
};

export const TRIP_CATEGORIES = [
  { key: "cazare", label: "Cazare", icon: "🛏️", color: "var(--c-mov)" },
  { key: "transport", label: "Transport", icon: "🚗", color: "var(--c-albastru)" },
  { key: "mancare", label: "Mâncare", icon: "🍽️", color: "var(--c-rosu)" },
  { key: "activitati", label: "Activități", icon: "🎟️", color: "var(--c-leu)" },
  { key: "cumparaturi", label: "Cumpărături", icon: "🛍️", color: "var(--c-galben)" },
  { key: "altele", label: "Altele", icon: "•", color: "var(--c-ink-faint)" },
] as const;

export function tripCategory(key: string) {
  return TRIP_CATEGORIES.find((c) => c.key === key) ?? TRIP_CATEGORIES[TRIP_CATEGORIES.length - 1];
}

/** Monedele propuse în formulare (toate sunt cotate de BNR). Se poate scrie și orice alt cod. */
export const CURRENCIES: { code: string; name: string }[] = [
  { code: "EUR", name: "Euro" },
  { code: "RON", name: "Leu românesc" },
  { code: "USD", name: "Dolar american" },
  { code: "GBP", name: "Liră sterlină" },
  { code: "CHF", name: "Franc elvețian" },
  { code: "TRY", name: "Liră turcească" },
  { code: "HUF", name: "Forint maghiar" },
  { code: "BGN", name: "Leva bulgărească" },
  { code: "CZK", name: "Coroană cehă" },
  { code: "PLN", name: "Zlot polonez" },
  { code: "RSD", name: "Dinar sârbesc" },
  { code: "MDL", name: "Leu moldovenesc" },
  { code: "DKK", name: "Coroană daneză" },
  { code: "SEK", name: "Coroană suedeză" },
  { code: "NOK", name: "Coroană norvegiană" },
  { code: "ISK", name: "Coroană islandeză" },
  { code: "AED", name: "Dirham (Emirate)" },
  { code: "EGP", name: "Liră egipteană" },
  { code: "THB", name: "Baht thailandez" },
  { code: "JPY", name: "Yen japonez" },
  { code: "CNY", name: "Yuan chinezesc" },
  { code: "INR", name: "Rupie indiană" },
  { code: "CAD", name: "Dolar canadian" },
  { code: "AUD", name: "Dolar australian" },
  { code: "MXN", name: "Peso mexican" },
  { code: "BRL", name: "Real brazilian" },
  { code: "ZAR", name: "Rand sud-african" },
];

/** „48,00 €”, „1.250,00 lei”, „320,00 TRY”. */
export function fmtCur(n: number, code: string) {
  if (code === "RON") return `${money(n)} lei`;
  if (code === "EUR") return `${money(n)} €`;
  return `${money(n)} ${code}`;
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Numărul de zile dintre două date ISO, inclusiv capetele (12–19 iul. = 8 zile). */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
}

export type TripPhase = "viitoare" | "acum" | "incheiata";

export const PHASE_STYLE: Record<TripPhase, { label: string; color: string; bg: string }> = {
  acum: { label: "În desfășurare", color: "var(--c-albastru)", bg: "var(--c-albastru-tint)" },
  viitoare: { label: "Urmează", color: "var(--c-galben)", bg: "var(--c-galben-tint)" },
  incheiata: { label: "Încheiată", color: "var(--c-ink-soft)", bg: "var(--c-line)" },
};

export function tripPhase(t: Pick<Trip, "start_date" | "end_date">, today = todayIso()): TripPhase {
  if (today < t.start_date) return "viitoare";
  if (today > t.end_date) return "incheiata";
  return "acum";
}

/** Vacanța în desfășurare azi (prima, dacă se suprapun), pentru Panou și butonul „+”. */
export function activeTrip<T extends Pick<Trip, "start_date" | "end_date">>(trips: T[], today = todayIso()): T | null {
  return trips.find((t) => tripPhase(t, today) === "acum") ?? null;
}

const fmtDay = new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "short" });
const fmtDayYear = new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "short", year: "numeric" });

/** „12 iul. – 19 iul. 2026”. */
export function periodLabel(t: Pick<Trip, "start_date" | "end_date">) {
  const a = new Date(`${t.start_date}T12:00:00`);
  const b = new Date(`${t.end_date}T12:00:00`);
  return `${fmtDay.format(a)} – ${fmtDayYear.format(b)}`;
}

export function dayLabel(iso: string) {
  return new Intl.DateTimeFormat("ro-RO", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${iso}T12:00:00`));
}

export function sumBy<T>(rows: T[], key: (r: T) => string, value: (r: T) => number) {
  const out: Record<string, number> = {};
  for (const r of rows) out[key(r)] = (out[key(r)] ?? 0) + value(r);
  return out;
}

/**
 * Câți lei valorează o unitate din monedă: întâi cursul la care ai cumpărat valuta (media ponderată a
 * banilor din acea monedă cu curs trecut), apoi cursul BNR. null = nu se poate converti.
 */
export function ronRate(code: string, funds: TripFund[], rates: TripDetail["rates"]): number | null {
  if (code === "RON") return 1;
  const bought = funds.filter((f) => f.currency === code && f.rate_ron && f.rate_ron > 0);
  const units = bought.reduce((a, f) => a + f.amount, 0);
  if (units > 0) return bought.reduce((a, f) => a + f.amount * (f.rate_ron as number), 0) / units;
  return rates[code]?.rate ?? null;
}

/**
 * Pentru fiecare monedă folosită: cât ai avut, cât ai cheltuit și cât ți-a rămas.
 * Moneda vacanței e mereu prima; dacă nu ai trecut bani pentru ea, bugetul estimat ține locul lor.
 */
export function walletRows(trip: Trip, funds: TripFund[], expenses: TripExpense[]) {
  const had = sumBy(funds, (f) => f.currency, (f) => f.amount);
  const spent = sumBy(expenses, (e) => e.currency, (e) => e.amount);
  const codes = [...new Set([trip.currency, ...Object.keys(had), ...Object.keys(spent)])];
  return codes
    .map((code) => {
      const fromFunds = had[code] ?? 0;
      const available = fromFunds > 0 ? fromFunds : code === trip.currency ? trip.budget : 0;
      const used = spent[code] ?? 0;
      return { code, available, fromFunds: fromFunds > 0, spent: used, left: available - used };
    })
    .filter((r) => r.code === trip.currency || r.available > 0 || r.spent > 0);
}

/** Cât mai ai în moneda vacanței (din banii avuți sau, dacă nu i-ai trecut, din buget). */
export function tripLeft(t: TripListItem) {
  const available = t.funds[t.currency] ?? t.budget;
  const spent = t.spent[t.currency] ?? 0;
  return { available, spent, left: available - spent };
}
