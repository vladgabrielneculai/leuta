export const TABLES: Record<string, { columns: string[]; filters: string[]; order: string }> = {
  categories: { columns: ["name", "kind", "bucket", "color"], filters: ["kind"], order: "kind, name" },
  entries: {
    columns: ["month", "kind", "category_id", "goal_id", "investment_id", "description", "amount", "currency", "recurring"],
    filters: ["month", "kind", "goal_id", "investment_id"],
    order: "id",
  },
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
