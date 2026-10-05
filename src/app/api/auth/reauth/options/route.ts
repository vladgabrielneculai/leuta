import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { getCurrentSession } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { credentialsForUser, relyingParty, saveChallenge } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

/** Cum își confirmă utilizatorul identitatea: cu passkey (dacă are) sau cu parola. */
export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
    const creds = await credentialsForUser(session.id);
    if (!creds.length) return NextResponse.json({ method: "password" });
    const { rpID } = relyingParty(req);
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
      allowCredentials: creds.map((c) => ({ id: c.id, transports: c.transports })),
    });
    const res = NextResponse.json({ method: "passkey", options });
    await saveChallenge(res, "reauth", options.challenge, session.id);
    return res;
  } catch (err) {
    return errorResponse(err, "Confirmarea nu a putut porni.");
  }
}
