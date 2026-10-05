import fs from "fs";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { money, monthLabel } from "../util";
import type { Receipt, ReceiptLine } from "./model";

/**
 * Bonul lunar ca PDF, în stilul unui bon de casă: hârtie îngustă cu margini rupte în zigzag,
 * font monospace, linii punctate, total mare și cod de bare. O singură pagină, cât de lungă e
 * nevoie (ca o rolă de casă). Fontul IBM Plex Mono (OFL) e inclus pentru diacriticele românești.
 */

const FONT_DIR = path.join(process.cwd(), "src/lib/receipt/fonts");

const PAGE_W = 260; // ≈ 92 mm, cu marginea gri din jurul bonului
const PAPER_W = 214; // ≈ 75 mm, lățimea rolei
const PAPER_X = (PAGE_W - PAPER_W) / 2;
const PAD = 13;
const LEFT = PAPER_X + PAD;
const RIGHT = PAPER_X + PAPER_W - PAD;
const TEXT_W = RIGHT - LEFT;
const TOOTH = 7; // lățimea unui dinte al marginii rupte
const TOOTH_H = 5;

const INK = rgb(0.13, 0.15, 0.16);
const SOFT = rgb(0.42, 0.45, 0.46);
const FAINT = rgb(0.62, 0.64, 0.64);
const PAPER = rgb(1, 0.993, 0.968);
const BACKDROP = rgb(0.91, 0.925, 0.91);
const LEU = rgb(0.239, 0.478, 0.306);
const ROSU = rgb(0.71, 0.27, 0.416);
const GOLD = rgb(0.894, 0.718, 0.298);
const CREAM = rgb(0.969, 0.941, 0.855);

type Fonts = { regular: PDFFont; bold: PDFFont };

/** Desenarea are două treceri: întâi doar măsoară înălțimea, apoi desenează pe pagina de mărimea potrivită. */
class Cursor {
  y = 0; // distanța de la marginea de sus a paginii
  constructor(
    readonly fonts: Fonts,
    readonly page: PDFPage | null,
    readonly height: number,
  ) {}

  private py(y: number) {
    return this.height - y;
  }

  gap(h: number) {
    this.y += h;
  }

  text(s: string, x: number, size: number, opts: { bold?: boolean; color?: RGB } = {}) {
    if (!this.page) return;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    this.page.drawText(s, { x, y: this.py(this.y), size, font, color: opts.color ?? INK });
  }

  width(s: string, size: number, bold = false) {
    return (bold ? this.fonts.bold : this.fonts.regular).widthOfTextAtSize(s, size);
  }

  /** Taie textul cu „…” ca să încapă în lățimea dată. */
  fit(s: string, size: number, max: number, bold = false) {
    if (this.width(s, size, bold) <= max) return s;
    let t = s;
    while (t.length > 1 && this.width(`${t}…`, size, bold) > max) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
  }

  line(size: number, height = size * 1.45) {
    this.y += height;
  }

  center(s: string, size: number, opts: { bold?: boolean; color?: RGB } = {}) {
    this.line(size);
    this.text(s, PAGE_W / 2 - this.width(s, size, opts.bold) / 2, size, opts);
  }

  /** Rând „etichetă ……… sumă”: eticheta la stânga (tăiată dacă e prea lungă), suma aliniată la dreapta. */
  row(label: string, value: string, size: number, opts: { bold?: boolean; color?: RGB; indent?: number; labelColor?: RGB } = {}) {
    this.line(size);
    const vw = this.width(value, size, opts.bold);
    const x = LEFT + (opts.indent ?? 0);
    const l = this.fit(label, size, RIGHT - vw - 8 - x, opts.bold);
    this.text(l, x, size, { bold: opts.bold, color: opts.labelColor ?? opts.color });
    this.text(value, RIGHT - vw, size, opts);
  }

  dashed(gapBefore = 5, gapAfter = 5) {
    this.y += gapBefore;
    if (this.page) {
      this.page.drawLine({
        start: { x: LEFT, y: this.py(this.y) },
        end: { x: RIGHT, y: this.py(this.y) },
        thickness: 0.6,
        color: FAINT,
        dashArray: [2.2, 2.2],
      });
    }
    this.y += gapAfter;
  }

  double(gapBefore = 6, gapAfter = 6) {
    this.y += gapBefore;
    if (this.page) {
      for (const d of [0, 2.4]) {
        this.page.drawLine({ start: { x: LEFT, y: this.py(this.y + d) }, end: { x: RIGHT, y: this.py(this.y + d) }, thickness: 0.7, color: INK });
      }
    }
    this.y += 2.4 + gapAfter;
  }
}

