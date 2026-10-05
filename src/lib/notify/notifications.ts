import { buildSummary, loadLoans, type Summary } from "../analytics";
import { getDb, getSetting, getSystemDb, runAsUser } from "../db";
import { annualInsuranceFor, monthCashflow } from "../loan";
import { addMonths, lei, monthLabel, pct } from "../util";
import { emailConfigured, isEmail, sendEmail } from "./email";
import { parsePrefs, type Channel, type NotifyKind } from "./kinds";
import { toEmailHtml, toPlainText, toTelegram, type Message, type Row } from "./render";
import { sendTelegram, sendTelegramDocument, telegramConfigured } from "./telegram";
import { buildReceipt } from "../receipt/model";
import { receiptFilename, renderReceiptPdf } from "../receipt/pdf";
import { addDays, daysBetween, isoWeek, localNow, longDate, shortDate, type LocalNow } from "./time";

/**
 * Notificările unui utilizator: ce se trimite, pe ce canal, o singură dată.
 * Toate funcțiile de aici rulează în contextul utilizatorului (runAsUser), deci văd doar datele lui.
 */

type EntryLine = { amount: number; currency: string; kind: string; description: string; category: string | null; created_at: string };

const lastDayOfMonth = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

/** Înregistrările introduse între două zile (inclusiv), după ora României. */
async function entriesBetween(from: string, to: string): Promise<EntryLine[]> {
  return (await getDb())
    .prepare(
      `SELECT e.amount, e.currency, e.kind, e.description, c.name AS category, e.created_at
       FROM entries e LEFT JOIN categories c ON c.id = e.category_id
       WHERE e.created_at IS NOT NULL
         AND (e.created_at AT TIME ZONE 'Europe/Bucharest')::date BETWEEN ?::date AND ?::date
       ORDER BY e.created_at`,
    )
    .all<EntryLine>(from, to);
}

const ron = (e: EntryLine, rate: number) => (e.currency === "EUR" ? e.amount * rate : e.amount);
const isSpending = (e: EntryLine) => e.kind === "fixed" || e.kind === "variable";

/** Media cheltuielilor variabile din ultimele 3 luni cu date (fără luna curentă). */
function variableAverage(s: Summary) {
  const prior = s.trend.slice(0, -1).filter((t) => t.hasData).slice(-3);
  return prior.length ? prior.reduce((a, t) => a + t.variable, 0) / prior.length : 0;
}

/** Următoarea scadență a ratei (ziua din luna din graficul băncii sau din data acordării). */
function nextDueDate(dueDaySource: string, today: string) {
  const dueDay = Number(dueDaySource.slice(8, 10)) || 1;
  let month = today.slice(0, 7);
  for (let i = 0; i < 2; i++) {
    const d = `${month}-${String(Math.min(dueDay, lastDayOfMonth(month))).padStart(2, "0")}`;
    if (d >= today) return d;
    month = addMonths(month, 1);
  }
  return `${month}-${String(Math.min(dueDay, lastDayOfMonth(month))).padStart(2, "0")}`;
}

type LoanDue = { loanId: number; name: string; dueDate: string; daysLeft: number; amount: number; insurance: number; annual: number; balanceAfter: number };

async function loanDues(today: string): Promise<LoanDue[]> {
  const out: LoanDue[] = [];
  for (const { loan, sim } of await loadLoans()) {
    if (!loan.active) continue;
    const dueDate = nextDueDate(loan.next_payment_date || loan.start_date, today);
    const month = dueDate.slice(0, 7);
    const cf = monthCashflow(loan, sim, month);
    if (cf.payment <= 0) continue;
    const row = sim.rows.find((r) => r.month === month);
    out.push({
      loanId: loan.id,
      name: loan.name,
      dueDate,
      daysLeft: daysBetween(today, dueDate),
      amount: cf.payment + cf.insurance,
      insurance: cf.insurance - cf.annualInsurance,
      annual: cf.annualInsurance,
      balanceAfter: row?.balanceEnd ?? 0,
    });
  }
  return out;
}

function loanRows(dues: LoanDue[], s: Summary): Row[] {
  return dues.map((d) => {
    const view = s.loans.find((l) => l.loan.id === d.loanId);
    return {
      label: d.name,
      value: lei(d.amount, true),
      sub: `rata pe ${shortDate(d.dueDate)} (${d.daysLeft === 0 ? "azi" : d.daysLeft === 1 ? "mâine" : `în ${d.daysLeft} zile`}) · sold ${lei(view?.status.balance ?? d.balanceAfter)}`,
      tone: "mov",
    };
  });
}

// ---------- Mesajele ----------

