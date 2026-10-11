import { createHash } from "node:crypto";

/**
 * Citirea extraselor de cont (CSV / Excel) în tranzacții: data, suma cu semn (minus = plată), descrierea.
 *
 * - ING Home'Bank: antet „Data, Detalii tranzactie, Debit, Credit” (cu coloane goale între ele), date ca
 *   „30 septembrie 2013”, iar detaliile („Terminal: …”, „Beneficiar: …”) vin pe rândurile de sub tranzacție.
 * - BCR George și restul băncilor: un rând pe tranzacție, coloane recunoscute după nume („Data inregistrarii”,
 *   „Suma”, „Partener”, „Descrierea tranzactiei”…). George exportă în UTF-16, cu „;” ca separator.
 * - Dacă nu recunoaștem antetul, utilizatorul alege coloanele (`Mapping`), iar alegerea se reține după
 *   semnătura antetului (`signature`).
 *
 * Fără dependențe de Next.js, ca să poată fi testat direct cu Node.
 */

export type Table = string[][];

export type Mapping = {
  header: number; // indexul rândului de antet
  date: number;
  amount?: number; // sumă cu semn
  debit?: number; // sau: plăți și încasări în coloane separate
  credit?: number;
  description: number[];
  currency?: number;
};

export type Transaction = {
  date: string; // YYYY-MM-DD
  amount: number; // negativ = plată, pozitiv = încasare
  currency: string;
  description: string; // comerciantul / partenerul, scurt
  details: string; // tot textul băncii (pentru reguli)
  hash: string; // amprenta tranzacției, contra importului dublu
};

export type ParseResult =
  | { status: "ok"; bank: string; transactions: Transaction[]; signature: string; mapping?: Mapping; headers?: string[] }
  | { status: "needs-mapping"; signature: string; header: number; headers: string[]; sample: string[][]; guess: Partial<Mapping> };

// ---------- Text și CSV ----------

/** Textul fișierului: UTF-16 (George), UTF-8 cu sau fără BOM, altfel Windows-1250 (export vechi cu diacritice). */
export function decodeText(buf: Uint8Array): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf.subarray(2));
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return new TextDecoder("utf-8").decode(buf.subarray(3));
  // UTF-16 fără BOM: octeții nuli apar în jumătate din poziții.
  const probe = buf.subarray(0, 400);
  let zerosOdd = 0;
  for (let i = 1; i < probe.length; i += 2) if (probe[i] === 0) zerosOdd++;
  if (probe.length > 10 && zerosOdd > probe.length / 4) return new TextDecoder("utf-16le").decode(buf);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1250").decode(buf);
  }
}

function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  let best = ",";
  let bestScore = -1;
  for (const d of [";", ",", "\t"]) {
    // Separatorul bun apare pe multe rânduri; numărăm doar în afara ghilimelelor.
    const score = lines.reduce((s, l) => s + l.replace(/"[^"]*"/g, "").split(d).length - 1, 0);
    if (score > bestScore) [best, bestScore] = [d, score];
  }
  return best;
}

/** CSV cu ghilimele (inclusiv câmpuri pe mai multe rânduri) și separator detectat automat. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): Table {
  const rows: Table = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim()));
}

/** Celulele din Excel (Date, numere) aduse la text, ca restul codului să lucreze la fel pentru CSV și .xlsx. */
export function tableFromCells(rows: unknown[][]): Table {
  return rows.map((r) =>
    (r ?? []).map((c) => {
      if (c === null || c === undefined) return "";
      if (c instanceof Date) return isNaN(c.getTime()) ? "" : c.toISOString().slice(0, 10);
      return String(c).trim();
    }),
  );
}

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- Sume și date ----------

