import { NextResponse } from "next/server";
import { getCurrentUser, isSetupComplete } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  let setupComplete: boolean;
  let user: Awaited<ReturnType<typeof getCurrentUser>>;
  try {
    [setupComplete, user] = await Promise.all([isSetupComplete(), getCurrentUser()]);
  } catch {
    return NextResponse.json({ error: "Baza de date nu răspunde. Încearcă din nou." }, { status: 503 });
  }
  return NextResponse.json({
    setupNeeded: !setupComplete,
    authenticated: !!user,
    user: user ? { id: user.id, username: user.username } : null,
  });
}
