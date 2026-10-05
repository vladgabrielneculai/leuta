import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import {
  clearFailedLogins, createSession, isLockedOut, LOCKOUT_MESSAGE, logAuthEvent, recordFailedLogin, requestMeta,
  sessionCookieOptions,
} from "@/lib/auth";
import { getSystemDb as getDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { clearChallengeCookie, credentialById, relyingParty, takeChallenge } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

/** Verifică semnătura passkey-ului și deschide sesiunea. Blocarea contului (parole greșite) nu se aplică aici. */
export async function POST(req: NextRequest) {
  const meta = requestMeta(req.headers);
  try {
    if (await isLockedOut(meta.ip)) return NextResponse.json({ error: LOCKOUT_MESSAGE }, { status: 429 });
    const body = (await req.json()) as { response: AuthenticationResponseJSON; rememberMe?: boolean };
    const challenge = await takeChallenge(req, "login", null);
    const credential = body.response?.id ? await credentialById(String(body.response.id)) : null;
    const fail = async (reason: string) => {
      await recordFailedLogin(meta.ip);
      await logAuthEvent(credential?.userId ?? null, false, "passkey", meta, reason);
      const res = NextResponse.json({ error: "Passkey-ul nu a putut fi verificat. Încearcă din nou." }, { status: 401 });
      clearChallengeCookie(res);
      return res;
    };
    if (!challenge) return fail("provocare expirată");
    if (!credential) return fail("passkey necunoscut");

    const { rpID, origin } = relyingParty(req);
    const result = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential,
      requireUserVerification: true,
    }).catch(() => null);
    if (!result?.verified) return fail("semnătură invalidă");

    const db = await getDb();
    await db
      .prepare("UPDATE webauthn_credentials SET counter = ?, last_used_at = now() WHERE id = ?")
      .run(result.authenticationInfo.newCounter, credential.id);
    const user = await db.prepare("SELECT id, username FROM users WHERE id = ?").get<{ id: number; username: string }>(credential.userId);
    if (!user) return fail("utilizator inexistent");

    await clearFailedLogins(meta.ip, user.id);
    await logAuthEvent(user.id, true, "passkey", meta);
    const { token, expiresAt } = await createSession(user.id, body.rememberMe !== false, "passkey", meta);
    const res = NextResponse.json({ ok: true, user });
    res.cookies.set({ ...sessionCookieOptions(expiresAt), value: token });
    clearChallengeCookie(res);
    return res;
  } catch (err) {
    return errorResponse(err, "Eroare la login-ul cu passkey.");
  }
}
