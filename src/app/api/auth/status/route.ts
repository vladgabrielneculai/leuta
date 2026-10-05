import { NextResponse } from "next/server";
import { getCurrentSession, isSetupComplete, passkeyCount } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  let setupComplete: boolean;
  let session: Awaited<ReturnType<typeof getCurrentSession>>;
  try {
    [setupComplete, session] = await Promise.all([isSetupComplete(), getCurrentSession()]);
  } catch {
    return NextResponse.json({ error: "Baza de date nu răspunde. Încearcă din nou." }, { status: 503 });
  }
  return NextResponse.json({
    setupNeeded: !setupComplete,
    authenticated: !!session,
    user: session ? { id: session.id, username: session.username } : null,
    hasPasskey: session ? (await passkeyCount(session.id).catch(() => 1)) > 0 : undefined,
  });
}
