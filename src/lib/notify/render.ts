import { barcodeBars, barcodeDigits } from "../barcode";
import { esc } from "./telegram";

/**
 * Un mesaj descris o singură dată și afișat în două feluri: text scurt pentru Telegram și email HTML
 * (tabele + stiluri inline, singurul format afișat corect de Gmail, Outlook și Apple Mail).
 */

export type Tone = "leu" | "mov" | "rosu" | "galben" | "albastru" | "ink";

export type Kpi = { label: string; value: string; sub?: string; tone?: Tone };
export type Row = { label: string; value: string; sub?: string; bar?: number; tone?: Tone };
export type Section = { title: string; rows: Row[]; empty?: string };
export type Callout = { text: string; tone: Tone };

export type Message = {
  emoji: string;
  title: string;
  subtitle?: string;
  intro?: string;
  kpis?: Kpi[];
  callouts?: Callout[];
  sections?: Section[];
  footer?: string; // ex. „Răspunde cu «45 mâncare»…” (doar Telegram)
  cta?: { label: string; url: string };
  /** Fișier atașat (ex. bonul lunar în PDF): document pe Telegram, atașament pe email. */
  attachment?: { filename: string; content: Uint8Array; caption?: string };
};

/** Culorile bancnotelor (aceleași ca în aplicație), pentru email și imaginea de pe Telegram. */
export const C: Record<Tone, string> = {
  leu: "#3D7A4E",
  mov: "#6A4E99",
  rosu: "#B5456A",
  galben: "#A87C10",
  albastru: "#2E5C8A",
  ink: "#1F1D1A",
};
export const TINT: Record<Tone, string> = {
  leu: "#E3EEE2",
  mov: "#ECE5F2",
  rosu: "#F7E4E9",
  galben: "#F7EED3",
  albastru: "#E3E9F0",
  ink: "#F1ECE2",
};

// ---------- Telegram ----------

export function toTelegram(m: Message): string {
  const out: string[] = [`${m.emoji} <b>${esc(m.title)}</b>`];
  if (m.subtitle) out.push(`<i>${esc(m.subtitle)}</i>`);
  if (m.intro) out.push("", esc(m.intro));
  for (const c of m.callouts ?? []) out.push("", `${c.tone === "rosu" ? "🔴" : c.tone === "galben" ? "🟡" : "🟢"} ${esc(c.text)}`);
  if (m.kpis?.length) {
    out.push("");
    for (const k of m.kpis) out.push(`${esc(k.label)}: <b>${esc(k.value)}</b>${k.sub ? ` <i>(${esc(k.sub)})</i>` : ""}`);
  }
  for (const s of m.sections ?? []) {
    out.push("", `<b>${esc(s.title)}</b>`);
    if (!s.rows.length && s.empty) out.push(`<i>${esc(s.empty)}</i>`);
    for (const r of s.rows) out.push(`• ${esc(r.label)} — <b>${esc(r.value)}</b>${r.sub ? ` <i>${esc(r.sub)}</i>` : ""}`);
  }
  if (m.footer) out.push("", `<i>${esc(m.footer)}</i>`);
  return out.join("\n").slice(0, 4000);
}

/** Legenda imaginii de pe Telegram: titlul și indicația de răspuns; restul e în imagine. */
export function toTelegramCaption(m: Message): string {
  const out: string[] = [`${m.emoji} <b>${esc(m.title)}</b>`];
  if (m.subtitle) out.push(`<i>${esc(m.subtitle)}</i>`);
  if (m.footer) out.push("", esc(m.footer));
  return out.join("\n");
}

// ---------- Email ----------
// Emailul arată ca un bon de casă: hârtie crem cu marginile rupte în zigzag pe fundalul „mesei”,
// font monospace, rânduri cu puncte între etichetă și sumă, linii punctate, cod de bare la final.
// Doar tabele și stiluri inline (singurul format afișat corect de Gmail, Outlook și Apple Mail).

