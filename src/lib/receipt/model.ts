import { buildSummary, loadLoans } from "../analytics";
import { currentUserId, getDb, getSystemDb } from "../db";
import { monthCashflow } from "../loan";
import { loadProfile } from "../profileServer";
import { displayName } from "../profile";
import type { Kind } from "../util";

/**
 * Datele „bonului” lunar: veniturile și cheltuielile unei luni, grupate ca pe un bon de casă.
 * Rulează în contextul utilizatorului (sesiune sau runAsUser), deci vede doar datele lui.
 */

export type ReceiptLine = {
  label: string;
  amount: number; // în lei (sumele în EUR sunt convertite la cursul lunii)
  note?: string; // descrierea introdusă de utilizator
  eur?: number; // suma originală, dacă a fost în EUR
};

export type ReceiptSection = { title: string; lines: ReceiptLine[]; subtotal: number };

export type Receipt = {
  month: string;
  number: string; // „numărul bonului”: luna, ca 0010 pentru octombrie (an + lună în codul de bare)
  holder: string;
  issuedAt: Date;
  sections: ReceiptSection[];
  totals: {
    income: number;
    spent: number; // costuri fixe + variabile + rate + comisioane
    saved: number; // economii, investiții, plăți anticipate
    unallocated: number;
    savingsRate: number;
  };
  eurRate: number;
  eurRateDate: string | null;
  hasData: boolean;
  userId: number;
};

type Row = {
  kind: Kind;
  amount: number;
  currency: string;
  description: string;
  category: string | null;
  goal: string | null;
  investment: string | null;
};

const SECTION_ORDER: { kind: Kind; title: string }[] = [
  { kind: "income", title: "VENITURI" },
  { kind: "fixed", title: "COSTURI FIXE" },
  { kind: "variable", title: "CHELTUIELI VARIABILE" },
  { kind: "saving", title: "ECONOMII ȘI INVESTIȚII" },
];

export async function buildReceipt(month: string, username = ""): Promise<Receipt> {
  const db = await getDb();
  const [summary, rows, loans, profile, userId] = await Promise.all([
    buildSummary(month),
    db
      .prepare(
        `SELECT e.kind, e.amount, e.currency, e.description, c.name AS category, g.name AS goal, i.name AS investment
         FROM entries e
         LEFT JOIN categories c ON c.id = e.category_id
         LEFT JOIN goals g ON g.id = e.goal_id
         LEFT JOIN investments i ON i.id = e.investment_id
         WHERE e.month = ?
         ORDER BY e.kind, e.amount DESC, e.id`,
      )
      .all<Row>(month),
    loadLoans(),
    loadProfile().catch(() => null),
    currentUserId(),
  ]);
  // Din cron (fără sesiune) numele de utilizator se ia din cont, pentru titular când profilul e gol.
  if (!username && userId) {
    const u = await (await getSystemDb()).prepare("SELECT username FROM users WHERE id = ?").get<{ username: string }>(userId);
    username = u?.username ?? "";
  }
  const rate = summary.fx.rate;
  const t = summary.totals;

  const toLine = (r: Row): ReceiptLine => {
    const label =
      r.kind === "saving"
        ? r.investment ?? r.goal ?? "Economii generale"
        : r.category ?? "Fără categorie";
    const note = r.description && r.description.trim().toLowerCase() !== label.toLowerCase() ? r.description.trim() : undefined;
    return r.currency === "EUR"
      ? { label, note, amount: r.amount * rate, eur: r.amount }
      : { label, note, amount: r.amount };
  };

  const sections: ReceiptSection[] = [];
  for (const { kind, title } of SECTION_ORDER) {
    const lines = rows.filter((r) => r.kind === kind).map(toLine);

    // Ratele creditelor nu sunt intrări: vin din graficul de rambursare, ca în restul aplicației.
    if (kind === "fixed") {
      const loanLines: ReceiptLine[] = [];
      for (const { loan, sim } of loans) {
        const cf = monthCashflow(loan, sim, month);
        if (cf.payment > 0) loanLines.push({ label: `Rată ${loan.name}`, amount: cf.payment });
        if (cf.insurance > 0) loanLines.push({ label: `Asigurare ${loan.name}`, amount: cf.insurance });
        if (cf.fee > 0) loanLines.push({ label: `Comision rambursare ${loan.name}`, amount: cf.fee });
      }
      if (loanLines.length) {
        sections.push({ title: "RATE CREDITE", lines: loanLines, subtotal: loanLines.reduce((s, l) => s + l.amount, 0) });
      }
    }
    if (kind === "saving") {
      for (const { loan, sim } of loans) {
        const cf = monthCashflow(loan, sim, month);
        if (cf.prepayment > 0) lines.push({ label: `Plată anticipată ${loan.name}`, amount: cf.prepayment });
      }
    }
    if (lines.length) sections.push({ title, lines, subtotal: lines.reduce((s, l) => s + l.amount, 0) });
  }
  // Ordinea de pe bon: venituri, costuri fixe, rate, variabile, economii.
  const order = ["VENITURI", "COSTURI FIXE", "RATE CREDITE", "CHELTUIELI VARIABILE", "ECONOMII ȘI INVESTIȚII"];
  sections.sort((a, b) => order.indexOf(a.title) - order.indexOf(b.title));

  return {
    month,
    number: month.slice(5, 7).padStart(4, "0"),
    holder: profile ? displayName(profile, username) : username,
    issuedAt: new Date(),
    sections,
    totals: {
      income: t.income,
      spent: t.spent,
      saved: t.savedTotal,
      unallocated: t.unallocated,
      savingsRate: t.savingsRate,
    },
    eurRate: rate,
    eurRateDate: summary.fx.date ?? null,
    hasData: rows.length > 0 || sections.length > 0,
    userId: userId ?? 0,
  };
}
