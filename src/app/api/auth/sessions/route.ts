import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, logAuthEvent, requestMeta, revokeSessions } from "@/lib/auth";
import { getSystemDb as getDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Sesiunile deschise (dispozitive). `key` = primele caractere din hash-ul sesiunii, nu token-ul. */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
  const rows = await (await getDb())
    .prepare(
      `SELECT substr(id, 1, 16) AS key, created_at, last_seen_at, expires_at, ip, user_agent, location, method,
              (id = ?) AS current
       FROM sessions WHERE user_id = ? AND expires_at > now() ORDER BY last_seen_at DESC NULLS LAST`,
    )
    .all(session.sessionId, session.id);
  return NextResponse.json({ sessions: rows });
}

/** Închide o sesiune (`?key=`) sau toate celelalte (`?all=1`). */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
    const meta = requestMeta(req.headers);
    if (req.nextUrl.searchParams.get("all") === "1") {
      await revokeSessions(session.id, session.sessionId);
      await logAuthEvent(session.id, true, "delogare-peste-tot", meta);
      return NextResponse.json({ ok: true });
    }
    const key = (req.nextUrl.searchParams.get("key") ?? "").toLowerCase();
    if (!/^[0-9a-f]{16}$/.test(key)) return NextResponse.json({ error: "Sesiune invalidă." }, { status: 400 });
    const res = await (await getDb())
      .prepare("DELETE FROM sessions WHERE user_id = ? AND substr(id, 1, 16) = ? AND id <> ?")
      .run(session.id, key, session.sessionId);
    if (!res.changes) return NextResponse.json({ error: "Sesiunea nu există." }, { status: 404 });
    await logAuthEvent(session.id, true, "sesiune-inchisa", meta);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Sesiunea nu a putut fi închisă.");
  }
}

