import { indexForMonth, type Loan, type ScheduleRow } from "./loan";
import { addMonths } from "./util";
import type { ScheduleMeta } from "./scheduleParser";

type ImportedRow = ScheduleRow & { date?: string };

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Câmpurile creditului deduse din graficul băncii: suma, data acordării, tipul ratelor, dobânda fixă și
 * cea de după (marjă + IRCC), durata, soldul actual și „situația la zi” (rata următoare și componența ei).
 * `base` = creditul existent (sau unul gol), ca să păstrăm ce nu apare în grafic (nume, IRCC, comisioane).
 */
export function loanFieldsFromSchedule(meta: ScheduleMeta | null | undefined, rows: ImportedRow[], base: Partial<Loan>): Partial<Loan> {
  if (!rows.length) return {};
  const m: ScheduleMeta = meta ?? { ratePeriods: [] };
  const asOf = m.generatedAt ?? today();
  // Fără data acordării în fișier: păstrăm data creditului, dacă e înaintea primei rate, altfel luna dinainte.
  const fallbackStart = `${addMonths(rows[0].month, -1)}-01`;
  const start_date =
    m.startDate ?? (base.start_date && base.start_date.slice(0, 7) < rows[0].month ? base.start_date : fallbackStart);
  const principal = m.principal ?? (base.principal || rows[0].balance_start);
  const ref = { ...base, start_date, principal } as Loan;

  const last = rows[rows.length - 1];
  const term_months = Math.max(1, indexForMonth(ref, last.month) + 1);
  // Rata următoare = prima rată de la data graficului încolo.
  const next = rows.find((r) => (r.date ?? `${r.month}-31`) >= asOf) ?? rows[0];

  const out: Partial<Loan> = {
    bank: m.bank ?? base.bank ?? "",
    principal,
    start_date,
    term_months,
    schedule_type: m.scheduleType ?? base.schedule_type ?? "annuity",
    already_paid_principal: Math.max(0, Math.round((principal - next.balance_start) * 100) / 100),
    insurance_monthly: next.fee,
    use_schedule: 1,
    schedule_source: "pdf",
    schedule_generated_at: asOf,
    contract_nr: m.contractNr ?? base.contract_nr ?? "",
    status_date: asOf,
    current_balance: next.balance_start,
    next_payment_date: next.date ?? `${next.month}-01`,
    next_payment_amount: next.payment,
    next_principal: next.principal,
    next_interest: next.interest,
    next_fees: next.fee,
    maturity_date: last.date ?? `${last.month}-01`,
  };

  const periods = m.ratePeriods;
  if (periods.length) {
    const current = periods.find((p) => p.from <= asOf && asOf <= p.to) ?? periods[0];
    out.current_rate = current.rate;
    out.fixed_rate = periods[0].rate;
    if (periods.length > 1) {
      // Rata cu scadența în ultima zi a primei perioade se calculează încă la dobânda fixă.
      out.fixed_months = Math.max(0, Math.min(term_months, indexForMonth(ref, periods[0].to.slice(0, 7)) + 1));
      const variable = periods[periods.length - 1].rate;
      const ircc = base.ircc && base.ircc > 0 && base.ircc < variable ? base.ircc : 0;
      out.ircc = ircc;
      out.margin = Math.round((variable - ircc) * 10000) / 10000;
    } else {
      out.fixed_months = term_months;
    }
  }
  return out;
}

/** Numele propus pentru un credit nou creat din PDF. */
export function loanNameFromMeta(meta: ScheduleMeta | null | undefined) {
  if (!meta) return "Credit";
  return `Credit ${meta.bank ?? ""}${meta.contractNr ? ` nr. ${meta.contractNr}` : ""}`.replace(/\s+/g, " ").trim();
}
