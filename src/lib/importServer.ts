import readXlsxFile from "read-excel-file/node";
import { getDb, getSetting, setSetting } from "./db";
import { suggestCategory, type ImportCategory, type ImportRule } from "./importRules";
import {
  decodeText, matchExisting, parseCsv, parseStatement, tableFromCells,
  type ExistingEntry, type Mapping, type Table, type Transaction,
} from "./statementImport";

export async function readStatementFile(file: File): Promise<Table> {
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  if (name.endsWith(".xls")) {
    throw new Error("Formatul vechi .xls nu e suportat. Descarcă extrasul ca .xlsx sau .csv.");
  }
  if (name.endsWith(".xlsx")) {
    const sheets = await readXlsxFile(buf);
    if (!sheets.length) return [];
    // Foaia cu cele mai multe rânduri e, de regulă, cea cu tranzacțiile.
    const sheet = sheets.reduce((a, b) => (b.data.length > a.data.length ? b : a));
    return tableFromCells(sheet.data as unknown[][]);
  }
  if (name.endsWith(".csv") || name.endsWith(".txt")) return parseCsv(decodeText(buf));
  throw new Error("Format nesuportat. Încarcă extrasul ca fișier .csv sau .xlsx.");
}

// Coloanele alese de utilizator, după semnătura antetului (o cheie în setările lui).
const MAPPINGS_KEY = "import_mappings";

export async function savedMappings(): Promise<Record<string, Mapping>> {
  try {
    return JSON.parse((await getSetting(MAPPINGS_KEY)) ?? "{}");
  } catch {
    return {};
  }
}

export async function saveMapping(signature: string, mapping: Mapping) {
  const all = await savedMappings();
  delete all[signature];
  const kept = Object.entries(all).slice(-19); // cele mai recente 20 de formate ajung
  await setSetting(MAPPINGS_KEY, JSON.stringify(Object.fromEntries([...kept, [signature, mapping]])));
}

export function validMapping(m: unknown, columns: number): m is Mapping {
  if (!m || typeof m !== "object") return false;
  const x = m as Record<string, unknown>;
  const col = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < columns;
  const opt = (v: unknown) => v === undefined || col(v);
  return (
    Number.isInteger(x.header) && (x.header as number) >= 0 &&
    col(x.date) && opt(x.amount) && opt(x.debit) && opt(x.credit) && opt(x.currency) &&
    (x.amount !== undefined || x.debit !== undefined || x.credit !== undefined) &&
    Array.isArray(x.description) && x.description.length > 0 && x.description.length <= 5 && x.description.every(col)
  );
}

export async function userCategories(): Promise<ImportCategory[]> {
  return (await getDb()).prepare("SELECT id, name, kind FROM categories ORDER BY kind, name").all<ImportCategory>();
}

export async function userRules(): Promise<ImportRule[]> {
  return (await getDb()).prepare("SELECT pattern, category_id FROM import_rules").all<ImportRule>();
}

export type PreviewRow = Transaction & {
  categoryId: number | null;
  source: "rule" | "auto" | null;
  duplicate: boolean;
  /** Intrarea trecută deja de mână pentru aceeași tranzacție; rămâne cum e, iar tranzacția nu se bifează. */
  existing: { description: string; category: string | null } | null;
};

/** Intrările care nu vin din import, din perioada extrasului, cu ziua lor în ora României. */
async function manualEntries(transactions: Transaction[]): Promise<ExistingEntry[]> {
  const days = transactions.flatMap((t) => [t.date, t.posted]).sort();
  if (!days.length) return [];
  return (await getDb())
    .prepare(
      `SELECT e.id, to_char(e.created_at AT TIME ZONE 'Europe/Bucharest', 'YYYY-MM-DD') AS day, e.kind, e.amount, e.currency,
              e.description, c.name AS category
       FROM entries e LEFT JOIN categories c ON c.id = e.category_id
       WHERE e.import_hash IS NULL
         AND e.created_at >= ?::date::timestamp AT TIME ZONE 'Europe/Bucharest'
         AND e.created_at < (?::date + 1)::timestamp AT TIME ZONE 'Europe/Bucharest'
       ORDER BY e.id`,
    )
    .all<ExistingEntry>(days[0], days[days.length - 1]);
}

/** Tranzacțiile cu categoria propusă, semnul că au mai fost importate și intrarea trecută deja de mână. */
export async function preview(transactions: Transaction[]): Promise<{ rows: PreviewRow[]; categories: ImportCategory[] }> {
  const [categories, rules, manual] = await Promise.all([userCategories(), userRules(), manualEntries(transactions)]);
  const hashes = transactions.map((t) => t.hash);
  const imported = hashes.length
    ? await (await getDb())
        .prepare("SELECT import_hash FROM entries WHERE import_hash = ANY(?::text[])")
        .all<{ import_hash: string }>(hashes)
    : [];
  const seen = new Set(imported.map((r) => r.import_hash));
  // Tranzacțiile importate deja nu „consumă” intrări trecute de mână.
  const fresh = transactions.filter((t) => !seen.has(t.hash));
  const found = matchExisting(fresh, manual);
  const matches = new Map(fresh.map((t, i) => [t, found[i]]));
  const rows = transactions.map((t) => {
    const match = matches.get(t);
    return {
      ...t,
      ...suggestCategory(t, rules, categories),
      duplicate: seen.has(t.hash),
      existing: match ? { description: match.description, category: match.category } : null,
    };
  });
  return { rows, categories };
}

export async function parseUpload(file: File, mapping?: { signature: string; mapping: unknown }) {
  const table = await readStatementFile(file);
  const saved = await savedMappings();
  if (mapping) {
    const width = Math.max(0, ...table.map((r) => r.length));
    if (!validMapping(mapping.mapping, width)) throw new Error("Alege cel puțin coloana cu data, suma și descrierea.");
    saved[mapping.signature] = mapping.mapping;
  }
  const result = parseStatement(table, saved);
  if (result.status === "ok" && mapping && result.signature === mapping.signature) {
    await saveMapping(mapping.signature, mapping.mapping as Mapping);
  }
  return result;
}
