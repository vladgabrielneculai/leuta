import fs from "fs";
import path from "path";
import { ImageResponse } from "next/og";
import { barcodeBars, barcodeDigits } from "../barcode";
import { C as TONE, TINT, type Message, type Tone } from "./render";
import { TIME_ZONE } from "./time";

/**
 * Notificarea ca imagine (PNG) în stilul bonului de casă, trimisă pe Telegram ca fotografie.
 *
 * Fontul e monospace (IBM Plex Mono, ca în aplicație și în bonul PDF): fiecare caracter are 0,6 din
 * mărimea fontului, deci textul se așază pe „coloane”, exact ca la o imprimantă de bonuri. Așa putem
 * rupe rândurile și umple spațiul cu puncte dinainte, iar înălțimea imaginii se calculează exact
 * (Satori, motorul din spatele ImageResponse, cere dimensiunile din start).
 */

const W = 600; // lățimea imaginii
const MARGIN = 24; // „masa” din jurul bonului
const PAD_X = 36; // marginea interioară a hârtiei
const CONTENT_W = W - 2 * (MARGIN + PAD_X); // 480
const TOOTH_W = 12;
const TOOTH_H = 7;
const CHAR = 0.6; // lățimea unui caracter, în em

const BASE = 20; // 40 de coloane
const SMALL = 16; // 50 de coloane
const TITLE = 26; // 30 de coloane
const CALLOUT = 18;

const COLOR = {
  table: "#EAE5DB",
  paper: "#FDFBF6",
  ink: "#1F1D1A",
  soft: "#5C564D",
  faint: "#8C857A",
  rule: "#B9B0A0",
};
const BANDS = ["#3D7A4E", "#6A4E99", "#B5456A", "#C99A1E", "#2E5C8A"];

const cols = (size: number, width = CONTENT_W) => Math.floor(width / (size * CHAR));
const lineH = (size: number) => Math.round(size * 1.45);

// ---------- Text ----------

/** Fără emoji: fontul bonului nu le are (Satori ar încerca să le descarce de pe internet). */
const clean = (s: string) =>
  s
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍]/gu, "")
    .replace(/[ \t\r\n]+/g, " ")
    .trim()
    // Suma și moneda rămân pe același rând („288.405,73 lei”, nu „288.405,73” / „lei”).
    .replace(/(\d) (lei|€|EUR)(?=$|[\s.,;:)·])/g, "$1 $2");

