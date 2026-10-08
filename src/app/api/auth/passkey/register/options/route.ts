import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { isoUint8Array } from "@simplewebauthn/server/helpers";
import { requireRecentAuth } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { credentialsForUser, relyingParty, RP_NAME, saveChallenge } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

/**
 * Începe adăugarea Face ID / amprentei pe dispozitivul curent (cere identitatea confirmată recent). Cerem
 * autentificatorul dispozitivului (Face ID, Touch ID, amprenta Android, Windows Hello), nu chei externe sau
 * telefonul altcuiva, ca fereastra browserului să ceară direct biometria.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireRecentAuth();
    if ("response" in auth) return auth.response;
    const { session } = auth;
    const { rpID } = relyingParty(req);
    const existing = await credentialsForUser(session.id);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userName: session.username,
      userID: isoUint8Array.fromUTF8String(`bp-user-${session.id}`),
      attestationType: "none",
      excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports })),
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      preferredAuthenticatorType: "localDevice",
    });
    const res = NextResponse.json(options);
    await saveChallenge(res, "register", options.challenge, session.id);
    return res;
  } catch (err) {
    return errorResponse(err, "Adăugarea Face ID / amprentei nu a putut porni.");
  }
}
