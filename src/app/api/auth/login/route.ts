import { NextRequest, NextResponse } from "next/server";
import {
  clearFailedLogins, createSession, DISABLED_MESSAGE, dummyPasswordCheck, hashPassword, isAccountLocked, isLockedOut, isProtected,
  isSetupComplete, LOCKOUT_MESSAGE, logAuthEvent, recordFailedLogin, requestMeta, secondFactors, sessionCookieOptions,
  useRecoveryCode, useTotpCode, verifyPassword,
} from "@/lib/auth";
import { getSystemDb as getDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

const BAD_CREDENTIALS = "Utilizator sau parolă incorectă.";
const BAD_CODE = "Codul nu este corect sau a expirat. Încearcă din nou.";

/**
 * Login cu parolă, în doi pași dacă e nevoie. Contul protejat cu Face ID / amprentă sau cu 2FA nu se deschide
 * doar cu parola: după parola corectă cerem codul din aplicația de autentificare (2FA) sau, în caz de urgență,
 * un cod de recuperare. Face ID / amprenta are drumul ei (/api/auth/passkey/login/...), fără parolă.
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

    // Pasul al doilea. Parola e corectă, dar fără cod contul rămâne închis; interfața cere codul și retrimite tot.
    const factors = await secondFactors(user.id);
    let method: "password" | "totp" | "recovery" = "password";
    if (isProtected(factors)) {
      if (!totpCode && !recoveryCode) {
        return NextResponse.json(
          {
            error: factors.totp
              ? "Introdu codul de 6 cifre din aplicația de autentificare."
              : "Contul tău se deschide cu Face ID / amprentă. Dacă nu ai acces la dispozitiv, folosește un cod de recuperare.",
            secondFactor: { totp: factors.totp, biometric: factors.biometric > 0 },
          },
          { status: 403 },
        );
      }
      method = recoveryCode ? "recovery" : "totp";
      const ok = recoveryCode ? await useRecoveryCode(user.id, recoveryCode) : await useTotpCode(user.id, totpCode);
      if (!ok) {
        await recordFailedLogin(meta.ip, user.id);
        await logAuthEvent(user.id, false, method, meta, recoveryCode ? "cod de recuperare greșit" : "cod 2FA greșit");
        return NextResponse.json({ error: BAD_CODE, secondFactor: { totp: factors.totp, biometric: factors.biometric > 0 } }, { status: 401 });
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
    const res = NextResponse.json({ ok: true, user: { id: user.id, username: user.username }, usedRecoveryCode: method === "recovery" });
    res.cookies.set({ ...sessionCookieOptions(expiresAt), value: token });
    return res;
  } catch (err) {
    return errorResponse(err, "Eroare la autentificare.");
  }
}
