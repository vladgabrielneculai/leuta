/**
 * Luna de buget legată de ziua salariului.
 *
 * Implicit, o lună din aplicație e luna calendaristică (1–31). Cine primește salariul pe 5 poate alege ca luna
 * să înceapă în ziua în care intră salariul: „noiembrie” = de la salariul din noiembrie până în ziua dinaintea
 * salariului din decembrie. Cheltuielile din 1–4 noiembrie se plătesc încă din salariul din octombrie, deci
 * intră în octombrie.
 *
 * Dacă ziua salariului cade în weekend, salariul vine în ziua lucrătoare apropiată, după regula aleasă:
 *  - „split” (implicit): sâmbătă → vinerea dinainte, duminică → lunea de după;
 *  - „before”: întotdeauna vinerea dinainte;
 *  - „after”: întotdeauna lunea de după.
 *
 * Fără bază de date și fără `Date` locale: datele sunt texte AAAA-LL-ZZ, calculate în UTC, ca rezultatul
 * să fie același pe server (UTC) și pe telefon.
 */

export type WeekendRule = "split" | "before" | "after";

export type PayCycle = {
  /** Luna de buget începe în ziua salariului (altfel: luna calendaristică). */
  enabled: boolean;
  /** Ziua din lună în care vine salariul (1–31), din profil. */
  payday: number | null;
  weekend: WeekendRule;
};

export const CALENDAR_CYCLE: PayCycle = { enabled: false, payday: null, weekend: "split" };

export const WEEKEND_RULES: { value: WeekendRule; label: string }[] = [
  { value: "split", label: "Sâmbătă → vineri, duminică → luni" },
  { value: "before", label: "Mereu vinerea dinainte" },
  { value: "after", label: "Mereu lunea de după" },
];

export function isWeekendRule(v: unknown): v is WeekendRule {
  return v === "split" || v === "before" || v === "after";
}

/** Setările salvate (user_settings) + ziua salariului din profil → ciclul folosit peste tot. */
export function payCycleFrom(settings: { budget_from_payday?: string; payday_weekend?: string }, payday: number | null | undefined): PayCycle {
  const day = Number(payday);
  return {
    enabled: settings.budget_from_payday === "1",
    payday: Number.isInteger(day) && day >= 1 && day <= 31 ? day : null,
    weekend: isWeekendRule(settings.payday_weekend) ? settings.payday_weekend : "split",
  };
}

/** Luna de buget e diferită de cea calendaristică doar cu opțiunea pornită și ziua salariului completată. */
export function cycleActive(c: PayCycle): c is PayCycle & { payday: number } {
  return c.enabled && c.payday !== null;
}

// ---------- Date (AAAA-LL-ZZ) ----------

const DAY_MS = 86_400_000;

function toUtc(date: string) {
  return Date.parse(`${date}T00:00:00Z`);
}

function fromUtc(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number) {
  return fromUtc(toUtc(date) + n * DAY_MS);
}

export function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Ziua de azi în România (AAAA-LL-ZZ), oriunde ar rula codul. */
export function todayRo(at: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(at);
}

/**
 * Data la care vine salariul într-o lună calendaristică: ziua din profil (31 → ultima zi a lunilor scurte),
 * mutată pe o zi lucrătoare dacă pică în weekend. Poate ieși din lună (ex. salariul pe 1, sâmbătă → vineri 31).
 */
export function paydayDate(month: string, payday: number, weekend: WeekendRule = "split") {
  const day = Math.min(Math.max(1, Math.trunc(payday)), daysInMonth(month));
  const date = `${month}-${String(day).padStart(2, "0")}`;
  const wd = new Date(toUtc(date)).getUTCDay(); // 0 = duminică, 6 = sâmbătă
  if (wd === 6) return addDays(date, weekend === "after" ? 2 : -1);
  if (wd === 0) return addDays(date, weekend === "before" ? -2 : 1);
  return date;
}

/** Luna de buget în care intră o zi (AAAA-LL-ZZ). Fără ciclu activ: luna calendaristică. */
export function budgetMonthOf(date: string, c: PayCycle) {
  const month = date.slice(0, 7);
  if (!cycleActive(c)) return month;
  const next = shiftMonth(month, 1);
  if (date >= paydayDate(next, c.payday, c.weekend)) return next;
  if (date >= paydayDate(month, c.payday, c.weekend)) return month;
  return shiftMonth(month, -1);
}

