import { NextRequest, NextResponse } from "next/server";
import {
  clearFailedLogins, clientIp, createSession, isLockedOut, isSetupComplete, LOCKOUT_MESSAGE,
  recordFailedLogin, sessionCookieOptions, verifyPassword,
} from "@/lib/auth";
import { getSystemDb as getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (!(await isSetupComplete())) {
      return NextResponse.json({ error: "Aplicația nu a fost configurată încă.", setupNeeded: true }, { status: 400 });
    }

    const ip = clientIp(req.headers);
    if (await isLockedOut(ip)) {
      return NextResponse.json({ error: LOCKOUT_MESSAGE }, { status: 429 });
    }

    const body = await req.json();
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const rememberMe = body.rememberMe !== false;

    if (!username || !password) {
      return NextResponse.json({ error: "Introdu utilizatorul și parola." }, { status: 400 });
    }

    const user = await (await getDb())
      .prepare("SELECT id, username, password_hash, salt FROM users WHERE lower(username) = lower(?)")
      .get<{ id: number; username: string; password_hash: string; salt: string }>(username);

    if (!user || !verifyPassword(password, user.salt, user.password_hash)) {
      await recordFailedLogin(ip);
      return NextResponse.json({ error: "Utilizator sau parolă incorectă." }, { status: 401 });
    }

    await clearFailedLogins(ip);
    const { token, expiresAt } = await createSession(user.id, rememberMe);
    const res = NextResponse.json({ ok: true, user: { id: user.id, username: user.username } });
    res.cookies.set({ ...sessionCookieOptions(expiresAt), value: token });
    return res;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Eroare la autentificare." }, { status: 500 });
  }
}
