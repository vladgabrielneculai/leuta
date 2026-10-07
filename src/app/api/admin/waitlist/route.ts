import { NextRequest, NextResponse } from "next/server";
import { createInvitation, INVITE_DAYS, requireAdmin } from "@/lib/auth";
import { getSystemDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { emailConfigured, sendEmail } from "@/lib/notify/email";
import { toEmailHtml, toPlainText, type Message } from "@/lib/notify/render";

export const dynamic = "force-dynamic";

type WaitlistRow = {
  id: number;
  email: string;
  created_at: string;
  invited_at: string | null;
  invitation_status: "active" | "used" | "expired" | "revoked" | null;
};

/** Lista de așteptare, cele mai noi înscrieri primele, cu starea invitației trimise. */
export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    const rows = await (await getSystemDb())
      .prepare(
        `SELECT w.id, w.email, w.created_at, w.invited_at,
                CASE WHEN i.id IS NULL THEN NULL
                     WHEN i.used_at IS NOT NULL THEN 'used'
                     WHEN i.revoked_at IS NOT NULL THEN 'revoked'
                     WHEN i.expires_at < now() THEN 'expired'
                     ELSE 'active' END AS invitation_status
         FROM waitlist w LEFT JOIN invitations i ON i.id = w.invitation_id
         ORDER BY w.created_at DESC
         LIMIT 500`,
      )
      .all<WaitlistRow>();
    return NextResponse.json({ rows, emailConfigured: emailConfigured() });
  } catch (err) {
    return errorResponse(err, "Lista de așteptare nu a putut fi încărcată.");
  }
}

/**
 * Trimite (sau retrimite) o invitație unei persoane de pe listă. Creează o invitație nouă, o trimite pe
 * email dacă Resend e configurat și întoarce linkul, ca administratorul să-l poată trimite și altfel.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const id = Number(body.id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: "Înscriere invalidă." }, { status: 400 });
    const db = await getSystemDb();
    const row = await db.prepare("SELECT id, email, invitation_id FROM waitlist WHERE id = ?").get<{ id: number; email: string; invitation_id: number | null }>(id);
    if (!row) return NextResponse.json({ error: "Înscrierea nu mai există." }, { status: 404 });

    // O invitație veche, încă activă, se anulează: rămâne valabil doar linkul nou.
    if (row.invitation_id) {
      await db.prepare("UPDATE invitations SET revoked_at = now() WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL").run(row.invitation_id);
    }
    const inv = await createInvitation(auth.session.id, row.email);
    const appUrl = process.env.APP_URL || req.nextUrl.origin;
    const link = `${appUrl}/inregistrare?cod=${inv.code}`;
    await db.prepare("UPDATE waitlist SET invited_at = now(), invitation_id = ? WHERE id = ?").run(inv.id, id);

    let emailed = false;
    let emailError: string | null = null;
    if (emailConfigured()) {
      const message: Message = {
        emoji: "🎟️",
        title: "Invitația ta în Leuța",
        intro: `Ți-a venit rândul! Îți poți crea contul în Leuța din linkul de mai jos. Linkul merge o singură dată, timp de ${INVITE_DAYS} zile.`,
        cta: { label: "Creează contul", url: link },
      };
      try {
        await sendEmail(row.email, "Invitația ta în Leuța", toEmailHtml(message, appUrl), `${toPlainText(message)}\n\n${link}`);
        emailed = true;
      } catch (e) {
        emailError = (e as Error).message;
      }
    }
    return NextResponse.json({ link, emailed, emailError, days: INVITE_DAYS });
  } catch (err) {
    return errorResponse(err, "Invitația nu a putut fi trimisă.");
  }
}

/** Scoate o persoană de pe listă (la cererea ei sau după ce a primit acces). */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id)) return NextResponse.json({ error: "Înscriere invalidă." }, { status: 400 });
    await (await getSystemDb()).prepare("DELETE FROM waitlist WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Înscrierea nu a putut fi ștearsă.");
  }
}