const P = {
  table: "#EAE5DB",
  paper: "#FDFBF6",
  ink: "#1F1D1A",
  soft: "#5C564D",
  faint: "#8C857A",
  rule: "#C4BBAB",
  track: "#ECE6DA",
};
const BANDS = ["#3D7A4E", "#6A4E99", "#B5456A", "#C99A1E", "#2E5C8A"];
const mono = "font-family:'IBM Plex Mono','SF Mono',Menlo,Consolas,'Liberation Mono','Courier New',monospace;";

/** Suma rămâne lipită de monedă când textul se rupe pe rânduri („288.405,73 lei”). */
const glue = (s: string) => esc(s).replace(/(\d) (lei|€|EUR)\b/g, "$1&nbsp;$2");

/**
 * Rând de bon: etichetă, puncte, valoare. Valoarea are coloana ei; punctele se taie la marginea etichetei.
 * O etichetă lungă stă pe rândul ei (se poate rupe), iar punctele și valoarea pe rândul următor, ca să
 * încapă și pe ecranul unui telefon.
 */
function leaderHtml(label: string, value: string, o: { size?: number; bold?: boolean; color?: string } = {}): string {
  if (label.length > 22) {
    return `<div style="${mono}font-size:${o.size ?? 14}px;line-height:1.5;color:${P.ink};font-weight:${o.bold ? "700" : "400"};">${esc(label)}</div>${leaderHtml("", value, o)}`;
  }
  const size = o.size ?? 14;
  const weight = o.bold ? "700" : "400";
  // Coloana valorii are exact lățimea textului (fonturile monospace au ~0,6 em pe caracter), ca punctele
  // să ajungă până lângă sumă.
  const valueWidth = Math.ceil(value.length * size * 0.62) + 10;
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed;"><tr>
    <td style="${mono}font-size:${size}px;line-height:1.5;color:${P.ink};font-weight:${weight};">
      <div style="white-space:nowrap;overflow:hidden;">${label ? `${esc(label)} ` : ""}<span style="color:${P.rule};font-weight:400;">${". ".repeat(60)}</span></div>
    </td>
    <td width="${valueWidth}" align="right" valign="bottom" style="${mono}font-size:${size}px;line-height:1.5;font-weight:${o.bold ? "700" : "600"};color:${o.color ?? P.ink};white-space:nowrap;padding-left:6px;">${esc(value)}</td>
  </tr></table>`;
}

const subHtml = (text: string) => `<div style="${mono}font-size:12px;line-height:1.45;color:${P.faint};padding:1px 0 0 14px;">${glue(text)}</div>`;

const dashed = (margin = "12px 0") => `<div style="border-top:1px dashed ${P.rule};height:0;line-height:0;font-size:0;margin:${margin};">&nbsp;</div>`;
const double = (margin = "14px 0") =>
  `<div style="border-top:1px solid ${P.soft};border-bottom:1px solid ${P.soft};height:2px;line-height:0;font-size:0;margin:${margin};">&nbsp;</div>`;

function barHtml(pct: number, color: string) {
  const w = Math.max(2, Math.min(100, Math.round(pct)));
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:5px;"><tr>
    <td width="${w}%" style="background:${color};height:6px;line-height:6px;font-size:0;border-radius:3px 0 0 3px;">&nbsp;</td>
    ${w < 100 ? `<td style="background:${P.track};height:6px;line-height:6px;font-size:0;border-radius:0 3px 3px 0;">&nbsp;</td>` : ""}
  </tr></table>`;
}

