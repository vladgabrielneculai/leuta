import * as XLSX from "xlsx";

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

export type ParsedScheduleRow = {
  installment_nr: number;
  month: string; // YYYY-MM
  balance_start: number;
  principal: number;
  interest: number;
  fee: number;
  payment: number;
  balance_end: number;
  is_paid: number;
};

export function cleanNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  let str = String(val).trim();
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
  }

  const n = parseFloat(str.replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

export function parseDateToMonth(val: unknown, fallbackMonth?: string): string {
  if (!val) return fallbackMonth ?? new Date().toISOString().slice(0, 7);
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

export function parseExcelBuffer(buffer: Buffer): ParsedScheduleRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  if (!wb.SheetNames.length) return [];

  // Alege prima foaie sau foaia cu cel mai relevant nume
  let sheetName = wb.SheetNames[0];
  for (const name of wb.SheetNames) {
    const l = name.toLowerCase();
    if (l.includes("scadent") || l.includes("grafic") || l.includes("rate") || l.includes("amortiz")) {
      sheetName = name;
      break;
    }
  }

  const sheet = wb.Sheets[sheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
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

export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedScheduleRow[]> {
  let text = "";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfMod = require("pdf-parse");
    if (typeof pdfMod === "function") {
      const data = await pdfMod(buffer);
      text = data.text || "";
    } else if (pdfMod && pdfMod.PDFParse) {
      const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const instance = new pdfMod.PDFParse(uint8);
      text = (await instance.getText()) || "";
    } else if (pdfMod && typeof pdfMod.default === "function") {
      const data = await pdfMod.default(buffer);
      text = data.text || "";
    } else {
      throw new Error("Modulul PDF nu a putut fi inițializat.");
    }
  } catch (err: any) {
    console.error("Eroare la parsarea PDF:", err);
    throw new Error(err instanceof Error ? err.message : "Nu s-a putut citi conținutul fișierului PDF.");
  }

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const result: ParsedScheduleRow[] = [];
  let runningNumber = 1;

  // Căutăm linii care conțin: [număr] [dată] [sold] [principal] [dobândă] [rată]
  // Exemple frecvente în PDF-urile băncilor din România:
  // "1 15.04.2024 320.000,00 550,20 1.560,80 2.111,00 319.449,80"
  // "1 2024-04-15 320000 550.20 1560.80 2111.00 319449.80"
  const dateRegex = /(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}-\d{2}-\d{2})/;

  for (const line of lines) {
    if (!dateRegex.test(line)) continue;

    // Împarte linia după spații
    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length < 4) continue;

    // Găsește indexul token-ului care conține data
    const dateIdx = tokens.findIndex((t) => dateRegex.test(t));
    if (dateIdx === -1) continue;

    const monthStr = parseDateToMonth(tokens[dateIdx]);
    let installment_nr = dateIdx > 0 ? parseInt(tokens[dateIdx - 1], 10) : runningNumber;
    if (isNaN(installment_nr) || installment_nr <= 0) installment_nr = runningNumber;

    // Numerele care urmează după dată
    const numbersAfter = tokens.slice(dateIdx + 1).map(cleanNum).filter((n) => !isNaN(n));
    if (numbersAfter.length < 2) continue;

    // Interpretare coloane:
    // Format A: [sold_start, principal, dobanda, rata, sold_end]
    // Format B: [principal, dobanda, rata, sold_end]
    // Format C: [principal, dobanda, rata]
    let bStart = 0;
    let princ = 0;
    let dob = 0;
    let pmt = 0;
    let bEnd = 0;

    if (numbersAfter.length >= 5) {
      bStart = numbersAfter[0];
      princ = numbersAfter[1];
      dob = numbersAfter[2];
      pmt = numbersAfter[3];
      bEnd = numbersAfter[4];
    } else if (numbersAfter.length === 4) {
      princ = numbersAfter[0];
      dob = numbersAfter[1];
      pmt = numbersAfter[2];
      bEnd = numbersAfter[3];
    } else if (numbersAfter.length >= 3) {
      princ = numbersAfter[0];
      dob = numbersAfter[1];
      pmt = numbersAfter[2];
    } else {
      princ = numbersAfter[0];
      dob = numbersAfter[1];
      pmt = princ + dob;
    }

    if (princ === 0 && dob === 0 && pmt === 0) continue;

    result.push({
      installment_nr,
      month: monthStr,
      balance_start: bStart,
      principal: princ,
      interest: dob,
      fee: 0,
      payment: pmt || princ + dob,
      balance_end: bEnd,
      is_paid: 0,
    });

    runningNumber++;
  }

  return result;
}

