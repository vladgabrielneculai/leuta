import crypto from "crypto";
import { cookies } from "next/headers";
import { getSystemDb as getDb } from "./db"; // utilizatori/sesiuni = tabele comune

export const SESSION_COOKIE = "bp_session";

export type SafeUser = {
  id: number;
  username: string;
  created_at: string;
};

export function generateSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  const check = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(check, "hex"), Buffer.from(hash, "hex"));
}

/**
 * true dacă există deja un cont. Erorile de bază de date NU sunt înghițite: dacă am întoarce
 * `false` la o eroare, aplicația ar trimite utilizatorul la /setup ca și cum n-ar avea cont.
 */
export async function isSetupComplete(): Promise<boolean> {
  const row = await (await getDb()).prepare("SELECT COUNT(*)::int AS c FROM users").get<{ c: number }>();
  return (row?.c ?? 0) > 0;
}

export async function createSession(userId: number, rememberMe = true): Promise<{ token: string; expiresAt: string }> {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const days = rememberMe ? 30 : 1;
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  const db = await getDb();
  await db.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    token,
    userId,
    now.toISOString(),
    expiresAt,
  );
  // Curățenie ocazională a sesiunilor expirate, ca tabela să nu crească la nesfârșit.
  await db.prepare("DELETE FROM sessions WHERE expires_at < now()").run();

  return { token, expiresAt };
}

export async function destroySession(token: string): Promise<void> {
  try {
    await (await getDb()).prepare("DELETE FROM sessions WHERE id = ?").run(token);
  } catch {
    // Ignore errors
  }
}

/** Utilizatorul pentru un token de sesiune (folosit și de proxy.ts pentru protecția rutelor). */
export async function userForToken(token: string | undefined): Promise<SafeUser | null> {
  if (!token) return null;
  try {
    const row = await (await getDb())
      .prepare(
        `SELECT u.id, u.username, u.created_at
         FROM sessions s JOIN users u ON s.user_id = u.id
         WHERE s.id = ? AND s.expires_at > now()`,
      )
      .get<SafeUser>(token);
    return row ?? null;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<SafeUser | null> {
  const cookieStore = await cookies();
  return userForToken(cookieStore.get(SESSION_COOKIE)?.value);
}

/** Opțiunile cookie-ului de sesiune — `secure` doar în producție (HTTPS), ca local să meargă pe http. */
export function sessionCookieOptions(expiresAt: string) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: new Date(expiresAt),
  };
}

// ---------- Protecție împotriva ghicirii parolei (aplicația e acum publică pe internet) ----------

const MAX_FAILS = 8;
const WINDOW_MIN = 15;

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "necunoscut";
}

/** true dacă IP-ul a avut prea multe încercări eșuate în ultima fereastră de timp. */
export async function isLockedOut(ip: string): Promise<boolean> {
  const row = await (await getDb())
    .prepare(`SELECT COUNT(*)::int AS c FROM login_attempts WHERE ip = ? AND attempted_at > now() - interval '${WINDOW_MIN} minutes'`)
    .get<{ c: number }>(ip);
  return (row?.c ?? 0) >= MAX_FAILS;
}

export async function recordFailedLogin(ip: string) {
  const db = await getDb();
  await db.prepare("INSERT INTO login_attempts (ip) VALUES (?)").run(ip);
  await db.prepare("DELETE FROM login_attempts WHERE attempted_at < now() - interval '1 day'").run();
}

export async function clearFailedLogins(ip: string) {
  await (await getDb()).prepare("DELETE FROM login_attempts WHERE ip = ?").run(ip);
}

export const LOCKOUT_MESSAGE = `Prea multe încercări eșuate. Încearcă din nou peste ${WINDOW_MIN} minute.`;