export async function dailyMessage(now: LocalNow): Promise<Message> {
  const [s, today, dues] = await Promise.all([buildSummary(now.month), entriesBetween(now.date, now.date), loanDues(now.date)]);
  const rate = s.fx.rate;
  const spentToday = today.filter(isSpending).reduce((a, e) => a + ron(e, rate), 0);
  const avgVar = variableAverage(s);
  const t = s.totals;
  return {
    emoji: "🌙",
    title: "Seara de buget",
    subtitle: longDate(now.date),
    intro: today.length
      ? `Azi ai introdus ${today.length} ${today.length === 1 ? "înregistrare" : "înregistrări"}, ${lei(spentToday)} cheltuieli. Mai e ceva de adăugat?`
      : "Nu ai introdus nimic azi. Ai cheltuit ceva? Trece acum, cât îți amintești.",
    sections: [
      {
        title: "Azi",
        rows: today.map((e) => ({
          label: e.category ?? (e.kind === "income" ? "Venit" : "Fără categorie"),
          value: `${e.kind === "income" ? "+" : ""}${lei(ron(e, rate))}`,
          sub: e.description || undefined,
        })),
        empty: "Nicio înregistrare azi.",
      },
      ...(dues.length ? [{ title: "Credite", rows: loanRows(dues, s) }] : []),
    ],
    kpis: [
      { label: `Cheltuit în ${monthLabel(now.month).split(" ")[0]}`, value: lei(t.spent), sub: t.income ? `din ${lei(t.income)} venit` : undefined, tone: "mov" },
      { label: "Rămas nealocat", value: lei(t.unallocated), tone: t.unallocated < 0 ? "rosu" : "leu" },
      ...(avgVar > 0
        ? [{ label: "Cheltuieli variabile", value: lei(t.variable), sub: `media obișnuită ${lei(avgVar)} · ${pct((t.variable / avgVar) * 100, 0)}`, tone: (t.variable > avgVar ? "rosu" : "albastru") as "rosu" | "albastru" }]
        : []),
    ],
    footer: "Răspunde cu „45 mâncare” sau „120 benzină” ca să adaugi o cheltuială.",
  };
}

type Alert = { key: string; message: Message };

/** Rata în 0–3 zile; PAD / asigurarea facultativă în 0–7 zile. Câte un mesaj pentru fiecare scadență. */
export async function dueAlerts(now: LocalNow, ignoreWindow = false): Promise<Alert[]> {
  const out: Alert[] = [];
  for (const d of await loanDues(now.date)) {
    if (!ignoreWindow && (d.daysLeft < 0 || d.daysLeft > 3)) continue;
    out.push({
      key: `loan${d.loanId}:${d.dueDate}`,
      message: {
        emoji: "📅",
        title: d.daysLeft === 0 ? "Azi e scadența ratei" : `Rata la credit în ${d.daysLeft === 1 ? "o zi" : `${d.daysLeft} zile`}`,
        subtitle: `${d.name} · ${longDate(d.dueDate)}`,
        intro: "Verifică să ai banii în contul de rambursare.",
        kpis: [
          { label: "De plată", value: lei(d.amount, true), sub: d.insurance ? `include ${lei(d.insurance, true)} asigurare` : undefined, tone: "mov" },
          { label: "Sold după plată", value: lei(d.balanceAfter), tone: "albastru" },
        ],
        callouts: d.annual ? [{ text: `Luna aceasta se adaugă și asigurarea anuală: ${lei(d.annual, true)}.`, tone: "galben" }] : [],
      },
    });
  }
  // Asigurările anuale (PAD, facultativă): scadența din anul curent sau următor.
  for (const { loan } of await loadLoans()) {
    const items: [string, number | undefined, string | null | undefined][] = [
      ["PAD", loan.pad_amount, loan.pad_due_date],
      ["asigurarea facultativă", loan.opt_ins_amount, loan.opt_ins_due_date],
    ];
    for (const [name, amount, due] of items) {
      if (!amount || !due || due.length < 10) continue;
      const year = Number(now.date.slice(0, 4));
      const candidates = [year, year + 1].map((y) => `${y}${due.slice(4, 10)}`).filter((d) => d >= due.slice(0, 10));
      const next = candidates.find((d) => d >= now.date);
      if (!next || annualInsuranceFor(loan, next.slice(0, 7)) <= 0) continue;
      const days = daysBetween(now.date, next);
      if (days > 7 && !ignoreWindow) continue;
      out.push({
        key: `ins${loan.id}:${name}:${next}`,
        message: {
          emoji: "🛡️",
          title: `${name === "PAD" ? "Asigurarea PAD" : "Asigurarea facultativă"} ${days === 0 ? "e scadentă azi" : `în ${days} zile`}`,
          subtitle: `${loan.name} · ${longDate(next)}`,
          kpis: [{ label: "Suma anuală", value: lei(amount, true), tone: "galben" }],
          intro: "Plata se face o dată pe an. Am inclus-o deja în bugetul lunii.",
        },
      });
    }
  }
  return out;
}

