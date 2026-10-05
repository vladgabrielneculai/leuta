import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getSystemDb as getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Ultimele evenimente de securitate ale contului (login-uri reușite/eșuate, passkey-uri, sesiuni). */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
  const events = await (await getDb())
    .prepare(
      `SELECT id, success, method, reason, ip, user_agent, location, created_at
       FROM login_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 40`,
    )
    .all(session.id);
  return NextResponse.json({ events });
}
