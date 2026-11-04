/**
 * Căutarea în toate intrările (beta) și exportul lor în CSV. Logica e aici, fără bază de date, ca să poată fi
 * testată direct: filtrele din URL devin o condiție SQL cu parametri, iar rândurile găsite devin un fișier CSV.
 *
 * - Textul se caută în descriere și în numele categoriei, fără diferență între majuscule și minuscule.
 * - Perioada e pe luna din buget (YYYY-MM), nu pe ziua tranzacției: la intrările vechi ziua lipsește.
 * - Sumele min/max se compară cu valoarea absolută, în moneda intrării (un retur de -50 lei are 50).
 */

export const KINDS = ["income", "fixed", "variable", "saving"] as const;
export type SearchKind = (typeof KINDS)[number];

export type EntryFilters = {
  q?: string;
  kind?: SearchKind;
  categoryId?: number;
  from?: string; // YYYY-MM, inclusiv
  to?: string; // YYYY-MM, inclusiv
  min?: number;
  max?: number;
  /** doar retururile (sumele negative) */
  refunds?: boolean;
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function amountParam(raw: string | null, what: string): number | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw new Error(`${what} trebuie să fie un număr pozitiv.`);
  return n;
}

/** Filtrele din query string. Valorile greșite opresc cererea cu un mesaj clar, nu sunt ignorate în tăcere. */
export function parseFilters(p: URLSearchParams): EntryFilters {
  const f: EntryFilters = {};
  const q = p.get("q")?.trim();
  if (q) {
    if (q.length > 100) throw new Error("Textul căutat e prea lung.");
    f.q = q;
  }
  const kind = p.get("kind");
  if (kind) {
    if (!(KINDS as readonly string[]).includes(kind)) throw new Error("Tip de intrare necunoscut.");
    f.kind = kind as SearchKind;
  }
  const cat = p.get("category_id");
  if (cat) {
    if (!/^\d+$/.test(cat)) throw new Error("Categorie necunoscută.");
    f.categoryId = Number(cat);
  }
  for (const k of ["from", "to"] as const) {
    const v = p.get(k);
    if (!v) continue;
    if (!MONTH.test(v)) throw new Error("Perioada trebuie să fie în formatul AAAA-LL.");
    f[k] = v;
  }
  if (f.from && f.to && f.from > f.to) [f.from, f.to] = [f.to, f.from];
  const min = amountParam(p.get("min"), "Suma minimă");
  const max = amountParam(p.get("max"), "Suma maximă");
  if (min !== undefined) f.min = min;
  if (max !== undefined) f.max = max;
  if (f.min !== undefined && f.max !== undefined && f.min > f.max) [f.min, f.max] = [f.max, f.min];
  if (p.get("refunds") === "1") f.refunds = true;
  return f;
}

/** `%`, `_` și `\` din textul căutat se potrivesc literal, nu ca tipare LIKE. */
export function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Condiția WHERE (pe `entries e` cu `categories c`) și parametrii ei, în ordinea semnelor `?`. */
export function filtersSql(f: EntryFilters): { where: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (f.q) {
    parts.push("(e.description ILIKE ? OR c.name ILIKE ?)");
    const pat = likePattern(f.q);
    params.push(pat, pat);
  }
  if (f.kind) {
    parts.push("e.kind = ?");
    params.push(f.kind);
  }
  if (f.categoryId !== undefined) {
    parts.push("e.category_id = ?");
    params.push(f.categoryId);
  }
  if (f.from) {
    parts.push("e.month >= ?");
    params.push(f.from);
  }
  if (f.to) {
    parts.push("e.month <= ?");
    params.push(f.to);
  }
  if (f.min !== undefined) {
    parts.push("ABS(e.amount) >= ?");
    params.push(f.min);
  }
  if (f.max !== undefined) {
    parts.push("ABS(e.amount) <= ?");
    params.push(f.max);
  }
  if (f.refunds) parts.push("e.amount < 0 AND e.kind <> 'saving'"); // retragerile din economii nu sunt retururi
  return { where: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

export type FoundEntry = {
  id: number;
  month: string;
  day: string | null; // YYYY-MM-DD, ziua tranzacției în ora României
  kind: SearchKind;
  category_id: number | null;
  goal_id: number | null;
  investment_id: number | null;
  category: string | null;
  description: string;
  amount: number;
  currency: string;
  recurring: number;
  created_at: string | null;
  ron: number; // suma în lei, la cursul BNR al lunii
};

const KIND_CSV: Record<SearchKind, string> = { income: "Venit", fixed: "Cost fix", variable: "Cheltuială", saving: "Economii" };

/** Număr cu virgulă zecimală, fără separator de mii: Excel în limba română îl citește ca număr. */
export function csvNumber(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");
}

/**
 * O celulă de text: între ghilimele când are separatorul, ghilimele sau rând nou. Textul care începe cu
 * `=`, `+`, `-`, `@` primește un apostrof, ca Excel să nu-l execute ca formulă (CSV injection).
 */
export function csvText(v: string) {
  let s = v ?? "";
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV cu `;` și BOM UTF-8: Excel îl deschide direct, cu diacriticele corecte. */
export function toCsv(rows: FoundEntry[]) {
  const head = ["Data", "Luna", "Tip", "Categorie", "Descriere", "Sumă", "Monedă", "Sumă (lei)", "Se repetă lunar"];
  const lines = rows.map((r) =>
    [
      r.day ?? "",
      r.month,
      KIND_CSV[r.kind] ?? r.kind,
      csvText(r.category ?? ""),
      csvText(r.description),
      csvNumber(r.amount),
      r.currency,
      csvNumber(r.ron),
      r.recurring ? "da" : "nu",
    ].join(";"),
  );
  return `﻿${[head.join(";"), ...lines].join("\r\n")}\r\n`;
}

export type SearchTotals = Record<SearchKind, number> & { count: number; refunds: number };

/** Totalurile rezultatelor, în lei, pe tipuri; retururile se scad din cheltuieli și apar și separat. */
export function totalsOf(rows: FoundEntry[]): SearchTotals {
  const t: SearchTotals = { income: 0, fixed: 0, variable: 0, saving: 0, count: rows.length, refunds: 0 };
  for (const r of rows) {
    t[r.kind] += r.ron;
    if (r.ron < 0) t.refunds += -r.ron;
  }
  return t;
}
