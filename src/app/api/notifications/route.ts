import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getSetting, getSystemDb, setSetting } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { emailConfigured, isEmail } from "@/lib/notify/email";
import { NOTIFY_KINDS, parsePrefs } from "@/lib/notify/kinds";
import { botUsername, telegramConfigured } from "@/lib/notify/telegram";

export const dynamic = "force-dynamic";

/** Setările de notificări ale utilizatorului + starea canalelor. */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
  const [prefs, email, link] = await Promise.all([
    getSetting("notif_prefs"),
    getSetting("notif_email"),
    (await getSystemDb())
      .prepare("SELECT username, linked_at FROM telegram_links WHERE user_id = ?")
      .get<{ username: string; linked_at: string }>(session.id),
  ]);
  return NextResponse.json({
    prefs: parsePrefs(prefs),
    email: email ?? "",
    telegram: {
      configured: telegramConfigured(),
      bot: telegramConfigured() ? await botUsername().catch(() => null) : null,
      linked: !!link,
      username: link?.username ?? null,
      linkedAt: link?.linked_at ?? null,
    },
    emailConfigured: emailConfigured(),
  });
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
    const body = (await req.json()) as { prefs?: unknown; email?: string };
    if (body.prefs !== undefined) {
      const clean = parsePrefs(JSON.stringify(body.prefs));
      await setSetting("notif_prefs", JSON.stringify(Object.fromEntries(NOTIFY_KINDS.map((k) => [k, clean[k]]))));
    }
    if (body.email !== undefined) {
      const email = String(body.email).trim();
      if (email && !isEmail(email)) return NextResponse.json({ error: "Adresa de email nu e validă." }, { status: 400 });
      await setSetting("notif_email", email);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Setările nu au putut fi salvate.");
  }
}