/** Marginea ruptă a hârtiei: triunghiuri din chenare (fără imagini), ascunse în Outlook pentru Windows. */
function tearHtml(side: "top" | "bottom") {
  const tooth =
    side === "bottom"
      ? `<span style="display:inline-block;width:0;height:0;border-left:7px solid ${P.table};border-right:7px solid ${P.table};border-top:8px solid ${P.paper};"></span>`
      : `<span style="display:inline-block;width:0;height:0;border-left:7px solid ${P.table};border-right:7px solid ${P.table};border-bottom:8px solid ${P.paper};"></span>`;
  return `<!--[if !mso]><!--><div style="font-size:0;line-height:0;height:8px;white-space:nowrap;overflow:hidden;">${tooth.repeat(48)}</div><!--<![endif]-->`;
}

function barcodeHtml(seed: string) {
  const bars = barcodeBars(seed, 200);
  let x = 0;
  const spans = bars
    .map((b) => {
      const gap = Math.max(0, Math.round((b.x - x) * 1.2));
      const w = Math.max(1, Math.round(b.w * 1.2));
      x = b.x + b.w;
      return `<span style="display:inline-block;width:${w}px;height:44px;background:${P.ink};margin-left:${gap}px;"></span>`;
    })
    .join("");
  return `<!--[if !mso]><!--><div style="font-size:0;line-height:0;white-space:nowrap;text-align:center;">${spans}</div><!--<![endif]-->
    <div style="${mono}font-size:11px;letter-spacing:.2em;color:${P.soft};text-align:center;margin-top:6px;">${esc(barcodeDigits(seed))}</div>`;
}

