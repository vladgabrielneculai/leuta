import { NextRequest } from "next/server";
import { generateSalt, hashPassword, logAuthEvent, passwordError, requestMeta, sessionResponse, validateUsername } from "@/lib/auth";
import { getDbFor, getSystemDb } from "@/lib/db";
import { errorResponse, jsonError } from "@/lib/http";
import { seedDemoData } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = String(body.username ?? "").trim().slice(0, 100);
    const password = String(body.password ?? "").slice(0, 200);
    const seedDemo = !!body.seedDemo;

    // Aplicația e publică pe internet, deci cerem și o parolă lungă.
    const invalid = validateUsername(username) ?? passwordError(password);
    if (invalid) return jsonError(invalid);

    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);
    // Configurarea inițială e permisă o singură dată: inserarea se face doar dacă nu există niciun cont,
    // atomic (două cereri simultane nu pot crea două conturi).
    const info = await (await getSystemDb())
      .prepare(
        `INSERT INTO users (username, password_hash, salt, created_at, is_admin)
         SELECT ?, ?, ?, ?, true WHERE NOT EXISTS (SELECT 1 FROM users)`,
      )
      .run(username, passwordHash, salt, new Date().toISOString());
    if (!info.changes) return jsonError("Configurarea inițială a fost deja efectuată.");
    const userId = Number(info.lastInsertRowid);

    // Categoriile și setările implicite ale noului cont se creează la prima folosire a bazei lui.
    const userDb = await getDbFor(userId);
    // Profilul gol pornește ghidul de început; cu date demo contul e deja „populat”, deci îl sărim.
    await userDb
      .prepare("INSERT INTO user_profiles (onboarding_done_at) VALUES (?) ON CONFLICT DO NOTHING")
      .run(seedDemo ? new Date().toISOString() : null);
    if (seedDemo) {
      try {
        await seedDemoData(userDb);
      } catch (err) {
        console.error("Eroare la încărcarea datelor demo:", err);
      }
    }

    const meta = requestMeta(req.headers);
    await logAuthEvent(userId, true, "setup", meta);
    return sessionResponse(userId, true, "setup", meta, { ok: true, user: { id: userId, username } });
  } catch (err) {
    return errorResponse(err, "Eroare la configurare.");
  }
}
