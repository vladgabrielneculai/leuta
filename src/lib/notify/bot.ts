import { buildSummary } from "../analytics";
import { sha256 } from "../auth";
import { getDb, getSystemDb, runAsUser } from "../db";
import { lei, monthLabel, type Kind } from "../util";
import { dailyMessage } from "./notifications";
import { toTelegram } from "./render";
import { editTelegram, esc, sendTelegram, tg, type Keyboard } from "./telegram";
import { localNow } from "./time";

/**
 * Botul de Telegram: legarea contului, adăugarea cheltuielilor din chat („45 mâncare”) și comenzi rapide.
 * Fiecare acțiune rulează ca utilizatorul legat de chat (runAsUser), deci vede și modifică doar datele lui.
 */

type TgUser = { id: number; username?: string; first_name?: string };
type TgMessage = { message_id: number; chat: { id: number; type: string }; from?: TgUser; text?: string };
type TgCallback = { id: string; from: TgUser; message?: TgMessage; data?: string };
export type TgUpdate = { update_id: number; message?: TgMessage; callback_query?: TgCallback };

type Category = { id: number; name: string; kind: Kind };

const HELP = [
  "<b>Cum adaugi o cheltuială</b>",
  "Scrie suma și ce ai cumpărat:",
  "• <code>45 mâncare</code>",
  "• <code>120,50 benzină</code>",
  "• <code>20 eur cadou</code>",
  "• <code>+5000 salariu</code> (venit)",
  "",
  "Aleg singur categoria; o poți schimba cu butonul de sub mesaj.",
  "",
  "<b>Comenzi</b>: /azi · /luna · /sold · /anuleaza",
].join("\n");

const strip = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Cuvinte-cheie → categoria implicită cu acel nume (dacă există în cont). */
const KEYWORDS: [string, string[]][] = [
  ["Alimente", ["mancare", "alimente", "kaufland", "lidl", "carrefour", "mega", "profi", "penny", "auchan", "piata", "paine", "supermarket", "magazin", "cumparaturi alimentare"]],
  ["Restaurante și ieșiri", ["restaurant", "cafea", "coffee", "bere", "bar", "pizza", "glovo", "tazz", "wolt", "iesire", "shaorma", "burger", "mcdonalds", "kfc", "cina", "pranz", "sushi"]],
  ["Transport și mașină", ["benzina", "motorina", "carburant", "plin", "petrom", "omv", "mol", "rompetrol", "lukoil", "uber", "bolt", "taxi", "metrou", "stb", "parcare", "rovinieta", "service", "itp", "masina", "tren", "cfr", "autobuz"]],
  ["Sănătate", ["farmacie", "catena", "helpnet", "sensiblu", "doctor", "medic", "analize", "dentist", "medicamente", "regina maria", "medlife"]],
  ["Cumpărături", ["haine", "emag", "altex", "ikea", "dedeman", "decathlon", "cumparaturi", "pantofi", "temu", "zara", "hm"]],
  ["Abonamente", ["netflix", "spotify", "hbo", "max", "youtube", "abonament", "icloud", "disney", "chatgpt", "sala"]],
  ["Internet și telefon", ["digi", "orange", "vodafone", "telekom", "internet", "telefon", "cartela"]],
  ["Energie electrică (curent)", ["curent", "enel", "electrica", "hidroelectrica", "energie"]],
  ["Gaze naturale", ["gaz", "gaze", "engie"]],
  ["Întreținere și apă", ["intretinere", "apa", "bloc"]],
  ["Cadouri", ["cadou", "cadouri", "flori"]],
  ["Călătorii", ["hotel", "booking", "airbnb", "zbor", "avion", "vacanta", "cazare"]],
  ["Chirie", ["chirie"]],
  ["Salariu", ["salariu", "leafa"]],
  ["Tichete de masă", ["tichete", "bonuri"]],
  ["Venituri extra", ["bonus", "freelance", "extra", "vanzare", "dividende"]],
];

