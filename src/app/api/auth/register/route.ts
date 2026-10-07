import { NextRequest, NextResponse } from "next/server";
import {
  createSession, findValidInvitation, generateSalt, hashPassword, isLockedOut, LOCKOUT_MESSAGE, logAuthEvent,
  MIN_PASSWORD_LENGTH, recordFailedLogin, requestMeta, sessionCookieOptions, sha256, validateUsername,
} from "@/lib/auth";
import { getDbFor, getSystemDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

const INVALID_INVITE = "Invitația nu este validă: a expirat, a fost deja folosită sau a fost anulată. Cere una nouă administratorului.";

/** Verifică o invitație înainte de afișarea formularului (pagina /inregistrare). */
export async function GET(req: NextRequest) {
  try {
    const meta = requestMeta(req.headers);
    if (await isLockedOut(meta.ip)) return NextResponse.json({ error: LOCKOUT_MESSAGE }, { status: 429 });
    const code = req.nextUrl.searchParams.get("cod") ?? "";
    const invite = await findValidInvitation(code);
    if (!invite) {
      await recordFailedLogin(meta.ip); // codurile ghicite consumă din aceeași limită ca parolele greșite
      return NextResponse.json({ valid: false, error: INVALID_INVITE }, { status: 404 });
    }
    return NextResponse.json({ valid: true, expiresAt: invite.expires_at });
  } catch (err) {
    return errorResponse(err, "Invitația nu a putut fi verificată.");
  }
}

/** Creează un cont nou dintr-o invitație (o singură folosire) și deschide sesiunea. */
export async function POST(req: NextRequest) {
  try {
    const meta = requestMeta(req.headers);
    if (await isLockedOut(meta.ip)) return NextResponse.json({ error: LOCKOUT_MESSAGE }, { status: 429 });

    const body = await req.json();
    const code = String(body.code ?? "");
    const username = String(body.username ?? "").trim().slice(0, 100);
    const password = String(body.password ?? "").slice(0, 200);

    const usernameError = validateUsername(username);
    if (usernameError) return NextResponse.json({ error: usernameError }, { status: 400 });
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json({ error: `Parola trebuie să aibă cel puțin ${MIN_PASSWORD_LENGTH} caractere.` }, { status: 400 });
    }

    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);
    const db = await getSystemDb();

    // Totul într-o tranzacție: invitația se consumă doar dacă se creează contul, iar două cereri
    // simultane cu același cod nu pot crea două conturi (UPDATE … WHERE used_at IS NULL e atomic).
    // Un rezultat „eroare” întors din tranzacție o finalizează (COMMIT), deci toate verificările care pot
    // eșua vin ÎNAINTE de consumarea invitației; o excepție ulterioară (ex. nume luat simultan) face ROLLBACK.
    const result = await db.transaction(async (tx) => {
      const taken = await tx.prepare("SELECT 1 FROM users WHERE lower(username) = lower(?)").get(username);
      if (taken) return { error: "Numele de utilizator este deja folosit. Alege altul.", status: 409 } as const;

      const claimed = await tx
        .prepare(
          `UPDATE invitations SET used_at = now()
           WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
           RETURNING id`,
        )
        .get<{ id: number }>(sha256(code));
      if (!claimed) return { error: INVALID_INVITE, status: 404 } as const;

      const user = await tx
        .prepare("INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)")
        .run(username, passwordHash, salt, new Date().toISOString());
      const userId = Number(user.lastInsertRowid);
      await tx.prepare("UPDATE invitations SET used_by = ? WHERE id = ?").run(userId, claimed.id);
      return { userId, invitationId: claimed.id } as const;
    });

    if ("error" in result) {
      if (result.status === 404) await recordFailedLogin(meta.ip);
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    // Categoriile și setările implicite se creează la prima folosire; profilul gol pornește ghidul de început.
    const userDb = await getDbFor(result.userId);
    await userDb.prepare("INSERT INTO user_profiles (onboarding_done_at) VALUES (NULL) ON CONFLICT DO NOTHING").run();

    // Persoana venea de pe lista de așteptare: emailul nu mai trebuie păstrat acolo. În afara tranzacției și
    // fără să blocheze crearea contului (ex. dacă migrarea 0007 n-a fost încă aplicată).
    await (await getSystemDb())
      .prepare("DELETE FROM waitlist WHERE invitation_id = ?")
      .run(result.invitationId)
      .catch((e) => console.error("Curățarea listei de așteptare a eșuat:", e));

    await logAuthEvent(result.userId, true, "invite", meta);
    const { token, expiresAt } = await createSession(result.userId, true, "invite", meta);
    const res = NextResponse.json({ ok: true, user: { id: result.userId, username } });
    res.cookies.set({ ...sessionCookieOptions(expiresAt), value: token });
    return res;
  } catch (err) {
    return errorResponse(err, "Contul nu a putut fi creat.");
  }
}
