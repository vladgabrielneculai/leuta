import { NextRequest, NextResponse } from "next/server";
import { handleUpdate, type TgUpdate } from "@/lib/notify/bot";
import { verifyWebhookSecret } from "@/lib/notify/telegram";

export const dynamic = "force-dynamic";

/**
 * Mesajele trimise botului. Telegram semnează fiecare apel cu secretul setat la configurarea webhook-ului;
 * fără el, cererea e ignorată (oricine altcineva ar putea apela adresa).
 */
export async function POST(req: NextRequest) {
  if (!verifyWebhookSecret(req.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ error: "Neautorizat." }, { status: 401 });
  }
  try {
    const update = (await req.json()) as TgUpdate;
    await handleUpdate(update);
  } catch (e) {
    // Răspundem 200 oricum: altfel Telegram reîncearcă același mesaj la nesfârșit.
    console.error("Eroare la procesarea mesajului Telegram:", e);
  }
  return NextResponse.json({ ok: true });
}
