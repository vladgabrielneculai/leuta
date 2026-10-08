import { NextRequest, NextResponse } from "next/server";
import { createPasswordReset, logAuthEvent, requestMeta, requireAdmin, RESET_HOURS } from "@/lib/auth";
import { getSystemDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Link de resetare pentru un cont care nu mai poate intra (parolă uitată, telefon cu 2FA pierdut). Administratorul
 * îl trimite persoanei pe un canal în care are încredere; linkul merge o singură dată, cel mult 24 de ore.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const id = Number(body.id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: "Cont invalid." }, { status: 400 });
    if (id === auth.session.id) {
      return NextResponse.json({ error: "Propriul cont îl schimbi din Setări → Securitate." }, { status: 400 });
    }
    const user = await (await getSystemDb())
      .prepare("SELECT id, username FROM users WHERE id = ? AND disabled_at IS NULL")
      .get<{ id: number; username: string }>(id);
    if (!user) return NextResponse.json({ error: "Contul nu există sau e dezactivat." }, { status: 404 });

    const { code, expiresAt } = await createPasswordReset(user.id, auth.session.id);
    const base = (process.env.APP_URL || req.nextUrl.origin).replace(/\/$/, "");
    await logAuthEvent(user.id, true, "resetare-creata", requestMeta(req.headers), `de @${auth.session.username}`);
    return NextResponse.json({ link: `${base}/resetare?cod=${code}`, expiresAt, hours: RESET_HOURS, username: user.username });
  } catch (err) {
    return errorResponse(err, "Linkul de resetare nu a putut fi creat.");
  }
}
