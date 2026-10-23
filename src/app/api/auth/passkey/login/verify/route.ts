import { NextRequest } from "next/server";
import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import {
  clearFailedLogins, isLockedOut, LOCKOUT_MESSAGE, logAuthEvent, recordFailedLogin, requestMeta, sessionResponse,
} from "@/lib/auth";
import { getSystemDb as getDb } from "@/lib/db";
import { errorResponse, jsonError } from "@/lib/http";
import { clearChallengeCookie, credentialById, relyingParty, takeChallenge } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

/** Verifică semnătura (Face ID / amprentă) și deschide sesiunea. Blocarea contului (parole greșite) nu se aplică aici. */
export async function POST(req: NextRequest) {
  const meta = requestMeta(req.headers);
  try {
    if (await isLockedOut(meta.ip)) return jsonError(LOCKOUT_MESSAGE, 429);
    const body = (await req.json()) as { response: AuthenticationResponseJSON; rememberMe?: boolean };
    const challenge = await takeChallenge(req, "login", null);
    const credential = body.response?.id ? await credentialById(String(body.response.id)) : null;
    const fail = async (reason: string) => {
      await recordFailedLogin(meta.ip);
      await logAuthEvent(credential?.userId ?? null, false, "passkey", meta, reason);
      const res = jsonError("Face ID / amprenta nu a putut fi verificată. Încearcă din nou.", 401);
      clearChallengeCookie(res);
      return res;
    };
    if (!challenge) return fail("provocare expirată");
    if (!credential) return fail("dispozitiv necunoscut");

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
    const user = await db
      .prepare("SELECT id, username FROM users WHERE id = ? AND disabled_at IS NULL")
      .get<{ id: number; username: string }>(credential.userId);
    if (!user) return fail("utilizator inexistent sau dezactivat");

    await clearFailedLogins(meta.ip, user.id);
    await logAuthEvent(user.id, true, "passkey", meta);
    const res = await sessionResponse(user.id, body.rememberMe !== false, "passkey", meta, { ok: true, user });
    clearChallengeCookie(res);
    return res;
  } catch (err) {
    return errorResponse(err, "Eroare la login-ul cu Face ID / amprentă.");
  }
}