/** Categorii peste 80% / 100% din media obișnuită și luna pe minus. Câte o alertă pe prag, pe lună. */
export async function budgetAlerts(now: LocalNow): Promise<{ keys: string[]; message: Message } | null> {
  const s = await buildSummary(now.month);
  const keys: string[] = [];
  const rows: Row[] = [];
  const callouts: Message["callouts"] = [];
  for (const c of s.categories) {
    if (c.avg3 <= 0 || c.amount <= 0) continue;
    const ratio = c.amount / c.avg3;
    const th = ratio >= 1 ? 100 : ratio >= 0.8 ? 80 : 0;
    if (!th) continue;
    keys.push(`${now.month}:cat${c.id}:${th}`);
    rows.push({
      label: c.name,
      value: pct(ratio * 100, 0),
      sub: `${lei(c.amount)} din media de ${lei(c.avg3)}`,
      bar: Math.min(100, ratio * 100),
      tone: th === 100 ? "rosu" : "galben",
    });
  }
  if (s.totals.income > 0 && s.totals.unallocated < 0) {
    keys.push(`${now.month}:minus`);
    callouts.push({ text: `Luna e pe minus: ai cheltuit și pus deoparte cu ${lei(-s.totals.unallocated)} mai mult decât veniturile.`, tone: "rosu" });
  }
  if (!keys.length) return null;
  return {
    keys,
    message: {
      emoji: "⚠️",
      title: "Alertă de buget",
      subtitle: monthLabel(now.month),
      intro: "Unele categorii se apropie sau au trecut de cât cheltui de obicei într-o lună.",
      callouts,
      sections: rows.length ? [{ title: "Categorii", rows }] : [],
    },
  };
}

export async function weeklyMessage(now: LocalNow, appUrl: string): Promise<Message> {
  const from = addDays(now.date, -6);
  const [s, week, prevWeek, dues] = await Promise.all([
    buildSummary(now.month),
    entriesBetween(from, now.date),
    entriesBetween(addDays(from, -7), addDays(from, -1)),
    loanDues(now.date),
  ]);
  const rate = s.fx.rate;
  const spend = week.filter(isSpending);
  const total = spend.reduce((a, e) => a + ron(e, rate), 0);
  const prevTotal = prevWeek.filter(isSpending).reduce((a, e) => a + ron(e, rate), 0);
  const byCat = new Map<string, number>();
  for (const e of spend) byCat.set(e.category ?? "Fără categorie", (byCat.get(e.category ?? "Fără categorie") ?? 0) + ron(e, rate));
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const max = cats[0]?.[1] ?? 1;
  const diff = total - prevTotal;
  return {
    emoji: "📊",
    title: "Săptămâna ta",
    subtitle: `${longDate(from)} – ${longDate(now.date)}`,
    intro: spend.length
      ? `Ai cheltuit ${lei(total)} în ${spend.length} ${spend.length === 1 ? "tranzacție" : "tranzacții"}${prevTotal > 0 ? `, ${diff >= 0 ? "cu " + lei(diff) + " mai mult" : "cu " + lei(-diff) + " mai puțin"} decât săptămâna trecută` : ""}.`
      : "Săptămâna asta n-ai introdus cheltuieli. Dacă ai uitat, le poți adăuga acum din aplicație sau din Telegram.",
    kpis: [
      { label: "Cheltuit săptămâna asta", value: lei(total), sub: `≈ ${lei(total / 7)} pe zi`, tone: "mov" },
      { label: "Săptămâna trecută", value: lei(prevTotal), tone: "albastru" },
      { label: `Cheltuit în ${monthLabel(now.month).split(" ")[0]}`, value: lei(s.totals.spent), tone: "rosu" },
      { label: "Rămas nealocat", value: lei(s.totals.unallocated), tone: s.totals.unallocated < 0 ? "rosu" : "leu" },
    ],
    sections: [
      { title: "Pe categorii", rows: cats.map(([name, v]) => ({ label: name, value: lei(v), bar: (v / max) * 100, tone: "mov" as const })), empty: "Nicio cheltuială." },
      ...(dues.length ? [{ title: "Credite", rows: loanRows(dues, s) }] : []),
    ],
    cta: { label: "Vezi luna în aplicație", url: `${appUrl}/luna` },
  };
}