/** Moneda-siglă Leuța (aceeași formă ca în aplicație), desenată vectorial. */
function drawLogo(c: Cursor, size: number) {
  const top = c.y;
  c.gap(size);
  if (!c.page) return;
  const r = size / 2;
  const cx = PAGE_W / 2;
  const cy = c.height - (top + r);
  c.page.drawCircle({ x: cx, y: cy, size: r, color: LEU });
  c.page.drawCircle({ x: cx, y: cy, size: r * 0.86, borderColor: CREAM, borderWidth: 0.5, borderOpacity: 0.55, borderDashArray: [1, 1.3] });
  // „L”-ul cu piciorul ascendent din Logo.tsx (viewBox 64×64), scalat la mărimea monedei.
  const k = size / 64;
  c.page.drawSvgPath("M22.5 15.5h7v22.2l13.2-6.6 2.9 6.3-17.6 8.9c-2.6 1.3-5.5-.6-5.5-3.5V15.5z", {
    x: cx - r,
    y: cy + r,
    scale: k,
    color: CREAM,
  });
  c.page.drawCircle({ x: cx - r + 46.3 * k, y: cy + r - 27.6 * k, size: 3.1 * k, color: GOLD });
}

/** Cod de bare decorativ, deterministic (același bon → același cod). */
function drawBarcode(c: Cursor, seed: string, height = 26) {
  const top = c.y;
  c.gap(height);
  if (!c.page) return;
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const width = TEXT_W * 0.82;
  let x = PAGE_W / 2 - width / 2;
  const end = x + width;
  const y = c.height - (top + height);
  // Bare de start și de stop, ca la un cod real.
  const bar = (w: number) => {
    c.page!.drawRectangle({ x, y, width: w, height, color: INK });
    x += w;
  };
  bar(1.2); x += 1; bar(0.6); x += 1;
  while (x < end - 6) {
    const w = 0.5 + Math.floor(rand() * 3) * 0.55;
    bar(w);
    x += 0.6 + Math.floor(rand() * 3) * 0.55;
  }
  x = end - 3.4;
  bar(0.6); x += 1; bar(1.2);
}

function drawPaper(page: PDFPage, height: number) {
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height, color: BACKDROP });
  const top = height - 14;
  const bottom = 14;
  // umbră discretă
  page.drawRectangle({ x: PAPER_X + 2, y: bottom - 2, width: PAPER_W, height: top - bottom, color: rgb(0, 0, 0), opacity: 0.06 });
  // hârtia, cu marginile de sus și de jos „rupte” în zigzag
  const teeth = Math.round(PAPER_W / TOOTH);
  const tw = PAPER_W / teeth;
  let d = `M ${PAPER_X} ${TOOTH_H}`;
  for (let i = 0; i < teeth; i++) d += ` L ${PAPER_X + tw * (i + 0.5)} 0 L ${PAPER_X + tw * (i + 1)} ${TOOTH_H}`;
  const paperH = top - bottom;
  d += ` L ${PAPER_X + PAPER_W} ${paperH - TOOTH_H}`;
  for (let i = teeth - 1; i >= 0; i--) d += ` L ${PAPER_X + tw * (i + 0.5)} ${paperH} L ${PAPER_X + tw * i} ${paperH - TOOTH_H}`;
  d += " Z";
  page.drawSvgPath(d, { x: 0, y: top, color: PAPER });
}

