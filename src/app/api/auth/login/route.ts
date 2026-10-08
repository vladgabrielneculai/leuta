import { NextRequest, NextResponse } from "next/server";
import {
  clearFailedLogins, createSession, DISABLED_MESSAGE, dummyPasswordCheck, hashPassword, isAccountLocked, isLockedOut, isProtected,
  isSetupComplete, LOCKOUT_MESSAGE, logAuthEvent, recordFailedLogin, requestMeta, secondFactors, sessionCookieOptions,
  useTotpCode, verifyPassword,
} from "@/lib/auth";
import { getSystemDb as getDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

const BAD_CREDENTIALS = "Utilizator sau parolă incorectă.";
const BAD_CODE = "Codul nu este corect sau a expirat. Încearcă din nou.";

/**
 * Login cu parolă, în doi pași dacă contul are 2FA: după parola corectă cerem codul din aplicația de
 * autentificare. Face ID / amprenta are drumul ei (/api/auth/passkey/login/...), fără parolă. Cine și-a uitat
 * parola sau a pierdut telefonul cu 2FA primește de la administrator un link de resetare (/resetare).
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
    const totpCode = String(body.totpCode ?? "").trim().slice(0, 20);
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

    const check = await verifyPassword(password, user.salt, user.password_hash);
    if (!check.ok) {
      await recordFailedLogin(meta.ip, user.id);
      await logAuthEvent(user.id, false, "password", meta, "parolă greșită");
      return NextResponse.json({ error: BAD_CREDENTIALS }, { status: 401 });
    }

    // Hash vechi (mai slab) → îl refacem acum, cât avem parola.
    if (check.rehash) {
      await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(password, user.salt), user.id);
    }

    // Pasul al doilea. Parola e bună, dar fără cod contul rămâne închis; interfața cere codul și retrimite tot.
    const factors = await secondFactors(user.id);
    let method: "password" | "totp" = "password";
    if (isProtected(factors)) {
      if (!totpCode) {
        return NextResponse.json(
          { error: "Introdu codul de 6 cifre din aplicația de autentificare.", secondFactor: { totp: true } },
          { status: 403 },
        );
      }
      method = "totp";
      if (!(await useTotpCode(user.id, totpCode))) {
        await recordFailedLogin(meta.ip, user.id);
        await logAuthEvent(user.id, false, method, meta, "cod 2FA greșit");
        return NextResponse.json({ error: BAD_CODE, secondFactor: { totp: true } }, { status: 401 });
      }
    }

    // Abia după autentificarea completă spunem că e dezactivat (altfel s-ar putea afla ce conturi există).
    if (user.disabled_at) {
      await logAuthEvent(user.id, false, method, meta, "cont dezactivat");
      return NextResponse.json({ error: DISABLED_MESSAGE }, { status: 403 });
    }

    await clearFailedLogins(meta.ip, user.id);
    await logAuthEvent(user.id, true, method, meta);
    const { token, expiresAt } = await createSession(user.id, rememberMe, method, meta);
    const res = NextResponse.json({ ok: true, user: { id: user.id, username: user.username } });
    res.cookies.set({ ...sessionCookieOptions(expiresAt), value: token });
    return res;
  } catch (err) {
    return errorResponse(err, "Eroare la autentificare.");
  }
}
