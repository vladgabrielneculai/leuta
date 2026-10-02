import { NextRequest, NextResponse } from "next/server";
import { createSession, generateSalt, hashPassword, isSetupComplete, sessionCookieOptions } from "@/lib/auth";
import { getDbFor, getSystemDb } from "@/lib/db";
import { seedDemoData } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // Configurarea inițială e permisă o singură dată: după ce există un cont, ruta e închisă.
    if (await isSetupComplete()) {
      return NextResponse.json({ error: "Configurarea inițială a fost deja efectuată." }, { status: 400 });
    }

    const body = await req.json();
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const seedDemo = !!body.seedDemo;

    if (!username || username.length < 3) {
      return NextResponse.json({ error: "Numele de utilizator trebuie să aibă cel puțin 3 caractere." }, { status: 400 });
    }
    // Aplicația e publică pe internet, deci cerem o parolă rezonabilă.
    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Parola trebuie să aibă cel puțin 8 caractere." }, { status: 400 });
    }

    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);
    const info = await (await getSystemDb())
      .prepare("INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)")
      .run(username, passwordHash, salt, new Date().toISOString());
    const userId = Number(info.lastInsertRowid);

    // Categoriile și setările implicite ale noului cont se creează la prima folosire a bazei lui.
    const userDb = await getDbFor(userId);
    if (seedDemo) {
      try {
        await seedDemoData(userDb);
      } catch (err) {
        console.error("Eroare la încărcarea datelor demo:", err);
      }
    }

    const { token, expiresAt } = await createSession(userId, true);
    const res = NextResponse.json({ ok: true, user: { id: userId, username } });
    res.cookies.set({ ...sessionCookieOptions(expiresAt), value: token });
    return res;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Eroare la configurare." }, { status: 500 });
  }
}