const fmtDate = (d: Date) =>
  d.toLocaleString("ro-RO", { timeZone: "Europe/Bucharest", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function render(c: Cursor, r: Receipt) {
  c.gap(14 + TOOTH_H + 12);
  drawLogo(c, 34);
  c.gap(4);
  c.center("L E U Ț A", 15, { bold: true });
  c.gap(1);
  c.center("BUGET PERSONAL · BAN CU BAN", 6.6, { color: SOFT });
  c.center("BON NEFISCAL · DOCUMENT INFORMATIV", 5.8, { color: FAINT });

  c.dashed(8, 3);
  c.row("TITULAR", r.holder.toUpperCase() || "—", 7);
  c.row("LUNA", monthLabel(r.month).toUpperCase(), 7, { bold: true });
  c.row(`BON NR. ${r.number}`, fmtDate(r.issuedAt), 7, { color: SOFT });
  c.dashed(5, 2);

  if (!r.hasData) {
    c.gap(6);
    c.center("NICIO ÎNREGISTRARE ÎN ACEASTĂ LUNĂ", 7, { color: SOFT });
    c.gap(4);
  }

  for (const s of r.sections) {
    c.gap(4);
    c.row(s.title, `${s.lines.length} POZ.`, 7.4, { bold: true, color: SOFT, labelColor: INK });
    c.gap(1);
    for (const l of s.lines) lineItem(c, l, r.eurRate);
    c.gap(1);
    c.row("", `SUBTOTAL ${money(s.subtotal)}`, 7, { bold: true });
    c.dashed(5, 1);
  }

  c.gap(3);
  c.row("TOTAL VENITURI", money(r.totals.income), 7.6, { bold: true });
  c.row("TOTAL CHELTUIELI", minusSign(r.totals.spent), 7.6);
  c.row("ECONOMII ȘI INVESTIȚII", minusSign(r.totals.saved), 7.6);
  c.double(7, 4);

  const minus = r.totals.unallocated < 0;
  c.line(9, 12);
  c.text(minus ? "DEPĂȘIRE" : "REST NEALOCAT", LEFT, 9, { bold: true });
  const total = `${money(Math.abs(r.totals.unallocated))} LEI`;
  c.text(total, RIGHT - c.width(total, 13.5, true), 13.5, { bold: true, color: minus ? ROSU : LEU });
  c.gap(5);
  c.double(3, 4);

  c.row("RATA DE ECONOMISIRE", `${r.totals.savingsRate.toLocaleString("ro-RO", { maximumFractionDigits: 1 })}%`, 6.8, { color: SOFT });
  c.row(`CURS BNR 1 EUR${r.eurRateDate ? ` (${r.eurRateDate.split("-").reverse().join(".")})` : ""}`, `${r.eurRate.toFixed(4).replace(".", ",")} LEI`, 6.8, { color: SOFT });
  if (r.sections.some((s) => s.lines.some((l) => l.eur))) {
    c.center("Sumele în EUR sunt convertite la cursul lunii.", 5.8, { color: FAINT });
  }
  c.dashed(6, 8);

  const code = `LEU ${r.month.replace("-", " ")} ${String(r.userId).padStart(4, "0")} ${r.number}`;
  drawBarcode(c, code);
  c.gap(2);
  c.center(code, 6, { color: SOFT });
  c.gap(8);
  c.center("*** VĂ MULȚUMIM! ***", 8.4, { bold: true });
  c.gap(1);
  c.center("Păstrați bonul pentru evidența", 6.2, { color: SOFT });
  c.center("bugetului dumneavoastră.", 6.2, { color: SOFT });
  c.gap(3);
  c.center("leuta.vercel.app", 6.2, { color: FAINT });
  c.gap(14 + TOOTH_H + 12);
}

/** „-1.234,56” pentru sume scăzute din venit; fără semn la zero (nu „-0,00”). */
const minusSign = (n: number) => (Math.abs(n) < 0.005 ? money(0) : `-${money(n)}`);

function lineItem(c: Cursor, l: ReceiptLine, rate: number) {
  c.row(l.label, money(l.amount), 7.2);
  if (l.eur) c.row(`  ${money(l.eur)} EUR × ${rate.toFixed(4).replace(".", ",")}`, "", 6.2, { color: SOFT });
  if (l.note) {
    c.line(6.2, 8.2);
    c.text(c.fit(`  ${l.note}`, 6.2, TEXT_W), LEFT, 6.2, { color: SOFT });
  }
}

let fontBytes: { regular: Buffer; bold: Buffer } | null = null;

export async function renderReceiptPdf(r: Receipt): Promise<Uint8Array> {
  fontBytes ??= {
    regular: fs.readFileSync(path.join(FONT_DIR, "IBMPlexMono-Regular.ttf")),
    bold: fs.readFileSync(path.join(FONT_DIR, "IBMPlexMono-Bold.ttf")),
  };
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts: Fonts = {
    regular: await doc.embedFont(fontBytes.regular, { subset: true }),
    bold: await doc.embedFont(fontBytes.bold, { subset: true }),
  };
  doc.setTitle(`Bonul lunii ${monthLabel(r.month)} · Leuța`);
  doc.setAuthor("Leuța");
  doc.setSubject("Venituri și cheltuieli lunare");
  doc.setCreator("Leuța · leuta.vercel.app");
  doc.setLanguage("ro-RO");

  const measure = new Cursor(fonts, null, 0);
  render(measure, r);
  const height = Math.ceil(measure.y);

  const page = doc.addPage([PAGE_W, height]);
  drawPaper(page, height);
  render(new Cursor(fonts, page, height), r);
  return doc.save();
}

export const receiptFilename = (month: string) => `Leuta-bon-${month}.pdf`;