/** „1.234,56”, „1,234.56”, „-100,00”, „100,00 RON”, „(45.10)” → număr; text fără cifre → null. */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/\s| /g, "").replace(/[a-zA-Z]{3}$/, "").replace(/^[a-zA-Z]{3}/, "");
  if (!s || !/\d/.test(s)) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-") || s.startsWith("−")) {
    negative = true;
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (!/^[\d.,']+$/.test(s)) return null;
  s = s.replace(/'/g, "");
  const decimalIdx = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  // Un singur separator urmat de exact 3 cifre e de mii („1.234”), nu zecimal.
  const onlyOne = (s.match(/[.,]/g) ?? []).length === 1;
  if (decimalIdx >= 0 && !(onlyOne && s.length - decimalIdx - 1 === 3)) {
    const intPart = s.slice(0, decimalIdx).replace(/[.,]/g, "");
    const frac = s.slice(decimalIdx + 1);
    if (!/^\d*$/.test(frac)) return null;
    s = `${intPart}.${frac}`;
  } else {
    s = s.replace(/[.,]/g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

const RO_MONTHS: Record<string, number> = {
  ianuarie: 1, ian: 1, februarie: 2, feb: 2, martie: 3, mar: 3, aprilie: 4, apr: 4, mai: 5, iunie: 6, iun: 6,
  iulie: 7, iul: 7, august: 8, aug: 8, septembrie: 9, sep: 9, sept: 9, octombrie: 10, oct: 10, noiembrie: 11,
  nov: 11, noi: 11, decembrie: 12, dec: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** „31.10.2026”, „31/10/2026”, „31-10-2026”, „2026-10-31”, „31 octombrie 2026”, „31 oct. 2026” (cu sau fără oră). */
export function parseDate(raw: string): string | null {
  const s = normalize(raw);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\D|$)/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})\s+([a-z]+)\.?,?\s+(\d{4})(?:\D|$)/);
  if (m && RO_MONTHS[m[2]]) return iso(+m[3], RO_MONTHS[m[2]], +m[1]);
  return null;
}

// ---------- Descriere și amprentă ----------

const DETAIL_LABELS = ["terminal", "locatie", "beneficiar", "ordonator", "platitor", "nume beneficiar", "partener", "comerciant"];

function clip(s: string, max = 80) {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** Numele scurt al comerciantului / partenerului din textul băncii; altfel începutul textului. */
export function merchantFrom(details: string[]): string {
  for (const label of DETAIL_LABELS) {
    for (const line of details) {
      const m = line.match(new RegExp(`(?:^|[\\s,;.-])${label}\\s*:\\s*([^;|]+)`, "i"));
      if (!m) continue;
      let v = m[1].trim();
      // „KAUFLAND 1234 RO BUCURESTI” → „KAUFLAND 1234”; „ORO2050B RO OMV 1900/ BUCURESTI” → „OMV 1900”.
      const parts = v.split(/\s+RO\s+/);
      if (parts.length > 1) v = /^[A-Z]{2,4}\d+[A-Z]?$/i.test(parts[0].trim()) ? parts[1] : parts[0];
      v = v.replace(/\s*\/.*$/, "").replace(/[;,.\s]+$/, "").trim();
      if (v) return clip(v, 60);
    }
  }
  const first = details.find((d) => d.trim()) ?? "";
  return clip(first.replace(/\s+/g, " ").trim(), 60);
}

function withHashes(txs: Omit<Transaction, "hash">[]): Transaction[] {
  const seen = new Map<string, number>();
  return txs.map((t) => {
    const key = `${t.date}|${t.amount.toFixed(2)}|${t.currency}|${normalize(t.details)}`;
    const n = (seen.get(key) ?? 0) + 1; // două cafele identice în aceeași zi rămân două tranzacții
    seen.set(key, n);
    return { ...t, hash: createHash("sha256").update(`${key}#${n}`).digest("hex").slice(0, 40) };
  });
}

/** Semnătura antetului: aceeași bancă și același export dau aceeași semnătură. */
export function headerSignature(cells: string[]): string {
  const key = cells.map(normalize).filter(Boolean).join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

// ---------- ING ----------

function findIngHeader(table: Table) {
  for (let r = 0; r < Math.min(table.length, 40); r++) {
    const cells = table[r].map(normalize);
    const date = cells.indexOf("data");
    const details = cells.findIndex((c) => c === "detalii tranzactie" || c === "detalii tranzactii");
    const debit = cells.indexOf("debit");
    const credit = cells.indexOf("credit");
    if (date >= 0 && details >= 0 && (debit >= 0 || credit >= 0)) return { row: r, date, details, debit, credit };
  }
  return null;
}

function parseIng(table: Table, h: NonNullable<ReturnType<typeof findIngHeader>>, currency: string): Transaction[] {
  const out: Omit<Transaction, "hash">[] = [];
  const open: { tx: { date: string; amount: number; lines: string[] } | null } = { tx: null };
  const flush = () => {
    const t = open.tx;
    if (t) out.push({ date: t.date, amount: t.amount, currency, description: merchantFrom(t.lines.slice(1)) || t.lines[0], details: t.lines.join(" | ") });
    open.tx = null;
  };
  for (let r = h.row + 1; r < table.length; r++) {
    const row = table[r];
    const first = (row[h.date] ?? "").trim();
    const detail = (row[h.details] ?? "").trim();
    const date = first ? parseDate(first) : null;
    if (date) {
      flush();
      const debit = h.debit >= 0 ? parseAmount(row[h.debit] ?? "") : null;
      const credit = h.credit >= 0 ? parseAmount(row[h.credit] ?? "") : null;
      const amount = (credit ?? 0) - Math.abs(debit ?? 0);
      if (amount !== 0) open.tx = { date, amount, lines: [detail] };
    } else if (!row.slice(0, h.details).some((c) => c.trim()) && detail && open.tx) {
      // Rândurile de detaliu au coloanele dinaintea detaliilor goale.
      open.tx.lines.push(detail);
    } else if (row.some((c) => c.trim())) {
      // Sold inițial/final, titular, semnătură: textul de după tabel nu aparține tranzacției.
      flush();
    }
  }
  flush();
  return withHashes(out);
}

// ---------- Restul băncilor: coloane recunoscute după nume ----------

const DATE_NAMES = ["data inregistrarii", "data tranzactiei", "data tranzactie", "data operatiunii", "data finalizarii tranzactiei", "data procesarii", "data contabila", "data", "data valutei", "date", "transaction date", "completed date", "started date"];
const AMOUNT_NAMES = ["suma", "suma tranzactiei", "valoare", "amount", "suma (ron)", "suma ron"];
const DEBIT_NAMES = ["debit", "debit (suma)", "suma debit", "plati", "iesiri"];
const CREDIT_NAMES = ["credit", "credit (suma)", "suma credit", "incasari", "intrari"];
const DESCRIPTION_NAMES = [
  "partener", "nume beneficiar", "beneficiar", "nume platitor", "platitor", "contrapartida", "comerciant", "merchant",
  "descrierea tranzactiei", "descriere", "detalii", "detalii tranzactie", "tranzactii finalizate (detalii)", "explicatie", "explicatii", "description", "mesaj",
];
const CURRENCY_NAMES = ["moneda", "valuta", "currency"];

function indexOfAny(cells: string[], names: string[]) {
  for (const n of names) {
    const i = cells.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
}

/** Ghicește coloanele după nume. `complete` = destul ca importul să meargă fără întrebări. */
export function guessMapping(table: Table): { mapping: Partial<Mapping> & { header: number }; complete: boolean } {
  let best: { mapping: Partial<Mapping> & { header: number }; score: number } = { mapping: { header: 0, description: [] }, score: -1 };
  for (let r = 0; r < Math.min(table.length, 40); r++) {
    const cells = table[r].map(normalize);
    const m: Partial<Mapping> & { header: number } = { header: r, description: [] };
    const date = indexOfAny(cells, DATE_NAMES);
    const amount = indexOfAny(cells, AMOUNT_NAMES);
    const debit = indexOfAny(cells, DEBIT_NAMES);
    const credit = indexOfAny(cells, CREDIT_NAMES);
    const currency = indexOfAny(cells, CURRENCY_NAMES);
    if (date >= 0) m.date = date;
    if (amount >= 0) m.amount = amount;
    else {
      if (debit >= 0) m.debit = debit;
      if (credit >= 0) m.credit = credit;
    }
    if (currency >= 0) m.currency = currency;
    m.description = DESCRIPTION_NAMES.map((n) => cells.indexOf(n)).filter((i, k, a) => i >= 0 && a.indexOf(i) === k);
    const score = (date >= 0 ? 2 : 0) + (amount >= 0 || debit >= 0 || credit >= 0 ? 2 : 0) + (m.description.length ? 1 : 0);
    if (score > best.score) best = { mapping: m, score };
  }
  return { mapping: best.mapping, complete: best.score === 5 };
}

export function applyMapping(table: Table, m: Mapping, fallbackCurrency = "RON"): Transaction[] {
  const out: Omit<Transaction, "hash">[] = [];
  for (let r = m.header + 1; r < table.length; r++) {
    const row = table[r];
    const date = parseDate(row[m.date] ?? "");
    if (!date) continue;
    let amount: number | null;
    if (m.amount !== undefined) amount = parseAmount(row[m.amount] ?? "");
    else {
      const debit = m.debit !== undefined ? parseAmount(row[m.debit] ?? "") : null;
      const credit = m.credit !== undefined ? parseAmount(row[m.credit] ?? "") : null;
      amount = debit === null && credit === null ? null : (credit ?? 0) - Math.abs(debit ?? 0);
    }
    if (amount === null || amount === 0) continue;
    const parts = m.description.map((i) => (row[i] ?? "").trim()).filter(Boolean);
    const currency = (m.currency !== undefined ? row[m.currency] : "")?.trim().toUpperCase() || fallbackCurrency;
    out.push({
      date,
      amount,
      currency: /^[A-Z]{3}$/.test(currency) ? currency : fallbackCurrency,
      description: merchantFrom(parts) || "Tranzacție",
      details: parts.join(" | "),
    });
  }
  return withHashes(out);
}

function bankLabel(table: Table, m: Partial<Mapping> & { header: number }) {
  const head = table.slice(0, m.header + 1).flat().map(normalize).join(" ");
  if (head.includes("data inregistrarii") || head.includes("partener") || head.includes("rncb")) return "BCR";
  if (head.includes("salt")) return "Salt Bank";
  return "extras de cont";
}

/** Moneda contului, dacă apare deasupra tabelului („Valuta: RON”, „Moneda EUR”). */
function accountCurrency(table: Table, upto: number): string {
  const text = table.slice(0, Math.max(upto, 0)).flat().join(" ");
  const m = text.match(/\b(?:valuta|moneda|currency)\s*:?\s*(RON|EUR|USD|GBP)\b/i);
  return m ? m[1].toUpperCase() : "RON";
}

/**
 * Tabelul extrasului → tranzacții. `saved` = coloanele alese de utilizator data trecută pentru același antet.
 */
export function parseStatement(table: Table, saved?: Record<string, Mapping>): ParseResult {
  const rows = table.filter((r) => r.some((c) => c.trim()));
  if (!rows.length) throw new Error("Fișierul nu conține date.");

  const ing = findIngHeader(rows);
  if (ing) {
    const signature = headerSignature(rows[ing.row]);
    const transactions = parseIng(rows, ing, accountCurrency(rows, ing.row));
    return { status: "ok", bank: "ING", transactions, signature };
  }

  const { mapping, complete } = guessMapping(rows);
  const headers = rows[mapping.header] ?? [];
  const signature = headerSignature(headers);
  const currency = accountCurrency(rows, mapping.header);
  const chosen = saved?.[signature];
  if (chosen) {
    return { status: "ok", bank: bankLabel(rows, mapping), transactions: applyMapping(rows, chosen, currency), signature, mapping: chosen, headers };
  }
  if (complete) {
    const full = mapping as Mapping;
    const transactions = applyMapping(rows, full, currency);
    if (transactions.length) return { status: "ok", bank: bankLabel(rows, mapping), transactions, signature, mapping: full, headers };
  }
  return {
    status: "needs-mapping",
    signature,
    header: mapping.header,
    headers,
    sample: rows.slice(mapping.header + 1, mapping.header + 6),
    guess: mapping,
  };
}