function issued(at: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("ro-RO", { timeZone: "Europe/Bucharest", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  const dayOfYear = Math.floor((at.getTime() - Date.UTC(at.getUTCFullYear(), 0, 0)) / 86_400_000);
  return { number: String(dayOfYear).padStart(4, "0"), when: `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}` };
}

export function toEmailHtml(m: Message, appUrl: string, at: Date = new Date()): string {
  const meta = issued(at);
  const cta = m.cta ?? { label: "Deschide aplicația", url: appUrl };
  let host = "";
  try {
    host = new URL(appUrl).host;
  } catch {
    // fără adresă: rândul cu domeniul lipsește
  }

  const callouts = (m.callouts ?? [])
    .map(
      (c) => `<div style="${mono}background:${TINT[c.tone]};border-left:4px solid ${C[c.tone]};padding:10px 12px;margin:12px 0 0;font-size:13px;line-height:1.5;color:${P.ink};">
        <strong>!</strong> ${glue(c.text)}
      </div>`,
    )
    .join("");

  const kpis = (m.kpis ?? [])
    .map(
      (k) => `<div style="padding:4px 0 6px;">
        ${leaderHtml(k.label, k.value, { size: 15, bold: true, color: C[k.tone ?? "ink"] })}
        ${k.sub ? subHtml(k.sub) : ""}
      </div>`,
    )
    .join("");

  const sections = (m.sections ?? [])
    .map(
      (s) => `<div style="${mono}font-size:14px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${P.ink};margin-top:22px;">${esc(s.title)}</div>
      ${dashed("8px 0 6px")}
      ${
        s.rows.length
          ? s.rows
              .map(
                (r) => `<div style="padding:5px 0;">
                  ${leaderHtml(r.label, r.value)}
                  ${r.sub ? subHtml(r.sub) : ""}
                  ${r.bar !== undefined ? barHtml(r.bar, C[r.tone ?? "mov"]) : ""}
                </div>`,
              )
              .join("")
          : `<div style="${mono}font-size:13px;color:${P.faint};padding:4px 0;">${esc(s.empty ?? "—")}</div>`
      }`,
    )
    .join("");

  const seed = `${m.title}|${meta.when}`;

  return `<!doctype html>
<html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${esc(m.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @media (max-width: 480px) {
    .paper { padding: 22px 16px 20px !important; }
    .title { font-size: 19px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${P.table};">
  <div style="display:none;max-height:0;overflow:hidden;">${esc(m.intro ?? m.subtitle ?? m.title)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${P.table};">
    <tr><td align="center" style="padding:28px 10px;">
      <!-- table-layout:fixed: marginile zimțate (mai late decât ecranul unui telefon) se taie, nu lățesc emailul. -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;table-layout:fixed;">
        <tr><td>${tearHtml("top")}</td></tr>
        <tr><td class="paper" style="background:${P.paper};padding:28px 30px 24px;">

          <div style="text-align:center;">
            <img src="${esc(appUrl)}/email/logo.png" width="52" height="52" alt="" style="display:inline-block;border:0;width:52px;height:52px;">
            <div style="${mono}font-size:30px;line-height:1.2;font-weight:700;letter-spacing:-.02em;color:${P.ink};margin-top:6px;">Leuța</div>
            <div style="${mono}font-size:11px;letter-spacing:.12em;color:${P.soft};margin-top:3px;">BUGETUL TĂU, BAN CU BAN</div>
            <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:10px auto 0;"><tr>
              ${BANDS.map((c) => `<td style="padding:0 2px;"><div style="background:${c};width:30px;height:5px;line-height:5px;font-size:0;border-radius:3px;">&nbsp;</div></td>`).join("")}
            </tr></table>
          </div>

          ${double("16px 0 8px")}
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
            <td style="${mono}font-size:12px;color:${P.soft};">BON NR. ${meta.number}</td>
            <td align="right" style="${mono}font-size:12px;color:${P.soft};">${meta.when}</td>
          </tr></table>
          ${dashed("8px 0 16px")}

          <div class="title" style="${mono}font-size:21px;line-height:1.3;font-weight:700;text-transform:uppercase;color:${P.ink};">${esc(m.title)}</div>
          ${m.subtitle ? `<div style="${mono}font-size:13px;color:${P.soft};margin-top:4px;">${esc(m.subtitle)}</div>` : ""}
          ${m.intro ? `<div style="${mono}font-size:14px;line-height:1.6;color:${P.ink};margin-top:14px;">${glue(m.intro)}</div>` : ""}
          ${callouts}
          ${kpis ? `${dashed("16px 0 8px")}${kpis}` : ""}
          ${sections}

          <div style="text-align:center;margin-top:26px;">
            <a href="${esc(cta.url)}" style="${mono}display:inline-block;background:${P.ink};color:${P.paper};text-decoration:none;font-size:14px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;padding:12px 22px;border-radius:6px;">${esc(cta.label)} &rarr;</a>
          </div>

          ${double("24px 0 16px")}
          <div style="${mono}font-size:14px;font-weight:700;letter-spacing:.08em;color:${P.ink};text-align:center;margin-bottom:12px;">*** VĂ MULȚUMIM! ***</div>
          ${barcodeHtml(seed)}
          ${host ? `<div style="${mono}font-size:11px;color:${P.faint};text-align:center;margin-top:4px;">${esc(host)}</div>` : ""}
        </td></tr>
        <tr><td>${tearHtml("bottom")}</td></tr>
        <tr><td style="${mono}font-size:11px;line-height:1.5;color:${P.faint};text-align:center;padding:18px 8px 0;">
          Primești acest email pentru că l-ai activat în Leuța → Setări → Notificări.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function toPlainText(m: Message): string {
  const out = [`${m.title}${m.subtitle ? ` — ${m.subtitle}` : ""}`];
  if (m.intro) out.push("", m.intro);
  for (const c of m.callouts ?? []) out.push("", `! ${c.text}`);
  for (const k of m.kpis ?? []) out.push(`${k.label}: ${k.value}${k.sub ? ` (${k.sub})` : ""}`);
  for (const s of m.sections ?? []) {
    out.push("", s.title.toUpperCase());
    if (!s.rows.length && s.empty) out.push(s.empty);
    for (const r of s.rows) out.push(`- ${r.label}: ${r.value}${r.sub ? ` (${r.sub})` : ""}`);
  }
  return out.join("\n");
}
