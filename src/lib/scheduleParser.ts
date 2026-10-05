import readXlsxFile from "read-excel-file/node";
import type { ScheduleRow } from "./loan";

// Polyfills pentru API-urile DOM de browser necesare în mediul Node.js pentru parsarea fișierelor PDF
if (typeof (globalThis as any).DOMMatrix === "undefined") {
  class SimpleDOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    is2D = true;
    isIdentity = true;
    constructor(init?: any) {
      if (Array.isArray(init) && init.length >= 6) {
        this.a = this.m11 = init[0];
        this.b = this.m12 = init[1];
        this.c = this.m21 = init[2];
        this.d = this.m22 = init[3];
        this.e = this.m41 = init[4];
        this.f = this.m42 = init[5];
      }
    }
    multiply() { return this; }
    preMultiplySelf() { return this; }
    multiplySelf() { return this; }
    invertSelf() { return this; }
    translate() { return this; }
    scale() { return this; }
    rotate() { return this; }
    transformPoint(p?: any) { return p || { x: 0, y: 0, z: 0, w: 1 }; }
    toFloat32Array() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
    toFloat64Array() { return new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
  }
  (globalThis as any).DOMMatrix = SimpleDOMMatrix;
  if (typeof global !== "undefined") (global as any).DOMMatrix = SimpleDOMMatrix;
}

if (typeof (globalThis as any).Path2D === "undefined") {
  class SimplePath2D {
    addPath() {}
    closePath() {}
    moveTo() {}
    lineTo() {}
    bezierCurveTo() {}
    quadraticCurveTo() {}
    arc() {}
    arcTo() {}
    ellipse() {}
    rect() {}
  }
  (globalThis as any).Path2D = SimplePath2D;
  if (typeof global !== "undefined") (global as any).Path2D = SimplePath2D;
}

if (typeof (globalThis as any).ImageData === "undefined") {
  class SimpleImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
      this.data = new Uint8ClampedArray(w * h * 4);
    }
  }
  (globalThis as any).ImageData = SimpleImageData;
  if (typeof global !== "undefined") (global as any).ImageData = SimpleImageData;
}

export type ParsedScheduleRow = ScheduleRow & {
  date?: string; // YYYY-MM-DD, data exactă a plății (doar la import, nu se salvează)
};

/** Datele generale ale creditului citite din antetul graficului (ex. BCR). */
export type ScheduleMeta = {
  bank?: string;
  principal?: number; // suma împrumutată
  currentBalance?: number; // credit actual (sold la data graficului)
  startDate?: string; // data primirii creditului, YYYY-MM-DD
  contractNr?: string;
  scheduleType?: "annuity" | "declining";
  ratePeriods: { rate: number; from: string; to: string }[]; // datele în format YYYY-MM-DD
  generatedAt?: string; // YYYY-MM-DD
  totals?: { principal: number; interest: number; fees: number; payment: number };
};

/**
 * Transformă un număr scris în format românesc sau englezesc. În graficele băncilor românești punctul
 * e separator de mii, iar virgula de zecimale („204.000”, „1.092,27”), dar dobânzile apar cu punct („4.79”).
 */
export function cleanNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  let str = String(val).trim().replace(/\s/g, "");
  if (!str) return 0;

  // Format românesc (12.345,67) vs englezesc (12,345.67)
  if (str.includes(".") && str.includes(",")) {
    if (str.lastIndexOf(",") > str.lastIndexOf(".")) {
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      str = str.replace(/,/g, "");
    }
  } else if (str.includes(",")) {
    str = str.replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(str)) {
    str = str.replace(/\./g, ""); // „204.000” = 204 de mii
  }

  const n = parseFloat(str.replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

export function parseDateToMonth(val: unknown, fallbackMonth?: string): string {
  if (!val) return fallbackMonth ?? new Date().toISOString().slice(0, 7);
  if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString().slice(0, 7);
  const str = String(val).trim();

  // YYYY-MM
  if (/^\d{4}-\d{2}$/.test(str)) return str;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 7);

  // DD.MM.YYYY sau DD/MM/YYYY
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(str);
  if (dmy) {
    const mm = dmy[2].padStart(2, "0");
    const yyyy = dmy[3];
    return `${yyyy}-${mm}`;
  }

  // MM.YYYY sau MM/YYYY
  const my = /^(\d{1,2})[./-](\d{4})/.exec(str);
  if (my) {
    const mm = my[1].padStart(2, "0");
    const yyyy = my[2];
    return `${yyyy}-${mm}`;
  }

  // Numar de serie Excel
  if (typeof val === "number" && val > 30000 && val < 60000) {
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 7);
  }

  return fallbackMonth ?? new Date().toISOString().slice(0, 7);
}