/** Rupe textul pe cuvinte în rânduri de cel mult `n` caractere (cuvintele prea lungi se taie). */
export function wrap(text: string, n: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (let word of clean(text).split(" ")) {
    word = word.replace(/ /g, " ");
    while (word.length > n) {
      if (cur) out.push(cur), (cur = "");
      out.push(word.slice(0, n));
      word = word.slice(n);
    }
    if (!word) continue;
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= n) cur += ` ${word}`;
    else out.push(cur), (cur = word);
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

// ---------- Blocuri ----------

type Seg = { t: string; c?: string; b?: boolean };
type Block =
  | { k: "line"; segs: Seg[]; size: number; align?: "left" | "center"; indent?: number }
  | { k: "split"; left: Seg[]; right: Seg[]; size: number }
  | { k: "gap"; h: number }
  | { k: "bar"; pct: number; color: string }
  | { k: "box"; lines: string[]; tone: Tone }
  | { k: "bands" }
  | { k: "logo" }
  | { k: "barcode"; seed: string };

const BOX_PAD = 10;
const BOX_TEXT_W = CONTENT_W - 4 - 2 * 12;

function heightOf(b: Block): number {
  switch (b.k) {
    case "line":
    case "split":
      return lineH(b.size);
    case "gap":
      return b.h;
    case "bar":
      return 16;
    case "box":
      return b.lines.length * lineH(CALLOUT) + 2 * BOX_PAD + 8;
    case "bands":
      return 22;
    case "logo":
      return 76;
    case "barcode":
      return 62;
  }
}

const text = (t: string, size: number, opts: Omit<Seg, "t"> & { align?: "left" | "center"; indent?: number } = {}): Block => ({
  k: "line",
  size,
  align: opts.align,
  indent: opts.indent,
  segs: [{ t, c: opts.c, b: opts.b }],
});

const rule = (ch: "-" | "=", size = SMALL): Block[] => [
  { k: "gap", h: 4 },
  text((ch === "-" ? "- " : "=").repeat(ch === "-" ? Math.floor(cols(size) / 2) : cols(size)), size, { c: COLOR.rule }),
  { k: "gap", h: 4 },
];

/**
 * Rând de bon: eticheta, puncte, valoarea aliniată la dreapta. O etichetă prea lungă se rupe pe mai multe
 * rânduri, iar punctele și valoarea stau pe ultimul.
 */
function leader(label: string, value: string, size: number, opts: { valueColor?: string; bold?: boolean } = {}): Block[] {
  const n = cols(size);
  value = clean(value).replace(/ /g, " ");
  // Loc pentru etichetă: tot rândul minus valoarea, două spații și măcar un punct.
  const avail = n - value.length - 3;
  const lines = avail >= 8 ? wrap(label, avail) : [...wrap(label, n), ""];
  const last = lines.pop()!;
  const dots = Math.max(1, n - last.length - value.length - 2);
  return [
    ...lines.map((l) => text(l, size, { b: opts.bold })),
    {
      k: "line",
      size,
      segs: [
        { t: last ? `${last} ` : "", b: opts.bold },
        { t: ".".repeat(dots), c: COLOR.rule },
        { t: ` ${value}`, c: opts.valueColor ?? COLOR.ink, b: opts.bold },
      ],
    },
  ];
}

function issuedLabel(at: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("ro-RO", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  const start = Date.UTC(at.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((at.getTime() - start) / 86_400_000);
  return { number: String(dayOfYear).padStart(4, "0"), when: `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}` };
}

/** Conținutul bonului, ca listă de blocuri cu înălțime cunoscută. */
export function receiptBlocks(m: Message, opts: { issuedAt?: Date; host?: string } = {}): Block[] {
  const issued = issuedLabel(opts.issuedAt ?? new Date());
  const out: Block[] = [
    { k: "logo" },
    text("Leuța", 40, { b: true, align: "center" }),
    text("BUGETUL TĂU, BAN CU BAN", SMALL, { c: COLOR.soft, align: "center" }),
    { k: "gap", h: 6 },
    { k: "bands" },
    ...rule("="),
    { k: "split", size: SMALL, left: [{ t: `BON NR. ${issued.number}`, c: COLOR.soft }], right: [{ t: issued.when, c: COLOR.soft }] },
    ...rule("-"),
    { k: "gap", h: 6 },
    ...wrap(m.title.toUpperCase(), cols(TITLE)).map((l) => text(l, TITLE, { b: true })),
  ];
  if (m.subtitle) out.push(...wrap(m.subtitle, cols(SMALL)).map((l) => text(l, SMALL, { c: COLOR.soft })));
  if (m.intro) out.push({ k: "gap", h: 12 }, ...wrap(m.intro, cols(BASE)).map((l) => text(l, BASE)));

  for (const c of m.callouts ?? []) {
    out.push({ k: "gap", h: 12 }, { k: "box", lines: wrap(`! ${c.text}`, cols(CALLOUT, BOX_TEXT_W)), tone: c.tone });
  }

  if (m.kpis?.length) {
    out.push({ k: "gap", h: 8 }, ...rule("-"));
    for (const k of m.kpis) {
      out.push(...leader(k.label, k.value, BASE, { valueColor: TONE[k.tone ?? "ink"], bold: true }));
      if (k.sub) out.push(...wrap(k.sub, cols(SMALL) - 2).map((l) => text(l, SMALL, { c: COLOR.faint, indent: 2 })));
      out.push({ k: "gap", h: 6 });
    }
  }

  for (const s of m.sections ?? []) {
    out.push({ k: "gap", h: 10 }, text(clean(s.title).toUpperCase(), BASE, { b: true }), ...rule("-"));
    if (!s.rows.length) out.push(text(s.empty ?? "—", SMALL, { c: COLOR.faint }));
    // Cel mult 8 rânduri pe secțiune: pe Telegram, o imagine foarte lungă e micșorată și devine greu de citit.
    const rows = s.rows.slice(0, 8);
    for (const r of rows) {
      out.push(...leader(r.label, r.value, BASE));
      if (r.sub) out.push(...wrap(r.sub, cols(SMALL) - 2).map((l) => text(l, SMALL, { c: COLOR.faint, indent: 2 })));
      if (r.bar !== undefined) out.push({ k: "bar", pct: r.bar, color: TONE[r.tone ?? "mov"] });
      out.push({ k: "gap", h: 6 });
    }
    if (s.rows.length > rows.length) out.push(text(`… și încă ${s.rows.length - rows.length}`, SMALL, { c: COLOR.faint }));
  }

  const seed = `${m.title}|${issued.when}`;
  out.push(
    { k: "gap", h: 10 },
    ...rule("="),
    { k: "gap", h: 8 },
    text("*** VĂ MULȚUMIM! ***", BASE, { b: true, align: "center" }),
    { k: "gap", h: 8 },
    { k: "barcode", seed },
    text(barcodeDigits(seed), SMALL, { c: COLOR.soft, align: "center" }),
  );
  if (opts.host) out.push(text(opts.host, SMALL, { c: COLOR.faint, align: "center" }));
  return out;
}

// ---------- Desen ----------

const PAD_TOP = 30;
const PAD_BOTTOM = 30;

function Segs({ segs, size }: { segs: Seg[]; size: number }) {
  return (
    <>
      {segs
        .filter((s) => s.t)
        .map((s, i) => (
          <span key={i} style={{ whiteSpace: "pre", color: s.c ?? COLOR.ink, fontWeight: s.b ? 700 : 400, fontSize: size }}>
            {s.t}
          </span>
        ))}
    </>
  );
}

function BlockView({ b }: { b: Block }) {
  const h = heightOf(b);
  switch (b.k) {
    case "line":
      return (
        <div style={{ display: "flex", height: h, alignItems: "center", justifyContent: b.align === "center" ? "center" : "flex-start", paddingLeft: (b.indent ?? 0) * b.size * CHAR }}>
          <Segs segs={b.segs} size={b.size} />
        </div>
      );
    case "split":
      return (
        <div style={{ display: "flex", height: h, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex" }}><Segs segs={b.left} size={b.size} /></div>
          <div style={{ display: "flex" }}><Segs segs={b.right} size={b.size} /></div>
        </div>
      );
    case "gap":
      return <div style={{ display: "flex", height: h }} />;
    case "bar":
      return (
        <div style={{ display: "flex", height: h, alignItems: "center" }}>
          <div style={{ display: "flex", width: "100%", height: 7, borderRadius: 4, background: "#ECE6DA" }}>
            <div style={{ display: "flex", width: `${Math.max(2, Math.min(100, b.pct))}%`, height: 7, borderRadius: 4, background: b.color }} />
          </div>
        </div>
      );
    case "box":
      return (
        <div style={{ display: "flex", height: h, paddingTop: 4, paddingBottom: 4 }}>
          <div style={{ display: "flex", flexDirection: "column", width: "100%", background: TINT[b.tone], borderLeft: `4px solid ${TONE[b.tone]}`, padding: `${BOX_PAD}px 12px` }}>
            {b.lines.map((l, i) => (
              <div key={i} style={{ display: "flex", height: lineH(CALLOUT), alignItems: "center" }}>
                <span style={{ whiteSpace: "pre", fontSize: CALLOUT, color: COLOR.ink }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case "bands":
      return (
        <div style={{ display: "flex", height: h, alignItems: "center", justifyContent: "center" }}>
          {BANDS.map((c) => (
            <div key={c} style={{ display: "flex", width: 40, height: 7, borderRadius: 4, background: c, marginLeft: 3, marginRight: 3 }} />
          ))}
        </div>
      );
    case "logo":
      return (
        <div style={{ display: "flex", height: h, justifyContent: "center", alignItems: "flex-start" }}>
          <svg width="64" height="64" viewBox="0 0 64 64">
            <defs>
              <linearGradient id="g" x1="10" y1="6" x2="54" y2="60" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#5FA374" />
                <stop offset="0.55" stopColor="#3D7A4E" />
                <stop offset="1" stopColor="#24502F" />
              </linearGradient>
            </defs>
            <circle cx="32" cy="32" r="30" fill="url(#g)" />
            <circle cx="32" cy="32" r="26.5" fill="none" stroke="#F3EBD3" strokeOpacity="0.55" strokeWidth="1.1" strokeDasharray="1.6 2.2" />
            <path d="M22.5 15.5h7v22.2l13.2-6.6 2.9 6.3-17.6 8.9c-2.6 1.3-5.5-.6-5.5-3.5V15.5z" fill="#F7F0DA" />
            <circle cx="46.3" cy="27.6" r="3.1" fill="#E4B74C" />
          </svg>
        </div>
      );
    case "barcode": {
      const bw = 300;
      return (
        <div style={{ display: "flex", height: h, justifyContent: "center", alignItems: "center" }}>
          <svg width={bw} height="52" viewBox="0 0 200 40" preserveAspectRatio="none">
            {barcodeBars(b.seed, 200).map((r, i) => (
              <rect key={i} x={r.x} y={0} width={r.w} height={40} fill={COLOR.ink} />
            ))}
          </svg>
        </div>
      );
    }
  }
}

/** Marginea de hârtie ruptă în zigzag (sus sau jos). */
function Tear({ side }: { side: "top" | "bottom" }) {
  const width = W - 2 * MARGIN;
  const n = Math.ceil(width / TOOTH_W);
  let d = side === "bottom" ? `M0 0` : `M0 ${TOOTH_H}`;
  for (let i = 0; i < n; i++) {
    const x = i * TOOTH_W;
    d += side === "bottom" ? ` L${x + TOOTH_W / 2} ${TOOTH_H} L${x + TOOTH_W} 0` : ` L${x + TOOTH_W / 2} 0 L${x + TOOTH_W} ${TOOTH_H}`;
  }
  d += " Z";
  return (
    <svg width={width} height={TOOTH_H} viewBox={`0 0 ${width} ${TOOTH_H}`} style={{ display: "flex" }}>
      <path d={d} fill={COLOR.paper} />
    </svg>
  );
}

let fontCache: { regular: Buffer; bold: Buffer } | null = null;
function fonts() {
  if (!fontCache) {
    const dir = path.join(process.cwd(), "src/lib/receipt/fonts");
    fontCache = {
      regular: fs.readFileSync(path.join(dir, "IBMPlexMono-Regular.ttf")),
      bold: fs.readFileSync(path.join(dir, "IBMPlexMono-Bold.ttf")),
    };
  }
  return fontCache;
}

/** Desenează notificarea ca bon și întoarce imaginea PNG. */
export async function renderMessageImage(m: Message, opts: { issuedAt?: Date; host?: string } = {}): Promise<Uint8Array> {
  const blocks = receiptBlocks(m, opts);
  const paperH = PAD_TOP + blocks.reduce((a, b) => a + heightOf(b), 0) + PAD_BOTTOM;
  const height = MARGIN + TOOTH_H + paperH + TOOTH_H + MARGIN;
  const f = fonts();
  const res = new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: W, height, background: COLOR.table, padding: MARGIN, fontFamily: "Plex Mono" }}>
        <Tear side="top" />
        <div style={{ display: "flex", flexDirection: "column", height: paperH, background: COLOR.paper, padding: `${PAD_TOP}px ${PAD_X}px ${PAD_BOTTOM}px` }}>
          {blocks.map((b, i) => (
            <BlockView key={i} b={b} />
          ))}
        </div>
        <Tear side="bottom" />
      </div>
    ),
    {
      width: W,
      height,
      fonts: [
        { name: "Plex Mono", data: f.regular, weight: 400, style: "normal" },
        { name: "Plex Mono", data: f.bold, weight: 700, style: "normal" },
      ],
    },
  );
  return new Uint8Array(await res.arrayBuffer());
}