/** Categoria potrivită pentru text: nume de categorie, cuvinte-cheie, apoi istoricul tău. */
async function guessCategory(text: string, income: boolean, cats: Category[]): Promise<Category | null> {
  const pool = cats.filter((c) => (income ? c.kind === "income" : c.kind === "fixed" || c.kind === "variable"));
  const words = strip(text).split(" ").filter((w) => w.length >= 3);
  if (words.length) {
    const byName = pool.find((c) => strip(c.name).split(" ").some((n) => n.length >= 3 && words.some((w) => n.startsWith(w) || w.startsWith(n))));
    if (byName) return byName;
    for (const [name, keys] of KEYWORDS) {
      const cat = pool.find((c) => strip(c.name) === strip(name));
      if (cat && keys.some((k) => strip(text).includes(k))) return cat;
    }
    // Istoric: ultima înregistrare cu un cuvânt comun în descriere.
    const prev = await (await getDb())
      .prepare(
        `SELECT category_id FROM entries
         WHERE category_id IS NOT NULL AND description <> '' AND (${words.map(() => "lower(description) LIKE ?").join(" OR ")})
         ORDER BY id DESC LIMIT 1`,
      )
      .get<{ category_id: number }>(...words.map((w) => `%${w}%`));
    const hist = prev && pool.find((c) => c.id === prev.category_id);
    if (hist) return hist;
  }
  const fallback = income ? ["Venituri extra"] : ["Neprevăzute", "Cumpărături"];
  return pool.find((c) => fallback.some((f) => strip(f) === strip(c.name))) ?? pool[0] ?? null;
}

