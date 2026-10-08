import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { getCurrentSession, isProtected, secondFactors } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { credentialsForUser, relyingParty, saveChallenge } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

/**
 * Cum își poate confirma utilizatorul identitatea: Face ID / amprentă (dacă are pe vreun dispozitiv), plus codul
 * 2FA dacă e activ, altfel parola.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
    const factors = await secondFactors(session.id);
    const methods: string[] = [];
    let options = null;
    if (factors.biometric) {
      const creds = await credentialsForUser(session.id);
      options = await generateAuthenticationOptions({
        rpID: relyingParty(req).rpID,
        userVerification: "required",
        allowCredentials: creds.map((c) => ({ id: c.id, transports: c.transports })),
      });
      methods.push("biometric");
    }
    methods.push(isProtected(factors) ? "totp" : "password");
    const res = NextResponse.json({ methods, options });
    if (options) await saveChallenge(res, "reauth", options.challenge, session.id);
    return res;
  } catch (err) {
    return errorResponse(err, "Confirmarea nu a putut porni.");
  }
}
