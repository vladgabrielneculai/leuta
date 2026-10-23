/**
 * Tranzacții programate și abonamente (beta). Logica e aici, fără bază de date, ca să poată fi testată direct.
 *
 * - O programare („Netflix, 55 lei, pe 3 ale lunii” / „RCA, anual, 15 martie”) creează intrarea în buget în
 *   ziua scadenței. Ziua 31 devine ultima zi a lunilor mai scurte.
 * - `last_month` = ultima lună pentru care s-a creat intrarea; intrările șterse de utilizator nu se refac.
 * - Abonamentele se detectează din intrările existente: aceeași plată, lună de lună (sau an de an), cu sumă
 *   apropiată, la categorii de costuri fixe sau la comercianți de abonamente cunoscuți.
 */

export type Frequency = "monthly" | "yearly";

export type Schedule = {
  id: number;
  name: string;
  category_id: number | null;
  amount: number;
  currency: string;
  frequency: Frequency;
  day: number;
  month_of_year: number | null;
  start_month: string; // YYYY-MM
  end_month: string | null;
  last_month: string | null;
  is_subscription: number;
  active: number;
};

export type Today = { date: string; month: string; day: number }; // date = YYYY-MM-DD

export function today(at = new Date()): Today {
  // Ziua din România, nu cea a serverului (UTC).
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(at);
  return { date, month: date.slice(0, 7), day: Number(date.slice(8, 10)) };
}

export function addMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Data scadenței într-o lună (null dacă programarea anuală nu cade în luna aceea). */
export function dueDate(s: Pick<Schedule, "frequency" | "day" | "month_of_year">, month: string): string | null {
  if (s.frequency === "yearly" && Number(month.slice(5, 7)) !== s.month_of_year) return null;
  const day = Math.min(s.day, daysInMonth(month));
  return `${month}-${String(day).padStart(2, "0")}`;
}

/** Lunile pentru care trebuie create acum intrări: scadența a venit și nu s-a creat încă (cel mult 24 de luni în urmă). */
export function dueMonths(s: Schedule, t: Today): { month: string; date: string }[] {
  if (!s.active) return [];
  const out: { month: string; date: string }[] = [];
  let m = s.last_month && s.last_month >= s.start_month ? addMonth(s.last_month, 1) : s.start_month;
  const oldest = addMonth(t.month, -24);
  if (m < oldest) m = oldest;
  for (; m <= t.month; m = addMonth(m, 1)) {
    if (s.end_month && m > s.end_month) break;
    const date = dueDate(s, m);
    if (date && date <= t.date) out.push({ month: m, date });
  }
  return out;
}

