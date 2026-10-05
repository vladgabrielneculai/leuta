import { NextRequest, NextResponse } from "next/server";
import { currentUserId, getDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { ageFrom, recommendedEmergencyMonths, sanitizeProfile } from "@/lib/profile";
import { loadProfile } from "@/lib/profileServer";

export const dynamic = "force-dynamic";

const COLUMNS = [
  "first_name", "last_name", "birth_date", "city", "county", "email", "phone",
  "occupation", "job_title", "income_stability", "net_income", "payday", "currency",
  "goals", "risk_tolerance", "horizon", "investing_experience",
] as const;

/** Profilul utilizatorului curent + recomandările calculate din el. */
export async function GET() {
  try {
    const profile = await loadProfile();
    return NextResponse.json({
      profile,
      age: ageFrom(profile.birth_date),
      emergency: recommendedEmergencyMonths(profile),
    });
  } catch (err) {
    return errorResponse(err, "Profilul nu a putut fi încărcat.");
  }
}

/**
 * Salvează profilul. Se trimit doar câmpurile modificate (ghidul de început salvează pas cu pas);
 * `onboardingDone: true` marchează ghidul ca terminat (sau amânat).
 */
export async function PUT(req: NextRequest) {
  try {
    if (!(await currentUserId())) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
    const body = (await req.json()) as Record<string, unknown>;

    // Validări cu mesaj clar (restul câmpurilor invalide devin pur și simplu goale).
    const email = String(body.email ?? "").trim();
    if ("email" in body && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Adresa de email nu pare validă." }, { status: 400 });
    }
    if ("birth_date" in body && body.birth_date) {
      const age = ageFrom(String(body.birth_date));
      if (age === null || age < 14) return NextResponse.json({ error: "Data nașterii nu pare corectă." }, { status: 400 });
    }

    const current = await loadProfile();
    const merged = sanitizeProfile({ ...current, ...Object.fromEntries(Object.entries(body).filter(([k]) => (COLUMNS as readonly string[]).includes(k))) });
    const values = COLUMNS.map((c) => (c === "goals" ? merged.goals.join(",") : merged[c]));
    const done = body.onboardingDone === true;
    // Un rând nou creat din pagina de profil nu trebuie să pornească ghidul de început;
    // doar pașii intermediari ai ghidului îl lasă „în curs”.
    const insertDone = done || body.fromOnboarding !== true;

    await (await getDb())
      .prepare(
        `INSERT INTO user_profiles (${COLUMNS.join(", ")}, onboarding_done_at, updated_at)
         VALUES (${COLUMNS.map(() => "?").join(", ")}, ${insertDone ? "now()" : "NULL"}, now())
         ON CONFLICT (user_id) DO UPDATE SET
           ${COLUMNS.map((c) => `${c} = EXCLUDED.${c}`).join(", ")},
           ${done ? "onboarding_done_at = COALESCE(user_profiles.onboarding_done_at, now())," : ""}
           updated_at = now()`,
      )
      .run(...values);

    const profile = await loadProfile();
    return NextResponse.json({ profile, age: ageFrom(profile.birth_date), emergency: recommendedEmergencyMonths(profile) });
  } catch (err) {
    return errorResponse(err, "Profilul nu a putut fi salvat.");
  }
}