/** CSV simplu: separator „;”, „,” sau tab (detectat din primul rând), câmpuri între ghilimele. */
function parseCsv(text: string): string[][] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const first = lines[0];
  const sep = [";", "\t", ","].map((c) => [c, first.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  return lines.map((line) => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === sep) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  });
}

/** Rândurile tabelului dintr-un fișier .xlsx (foaia cu numele cel mai relevant) sau .csv. */
async function spreadsheetRows(buffer: Buffer, filename: string): Promise<unknown[][]> {
  const name = filename.toLowerCase();
  if (name.endsWith(".csv")) return parseCsv(buffer.toString("utf8"));
  if (name.endsWith(".xls")) {
    throw new Error("Formatul vechi .xls nu e suportat. Deschide fișierul în Excel și salvează-l ca .xlsx sau .csv.");
  }
  const sheets = await readXlsxFile(buffer);
  if (!sheets.length) return [];
  const pick =
    sheets.find((s) => /scadent|grafic|rate|amortiz/i.test(s.sheet)) ?? sheets[0];
  return pick.data as unknown[][];
}

export async function parseSpreadsheet(buffer: Buffer, filename: string): Promise<ParsedScheduleRow[]> {
  const rows = await spreadsheetRows(buffer, filename);
  if (!rows || rows.length < 2) return [];

  // 1. Identifică rândul de antet (header)
  let headerRowIdx = -1;
  let colNr = -1;
  let colDate = -1;
  let colStart = -1;
  let colPrinc = -1;
  let colInt = -1;
  let colFee = -1;
  let colPmt = -1;
  let colEnd = -1;

  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    let nr = -1, dt = -1, pr = -1, int = -1, tot = -1, bs = -1, be = -1, fe = -1;

    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] ?? "").trim().toLowerCase();
      if (!cell) continue;

      if (cell === "nr" || cell === "nr." || cell === "nr. rata" || cell === "nr rata" || cell === "nr crt" || cell === "rata nr") nr = c;
      if (cell.includes("data") || cell.includes("scadent") || cell.includes("luna")) dt = c;
      if (cell.includes("principal") || cell.includes("capital") || cell.includes("rata capital")) pr = c;
      if (cell.includes("doband") || cell.includes("dobind") || cell.includes("dob.")) int = c;
      if (cell.includes("comision") || cell.includes("asigur") || cell.includes("costuri")) fe = c;
      if (cell.includes("total") || cell.includes("rata lunara") || (cell === "rata" && pr !== c) || cell.includes("de plata")) tot = c;
      if (cell.includes("sold init") || cell.includes("sold credit") || cell.includes("sold anterior") || cell === "sold") bs = c;
      if (cell.includes("sold fin") || cell.includes("sold ramas") || cell.includes("sold dupa")) be = c;
    }

    // Un rând este considerat header dacă conține măcar principal / dobândă / rată
    if ((pr !== -1 || int !== -1 || tot !== -1) && (dt !== -1 || nr !== -1)) {
      headerRowIdx = r;
      colNr = nr;
      colDate = dt;
      colPrinc = pr;
      colInt = int;
      colFee = fe;
      colPmt = tot;
      colStart = bs;
      colEnd = be;
      break;
    }
  }

  const result: ParsedScheduleRow[] = [];
  const startRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;
  let runningNumber = 1;

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    // Extrage valorile
    let installment_nr = colNr !== -1 ? parseInt(String(row[colNr]), 10) : runningNumber;
    if (isNaN(installment_nr) || installment_nr <= 0) installment_nr = runningNumber;

    const monthStr = colDate !== -1 ? parseDateToMonth(row[colDate]) : "";
    const principal = colPrinc !== -1 ? cleanNum(row[colPrinc]) : 0;
    const interest = colInt !== -1 ? cleanNum(row[colInt]) : 0;
    const fee = colFee !== -1 ? cleanNum(row[colFee]) : 0;
    let payment = colPmt !== -1 ? cleanNum(row[colPmt]) : principal + interest + fee;
    if (payment === 0 && (principal > 0 || interest > 0)) payment = principal + interest + fee;

    const bStart = colStart !== -1 ? cleanNum(row[colStart]) : 0;
    const bEnd = colEnd !== -1 ? cleanNum(row[colEnd]) : Math.max(0, bStart - principal);

    // Ignoră rândurile totalizatoare sau goale
    if (principal === 0 && interest === 0 && payment === 0) continue;

    result.push({
      installment_nr,
      month: monthStr || new Date().toISOString().slice(0, 7),
      balance_start: bStart,
      principal,
      interest,
      fee,
      payment,
      balance_end: bEnd,
      is_paid: 0,
    });

    runningNumber++;
  }

  return result;
}

