import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import {
  getCurrentSession, isLockedOut, LOCKOUT_MESSAGE, logAuthEvent, markReauthenticated, passkeyCount, recordFailedLogin,
  requestMeta, verifyPassword,
} from "@/lib/auth";
import { getSystemDb as getDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { clearChallengeCookie, credentialById, relyingParty, takeChallenge } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

/** Confirmă identitatea pentru următoarele minute (acțiuni sensibile). */
export async function POST(req: NextRequest) {
  const meta = requestMeta(req.headers);
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
    if (await isLockedOut(meta.ip)) return NextResponse.json({ error: LOCKOUT_MESSAGE }, { status: 429 });
    const body = (await req.json()) as { response?: AuthenticationResponseJSON; password?: string };
    const db = await getDb();

    if ((await passkeyCount(session.id)) > 0) {
      // Cu passkey activ, doar passkey-ul confirmă identitatea (parola singură nu mai e suficientă).
      const challenge = await takeChallenge(req, "reauth", session.id);
      const credential = body.response?.id ? await credentialById(String(body.response.id)) : null;
      const result =
        challenge && credential && credential.userId === session.id && body.response
          ? await verifyAuthenticationResponse({
              response: body.response,
              expectedChallenge: challenge,
              expectedOrigin: relyingParty(req).origin,
              expectedRPID: relyingParty(req).rpID,
              credential,
              requireUserVerification: true,
            }).catch(() => null)
          : null;
      if (!result?.verified || !credential) {
        await recordFailedLogin(meta.ip);
        await logAuthEvent(session.id, false, "reconfirmare", meta, "passkey invalid");
        return NextResponse.json({ error: "Passkey-ul nu a putut fi verificat." }, { status: 401 });
      }
      await db
        .prepare("UPDATE webauthn_credentials SET counter = ?, last_used_at = now() WHERE id = ?")
        .run(result.authenticationInfo.newCounter, credential.id);
    } else {
      const row = await db
        .prepare("SELECT password_hash, salt FROM users WHERE id = ?")
        .get<{ password_hash: string; salt: string }>(session.id);
      const ok = row ? (await verifyPassword(String(body.password ?? "").slice(0, 200), row.salt, row.password_hash)).ok : false;
      if (!ok) {
        await recordFailedLogin(meta.ip, session.id);
        await logAuthEvent(session.id, false, "reconfirmare", meta, "parolă greșită");
        return NextResponse.json({ error: "Parola este incorectă." }, { status: 401 });
      }
    }

    await markReauthenticated(session.sessionId);
    const res = NextResponse.json({ ok: true });
    clearChallengeCookie(res);
    return res;
  } catch (err) {
    return errorResponse(err, "Confirmarea nu a reușit.");
  }
}
