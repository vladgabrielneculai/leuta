import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, logAuthEvent, passkeyCount, recoveryCodesLeft, regenerateRecoveryCodes, requestMeta, requireRecentAuth } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
  return NextResponse.json({ left: await recoveryCodesLeft(session.id) });
}

/** Coduri noi (cele vechi nu mai merg). Se afișează o singură dată. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireRecentAuth();
    if ("response" in auth) return auth.response;
    if ((await passkeyCount(auth.session.id)) === 0) {
      return NextResponse.json({ error: "Adaugă întâi un passkey." }, { status: 400 });
    }
    const codes = await regenerateRecoveryCodes(auth.session.id);
    await logAuthEvent(auth.session.id, true, "coduri-regenerate", requestMeta(req.headers));
    return NextResponse.json({ codes });
  } catch (err) {
    return errorResponse(err, "Codurile nu au putut fi generate.");
  }
}
