import { NextRequest, NextResponse } from "next/server";
import { requireRecentAuth, SESSION_COOKIE } from "@/lib/auth";
import { getSystemDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Ștergerea definitivă a propriului cont (dreptul la ștergere, art. 17 GDPR). Cere identitatea confirmată
 * recent și numele de utilizator scris de mână. Toate datele contului (financiare, profil, sesiuni, passkey-uri,
 * notificări) au `on delete cascade`, deci dispar odată cu rândul din `users`. Ultimul administrator nu se poate
 * șterge, ca aplicația să nu rămână fără cineva care să trimită invitații.
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireRecentAuth();
  if ("response" in auth) return auth.response;
  const me = auth.session;
  try {
    const body = await req.json().catch(() => ({}));
    if (String(body.confirm ?? "").trim() !== me.username) {
      return NextResponse.json({ error: "Scrie exact numele de utilizator ca să confirmi ștergerea." }, { status: 400 });
    }
    const db = await getSystemDb();
    if (me.is_admin) {
      const admins = await db.prepare("SELECT COUNT(*)::int AS c FROM users WHERE is_admin AND id <> ?").get<{ c: number }>(me.id);
      if (!admins?.c) {
        return NextResponse.json(
          { error: "Ești singurul administrator. Contul de administrator nu se poate șterge din aplicație." },
          { status: 409 },
        );
      }
    }
    await db.prepare("DELETE FROM users WHERE id = ?").run(me.id);
    const res = NextResponse.json({ ok: true });
    res.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    return errorResponse(err, "Contul nu a putut fi șters.");
  }
}
