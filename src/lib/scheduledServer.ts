import { isBetaDeployment } from "./beta";
import { currentUserId, getDb, getSetting, setSetting } from "./db";
import {
  daysBetween, detectSubscriptions, dueMonths, monthlyCost, nextDue, paymentKey, priceIncrease, today,
  type Detected, type EntryLite, type Schedule,
} from "./scheduled";

const IGNORED_KEY = "subscriptions_ignored";
const ALERT_DAYS = 3; // reînnoirile din următoarele 3 zile

// ---------- Crearea intrărilor scadente ----------

declare global {
  // eslint-disable-next-line no-var
  var __scheduledRun: Map<number, number> | undefined;
}

/**
 * Creează intrările programărilor ajunse la scadență. Pe beta nu rulează cron-ul Vercel (doar în producție),
 * așa că le creăm când utilizatorul deschide aplicația: panoul, luna sau pagina programărilor.
 * `force` = imediat după o modificare; altfel cel mult o dată pe minut pentru fiecare utilizator.
 */
export async function materializeDue(force = false): Promise<number> {
  if (!isBetaDeployment()) return 0;
  const uid = await currentUserId();
  if (!uid) return 0;
  const runs = (global.__scheduledRun ??= new Map());
  if (!force && Date.now() - (runs.get(uid) ?? 0) < 60_000) return 0;
  runs.set(uid, Date.now());

  const t = today();
  const db = await getDb();
  const schedules = await db
    .prepare(
      `SELECT s.*, c.kind FROM scheduled_entries s JOIN categories c ON c.id = s.category_id
       WHERE s.active = 1 AND (s.last_month IS NULL OR s.last_month < ?)`,
    )
    .all<Schedule & { kind: string }>(t.month);
  let created = 0;
  for (const s of schedules) {
    const due = dueMonths(s, t);
    if (!due.length) continue;
    await db.transaction(async (tx) => {
      for (const d of due) {
        const res = await tx
          .prepare(
            `INSERT INTO entries (month, kind, category_id, description, amount, currency, recurring, created_at, scheduled_id)
             VALUES (?, ?, ?, ?, ?, ?, 0, (?::date + time '09:00') AT TIME ZONE 'Europe/Bucharest', ?)
             ON CONFLICT (user_id, scheduled_id, month) WHERE scheduled_id IS NOT NULL DO NOTHING`,
          )
          .run(d.month, s.kind, s.category_id, s.name, s.amount, s.currency, d.date, s.id);
        created += res.changes;
      }
      await tx.prepare("UPDATE scheduled_entries SET last_month = ? WHERE id = ?").run(due[due.length - 1].month, s.id);
    });
  }
  return created;
}

/** Pentru rutele care afișează intrări: erorile nu opresc pagina, doar se scriu în log. */
export async function materializeQuietly() {
  await materializeDue().catch((e) => console.error("Programările nu au putut fi aplicate:", e));
}

// ---------- Prezentarea pentru pagină ----------

export type ScheduleView = Schedule & { category: string | null; kind: string | null; next: string | null; monthly: number };

export type Alert =
  | { type: "renewal"; name: string; date: string; days: number; amount: number; currency: string }
  | { type: "price"; name: string; previous: number; amount: number; currency: string };

export type RecurringCandidate = {
  id: number; month: string; description: string; amount: number; currency: string; category: string | null; kind: string;
};