type PdfTextItem = { str: string; transform: number[] };

/**
 * Textul fiecărei pagini reconstruit pe rânduri, după pozițiile din PDF. Celulele de pe același rând
 * se despart prin tab. Fără asta, pdf-parse lipește coloanele („12026-10-07287,84753,65…”).
 */
async function pdfLines(buffer: Buffer): Promise<string[]> {
  const render = async (page: { getTextContent: (o: object) => Promise<{ items: PdfTextItem[] }> }) => {
    const content = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: true });
    const byY = new Map<number, { x: number; s: string }[]>();
    for (const it of content.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      const key = [...byY.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      if (!byY.has(key)) byY.set(key, []);
      byY.get(key)!.push({ x: it.transform[4], s: it.str });
    }
    return [...byY.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, cells]) => cells.sort((a, b) => a.x - b.x).map((c) => c.s.trim()).join("\t"))
      .join("\n");
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfMod = require("pdf-parse");
    const fn = typeof pdfMod === "function" ? pdfMod : pdfMod?.default;
    if (typeof fn !== "function") throw new Error("Modulul PDF nu a putut fi inițializat.");
    const data = await fn(buffer, { pagerender: render });
    return String(data.text || "").split("\n").map((l: string) => l.trim()).filter(Boolean);
  } catch (err) {
    console.error("Eroare la parsarea PDF:", err);
    throw new Error(err instanceof Error ? err.message : "Nu s-a putut citi conținutul fișierului PDF.");
  }
}

const isoDate = (d: string) => {
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(d);
  return dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : d;
};

/** Antetul graficului: suma, soldul actual, data acordării, dobânzile pe perioade, nr. contract. */
export function parseScheduleMeta(lines: string[]): ScheduleMeta {
  // Spațiile și tab-urile se pierd/inserează aleator în PDF („Suma î mprumutată”), deci căutăm fără ele.
  const flat = lines.join(" ").replace(/\s+/g, "");
  const flatLower = flat.toLowerCase();
  const meta: ScheduleMeta = { ratePeriods: [] };

  if (/bancacomercial[ăa]rom[âa]n[ăa]|bcr/i.test(flat)) meta.bank = "BCR";
  const num = (re: RegExp) => {
    const m = re.exec(flat);
    return m ? cleanNum(m[1]) : undefined;
  };
  meta.principal = num(/[îi]mprumutat[ăa]:([\d.,]+?)(?=[A-Za-zĂÂÎȘȚăâîșț]|$)/);
  meta.currentBalance = num(/Creditactual:([\d.,]+?)(?=[A-Za-zĂÂÎȘȚăâîșț]|$)/i);
  const start = /primiriiCreditului:(\d{4}-\d{2}-\d{2}|\d{2}[.-]\d{2}[.-]\d{4})/i.exec(flat);
  if (start) meta.startDate = isoDate(start[1]);
  const contract = /Nr\.?Contract:(\d+)/i.exec(flat);
  if (contract) meta.contractNr = contract[1];
  if (flatLower.includes("anuit") || flatLower.includes("ratelunaretotaleegale")) meta.scheduleType = "annuity";
  else if (flatLower.includes("descresc")) meta.scheduleType = "declining";

  const periodRe = /(\d{1,2}[.,]\d{1,4})\[(\d{2}-\d{2}-\d{4}),(\d{2}-\d{2}-\d{4})\]/g;
  for (const m of flat.matchAll(periodRe)) {
    meta.ratePeriods.push({ rate: cleanNum(m[1]), from: isoDate(m[2]), to: isoDate(m[3]) });
  }

  const gen = lines.map((l) => /^(\d{2}-\d{2}-\d{4})\s+\d{2}:\d{2}/.exec(l)).find(Boolean);
  if (gen) meta.generatedAt = isoDate(gen[1]);

  const totalLine = lines.find((l) => /^Total\t/i.test(l));
  if (totalLine) {
    const n = totalLine.split("\t").slice(1).map(cleanNum);
    if (n.length >= 4) {
      meta.totals = {
        principal: n[0],
        interest: n[1],
        fees: n.slice(2, n.length - 1).reduce((s, v) => s + v, 0),
        payment: n[n.length - 1],
      };
    }
  }
  return meta;
}

