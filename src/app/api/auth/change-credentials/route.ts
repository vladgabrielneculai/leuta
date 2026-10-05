import { NextRequest, NextResponse } from "next/server";
import {
  generateSalt, hashPassword, logAuthEvent, MIN_PASSWORD_LENGTH, requestMeta, requireRecentAuth, revokeSessions,
  verifyPassword,
} from "@/lib/auth";
import { getSystemDb as getDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Schimbă utilizatorul și/sau parola. Cere identitatea confirmată recent + parola curentă. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireRecentAuth();
    if ("response" in auth) return auth.response;
    const { session } = auth;

    const body = await req.json();
    const newUsername = body.newUsername ? String(body.newUsername).trim().slice(0, 100) : undefined;
    const currentPassword = String(body.currentPassword ?? "").slice(0, 200);
    const newPassword = body.newPassword ? String(body.newPassword).slice(0, 200) : undefined;

    const db = await getDb();
    const row = await db.prepare("SELECT password_hash, salt FROM users WHERE id = ?").get<{
      password_hash: string;
      salt: string;
    }>(session.id);
    if (!row || !(await verifyPassword(currentPassword, row.salt, row.password_hash)).ok) {
      return NextResponse.json({ error: "Parola curentă este incorectă." }, { status: 400 });
    }

    if (newUsername !== undefined && newUsername.length < 3) {
      return NextResponse.json({ error: "Numele de utilizator trebuie să aibă cel puțin 3 caractere." }, { status: 400 });
    }
    if (newPassword !== undefined && newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json({ error: `Parola nouă trebuie să aibă cel puțin ${MIN_PASSWORD_LENGTH} caractere.` }, { status: 400 });
    }

    if (newUsername) {
      const taken = await db
        .prepare("SELECT 1 FROM users WHERE lower(username) = lower(?) AND id <> ?")
        .get(newUsername, session.id);
      if (taken) return NextResponse.json({ error: "Numele de utilizator este deja folosit." }, { status: 400 });
      await db.prepare("UPDATE users SET username = ? WHERE id = ?").run(newUsername, session.id);
    }

    if (newPassword) {
      const newSalt = generateSalt();
      await db.prepare("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?").run(await hashPassword(newPassword, newSalt), newSalt, session.id);
      // O parolă schimbată închide toate celelalte dispozitive (inclusiv pe cineva care o aflase).
      await revokeSessions(session.id, session.sessionId);
      await logAuthEvent(session.id, true, "parola-schimbata", requestMeta(req.headers));
    }

    return NextResponse.json({ ok: true, message: "Datele de autentificare au fost actualizate." });
  } catch (err) {
    return errorResponse(err, "Eroare la actualizare.");
  }
}