export async function ignoredKeys(): Promise<string[]> {
  try {
    const v = JSON.parse((await getSetting(IGNORED_KEY)) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function setIgnored(key: string, ignored: boolean) {
  const keys = new Set(await ignoredKeys());
  if (ignored) keys.add(key);
  else keys.delete(key);
  await setSetting(IGNORED_KEY, JSON.stringify([...keys].slice(-200)));
}

export async function overview() {
  const t = today();
  const db = await getDb();
  const [rows, entries, ignored, recurring] = await Promise.all([
    db
      .prepare(
        `SELECT s.*, c.name AS category, c.kind FROM scheduled_entries s
         LEFT JOIN categories c ON c.id = s.category_id ORDER BY s.active DESC, s.name`,
      )
      .all<Schedule & { category: string | null; kind: string | null }>(),
    db
      .prepare(
        `SELECT e.id, e.description, e.amount, e.currency, e.month, e.kind, e.category_id, c.name AS category, e.scheduled_id,
                to_char(e.created_at AT TIME ZONE 'Europe/Bucharest', 'YYYY-MM-DD') AS date
         FROM entries e LEFT JOIN categories c ON c.id = e.category_id
         WHERE e.month >= ? AND e.month <= ?`,
      )
      .all<EntryLite>(addMonths(t.month, -15), t.month),
    ignoredKeys(),
    // Intrările recurente din cea mai recentă lună care are așa ceva (fără legătură la obiective/investiții).
    db
      .prepare(
        `SELECT e.id, e.month, e.description, e.amount, e.currency, c.name AS category, e.kind
         FROM entries e LEFT JOIN categories c ON c.id = e.category_id
         WHERE e.recurring = 1 AND e.scheduled_id IS NULL AND e.goal_id IS NULL AND e.investment_id IS NULL
           AND e.category_id IS NOT NULL
           AND e.month = (SELECT max(month) FROM entries WHERE recurring = 1 AND month <= ?)
         ORDER BY e.kind, e.description`,
      )
      .all<RecurringCandidate>(t.month),
  ]);

  // Data intrării: din created_at doar dacă e în luna intrării (altfel e o intrare adăugată mai târziu).
  const lite = entries.map((e) => ({ ...e, date: e.date && e.date.startsWith(e.month) ? e.date : null }));
  const scheduleKeys = new Set(rows.map((s) => paymentKey(s.name)));
  const detected: Detected[] = detectSubscriptions(lite, t, ignored).filter((d) => !scheduleKeys.has(d.key));

  const schedules: ScheduleView[] = rows.map((s) => ({ ...s, next: nextDue(s, t), monthly: monthlyCost(s) }));

  const alerts: Alert[] = [];
  for (const s of schedules) {
    if (!s.is_subscription || !s.next) continue;
    const days = daysBetween(t.date, s.next);
    if (days <= ALERT_DAYS) alerts.push({ type: "renewal", name: s.name, date: s.next, days, amount: s.amount, currency: s.currency });
  }
  for (const d of detected) {
    const days = daysBetween(t.date, d.next);
    if (days >= 0 && days <= ALERT_DAYS) alerts.push({ type: "renewal", name: d.name, date: d.next, days, amount: d.amount, currency: d.currency });
  }
  // Scumpiri: la abonamentele detectate (la cele programate, suma o alege utilizatorul).
  for (const d of detected) {
    if (priceIncrease(d.previous, d.amount) !== null) alerts.push({ type: "price", name: d.name, previous: d.previous!, amount: d.amount, currency: d.currency });
  }

  return { today: t.date, schedules, detected, alerts, recurring };
}

function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ---------- Validare ----------

export type ScheduleInput = {
  name: string; category_id: number; amount: number; currency: string; frequency: "monthly" | "yearly";
  day: number; month_of_year: number | null; start_month: string; end_month: string | null; is_subscription: number;
};

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function parseScheduleInput(b: Record<string, unknown>): ScheduleInput {
  const name = String(b.name ?? "").trim().slice(0, 100);
  if (!name) throw new Error("Scrie numele plății (ex. Netflix).");
  const category_id = Number(b.category_id);
  if (!Number.isInteger(category_id) || category_id <= 0) throw new Error("Alege categoria.");
  const amount = Math.round(Number(b.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 1e9) throw new Error("Suma trebuie să fie mai mare decât zero.");
  const currency = b.currency === "EUR" ? "EUR" : "RON";
  const frequency = b.frequency === "yearly" ? "yearly" : "monthly";
  const day = Number(b.day);
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error("Ziua trebuie să fie între 1 și 31.");
  const month_of_year = frequency === "yearly" ? Number(b.month_of_year) : null;
  if (frequency === "yearly" && (!Number.isInteger(month_of_year) || month_of_year! < 1 || month_of_year! > 12)) {
    throw new Error("Alege luna plății anuale.");
  }
  const start_month = String(b.start_month ?? today().month);
  if (!MONTH_RE.test(start_month)) throw new Error("Luna de început nu e validă.");
  const end_month = b.end_month ? String(b.end_month) : null;
  if (end_month && (!MONTH_RE.test(end_month) || end_month < start_month)) throw new Error("Luna de sfârșit trebuie să fie după cea de început.");
  return { name, category_id, amount, currency, frequency, day, month_of_year, start_month, end_month, is_subscription: b.is_subscription ? 1 : 0 };
}

/** Categoria trebuie să fie a utilizatorului (RLS o ascunde pe a altora). */
export async function assertCategory(categoryId: number) {
  const cat = await (await getDb()).prepare("SELECT id FROM categories WHERE id = ?").get(categoryId);
  if (!cat) throw new Error("Categoria aleasă nu există.");
}