export async function monthlyMessage(month: string, appUrl: string): Promise<Message> {
  const s = await buildSummary(month);
  const t = s.totals;
  const p = s.prev;
  const top = s.categories.filter((c) => c.amount > 0).slice(0, 8);
  const max = top[0]?.amount ?? 1;
  const loans = await loadLoans();
  const interest = loans.reduce((a, l) => a + monthCashflow(l.loan, l.sim, month).interest, 0);
  const vs = (now: number, before?: number) => (before ? `${now >= before ? "+" : "−"}${lei(Math.abs(now - before))} față de ${monthLabel(addMonths(month, -1)).split(" ")[0]}` : undefined);
  return {
    emoji: "🗓️",
    title: `Bilanțul lunii ${monthLabel(month)}`,
    intro: t.hasData
      ? t.unallocated >= 0
        ? `Ai încheiat luna pe plus: ${lei(t.unallocated)} au rămas nealocați. Rata de economisire: ${pct(t.savingsRate, 0)}.`
        : `Luna s-a încheiat pe minus cu ${lei(-t.unallocated)}. Merită o privire peste categoriile de mai jos.`
      : "Luna trecută nu are date introduse.",
    kpis: [
      { label: "Venituri", value: lei(t.income), sub: vs(t.income, p?.income), tone: "leu" },
      { label: "Cheltuieli", value: lei(t.spent), sub: vs(t.spent, p?.spent), tone: "rosu" },
      { label: "Economii și investiții", value: lei(t.savedTotal), sub: `rată de economisire ${pct(t.savingsRate, 0)}`, tone: "galben" },
      { label: "Rate credite", value: lei(t.loanPayments + t.loanInsurance), sub: interest ? `din care dobândă ${lei(interest)}` : undefined, tone: "mov" },
    ],
    callouts: t.dti > 40 ? [{ text: `Ratele au fost ${pct(t.dti, 0)} din venit — peste pragul de 40% recomandat.`, tone: "rosu" }] : [],
    sections: [
      { title: "Unde s-au dus banii", rows: top.map((c) => ({ label: c.name, value: lei(c.amount), sub: c.avg3 ? `media: ${lei(c.avg3)}` : undefined, bar: (c.amount / max) * 100, tone: "mov" as const })), empty: "Nicio cheltuială." },
      ...(s.loans.length
        ? [{ title: "Credite la final de lună", rows: s.loans.map((l) => ({ label: l.loan.name, value: lei(l.status.balance), sub: `${pct(l.status.paidPct, 1)} din principal achitat`, bar: l.status.paidPct, tone: "leu" as const })) }]
        : []),
    ],
    cta: { label: "Deschide bilanțul în aplicație", url: `${appUrl}/` },
    attachment: await monthlyReceipt(month),
  };
}

/** Bonul lunii în PDF, atașat bilanțului lunar. Dacă generarea eșuează, bilanțul pleacă fără el. */
async function monthlyReceipt(month: string): Promise<Message["attachment"]> {
  try {
    const content = await renderReceiptPdf(await buildReceipt(month));
    return { filename: receiptFilename(month), content, caption: `🧾 Bonul lunii ${monthLabel(month)}` };
  } catch (e) {
    console.error("Bonul lunar nu a putut fi generat:", e);
    return undefined;
  }
}

// ---------- Trimiterea ----------

type Target = { chatId: number | null; email: string | null };

async function targetFor(userId: number): Promise<Target> {
  const [link, email] = await Promise.all([
    (await getSystemDb()).prepare("SELECT chat_id FROM telegram_links WHERE user_id = ?").get<{ chat_id: string }>(userId),
    getSetting("notif_email"),
  ]);
  return { chatId: link ? Number(link.chat_id) : null, email: email && isEmail(email) ? email : null };
}

