import { NextRequest, NextResponse } from "next/server";
import {
  checkRecoveryCode, getCurrentSession, isLockedOut, LOCKOUT_MESSAGE, logAuthEvent, recordFailedLogin, requestMeta,
} from "@/lib/auth";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Verificarea periodică (la 3 luni): utilizatorul scrie unul dintre codurile de recuperare, ca dovadă că lista e
 * încă la el. Codul NU se consumă. Încercările greșite intră în aceeași limită ca parolele greșite.
 */
export async function POST(req: NextRequest) {
  const meta = requestMeta(req.headers);
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
    if (await isLockedOut(meta.ip)) return NextResponse.json({ error: LOCKOUT_MESSAGE }, { status: 429 });
    const body = await req.json().catch(() => ({}));
    if (!(await checkRecoveryCode(session.id, String(body.code ?? "").slice(0, 40)))) {
      await recordFailedLogin(meta.ip, session.id);
      await logAuthEvent(session.id, false, "coduri-verificate", meta, "cod greșit");
      return NextResponse.json({ error: "Codul nu se potrivește cu niciunul dintre codurile nefolosite." }, { status: 400 });
    }
    await logAuthEvent(session.id, true, "coduri-verificate", meta);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Codul nu a putut fi verificat.");
  }
}
