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
};

const C: Record<Tone, string> = {
  leu: "#3D7A4E",
  mov: "#6A4E99",
  rosu: "#B5456A",
  galben: "#C99A1E",
  albastru: "#2E5C8A",
  ink: "#1C2B30",
};
const TINT: Record<Tone, string> = {
  leu: "#DCEBDF",
  mov: "#E6DFF1",
  rosu: "#F4DDE5",
  galben: "#F6ECCB",
  albastru: "#DCE6F1",
  ink: "#EDF1EE",
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

// ---------- Email ----------

const font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

function kpiCell(k: Kpi, side: "left" | "right") {
  const tone = C[k.tone ?? "ink"];
  return `<td valign="top" style="padding:${side === "left" ? "6px 6px 6px 0" : "6px 0 6px 6px"};width:50%;">
    <div style="background:#FFFFFF;border:1px solid #D5DDD8;border-left:4px solid ${tone};border-radius:10px;padding:12px 14px;">
      <div style="${font}font-size:12px;color:#4E5E63;">${esc(k.label)}</div>
      <div style="${font}font-size:22px;font-weight:700;color:${tone};margin-top:2px;">${esc(k.value)}</div>
      ${k.sub ? `<div style="${font}font-size:12px;color:#8A989C;margin-top:2px;">${esc(k.sub)}</div>` : ""}
    </div>
  </td>`;
}

function rowHtml(r: Row) {
  const tone = C[r.tone ?? "mov"];
  const bar =
    r.bar !== undefined
      ? `<div style="height:6px;background:#EDF1EE;border-radius:3px;margin-top:6px;overflow:hidden;">
           <div style="height:6px;width:${Math.max(2, Math.min(100, Math.round(r.bar)))}%;background:${tone};border-radius:3px;"></div>
         </div>`
      : "";
  return `<tr>
    <td style="padding:9px 0;border-bottom:1px solid #EDF1EE;${font}">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
        <td style="${font}font-size:14px;color:#1C2B30;">${esc(r.label)}${r.sub ? `<div style="font-size:12px;color:#8A989C;">${esc(r.sub)}</div>` : ""}</td>
        <td align="right" style="${font}font-size:14px;font-weight:600;color:#1C2B30;white-space:nowrap;padding-left:12px;">${esc(r.value)}</td>
      </tr></table>
      ${bar}
    </td>
  </tr>`;
}

export function toEmailHtml(m: Message, appUrl: string): string {
  const kpis = m.kpis ?? [];
  const kpiRows: string[] = [];
  for (let i = 0; i < kpis.length; i += 2) {
    kpiRows.push(`<tr>${kpiCell(kpis[i], "left")}${kpis[i + 1] ? kpiCell(kpis[i + 1], "right") : '<td style="width:50%;"></td>'}</tr>`);
  }
  const callouts = (m.callouts ?? [])
    .map(
      (c) => `<tr><td style="padding:6px 0;">
        <div style="${font}background:${TINT[c.tone]};border-radius:10px;padding:12px 14px;font-size:14px;color:#1C2B30;border-left:4px solid ${C[c.tone]};">${esc(c.text)}</div>
      </td></tr>`,
    )
    .join("");
  const sections = (m.sections ?? [])
    .map(
      (s) => `<tr><td style="padding:18px 0 4px;">
        <div style="${font}font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#4E5E63;">${esc(s.title)}</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:4px;">
          ${s.rows.length ? s.rows.map(rowHtml).join("") : `<tr><td style="${font}font-size:14px;color:#8A989C;padding:8px 0;">${esc(s.empty ?? "—")}</td></tr>`}
        </table>
      </td></tr>`,
    )
    .join("");
  const cta = m.cta ?? { label: "Deschide aplicația", url: appUrl };

  return `<!doctype html>
<html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${esc(m.title)}</title></head>
<body style="margin:0;padding:0;background:#EDF1EE;">
  <div style="display:none;max-height:0;overflow:hidden;">${esc(m.intro ?? m.subtitle ?? m.title)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#EDF1EE;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;">
        <tr><td style="padding:0 4px 14px;">
          <table role="presentation" cellspacing="0" cellpadding="0"><tr>
            <td style="background:#3D7A4E;width:8px;border-radius:2px;">&nbsp;</td>
            <td style="${font}font-size:18px;font-weight:800;color:#1C2B30;padding-left:8px;">Banii mei</td>
          </tr></table>
          <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:6px;"><tr>
            ${["#3D7A4E", "#6A4E99", "#B5456A", "#C99A1E", "#2E5C8A"].map((c) => `<td style="background:${c};width:22px;height:3px;font-size:0;line-height:0;border-right:3px solid #EDF1EE;">&nbsp;</td>`).join("")}
          </tr></table>
        </td></tr>
        <tr><td style="background:#F8FAF8;border:1px solid #D5DDD8;border-radius:16px;padding:24px 22px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr><td>
              <div style="${font}font-size:26px;line-height:1.2;font-weight:800;color:#1C2B30;">${m.emoji} ${esc(m.title)}</div>
              ${m.subtitle ? `<div style="${font}font-size:14px;color:#4E5E63;margin-top:4px;">${esc(m.subtitle)}</div>` : ""}
              ${m.intro ? `<div style="${font}font-size:15px;line-height:1.5;color:#1C2B30;margin-top:14px;">${esc(m.intro)}</div>` : ""}
            </td></tr>
            ${kpiRows.length ? `<tr><td style="padding-top:14px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${kpiRows.join("")}</table></td></tr>` : ""}
            ${callouts ? `<tr><td style="padding-top:10px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${callouts}</table></td></tr>` : ""}
            ${sections}
            <tr><td align="center" style="padding-top:24px;">
              <a href="${esc(cta.url)}" style="${font}display:inline-block;background:#2E5C8A;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:10px;">${esc(cta.label)}</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="${font}font-size:12px;color:#8A989C;text-align:center;padding:16px 8px;">
          Primești acest email pentru că l-ai activat în Banii mei → Setări → Notificări.
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
