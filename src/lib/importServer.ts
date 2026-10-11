import readXlsxFile from "read-excel-file/node";
import { NextResponse } from "next/server";
import { isBetaDeployment } from "./beta";
import { getDb, getSetting, setSetting } from "./db";
import { suggestCategory, type ImportCategory, type ImportRule } from "./importRules";
import { decodeText, parseCsv, parseStatement, tableFromCells, type Mapping, type Table, type Transaction } from "./statementImport";

/** Importul extraselor e încă în beta: în producție rutele nu există. */
export function betaOnly(): NextResponse | null {
  return isBetaDeployment() ? null : NextResponse.json({ error: "Pagina nu există." }, { status: 404 });
}

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
};

/** Tranzacțiile cu categoria propusă și semnul că au mai fost importate. */
export async function preview(transactions: Transaction[]): Promise<{ rows: PreviewRow[]; categories: ImportCategory[] }> {
  const [categories, rules] = await Promise.all([userCategories(), userRules()]);
  const hashes = transactions.map((t) => t.hash);
  const existing = hashes.length
    ? await (await getDb())
        .prepare("SELECT import_hash FROM entries WHERE import_hash = ANY(?::text[])")
        .all<{ import_hash: string }>(hashes)
    : [];
  const seen = new Set(existing.map((r) => r.import_hash));
  const rows = transactions.map((t) => ({ ...t, ...suggestCategory(t, rules, categories), duplicate: seen.has(t.hash) }));
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
