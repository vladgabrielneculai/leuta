import { NextResponse } from "next/server";
import { getCurrentSession, isSetupComplete, passkeyCount } from "@/lib/auth";
import { getDbFor } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Profilul scurt pentru bara aplicației: numele afișat și dacă ghidul de început mai trebuie parcurs. */
async function profileBrief(userId: number) {
  const row = await (await getDbFor(userId))
    .prepare("SELECT first_name, onboarding_done_at FROM user_profiles")
    .get<{ first_name: string; onboarding_done_at: string | null }>();
  // Fără rând de profil (conturi vechi) = ghidul nu se mai afișează.
  return { firstName: row?.first_name ?? "", onboardingPending: !!row && !row.onboarding_done_at };
}

export async function GET() {
  let setupComplete: boolean;
  let session: Awaited<ReturnType<typeof getCurrentSession>>;
  try {
    [setupComplete, session] = await Promise.all([isSetupComplete(), getCurrentSession()]);
  } catch {
    return NextResponse.json({ error: "Baza de date nu răspunde. Încearcă din nou." }, { status: 503 });
  }
  const [hasPasskey, brief] = session
    ? await Promise.all([
        passkeyCount(session.id).then((c) => c > 0).catch(() => true),
        profileBrief(session.id).catch(() => ({ firstName: "", onboardingPending: false })),
      ])
    : [undefined, null];
  return NextResponse.json({
    setupNeeded: !setupComplete,
    authenticated: !!session,
    user: session
      ? { id: session.id, username: session.username, isAdmin: session.is_admin, firstName: brief?.firstName ?? "" }
      : null,
    hasPasskey,
    onboardingPending: brief?.onboardingPending ?? false,
  });
}
