import { NextRequest, NextResponse } from "next/server";
import { createInvitation, INVITE_DAYS, requireAdmin } from "@/lib/auth";
import { getSystemDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

type InvitationRow = {
  id: number;
  note: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  used_by_name: string | null;
};

/** Invitațiile din ultimele 90 de zile, cu starea lor (activă / folosită / expirată / anulată). */
export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    const rows = await (await getSystemDb())
      .prepare(
        `SELECT i.id, i.note, i.created_at, i.expires_at, i.used_at, i.revoked_at, u.username AS used_by_name
         FROM invitations i LEFT JOIN users u ON u.id = i.used_by
         WHERE i.created_at > now() - interval '90 days'
         ORDER BY i.created_at DESC`,
      )
      .all<InvitationRow>();
    const now = Date.now();
    return NextResponse.json(
      rows.map((r) => ({
        ...r,
        status: r.used_at ? "used" : r.revoked_at ? "revoked" : new Date(r.expires_at).getTime() < now ? "expired" : "active",
      })),
    );
  } catch (err) {
    return errorResponse(err, "Invitațiile nu au putut fi încărcate.");
  }
}

/** Invitație nouă. Codul se întoarce o singură dată (în baza de date rămâne doar hash-ul lui). */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const note = String(body.note ?? "").trim();
    const inv = await createInvitation(auth.session.id, note);
    const origin = req.headers.get("origin") ?? req.nextUrl.origin;
    return NextResponse.json({
      id: inv.id,
      link: `${origin}/inregistrare?cod=${inv.code}`,
      expiresAt: inv.expiresAt,
      days: INVITE_DAYS,
    });
  } catch (err) {
    return errorResponse(err, "Invitația nu a putut fi creată.");
  }
}

/** Anulează o invitație nefolosită. */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id)) return NextResponse.json({ error: "Invitație invalidă." }, { status: 400 });
    const res = await (await getSystemDb())
      .prepare("UPDATE invitations SET revoked_at = now() WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL")
      .run(id);
    if (!res.changes) return NextResponse.json({ error: "Invitația a fost deja folosită sau anulată." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Invitația nu a putut fi anulată.");
  }
}
