import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import {
  getCurrentSession, isLockedOut, isProtected, LOCKOUT_MESSAGE, logAuthEvent, markReauthenticated, recordFailedLogin,
  requestMeta, secondFactors, useRecoveryCode, useTotpCode, verifyPassword,
} from "@/lib/auth";
import { getSystemDb as getDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { clearChallengeCookie, credentialById, relyingParty, takeChallenge } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

type Body = { response?: AuthenticationResponseJSON; totpCode?: string; recoveryCode?: string; password?: string };

/** Confirmă identitatea pentru următoarele minute (acțiuni sensibile). */
export async function POST(req: NextRequest) {
  const meta = requestMeta(req.headers);
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
    if (await isLockedOut(meta.ip)) return NextResponse.json({ error: LOCKOUT_MESSAGE }, { status: 429 });
    const body = (await req.json()) as Body;
    const db = await getDb();
    const factors = await secondFactors(session.id);

    const fail = async (reason: string, error: string) => {
      await recordFailedLogin(meta.ip, session.id);
      await logAuthEvent(session.id, false, "reconfirmare", meta, reason);
      return NextResponse.json({ error }, { status: 401 });
    };

    if (!isProtected(factors)) {
      const row = await db
        .prepare("SELECT password_hash, salt FROM users WHERE id = ?")
        .get<{ password_hash: string; salt: string }>(session.id);
      const ok = row ? (await verifyPassword(String(body.password ?? "").slice(0, 200), row.salt, row.password_hash)).ok : false;
      if (!ok) return fail("parolă greșită", "Parola este incorectă.");
    } else if (body.response) {
      // Cu o protecție activă, parola singură nu mai confirmă identitatea.
      const challenge = await takeChallenge(req, "reauth", session.id);
      const credential = body.response.id ? await credentialById(String(body.response.id)) : null;
      const { rpID, origin } = relyingParty(req);
      const result =
        challenge && credential && credential.userId === session.id
          ? await verifyAuthenticationResponse({
              response: body.response,
              expectedChallenge: challenge,
              expectedOrigin: origin,
              expectedRPID: rpID,
              credential,
              requireUserVerification: true,
            }).catch(() => null)
          : null;
      if (!result?.verified || !credential) return fail("Face ID / amprentă invalidă", "Face ID / amprenta nu a putut fi verificată.");
      await db
        .prepare("UPDATE webauthn_credentials SET counter = ?, last_used_at = now() WHERE id = ?")
        .run(result.authenticationInfo.newCounter, credential.id);
    } else if (body.totpCode && factors.totp) {
      if (!(await useTotpCode(session.id, String(body.totpCode).slice(0, 20)))) return fail("cod 2FA greșit", "Codul nu este corect sau a expirat.");
    } else if (body.recoveryCode) {
      if (!(await useRecoveryCode(session.id, String(body.recoveryCode).slice(0, 40)))) {
        return fail("cod de recuperare greșit", "Codul de recuperare nu este corect sau a fost deja folosit.");
      }
    } else {
      return NextResponse.json({ error: "Confirmă cu Face ID / amprentă sau cu un cod." }, { status: 400 });
    }

    await markReauthenticated(session.sessionId);
    const res = NextResponse.json({ ok: true });
    clearChallengeCookie(res);
    return res;
  } catch (err) {
    return errorResponse(err, "Confirmarea nu a reușit.");
  }
}