/** Prima și ultima zi a unei luni de buget. */
export function budgetMonthRange(month: string, c: PayCycle): { start: string; end: string } {
  if (!cycleActive(c)) return { start: `${month}-01`, end: `${month}-${String(daysInMonth(month)).padStart(2, "0")}` };
  return {
    start: paydayDate(month, c.payday, c.weekend),
    end: addDays(paydayDate(shiftMonth(month, 1), c.payday, c.weekend), -1),
  };
}

/** Luna de buget în care suntem acum. */
export function currentBudgetMonth(c: PayCycle, today = todayRo()) {
  return budgetMonthOf(today, c);
}

/** Data următorului salariu (azi, dacă azi intră). */
export function nextPayday(payday: number, weekend: WeekendRule = "split", today = todayRo()) {
  let month = shiftMonth(today.slice(0, 7), -1);
  for (let i = 0; i < 3; i++, month = shiftMonth(month, 1)) {
    const d = paydayDate(month, payday, weekend);
    if (d >= today) return d;
  }
  return paydayDate(month, payday, weekend);
}

/** Zile între două date AAAA-LL-ZZ (b - a). */
export function daysBetween(a: string, b: string) {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

/** O zi din luna de buget, potrivită ca dată implicită pentru o intrare nouă: azi, ultima sau prima zi. */
export function defaultDayIn(month: string, c: PayCycle, today = todayRo()) {
  const { start, end } = budgetMonthRange(month, c);
  if (today < start) return start;
  if (today > end) return end;
  return today;
}

/** „5 nov – 4 dec” */
export function rangeLabel(month: string, c: PayCycle) {
  const SHORT = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"];
  const fmt = (d: string) => `${Number(d.slice(8, 10))} ${SHORT[Number(d.slice(5, 7)) - 1]}`;
  const { start, end } = budgetMonthRange(month, c);
  return `${fmt(start)} – ${fmt(end)}`;
}

export type EntryDate = { id: number; month: string; date: string | null; recurring: number; scheduled?: boolean };
export type Move = { id: number; from: string; to: string };

/**
 * Intrările de mutat când se trece de la un mod de împărțire la altul (luna calendaristică ↔ luna de la salariu,
 * sau altă zi de salariu). Se mută doar intrările care stau exact în luna în care le punea vechiul mod după
 * data lor, deci au fost puse automat. Rămân pe loc:
 *  - intrările trecute intenționat în altă lună;
 *  - cele recurente („lunar”), care țin de luna pentru care sunt (chiria lunii, nu ziua plății);
 *  - cele create din programări (au deja luna scadenței).
 * Mutarea e reversibilă: înapoi, de la noul mod la cel vechi, aceleași intrări se întorc unde erau.
 */
export function resortMoves(rows: EntryDate[], from: PayCycle, to: PayCycle): Move[] {
  const out: Move[] = [];
  for (const r of rows) {
    if (!r.date || r.recurring || r.scheduled) continue;
    if (budgetMonthOf(r.date, from) !== r.month) continue;
    const target = budgetMonthOf(r.date, to);
    if (target !== r.month) out.push({ id: r.id, from: r.month, to: target });
  }
  return out;
}

/** Ciclul cu care au fost împărțite intrările ultima dată (salvat ca JSON în user_settings). */
export function parseSortedCycle(raw: string | undefined): PayCycle {
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v === "object") {
      return payCycleFrom({ budget_from_payday: v.enabled ? "1" : "0", payday_weekend: v.weekend }, v.payday);
    }
  } catch {
    /* setare stricată: ca la început, luni calendaristice */
  }
  return CALENDAR_CYCLE;
}

export function sameCycle(a: PayCycle, b: PayCycle) {
  if (!cycleActive(a) || !cycleActive(b)) return cycleActive(a) === cycleActive(b);
  return a.payday === b.payday && a.weekend === b.weekend;
}

/**
 * Unde suntem într-o lună de buget: a câta zi e azi (1 = prima zi) și câte zile are luna. Pentru estimarea
 * la final de lună: cu luna de la salariu, „finalul” e ziua dinaintea salariului următor.
 */
export function budgetMonthProgress(month: string, c: PayCycle, today = todayRo()): { day: number; length: number; start: string; end: string } {
  const { start, end } = budgetMonthRange(month, c);
  const length = daysBetween(start, end) + 1;
  const day = Math.min(length, Math.max(0, daysBetween(start, today) + 1));
  return { day, length, start, end };
}
