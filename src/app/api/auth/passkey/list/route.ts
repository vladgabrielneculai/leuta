import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, logAuthEvent, requestMeta, requireRecentAuth } from "@/lib/auth";
import { getSystemDb as getDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
  const rows = await (await getDb())
    .prepare(
      `SELECT id, name, device_type, backed_up, created_at, last_used_at
       FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at`,
    )
    .all(session.id);
  return NextResponse.json({ passkeys: rows });
}

/** Scoate Face ID / amprenta de pe un dispozitiv (de acolo se va intra din nou cu parola). */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireRecentAuth();
    if ("response" in auth) return auth.response;
    const { session } = auth;
    const id = req.nextUrl.searchParams.get("id") ?? "";
    const res = await (await getDb())
      .prepare("DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?")
      .run(id, session.id);
    if (!res.changes) return NextResponse.json({ error: "Dispozitivul nu există." }, { status: 404 });
    await logAuthEvent(session.id, true, "passkey-sters", requestMeta(req.headers));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Dispozitivul nu a putut fi scos.");
  }
}
