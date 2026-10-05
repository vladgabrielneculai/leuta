import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { clientIp, isLockedOut, LOCKOUT_MESSAGE } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { relyingParty, saveChallenge } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

/** Începe login-ul cu passkey: browserul arată passkey-urile salvate pentru acest site. */
export async function POST(req: NextRequest) {
  try {
    if (await isLockedOut(clientIp(req.headers))) return NextResponse.json({ error: LOCKOUT_MESSAGE }, { status: 429 });
    const { rpID } = relyingParty(req);
    const options = await generateAuthenticationOptions({ rpID, userVerification: "required", allowCredentials: [] });
    const res = NextResponse.json(options);
    await saveChallenge(res, "login", options.challenge, null);
    return res;
  } catch (err) {
    return errorResponse(err, "Login-ul cu passkey nu a putut porni.");
  }
}
