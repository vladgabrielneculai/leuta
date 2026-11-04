import type { DbInterface } from "./db";
import { ACCOUNT_KINDS, checkTransfer } from "./accounts";

export const TABLES: Record<string, { columns: string[]; filters: string[]; order: string }> = {
  categories: { columns: ["name", "kind", "bucket", "color", "parent_id"], filters: ["kind"], order: "kind, name" },
  entries: {
    columns: ["month", "kind", "category_id", "goal_id", "investment_id", "card_id", "description", "amount", "currency", "recurring", "created_at", "account_id", "split_group"],
    filters: ["month", "kind", "goal_id", "investment_id"],
    order: "id",
  },
  cards: { columns: ["name", "kind", "color", "account_id"], filters: ["kind"], order: "kind, lower(name), id" },
  goals: { columns: ["name", "type", "target", "initial", "deadline", "color"], filters: ["type"], order: "type DESC, id" },
  investments: { columns: ["name", "type", "expected_return"], filters: [], order: "id" },
  loans: {
    columns: [
      "name", "bank", "principal", "start_date", "term_months", "schedule_type", "fixed_rate", "fixed_months",
      "margin", "ircc", "fee_fixed_pct", "fee_variable_pct", "insurance_monthly", "strategy", "active",
      "already_paid_principal", "already_paid_interest",
      "use_schedule", "schedule_source", "schedule_generated_at", "contract_nr",
      "status_date", "current_balance", "arrears_amount", "arrears_count", "next_payment_date", "next_payment_amount",
      "next_principal", "next_interest", "next_fees", "maturity_date", "current_rate",
      "pad_amount", "pad_due_date", "opt_ins_amount", "opt_ins_due_date",
    ],

    filters: [],
    order: "id",
  },
  loan_prepayments: { columns: ["loan_id", "month", "amount", "strategy", "note"], filters: ["loan_id"], order: "month" },
  planned_purchases: {
    columns: [
      "name",
      "category",
      "total_price",
      "financing_type",
      "down_payment",
      "loan_term_months",
      "loan_interest_rate",
      "target_date",
      "priority",
      "notes",
      "created_at",
    ],
    filters: ["financing_type", "priority"],
    order: "id DESC",
  },
  trips: {
    columns: ["name", "destination", "start_date", "end_date", "currency", "budget", "notes"],
    filters: [],
    order: "start_date DESC, id DESC",
  },
  trip_funds: { columns: ["trip_id", "label", "amount", "currency", "rate_ron"], filters: ["trip_id"], order: "id" },
  // Beta: conturi, transferuri, etichete, carduri de credit / descoperit.
  accounts: { columns: ["name", "kind", "currency", "opening_balance", "opening_date", "archived"], filters: [], order: "archived, id" },
  transfers: { columns: ["from_account_id", "to_account_id", "amount", "to_amount", "date", "note"], filters: [], order: "date DESC, id DESC" },
  tags: { columns: ["name", "color"], filters: [], order: "lower(name)" },
  debts: {
    columns: ["name", "kind", "credit_limit", "balance", "balance_date", "rate", "min_payment_pct", "min_payment_amount", "due_day", "active"],
    filters: [],
    order: "active DESC, id",
  },
  trip_expenses: {
    columns: ["trip_id", "date", "category", "description", "amount", "currency"],
    filters: ["trip_id"],
    order: "date DESC, id DESC",
  },
};