const NUM_CELL = /^-?[\d.,]+$/;
const DATE_CELL = /^(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}-\d{2}-\d{2})$/;

/**
 * Un rând de rată: [nr] dată și apoi coloanele numerice. Coloanele se deduc din valori:
 *  - BCR: principal, dobândă, comision administrare, asigurare, comision gestiune,
 *    dobândă regularizată, total rată, sold — total ≈ suma celor dinainte, ultimul e soldul;
 *  - alte bănci: [sold inițial,] principal, dobândă, [costuri…,] rată, [sold final].
 */
function parseRowCells(cells: string[], bcr: boolean): Omit<ParsedScheduleRow, "installment_nr" | "is_paid"> | null {
  const dateIdx = cells.findIndex((c) => DATE_CELL.test(c));
  if (dateIdx === -1) return null;
  const nums = cells.slice(dateIdx + 1).filter((c) => NUM_CELL.test(c)).map(cleanNum);
  if (nums.length < 2) return null;
  const date = isoDate(cells[dateIdx]);
  const month = parseDateToMonth(date);
  const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.0005);

  let principal = 0, interest = 0, fee = 0, payment = 0, balanceStart = 0, balanceEnd = 0;

  if (bcr && nums.length === 8) {
    [principal, interest] = nums;
    fee = nums[2] + nums[3] + nums[4];
    interest += nums[5];
    payment = nums[6];
    balanceEnd = nums[7];
  } else if (nums.length >= 4 && close(nums[nums.length - 2], nums.slice(0, -2).reduce((s, v) => s + v, 0))) {
    // [principal, dobândă, costuri…, total, sold final]
    principal = nums[0];
    interest = nums[1];
    fee = nums.slice(2, -2).reduce((s, v) => s + v, 0);
    payment = nums[nums.length - 2];
    balanceEnd = nums[nums.length - 1];
  } else if (nums.length >= 5 && close(nums[0] - nums[1], nums[nums.length - 1])) {
    // [sold inițial, principal, dobândă, costuri…, rată, sold final]
    balanceStart = nums[0];
    principal = nums[1];
    interest = nums[2];
    fee = nums.slice(3, -2).reduce((s, v) => s + v, 0);
    payment = nums[nums.length - 2];
    balanceEnd = nums[nums.length - 1];
  } else if (nums.length >= 4) {
    [principal, interest, payment, balanceEnd] = nums;
  } else if (nums.length === 3) {
    [principal, interest, payment] = nums;
  } else {
    [principal, interest] = nums;
  }
  if (!payment) payment = principal + interest + fee;
  if (principal === 0 && interest === 0 && payment === 0) return null;
  return { date, month, balance_start: balanceStart, principal, interest, fee, payment, balance_end: balanceEnd };
}

export async function parsePdf(buffer: Buffer): Promise<{ rows: ParsedScheduleRow[]; meta: ScheduleMeta }> {
  const lines = await pdfLines(buffer);
  const meta = parseScheduleMeta(lines);
  const bcr = meta.bank === "BCR";

  const result: ParsedScheduleRow[] = [];
  for (const line of lines) {
    const cells = line.split("\t").map((c) => c.trim()).filter(Boolean);
    if (!cells.some((c) => DATE_CELL.test(c))) continue;
    const row = parseRowCells(cells, bcr);
    if (!row) continue;
    const nr = parseInt(cells[0], 10);
    result.push({ ...row, installment_nr: Number.isFinite(nr) && nr > 0 && !DATE_CELL.test(cells[0]) ? nr : result.length + 1, is_paid: 0 });
  }

  // Soldul de la începutul fiecărei rate = soldul de după rata anterioară (prima: sold + principal).
  for (let i = 0; i < result.length; i++) {
    const r = result[i];
    if (!r.balance_start) r.balance_start = i === 0 ? r.balance_end + r.principal : result[i - 1].balance_end;
    if (!r.balance_end && i < result.length - 1) r.balance_end = Math.max(0, r.balance_start - r.principal);
  }
  if (meta.currentBalance === undefined && result.length) meta.currentBalance = result[0].balance_start;
  return { rows: result, meta };
}

/** Compatibilitate: doar ratele. */
export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedScheduleRow[]> {
  return (await parsePdf(buffer)).rows;
}
