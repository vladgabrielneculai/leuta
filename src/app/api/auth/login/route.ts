import { NextRequest, NextResponse } from "next/server";
import {
  clearFailedLogins, createSession, DISABLED_MESSAGE, dummyPasswordCheck, hashPassword, isAccountLocked, isLockedOut, isSetupComplete,
  LOCKOUT_MESSAGE, logAuthEvent, passkeyCount, recordFailedLogin, requestMeta, sessionCookieOptions, useRecoveryCode,
  verifyPassword,
} from "@/lib/auth";
import { getSystemDb as getDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

const BAD_CREDENTIALS = "Utilizator, parolă sau cod de recuperare incorect.";

/**
 * Login cu parolă. Dacă contul are passkey, parola singură nu mai ajunge: login-ul se face cu passkey
 * (/api/auth/passkey/login/...) sau, în caz de urgență, cu parola + un cod de recuperare.
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await isSetupComplete())) {
      return NextResponse.json({ error: "Aplicația nu a fost configurată încă.", setupNeeded: true }, { status: 400 });
    }

    const meta = requestMeta(req.headers);
    if (await isLockedOut(meta.ip)) {
      return NextResponse.json({ error: LOCKOUT_MESSAGE }, { status: 429 });
    }

    const body = await req.json();
    const username = String(body.username ?? "").trim().slice(0, 100);
    const password = String(body.password ?? "").slice(0, 200);
    const recoveryCode = String(body.recoveryCode ?? "").trim().slice(0, 40);
    const rememberMe = body.rememberMe !== false;

    if (!username || !password) {
      return NextResponse.json({ error: "Introdu utilizatorul și parola." }, { status: 400 });
    }

    const db = await getDb();
    const user = await db
      .prepare("SELECT id, username, password_hash, salt, disabled_at FROM users WHERE lower(username) = lower(?)")
      .get<{ id: number; username: string; password_hash: string; salt: string; disabled_at: string | null }>(username);

    if (!user) {
      await dummyPasswordCheck(password);
      await recordFailedLogin(meta.ip);
      await logAuthEvent(null, false, "password", meta, "utilizator necunoscut");
      return NextResponse.json({ error: BAD_CREDENTIALS }, { status: 401 });
    }

    if (await isAccountLocked(user.id)) {
      await logAuthEvent(user.id, false, "password", meta, "cont blocat temporar");
      return NextResponse.json({ error: LOCKOUT_MESSAGE }, { status: 429 });
    }

    const needsPasskey = (await passkeyCount(user.id)) > 0;
    if (needsPasskey && !recoveryCode) {
      return NextResponse.json(
        { error: "Contul tău se deschide cu passkey. Dacă nu ai acces la el, folosește parola + un cod de recuperare.", passkeyRequired: true },
        { status: 403 },
      );
    }

    const check = await verifyPassword(password, user.salt, user.password_hash);
    const codeOk = check.ok && needsPasskey ? await useRecoveryCode(user.id, recoveryCode) : true;
    if (!check.ok || !codeOk) {
      await recordFailedLogin(meta.ip, user.id);
      await logAuthEvent(user.id, false, needsPasskey ? "recovery" : "password", meta, check.ok ? "cod de recuperare greșit" : "parolă greșită");
      return NextResponse.json({ error: BAD_CREDENTIALS }, { status: 401 });
    }

    // Hash vechi (mai slab) → îl refacem acum, cât avem parola.
    if (check.rehash) {
      await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(password, user.salt), user.id);
    }

    // Abia după parola corectă spunem că e dezactivat (altfel s-ar putea afla ce conturi există).
    if (user.disabled_at) {
      await logAuthEvent(user.id, false, needsPasskey ? "recovery" : "password", meta, "cont dezactivat");
      return NextResponse.json({ error: DISABLED_MESSAGE }, { status: 403 });
    }

    const method = needsPasskey ? "recovery" : "password";
    await clearFailedLogins(meta.ip, user.id);
    await logAuthEvent(user.id, true, method, meta);
    const { token, expiresAt } = await createSession(user.id, rememberMe, method, meta);
    const res = NextResponse.json({ ok: true, user: { id: user.id, username: user.username }, usedRecoveryCode: needsPasskey });
    res.cookies.set({ ...sessionCookieOptions(expiresAt), value: token });
    return res;
  } catch (err) {
    return errorResponse(err, "Eroare la autentificare.");
  }
}
