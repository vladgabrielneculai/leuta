import { NextResponse } from "next/server";
import { getCurrentUser, isSetupComplete } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  let setupComplete: boolean;
  let user: Awaited<ReturnType<typeof getCurrentUser>>;
  try {
    [setupComplete, user] = await Promise.all([isSetupComplete(), getCurrentUser()]);
  } catch (e) {
    // TEMP diagnostic
    const err = e as { message?: string; code?: string };
    return NextResponse.json(
      { error: "Baza de date nu răspunde. Încearcă din nou.", diag: `${err?.code ?? ""} ${String(err?.message ?? e).slice(0, 160)}` },
      { status: 503 },
    );
  }
  return NextResponse.json({
    setupNeeded: !setupComplete,
    authenticated: !!user,
    user: user ? { id: user.id, username: user.username } : null,
  });
}
