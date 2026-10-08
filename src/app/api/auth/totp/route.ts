import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import {
  getCurrentSession, isProtected, logAuthEvent, regenerateRecoveryCodes, requestMeta, requireRecentAuth, revokeSessions,
  secondFactors, sha256,
} from "@/lib/auth";
import { getSystemDb as getDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { generateTotpSecret, matchTotp, otpauthUri } from "@/lib/totp";

export const dynamic = "force-dynamic";

/**
 * Autentificarea în doi pași (2FA) cu o aplicație de coduri. Activarea are doi pași: `start` creează o cheie
 * nouă (QR + text) ținută deoparte 10 minute, iar `enable` o salvează abia după ce aplicația a generat un cod
 * corect — așa nu rămâne nimeni cu 2FA activ pe o cheie pe care n-a apucat s-o scaneze.
 */

const PENDING_MIN = 10;
// Cheia în curs e legată de sesiune (nu de un cookie): altă sesiune a aceluiași cont nu o poate confirma.
const pendingId = (sessionId: string) => sha256(`totp-setup:${sessionId}`);

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
  const row = await (await getDb())
    .prepare("SELECT totp_enabled_at FROM users WHERE id = ? AND totp_secret IS NOT NULL")
    .get<{ totp_enabled_at: string }>(session.id);
  return NextResponse.json({ enabled: !!row, enabledAt: row?.totp_enabled_at ?? null });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRecentAuth();
    if ("response" in auth) return auth.response;
    const { session } = auth;
    const body = await req.json().catch(() => ({}));
    const db = await getDb();

    if (body.action === "start") {
      const secret = generateTotpSecret();
      await db
        .prepare(
          `INSERT INTO auth_challenges (id, user_id, purpose, challenge, expires_at)
           VALUES (?, ?, 'totp-setup', ?, now() + interval '${PENDING_MIN} minutes')
           ON CONFLICT (id) DO UPDATE SET challenge = excluded.challenge, expires_at = excluded.expires_at`,
        )
        .run(pendingId(session.sessionId), session.id, secret);
      const uri = otpauthUri(session.username, secret);
      const qr = await QRCode.toDataURL(uri, { margin: 1, width: 240, errorCorrectionLevel: "M" });
      return NextResponse.json({ secret, uri, qr });
    }

    if (body.action === "enable") {
      const pending = await db
        .prepare("SELECT challenge FROM auth_challenges WHERE id = ? AND user_id = ? AND purpose = 'totp-setup' AND expires_at > now()")
        .get<{ challenge: string }>(pendingId(session.sessionId), session.id);
      if (!pending) return NextResponse.json({ error: "Configurarea a expirat. Pornește-o din nou." }, { status: 400 });
      const step = matchTotp(pending.challenge, String(body.code ?? ""));
      if (step === null) {
        return NextResponse.json({ error: "Codul nu se potrivește. Verifică ora telefonului și scrie codul afișat acum." }, { status: 400 });
      }

      const first = !isProtected(await secondFactors(session.id));
      await db
        .prepare("UPDATE users SET totp_secret = ?, totp_enabled_at = now(), totp_last_step = ? WHERE id = ?")
        .run(pending.challenge, step, session.id);
      await db.prepare("DELETE FROM auth_challenges WHERE id = ?").run(pendingId(session.sessionId));

      // Prima protecție pe lângă parolă: coduri de recuperare + închiderea sesiunilor deschise doar cu parola.
      let recoveryCodes: string[] | null = null;
      if (first) {
        recoveryCodes = await regenerateRecoveryCodes(session.id);
        await revokeSessions(session.id, session.sessionId);
      }
      await logAuthEvent(session.id, true, "totp-activat", requestMeta(req.headers));
      return NextResponse.json({ ok: true, recoveryCodes });
    }

    return NextResponse.json({ error: "Acțiune necunoscută." }, { status: 400 });
  } catch (err) {
    return errorResponse(err, "Autentificarea în doi pași nu a putut fi activată.");
  }
}

/** Dezactivează 2FA. Dacă nu mai rămâne nici Face ID / amprentă, contul se deschide din nou doar cu parola. */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireRecentAuth();
    if ("response" in auth) return auth.response;
    const { session } = auth;
    await (await getDb())
      .prepare("UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = 0 WHERE id = ?")
      .run(session.id);
    await logAuthEvent(session.id, true, "totp-dezactivat", requestMeta(req.headers));
    return NextResponse.json({ ok: true, protected: isProtected(await secondFactors(session.id)) });
  } catch (err) {
    return errorResponse(err, "Autentificarea în doi pași nu a putut fi dezactivată.");
  }
}
