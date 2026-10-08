import { NextRequest, NextResponse } from "next/server";
import {
  clearFailedLogins, createSession, findValidReset, generateSalt, hashPassword, isLockedOut, LOCKOUT_MESSAGE, logAuthEvent,
  MIN_PASSWORD_LENGTH, recordFailedLogin, requestMeta, sessionCookieOptions, sha256,
} from "@/lib/auth";
import { getSystemDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

const INVALID = "Linkul de resetare nu mai este valid: a expirat, a fost folosit sau a fost înlocuit. Cere unul nou administratorului.";

/** Verifică linkul înainte de afișarea formularului (pagina /resetare). */
export async function GET(req: NextRequest) {
  try {
    const meta = requestMeta(req.headers);
    if (await isLockedOut(meta.ip)) return NextResponse.json({ error: LOCKOUT_MESSAGE }, { status: 429 });
    const reset = await findValidReset(req.nextUrl.searchParams.get("cod") ?? "");
    if (!reset) {
      await recordFailedLogin(meta.ip); // codurile ghicite consumă din aceeași limită ca parolele greșite
      return NextResponse.json({ valid: false, error: INVALID }, { status: 404 });
    }
    return NextResponse.json({ valid: true, username: reset.username });
  } catch (err) {
    return errorResponse(err, "Linkul nu a putut fi verificat.");
  }
}

/**
 * Parolă nouă din linkul de resetare (o singură folosire). Resetarea pornește contul de la zero pe partea de
 * acces: 2FA se dezactivează, Face ID / amprenta se scoate de pe toate dispozitivele și toate sesiunile se închid
 * (telefonul poate fi pierdut sau în mâna altcuiva). Datele contului rămân neatinse.
 */
export async function POST(req: NextRequest) {
  try {
    const meta = requestMeta(req.headers);
    if (await isLockedOut(meta.ip)) return NextResponse.json({ error: LOCKOUT_MESSAGE }, { status: 429 });
    const body = await req.json().catch(() => ({}));
    const code = String(body.code ?? "");
    const password = String(body.password ?? "").slice(0, 200);
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json({ error: `Parola trebuie să aibă cel puțin ${MIN_PASSWORD_LENGTH} caractere.` }, { status: 400 });
    }

    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);
    const db = await getSystemDb();
    const result = await db.transaction(async (tx) => {
      const claimed = await tx
        .prepare(
          `UPDATE password_resets r SET used_at = now()
           FROM users u
           WHERE r.token_hash = ? AND u.id = r.user_id AND r.used_at IS NULL AND r.revoked_at IS NULL
             AND r.expires_at > now() AND u.disabled_at IS NULL
           RETURNING r.user_id, u.username`,
        )
        .get<{ user_id: number; username: string }>(sha256(code));
      if (!claimed) return null;
      await tx
        .prepare(
          `UPDATE users SET password_hash = ?, salt = ?, totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = 0
           WHERE id = ?`,
        )
        .run(passwordHash, salt, claimed.user_id);
      await tx.prepare("DELETE FROM webauthn_credentials WHERE user_id = ?").run(claimed.user_id);
      await tx.prepare("DELETE FROM sessions WHERE user_id = ?").run(claimed.user_id);
      return claimed;
    });

    if (!result) {
      await recordFailedLogin(meta.ip);
      return NextResponse.json({ error: INVALID }, { status: 404 });
    }

    await clearFailedLogins(meta.ip, result.user_id);
    await logAuthEvent(result.user_id, true, "reset", meta);
    const { token, expiresAt } = await createSession(result.user_id, true, "reset", meta);
    const res = NextResponse.json({ ok: true, username: result.username });
    res.cookies.set({ ...sessionCookieOptions(expiresAt), value: token });
    return res;
  } catch (err) {
    return errorResponse(err, "Parola nu a putut fi schimbată.");
  }
}
