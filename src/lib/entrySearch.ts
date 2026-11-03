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
  /** categoria; o categorie-părinte le cuprinde și pe subcategoriile ei */
  categoryId?: number;
  tagId?: number;
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
  const tag = p.get("tag_id");
  if (tag) {
    if (!/^\d+$/.test(tag)) throw new Error("Etichetă necunoscută.");
    f.tagId = Number(tag);
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
    parts.push("(e.category_id = ? OR e.category_id IN (SELECT id FROM categories WHERE parent_id = ?))");
    params.push(f.categoryId, f.categoryId);
  }
  if (f.tagId !== undefined) {
    parts.push("EXISTS (SELECT 1 FROM entry_tags et WHERE et.entry_id = e.id AND et.tag_id = ?)");
    params.push(f.tagId);
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
  if (f.refunds) parts.push("e.amount < 0");
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
  account_id?: number | null;
  split_group?: string | null;
  /** etichetele, separate prin virgulă (beta) */
  tags?: string | null;
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
  const head = ["Data", "Luna", "Tip", "Categorie", "Descriere", "Sumă", "Monedă", "Sumă (lei)", "Se repetă lunar", "Etichete"];
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
      csvText(r.tags ?? ""),
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

/** Numele etichetelor curățate: fără „#”, fără spații în plus, fără dubluri (indiferent de majuscule). */
export function cleanTagNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new Error("Etichetele trebuie trimise ca listă.");
  const out = new Map<string, string>();
  for (const v of raw) {
    const name = String(v ?? "").trim().replace(/^#+/, "").replace(/\s+/g, " ");
    if (!name) continue;
    if (name.length > 40) throw new Error("O etichetă poate avea cel mult 40 de caractere.");
    if (!out.has(name.toLowerCase())) out.set(name.toLowerCase(), name);
  }
  if (out.size > 10) throw new Error("Cel mult 10 etichete pe o intrare.");
  return [...out.values()];
}

export type SplitPart = { category_id: number; amount: number; description?: string };

/**
 * Părțile unei plăți împărțite pe categorii (beta): cel puțin două, fiecare cu categorie și sumă > 0, iar suma
 * părților egală cu totalul (la ban). Aruncă mesaje pentru utilizator.
 */
export function checkSplit(total: unknown, parts: unknown): SplitPart[] {
  const t = Number(total);
  if (!Number.isFinite(t) || t <= 0) throw new Error("Scrie suma totală.");
  if (!Array.isArray(parts) || parts.length < 2) throw new Error("Împarte plata pe cel puțin două categorii.");
  if (parts.length > 10) throw new Error("Cel mult 10 categorii într-o plată.");
  const out = parts.map((p) => {
    const category_id = Number(p?.category_id);
    const amount = Math.round(Number(p?.amount) * 100) / 100;
    if (!Number.isInteger(category_id) || category_id <= 0) throw new Error("Alege categoria fiecărei părți.");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Fiecare parte trebuie să aibă o sumă mai mare decât 0.");
    return { category_id, amount, description: typeof p?.description === "string" ? p.description.trim() : undefined };
  });
  if (new Set(out.map((p) => p.category_id)).size !== out.length) throw new Error("Fiecare categorie apare o singură dată.");
  const sum = Math.round(out.reduce((s, p) => s + p.amount, 0) * 100);
  if (sum !== Math.round(t * 100)) throw new Error("Părțile trebuie să dea împreună suma totală.");
  return out;
}