/** O dată YYYY-MM-DD care există în calendar (2026-02-31 sau 2026-13-05 nu trec). */
function isIsoDay(v: unknown) {
  const s = String(v ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

function currencyCode(v: unknown) {
  const c = String(v ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) throw new Error("Moneda trebuie să fie un cod din 3 litere (ex. EUR, USD, TRY).");
  return c;
}

function positive(v: unknown, what: string) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${what} trebuie să fie mai mare decât 0.`);
  return n;
}

/**
 * Verificări înainte de scriere, pe tabelele care le cer. `data` conține doar coloanele trimise
 * (la modificare pot lipsi unele), deci verificăm doar ce există; la adăugare, câmpurile obligatorii.
 * La modificare, `current` e rândul din baza de date, pentru verificările care leagă mai multe coloane.
 */
export const VALIDATE: Record<string, (data: Record<string, unknown>, isNew: boolean, current?: Record<string, unknown>) => void> = {
  entries(d) {
    // Ziua tranzacției (YYYY-MM-DD), salvată la prânz în ora României, ca la import: ziua rămâne aceeași în orice fus.
    if (!("created_at" in d)) return;
    if (d.created_at === null) {
      delete d.created_at;
      return;
    }
    if (!isIsoDay(d.created_at)) throw new Error("Alege data tranzacției.");
    d.created_at = `${d.created_at} 12:00 Europe/Bucharest`;
  },
  accounts(d, isNew) {
    if (isNew || "name" in d) {
      d.name = String(d.name ?? "").trim();
      if (!d.name) throw new Error("Dă un nume contului.");
    }
    if ((isNew || "kind" in d) && !ACCOUNT_KINDS.some((k) => k.kind === d.kind)) throw new Error("Alege tipul contului.");
    if (isNew || "currency" in d) d.currency = currencyCode(d.currency ?? "RON");
    if (isNew || "opening_balance" in d) {
      const b = Number(d.opening_balance ?? 0);
      if (!Number.isFinite(b)) throw new Error("Soldul de pornire trebuie să fie un număr.");
      d.opening_balance = b; // poate fi negativ (descoperit de cont)
    }
    if ((isNew || "opening_date" in d) && !isIsoDay(d.opening_date)) throw new Error("Alege data soldului de pornire.");
  },
  transfers(d, isNew, current) {
    const merged = { ...current, ...d } as { from_account_id: unknown; to_account_id: unknown; amount: unknown; to_amount?: unknown };
    if (isNew || ["from_account_id", "to_account_id", "amount", "to_amount"].some((k) => k in d)) {
      Object.assign(d, Object.fromEntries(Object.entries(checkTransfer(merged)).filter(([k]) => isNew || k in d)));
    }
    if ((isNew || "date" in d) && !isIsoDay(d.date)) throw new Error("Alege data transferului.");
    if ("note" in d) d.note = String(d.note ?? "").trim();
  },
  tags(d, isNew) {
    if (isNew || "name" in d) {
      d.name = String(d.name ?? "").trim().replace(/^#/, "");
      if (!d.name) throw new Error("Dă un nume etichetei.");
      if (String(d.name).length > 40) throw new Error("Eticheta e prea lungă.");
    }
  },
  debts(d, isNew) {
    if (isNew || "name" in d) {
      d.name = String(d.name ?? "").trim();
      if (!d.name) throw new Error("Dă un nume cardului.");
    }
    if ((isNew || "kind" in d) && !["card", "overdraft"].includes(String(d.kind))) throw new Error("Alege tipul: card sau descoperit.");
    for (const [k, what] of [["credit_limit", "Limita"], ["balance", "Soldul"], ["rate", "Dobânda"], ["min_payment_pct", "Plata minimă"], ["min_payment_amount", "Plata minimă"]] as const) {
      if (!(k in d)) continue;
      const n = Number(d[k] ?? 0);
      if (!Number.isFinite(n) || n < 0) throw new Error(`${what} nu poate fi negativă.`);
      if (k === "min_payment_pct" && n > 100) throw new Error("Plata minimă e un procent între 0 și 100.");
      d[k] = n;
    }
    if ("due_day" in d) {
      if (d.due_day === null || d.due_day === "") d.due_day = null;
      else if (!Number.isInteger(Number(d.due_day)) || Number(d.due_day) < 1 || Number(d.due_day) > 31) throw new Error("Ziua scadenței e între 1 și 31.");
      else d.due_day = Number(d.due_day);
    }
    if ("balance_date" in d && d.balance_date && !isIsoDay(d.balance_date)) throw new Error("Data soldului nu e validă.");
  },
  cards(d, isNew) {
    if (isNew || "name" in d) {
      d.name = String(d.name ?? "").trim();
      if (!d.name) throw new Error("Dă un nume cardului.");
      if (String(d.name).length > 60) throw new Error("Numele cardului e prea lung.");
    }
    if (isNew || "kind" in d) {
      d.kind = d.kind ?? "bank";
      if (d.kind !== "bank" && d.kind !== "meal") throw new Error("Tip de card necunoscut.");
    }
    if ("color" in d && !/^#[0-9a-fA-F]{6}$/.test(String(d.color))) throw new Error("Culoare invalidă.");
  },
  trips(d, isNew, current) {
    if (isNew || "name" in d) {
      d.name = String(d.name ?? "").trim();
      if (!d.name) throw new Error("Dă un nume vacanței.");
    }
    for (const k of ["start_date", "end_date"]) {
      if ((isNew || k in d) && !isIsoDay(d[k])) throw new Error("Alege perioada vacanței.");
    }
    // La modificarea unei singure date, cealaltă vine din rândul existent.
    const start = d.start_date ?? current?.start_date;
    const end = d.end_date ?? current?.end_date;
    if (start && end && String(end) < String(start)) {
      throw new Error("Vacanța nu se poate termina înainte să înceapă.");
    }
    if (isNew || "currency" in d) d.currency = currencyCode(d.currency);
    if ("budget" in d) {
      const b = Number(d.budget || 0);
      if (!Number.isFinite(b) || b < 0) throw new Error("Bugetul nu poate fi negativ.");
      d.budget = b;
    }
  },
  trip_funds(d, isNew) {
    if (isNew || "amount" in d) d.amount = positive(d.amount, "Suma");
    if (isNew || "currency" in d) d.currency = currencyCode(d.currency);
    if ("rate_ron" in d) d.rate_ron = d.rate_ron === null || d.rate_ron === "" ? null : positive(d.rate_ron, "Cursul");
  },
  trip_expenses(d, isNew) {
    if (isNew || "amount" in d) d.amount = positive(d.amount, "Suma");
    if (isNew || "currency" in d) d.currency = currencyCode(d.currency);
    if ((isNew || "date" in d) && !isIsoDay(d.date)) throw new Error("Alege data cheltuielii.");
  },
};

/** `INSERT INTO table (…) VALUES (…)` cu cheile lui `data` (coloane deja verificate de apelant). */
export function insertRow(db: DbInterface, table: string, data: Record<string, unknown>, suffix = "") {
  const keys = Object.keys(data);
  return db.prepare(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})${suffix}`).run(...Object.values(data));
}

/** `UPDATE table SET … WHERE id = ?` cu cheile lui `data` (coloane deja verificate de apelant). */
export function updateRow(db: DbInterface, table: string, id: unknown, data: Record<string, unknown>) {
  return db.prepare(`UPDATE ${table} SET ${Object.keys(data).map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).run(...Object.values(data), id);
}

/** Tabelele cu datele financiare ale unui cont, în ordinea cheilor străine (părinții înaintea copiilor). */
export const FINANCIAL_TABLES = [
  "categories", "cards", "goals", "investments", "loans", "accounts", "scheduled_entries", "entries",
  "investment_values", "loan_prepayments", "loan_schedules", "planned_purchases", "import_rules",
  "trips", "trip_funds", "trip_expenses", "transfers", "tags", "entry_tags", "debts",
] as const;

/** Tabelele vizibile în exploratorul bazei de date (Setări, doar administrator). */
export const DB_TABLES = [
  "entries", "loans", "loan_prepayments", "loan_schedules", "categories", "cards", "goals",
  "investments", "investment_values", "planned_purchases", "trips", "trip_funds", "trip_expenses",
  "accounts", "transfers", "tags", "debts", "user_settings", "fx_rates", "fx_rates_currency", "inflation_rates",
];
