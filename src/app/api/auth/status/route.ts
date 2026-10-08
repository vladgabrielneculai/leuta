import { NextResponse } from "next/server";
import { getCurrentSession, isProtected, isSetupComplete, recoveryCheckDue, secondFactors } from "@/lib/auth";
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
  const [secured, brief, checkDue] = session
    ? await Promise.all([
        secondFactors(session.id).then(isProtected).catch(() => true),
        profileBrief(session.id).catch(() => ({ firstName: "", onboardingPending: false })),
        recoveryCheckDue(session.id).catch(() => false),
      ])
    : [undefined, null, false];
  return NextResponse.json({
    setupNeeded: !setupComplete,
    authenticated: !!session,
    user: session
      ? { id: session.id, username: session.username, isAdmin: session.is_admin, firstName: brief?.firstName ?? "" }
      : null,
    secured,
    // Verificarea periodică a codurilor de recuperare (are rost doar cât contul e protejat).
    recoveryCheckDue: !!secured && checkDue,
    onboardingPending: brief?.onboardingPending ?? false,
  });
}
