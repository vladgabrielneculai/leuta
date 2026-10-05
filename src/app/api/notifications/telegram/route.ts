import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, sha256 } from "@/lib/auth";
import { getSystemDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { botUsername, configureBot, sendTelegram, telegramConfigured } from "@/lib/notify/telegram";

export const dynamic = "force-dynamic";

function appUrl(req: NextRequest) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return `https://${host}`;
}

/**
 * Pornește conectarea: configurează webhook-ul botului spre această aplicație și întoarce un link
 * t.me/<bot>?start=<cod>. Codul e de unică folosință și expiră în 15 minute.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
    if (!telegramConfigured()) {
      return NextResponse.json({ error: "Botul nu e configurat: adaugă TELEGRAM_BOT_TOKEN în Vercel și redeployează." }, { status: 400 });
    }
    await configureBot(appUrl(req));
    const code = crypto.randomBytes(24).toString("base64url");
    await (await getSystemDb())
      .prepare(
        `INSERT INTO auth_challenges (id, user_id, purpose, challenge, expires_at)
         VALUES (?, ?, 'telegram', '', now() + interval '15 minutes')`,
      )
      .run(sha256(code), session.id);
    return NextResponse.json({ url: `https://t.me/${await botUsername()}?start=${code}` });
  } catch (err) {
    return errorResponse(err, "Conectarea Telegram nu a putut porni.");
  }
}

/** Deconectează Telegram (botul nu mai trimite nimic și nu mai acceptă cheltuieli de la acel chat). */
export async function DELETE() {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
    const row = await (await getSystemDb())
      .prepare("DELETE FROM telegram_links WHERE user_id = ? RETURNING chat_id")
      .get<{ chat_id: string }>(session.id);
    if (row && telegramConfigured()) {
      await sendTelegram(Number(row.chat_id), "Contul Leuța a fost deconectat de la acest chat.").catch(() => undefined);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Deconectarea nu a reușit.");
  }
}