/** „45”, „45,5 mâncare”, „20 eur cadou”, „+5000 salariu”, „1.250 chirie” */
export function parseExpense(text: string) {
  const m = /^\s*([+-]?)\s*(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(lei|ron|eur|euro|€)?\b\s*(.*)$/i.exec(text);
  if (!m) return null;
  const raw = m[2].replace(/\s/g, "");
  const amount = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(raw) ? Number(raw.replace(/\./g, "").replace(",", ".")) : Number(raw.replace(",", "."));
  if (!(amount > 0) || amount > 10_000_000) return null;
  return {
    income: m[1] === "+",
    amount,
    currency: m[3] && /eur|€/i.test(m[3]) ? "EUR" : "RON",
    description: m[4].trim().slice(0, 120),
  };
}

const kindLabel = (k: Kind) => (k === "income" ? "venit" : k === "fixed" ? "cost fix" : "cheltuială variabilă");

function entryText(e: { amount: number; currency: string; description: string; kind: Kind }, cat: Category | null, prefix = "✅ Adăugat") {
  const amount = e.currency === "EUR" ? `${e.amount.toLocaleString("ro-RO")} €` : lei(e.amount, true);
  return `${prefix}: <b>${esc(amount)}</b> · ${esc(cat?.name ?? "fără categorie")} <i>(${kindLabel(e.kind)})</i>${e.description ? `\n<i>${esc(e.description)}</i>` : ""}`;
}

const entryKeyboard = (id: number): Keyboard => [[
  { text: "🏷 Schimbă categoria", callback_data: `cat:${id}` },
  { text: "↩️ Anulează", callback_data: `undo:${id}` },
]];

async function categories(): Promise<Category[]> {
  return (await getDb()).prepare("SELECT id, name, kind FROM categories WHERE kind IN ('income','fixed','variable') ORDER BY kind, name").all<Category>();
}

async function addEntry(chatId: number, text: string) {
  const p = parseExpense(text);
  if (!p) return sendTelegram(chatId, `Nu am înțeles. ${HELP}`);
  const cats = await categories();
  const cat = await guessCategory(p.description, p.income, cats);
  const kind: Kind = p.income ? "income" : cat?.kind === "fixed" ? "fixed" : "variable";
  const month = localNow().month;
  const info = await (await getDb())
    .prepare("INSERT INTO entries (month, kind, category_id, description, amount, currency, recurring) VALUES (?, ?, ?, ?, ?, ?, 0)")
    .run(month, kind, cat?.id ?? null, p.description, p.amount, p.currency);
  await sendTelegram(chatId, entryText({ ...p, kind }, cat), entryKeyboard(info.lastInsertRowid));
}

async function todayText() {
  const m = await dailyMessage(localNow());
  return toTelegram({ ...m, emoji: "📋", title: "Azi", footer: undefined });
}

async function monthText() {
  const now = localNow();
  const s = await buildSummary(now.month);
  const t = s.totals;
  const top = s.categories.filter((c) => c.amount > 0).slice(0, 6);
  return [
    `🗓️ <b>${esc(monthLabel(now.month))}</b>`,
    `Venituri: <b>${lei(t.income)}</b>`,
    `Cheltuieli: <b>${lei(t.spent)}</b> (fixe ${lei(t.fixed)}, variabile ${lei(t.variable)}, rate ${lei(t.loanPayments + t.loanInsurance)})`,
    `Economii: <b>${lei(t.savedTotal)}</b>`,
    `Rămas nealocat: <b>${lei(t.unallocated)}</b>`,
    ...(top.length ? ["", "<b>Top categorii</b>", ...top.map((c) => `• ${esc(c.name)} — ${lei(c.amount)}${c.avg3 ? ` <i>(media ${lei(c.avg3)})</i>` : ""}`)] : []),
  ].join("\n");
}

async function loansText() {
  const s = await buildSummary(localNow().month);
  if (!s.loans.length) return "Nu ai credite în aplicație.";
  return [
    "💳 <b>Credite</b>",
    ...s.loans.map(
      (l) =>
        `• <b>${esc(l.loan.name)}</b>: sold ${lei(l.status.balance)} · rata următoare ${lei(l.status.nextPayment + l.status.nextInsurance, true)}${l.status.nextMonth ? ` (${monthLabel(l.status.nextMonth)})` : ""} · dobândă ${l.status.currentRate.toLocaleString("ro-RO")}%`,
    ),
  ].join("\n");
}

async function undoLast(chatId: number) {
  const db = await getDb();
  const last = await db
    .prepare("SELECT id, amount, currency, description, kind, category_id FROM entries WHERE created_at > now() - interval '1 day' ORDER BY created_at DESC, id DESC LIMIT 1")
    .get<{ id: number; amount: number; currency: string; description: string; kind: Kind; category_id: number | null }>();
  if (!last) return sendTelegram(chatId, "Nu am găsit nicio înregistrare adăugată în ultimele 24 de ore.");
  await db.prepare("DELETE FROM entries WHERE id = ?").run(last.id);
  const cat = (await categories()).find((c) => c.id === last.category_id) ?? null;
  return sendTelegram(chatId, entryText(last, cat, "🗑 Șters"));
}

/** Leagă chat-ul de contul care a generat codul din Setări. */
async function linkChat(msg: TgMessage, code: string) {
  const sys = await getSystemDb();
  const row = await sys
    .prepare("DELETE FROM auth_challenges WHERE id = ? AND purpose = 'telegram' AND expires_at > now() RETURNING user_id")
    .get<{ user_id: number }>(sha256(code));
  if (!row) return sendTelegram(msg.chat.id, "Codul a expirat sau a fost deja folosit. Generează altul din aplicație: Setări → Notificări → Conectează Telegram.");
  await sys.prepare("DELETE FROM telegram_links WHERE chat_id = ? OR user_id = ?").run(msg.chat.id, row.user_id);
  await sys
    .prepare("INSERT INTO telegram_links (user_id, chat_id, username) VALUES (?, ?, ?)")
    .run(row.user_id, msg.chat.id, (msg.from?.username ?? msg.from?.first_name ?? "").slice(0, 60));
  return sendTelegram(msg.chat.id, `✅ <b>Telegram conectat la Banii mei.</b>\n\nPrimești aici reminderul de seară (21:00) și alertele.\n\n${HELP}`);
}

async function userForChat(chatId: number) {
  const row = await (await getSystemDb()).prepare("SELECT user_id FROM telegram_links WHERE chat_id = ?").get<{ user_id: number }>(chatId);
  return row?.user_id ?? null;
}

async function onMessage(msg: TgMessage) {
  const text = (msg.text ?? "").trim();
  if (msg.chat.type !== "private") return; // doar conversații private cu botul
  const start = /^\/start(?:\s+([A-Za-z0-9_-]{16,64}))?$/.exec(text);
  if (start?.[1]) return linkChat(msg, start[1]);

  const userId = await userForChat(msg.chat.id);
  if (!userId) {
    return sendTelegram(msg.chat.id, "Bun venit! Ca să folosești botul, deschide aplicația <b>Banii mei</b> → Setări → Notificări → <b>Conectează Telegram</b>.");
  }
  return runAsUser(userId, async () => {
    const cmd = text.split(/\s|@/)[0].toLowerCase();
    if (cmd === "/start" || cmd === "/ajutor" || cmd === "/help") return sendTelegram(msg.chat.id, HELP);
    if (cmd === "/azi") return sendTelegram(msg.chat.id, await todayText());
    if (cmd === "/luna") return sendTelegram(msg.chat.id, await monthText());
    if (cmd === "/sold") return sendTelegram(msg.chat.id, await loansText());
    if (cmd === "/anuleaza" || cmd === "/undo") return undoLast(msg.chat.id);
    return addEntry(msg.chat.id, text);
  });
}

async function onCallback(cb: TgCallback) {
  const chatId = cb.message?.chat.id;
  const messageId = cb.message?.message_id;
  const answer = (text?: string) => tg("answerCallbackQuery", { callback_query_id: cb.id, ...(text ? { text } : {}) }).catch(() => undefined);
  if (!chatId || !messageId) return answer();
  const userId = await userForChat(chatId);
  if (!userId) return answer("Chat neconectat.");

  return runAsUser(userId, async () => {
    const [action, idRaw, catRaw] = (cb.data ?? "").split(":");
    const id = Number(idRaw);
    const db = await getDb();
    // RLS: înregistrarea e găsită doar dacă e a acestui utilizator.
    const entry = await db
      .prepare("SELECT id, amount, currency, description, kind, category_id FROM entries WHERE id = ?")
      .get<{ id: number; amount: number; currency: string; description: string; kind: Kind; category_id: number | null }>(id);
    if (!entry) {
      await answer("Înregistrarea nu mai există.");
      return editTelegram(chatId, messageId, "<i>Înregistrarea nu mai există.</i>");
    }
    const cats = await categories();

    if (action === "undo") {
      await db.prepare("DELETE FROM entries WHERE id = ?").run(id);
      await answer("Șters");
      return editTelegram(chatId, messageId, entryText(entry, cats.find((c) => c.id === entry.category_id) ?? null, "🗑 Anulat"));
    }
    if (action === "cat") {
      const pool = cats.filter((c) => (entry.kind === "income" ? c.kind === "income" : c.kind !== "income"));
      const rows: Keyboard = [];
      for (let i = 0; i < pool.length; i += 2) {
        rows.push(pool.slice(i, i + 2).map((c) => ({ text: c.name.slice(0, 30), callback_data: `set:${id}:${c.id}` })));
      }
      rows.push([{ text: "← Înapoi", callback_data: `back:${id}` }]);
      await answer();
      return editTelegram(chatId, messageId, `${entryText(entry, cats.find((c) => c.id === entry.category_id) ?? null, "Alege categoria pentru")}`, rows);
    }
    if (action === "set") {
      const cat = cats.find((c) => c.id === Number(catRaw));
      if (!cat) return answer("Categorie inexistentă.");
      const kind: Kind = entry.kind === "income" ? "income" : cat.kind === "fixed" ? "fixed" : "variable";
      await db.prepare("UPDATE entries SET category_id = ?, kind = ? WHERE id = ?").run(cat.id, kind, id);
      await answer(`Categorie: ${cat.name}`);
      return editTelegram(chatId, messageId, entryText({ ...entry, kind }, cat), entryKeyboard(id));
    }
    if (action === "back") {
      await answer();
      return editTelegram(chatId, messageId, entryText(entry, cats.find((c) => c.id === entry.category_id) ?? null), entryKeyboard(id));
    }
    return answer();
  });
}

export async function handleUpdate(update: TgUpdate) {
  if (update.callback_query) return onCallback(update.callback_query);
  if (update.message?.text) return onMessage(update.message);
}
