import crypto from "crypto";

/**
 * Clientul Bot API Telegram (fără biblioteci). Token-ul vine din TELEGRAM_BOT_TOKEN (Vercel → Environment
 * Variables); fără el, funcțiile de Telegram sunt pur și simplu dezactivate.
 */

export type InlineButton = { text: string; callback_data: string };
export type Keyboard = InlineButton[][];

const API = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";

export const telegramConfigured = () => !!process.env.TELEGRAM_BOT_TOKEN;

export async function tg<T = unknown>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Botul Telegram nu e configurat (lipsește TELEGRAM_BOT_TOKEN).");
  const r = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!j.ok) throw new Error(`Telegram: ${j.description ?? r.status}`);
  return j.result as T;
}

export function sendTelegram(chatId: number | string, html: string, keyboard?: Keyboard) {
  return tg("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

export function editTelegram(chatId: number | string, messageId: number, html: string, keyboard?: Keyboard) {
  return tg("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: keyboard ?? [] },
  });
}

let cachedUsername: string | null = null;
export async function botUsername(): Promise<string> {
  if (!cachedUsername) cachedUsername = (await tg<{ username: string }>("getMe")).username;
  return cachedUsername;
}

/**
 * Secretul cu care Telegram își semnează apelurile către webhook (header X-Telegram-Bot-Api-Secret-Token).
 * Derivat din token-ul botului, ca să nu mai fie nevoie de încă o variabilă de mediu.
 */
export function webhookSecret() {
  return crypto.createHmac("sha256", process.env.TELEGRAM_BOT_TOKEN ?? "").update("bp-telegram-webhook").digest("hex");
}

export function verifyWebhookSecret(header: string | null) {
  if (!telegramConfigured() || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(webhookSecret());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Leagă botul de aplicație: webhook + lista de comenzi din meniul Telegram. */
export async function configureBot(baseUrl: string) {
  await tg("setWebhook", {
    url: `${baseUrl}/api/telegram/webhook`,
    secret_token: webhookSecret(),
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  await tg("setMyCommands", {
    commands: [
      { command: "azi", description: "Cheltuielile de azi" },
      { command: "luna", description: "Situația lunii" },
      { command: "sold", description: "Creditele: sold și rata următoare" },
      { command: "anuleaza", description: "Șterge ultima cheltuială adăugată" },
      { command: "ajutor", description: "Cum adaugi cheltuieli" },
    ],
  });
}

/** Text sigur pentru parse_mode HTML. */
export function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
