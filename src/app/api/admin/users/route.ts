import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireRecentAuth, revokeSessions } from "@/lib/auth";
import { getSystemDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Lista conturilor pentru administrator: doar date de cont (nume, creare, ultima activitate, stare).
 * Datele financiare și profilul celorlalți rămân invizibile și pentru admin (row-level security).
 */
export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    const rows = await (await getSystemDb())
      .prepare(
        `SELECT u.id, u.username, u.created_at, u.is_admin, u.disabled_at,
                GREATEST(
                  (SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id),
                  (SELECT max(e.created_at) FROM login_events e WHERE e.user_id = u.id AND e.success = 1)
                ) AS last_active_at,
                (SELECT count(*)::int FROM webauthn_credentials w WHERE w.user_id = u.id) AS passkeys
         FROM users u
         ORDER BY u.created_at`,
      )
      .all();
    return NextResponse.json({ me: auth.session.id, users: rows });
  } catch (err) {
    return errorResponse(err, "Conturile nu au putut fi încărcate.");
  }
}

/** Dezactivează / reactivează un cont. Dezactivarea închide imediat toate sesiunile lui. */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    const body = await req.json();
    const id = Number(body.id);
    const disabled = !!body.disabled;
    if (!Number.isInteger(id)) return NextResponse.json({ error: "Cont invalid." }, { status: 400 });
    if (id === auth.session.id) return NextResponse.json({ error: "Nu îți poți dezactiva propriul cont." }, { status: 400 });
    const db = await getSystemDb();
    const res = await db
      .prepare(`UPDATE users SET disabled_at = ${disabled ? "now()" : "NULL"} WHERE id = ? AND NOT is_admin`)
      .run(id);
    if (!res.changes) return NextResponse.json({ error: "Contul nu există sau este administrator." }, { status: 404 });
    if (disabled) await revokeSessions(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Contul nu a putut fi actualizat.");
  }
}

/** Șterge definitiv un cont și toate datele lui (cascadă în baza de date). Cere identitatea reconfirmată. */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const recent = await requireRecentAuth();
  if ("response" in recent) return recent.response;
  try {
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id)) return NextResponse.json({ error: "Cont invalid." }, { status: 400 });
    if (id === auth.session.id) return NextResponse.json({ error: "Nu îți poți șterge propriul cont de aici." }, { status: 400 });
    const res = await (await getSystemDb()).prepare("DELETE FROM users WHERE id = ? AND NOT is_admin").run(id);
    if (!res.changes) return NextResponse.json({ error: "Contul nu există sau este administrator." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Contul nu a putut fi șters.");
  }
}
