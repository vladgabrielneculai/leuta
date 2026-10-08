import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { getCurrentSession, isProtected, secondFactors } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { credentialsForUser, relyingParty, saveChallenge } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

/**
 * Cum își poate confirma utilizatorul identitatea: Face ID / amprentă, cod 2FA, cod de recuperare (dacă are
 * vreuna dintre protecții) sau parola (dacă nu are niciuna).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
    const factors = await secondFactors(session.id);
    if (!isProtected(factors)) return NextResponse.json({ methods: ["password"] });

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
    if (factors.totp) methods.push("totp");
    methods.push("recovery");
    const res = NextResponse.json({ methods, options });
    if (options) await saveChallenge(res, "reauth", options.challenge, session.id);
    return res;
  } catch (err) {
    return errorResponse(err, "Confirmarea nu a putut porni.");
  }
}