/** Următoarea scadență de azi încolo (inclusiv azi, dacă intrarea nu a fost creată încă). */
export function nextDue(s: Schedule, t: Today): string | null {
  if (!s.active) return null;
  let m = s.start_month > t.month ? s.start_month : t.month;
  for (let i = 0; i < 25; i++, m = addMonth(m, 1)) {
    if (s.end_month && m > s.end_month) return null;
    const date = dueDate(s, m);
    if (!date) continue;
    if (date > t.date || (date === t.date && (!s.last_month || s.last_month < m))) return date;
  }
  return null;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/** Costul lunar echivalent (o plată anuală se împarte la 12). */
export const monthlyCost = (s: Pick<Schedule, "amount" | "frequency">) => (s.frequency === "yearly" ? s.amount / 12 : s.amount);

// ---------- Detectarea abonamentelor ----------

export type EntryLite = {
  id: number;
  description: string;
  amount: number;
  currency: string;
  month: string;
  date: string | null; // ziua plății, dacă se știe (created_at)
  kind: string;
  category_id: number | null;
  category: string | null;
  scheduled_id: number | null;
};

export type Detected = {
  key: string;
  name: string;
  category_id: number | null;
  category: string | null;
  currency: string;
  frequency: Frequency;
  amount: number; // ultima sumă
  previous: number | null; // suma de dinainte, dacă s-a schimbat
  day: number;
  month_of_year: number | null;
  months: string[];
  next: string; // estimarea următoarei plăți
};

const SUBSCRIPTION_WORDS = [
  "netflix", "spotify", "youtube", "hbo", "max.com", "disney", "apple.com", "icloud", "google one", "amazon prime",
  "prime video", "voyo", "openai", "chatgpt", "microsoft", "adobe", "playstation", "xbox", "abonament", "digi", "rcs",
  "orange", "vodafone", "telekom", "yoxo", "world class", "7card", "stay fit",
];

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Cheia unei plăți: numele fără cifre și semne (numărul de terminal, data din descriere etc. variază). */
export function paymentKey(description: string): string {
  return normalize(description)
    .replace(/[^a-z0-9& ]/g, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !/\d/.test(w)) // „P0ABC”, „1234”: coduri care se schimbă
    .slice(0, 4)
    .join(" ");
}

function looksLikeSubscription(e: EntryLite) {
  const text = normalize(`${e.description} ${e.category ?? ""}`);
  return e.kind === "fixed" || SUBSCRIPTION_WORDS.some((w) => text.includes(w));
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export function detectSubscriptions(entries: EntryLite[], t: Today, ignored: string[] = []): Detected[] {
  const groups = new Map<string, EntryLite[]>();
  for (const e of entries) {
    if (e.scheduled_id || e.kind === "income" || e.kind === "saving" || !looksLikeSubscription(e)) continue;
    const key = paymentKey(e.description);
    if (key.length < 3 || ignored.includes(key)) continue;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

  const out: Detected[] = [];
  for (const [key, list] of groups) {
    // O singură plată pe lună (cumpărăturile repetate de la același magazin nu sunt abonamente).
    const byMonth = new Map<string, EntryLite[]>();
    for (const e of list) byMonth.set(e.month, [...(byMonth.get(e.month) ?? []), e]);
    if ([...byMonth.values()].some((xs) => xs.length > 1)) continue;
    const sorted = [...list].sort((a, b) => (a.date ?? `${a.month}-01`).localeCompare(b.date ?? `${b.month}-01`));
    const months = sorted.map((e) => e.month);
    const amounts = sorted.map((e) => e.amount);
    if (Math.max(...amounts) / Math.min(...amounts) > 1.25) continue; // sumă prea variabilă (ex. facturi la consum)
    const last = sorted[sorted.length - 1];
    if (last.month < addMonth(t.month, -13)) continue; // nu mai e activ

    const gaps = months.slice(1).map((m, i) => monthGap(months[i], m));
    let frequency: Frequency | null = null;
    if (months.length >= 3 && gaps.every((g) => g === 1) && last.month >= addMonth(t.month, -2)) frequency = "monthly";
    else if (months.length >= 2 && gaps.every((g) => g >= 11 && g <= 13)) frequency = "yearly";
    if (!frequency) continue;

    const days = sorted.map((e) => (e.date ? Number(e.date.slice(8, 10)) : 1));
    const day = median(days);
    const prev = sorted.length > 1 ? sorted[sorted.length - 2].amount : null;
    const monthOfYear = frequency === "yearly" ? Number(last.month.slice(5, 7)) : null;
    const sched = { frequency, day, month_of_year: monthOfYear };
    let next = t.month;
    for (let i = 0; i < 13; i++, next = addMonth(next, 1)) {
      const d = dueDate(sched, next);
      if (d && d >= t.date && next > last.month) break;
    }
    out.push({
      key,
      name: last.description,
      category_id: last.category_id,
      category: last.category,
      currency: last.currency,
      frequency,
      amount: last.amount,
      previous: prev !== null && Math.abs(prev - last.amount) >= 0.01 ? prev : null,
      day,
      month_of_year: monthOfYear,
      months,
      next: dueDate(sched, next) ?? `${next}-01`,
    });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

function monthGap(a: string, b: string) {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

/** Scumpire: ultima plată e mai mare cu cel puțin 3% și 1 leu decât cea de dinainte. */
export function priceIncrease(previous: number | null, amount: number): number | null {
  if (previous === null || previous <= 0) return null;
  const diff = amount - previous;
  return diff >= 1 && diff / previous >= 0.03 ? diff : null;
}