/** Rezervă cheile în jurnal și întoarce doar pe cele încă netrimise. */
async function claim(userId: number, kind: string, keys: string[]) {
  const fresh: string[] = [];
  for (const key of keys) {
    const res = await (await getSystemDb())
      .prepare("INSERT INTO notification_log (user_id, kind, period_key) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
      .run(userId, kind, key);
    if (res.changes > 0) fresh.push(key);
  }
  return fresh;
}

async function release(userId: number, kind: string, keys: string[]) {
  for (const key of keys) {
    await (await getSystemDb()).prepare("DELETE FROM notification_log WHERE user_id = ? AND kind = ? AND period_key = ?").run(userId, kind, key);
  }
}

const SUBJECT_PREFIX = "Leuța · ";

export async function deliver(m: Message, channels: Channel[], target: Target, appUrl: string): Promise<Channel[]> {
  const sent: Channel[] = [];
  const errors: string[] = [];
  if (channels.includes("telegram") && target.chatId && telegramConfigured()) {
    await sendTelegram(target.chatId, toTelegram(m)).then(() => sent.push("telegram"), (e) => errors.push(e.message));
    // Fișierul pleacă după mesaj; dacă el nu ajunge, mesajul rămâne trimis (nu-l retrimitem).
    if (m.attachment && sent.includes("telegram")) {
      await sendTelegramDocument(target.chatId, m.attachment.filename, m.attachment.content, m.attachment.caption).catch((e) =>
        console.error("Bonul lunar nu a putut fi trimis pe Telegram:", e),
      );
    }
  }
  if (channels.includes("email") && target.email && emailConfigured()) {
    const files = m.attachment ? [{ filename: m.attachment.filename, content: m.attachment.content }] : [];
    await sendEmail(target.email, `${SUBJECT_PREFIX}${m.title}`, toEmailHtml(m, appUrl), toPlainText(m), files).then(
      () => sent.push("email"),
      (e) => errors.push(e.message),
    );
  }
  if (!sent.length && errors.length) throw new Error(errors.join("; "));
  return sent;
}

/** Notificările zilnice ale unui utilizator (apelat de cron la 21:00, ora României). */
export async function runForUser(userId: number, appUrl: string, at: Date = new Date()) {
  return runAsUser(userId, async () => {
    const now = localNow(at);
    const prefs = parsePrefs(await getSetting("notif_prefs"));
    const target = await targetFor(userId);
    const report: Record<string, string> = {};

    // Trimite doar dacă măcar o cheie e nouă; la eșec, cheile se eliberează și se reîncearcă la rularea următoare.
    const send = async (kind: NotifyKind, keys: string[], build: () => Promise<Message>) => {
      const channels = (["telegram", "email"] as const).filter((c) => prefs[kind][c]);
      const reachable = channels.filter((c) => (c === "telegram" ? target.chatId : target.email));
      if (!reachable.length) return;
      const fresh = await claim(userId, kind, keys);
      if (!fresh.length) return;
      try {
        const sent = await deliver(await build(), reachable, target, appUrl);
        report[`${kind}:${fresh.join(",")}`] = sent.join(",") || "nimic";
      } catch (e) {
        await release(userId, kind, fresh);
        report[`${kind}:${fresh.join(",")}`] = `eroare: ${(e as Error).message}`;
      }
    };

    await send("daily", [now.date], () => dailyMessage(now));
    for (const a of await dueAlerts(now)) await send("loan_due", [a.key], async () => a.message);
    const budget = await budgetAlerts(now);
    if (budget) await send("budget", budget.keys, async () => budget.message);
    if (now.weekday === 0) await send("weekly", [isoWeek(now.date)], () => weeklyMessage(now, appUrl));
    if (now.day === 1) {
      const prev = addMonths(now.month, -1);
      await send("monthly", [prev], () => monthlyMessage(prev, appUrl));
    }
    return report;
  });
}

/** Mesaj de test (fără jurnal), din Setări. */
export async function testMessage(userId: number, kind: NotifyKind, channel: Channel, appUrl: string) {
  return runAsUser(userId, async () => {
    const now = localNow();
    const target = await targetFor(userId);
    if (channel === "telegram" && !target.chatId) throw new Error("Conectează întâi Telegram.");
    if (channel === "email" && !target.email) throw new Error("Completează și salvează întâi adresa de email.");
    let m: Message;
    if (kind === "daily") m = await dailyMessage(now);
    else if (kind === "weekly") m = await weeklyMessage(now, appUrl);
    else if (kind === "monthly") m = await monthlyMessage(addMonths(now.month, -1), appUrl);
    else if (kind === "budget") {
      m = (await budgetAlerts(now))?.message ?? {
        emoji: "✅",
        title: "Nicio alertă de buget",
        intro: "Toate categoriile sunt sub 80% din media obișnuită și luna nu e pe minus. Așa arată mesajul când e ceva de semnalat.",
      };
    } else {
      m = (await dueAlerts(now, true))[0]?.message ?? {
        emoji: "📅",
        title: "Nicio scadență în următoarele zile",
        intro: "Vei primi un mesaj cu 3 zile înainte de rată și cu 7 zile înainte de PAD / asigurarea anuală.",
      };
    }
    m = { ...m, subtitle: `[TEST] ${m.subtitle ?? ""}`.trim() };
    return deliver(m, [channel], target, appUrl);
  });
}
