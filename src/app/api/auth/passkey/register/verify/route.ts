import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { logAuthEvent, requestMeta, requireRecentAuth } from "@/lib/auth";
import { getSystemDb as getDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { clearChallengeCookie, deviceName, encodePublicKey, relyingParty, takeChallenge } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

/** Salvează Face ID / amprenta dispozitivului: de acum, pe el intri dintr-o atingere. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireRecentAuth();
    if ("response" in auth) return auth.response;
    const { session } = auth;
    const body = (await req.json()) as { response: RegistrationResponseJSON; name?: string };
    const challenge = await takeChallenge(req, "register", session.id);
    if (!challenge) return NextResponse.json({ error: "Cererea a expirat. Încearcă din nou." }, { status: 400 });

    const { rpID, origin } = relyingParty(req);
    const result = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    }).catch(() => null);
    if (!result?.verified || !result.registrationInfo) {
      return NextResponse.json({ error: "Face ID / amprenta nu a putut fi verificată." }, { status: 400 });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
    const meta = requestMeta(req.headers);
    const name = String(body.name ?? "").trim().slice(0, 60) || deviceName(meta.userAgent);
    await (await getDb())
      .prepare(
        `INSERT INTO webauthn_credentials (id, user_id, public_key, counter, transports, device_type, backed_up, name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        credential.id, session.id, encodePublicKey(credential.publicKey), credential.counter,
        (credential.transports ?? []).join(","), credentialDeviceType, credentialBackedUp ? 1 : 0, name,
      );

    await logAuthEvent(session.id, true, "passkey-adaugat", meta, name);
    const res = NextResponse.json({ ok: true, name });
    clearChallengeCookie(res);
    return res;
  } catch (err) {
    return errorResponse(err, "Face ID / amprenta nu a putut fi salvată.");
  }
}
