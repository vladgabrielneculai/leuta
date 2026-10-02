import { NextRequest, NextResponse } from "next/server";
import { generateSalt, getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Nu ești autentificat." }, { status: 401 });
    }

    const body = await req.json();
    const newUsername = body.newUsername ? String(body.newUsername).trim() : undefined;
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = body.newPassword ? String(body.newPassword) : undefined;

    const db = await getDb();
    const row = (await db.prepare("SELECT password_hash, salt FROM users WHERE id = ?").get<{
      password_hash: string;
      salt: string;
    }>(user.id))!;

    if (!verifyPassword(currentPassword, row.salt, row.password_hash)) {
      return NextResponse.json({ error: "Parola curentă este incorectă." }, { status: 400 });
    }

    if (newUsername && newUsername.length >= 3) {
      await db.prepare("UPDATE users SET username = ? WHERE id = ?").run(newUsername, user.id);
    }

    if (newPassword && newPassword.length >= 8) {
      const newSalt = generateSalt();
      const newHash = hashPassword(newPassword, newSalt);
      await db.prepare("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?").run(newHash, newSalt, user.id);
    }

    return NextResponse.json({ ok: true, message: "Datele de autentificare au fost actualizate." });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Eroare la actualizare." }, { status: 500 });
  }
}

