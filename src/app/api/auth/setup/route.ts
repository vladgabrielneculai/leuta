import { NextRequest, NextResponse } from "next/server";
import {
  createSession, generateSalt, hashPassword, logAuthEvent, MIN_PASSWORD_LENGTH, requestMeta, sessionCookieOptions,
} from "@/lib/auth";
import { getDbFor, getSystemDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { seedDemoData } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = String(body.username ?? "").trim().slice(0, 100);
    const password = String(body.password ?? "").slice(0, 200);
    const seedDemo = !!body.seedDemo;

    if (!username || username.length < 3) {
      return NextResponse.json({ error: "Numele de utilizator trebuie să aibă cel puțin 3 caractere." }, { status: 400 });
    }
    // Aplicația e publică pe internet, deci cerem o parolă lungă.
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json({ error: `Parola trebuie să aibă cel puțin ${MIN_PASSWORD_LENGTH} caractere.` }, { status: 400 });
    }

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
    if (!info.changes) {
      return NextResponse.json({ error: "Configurarea inițială a fost deja efectuată." }, { status: 400 });
    }
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
    const { token, expiresAt } = await createSession(userId, true, "setup", meta);
    const res = NextResponse.json({ ok: true, user: { id: userId, username } });
    res.cookies.set({ ...sessionCookieOptions(expiresAt), value: token });
    return res;
  } catch (err) {
    return errorResponse(err, "Eroare la configurare.");
  }
}
