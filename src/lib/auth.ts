import crypto from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSystemDb as getDb } from "./db"; // utilizatori/sesiuni = tabele comune
import { matchTotp } from "./totp";

export const SESSION_COOKIE = "bp_session";

export type SafeUser = {
  id: number;
  username: string;
  created_at: string;
  is_admin: boolean;
};

export type CurrentSession = SafeUser & {
  sessionId: string; // sha256(token) — cheia rândului din `sessions`
  lastAuthAt: string | null;
};

const pbkdf2 = promisify(crypto.pbkdf2);

/** sha256 hex — în baza de date ajung doar hash-uri ale token-urilor și codurilor, niciodată valorile. */
export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

// ---------- Parole ----------

// Format nou: „pbkdf2-sha512$<iterații>$<hex>”. Hash-urile vechi (doar hex) au 100.000 de iterații și se
// convertesc automat la următorul login reușit. 210.000 = recomandarea OWASP pentru PBKDF2-HMAC-SHA512.
const PBKDF2_ITERATIONS = 210_000;
const LEGACY_ITERATIONS = 100_000;
export const MIN_PASSWORD_LENGTH = 12;

export function generateSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await pbkdf2(password, salt, PBKDF2_ITERATIONS, 64, "sha512");
  return `pbkdf2-sha512$${PBKDF2_ITERATIONS}$${key.toString("hex")}`;
}

/** Verifică parola; `rehash` = hash-ul e într-un format mai slab și trebuie refăcut. */
export async function verifyPassword(password: string, salt: string, stored: string): Promise<{ ok: boolean; rehash: boolean }> {
  const m = /^pbkdf2-sha512\$(\d+)\$([0-9a-f]+)$/.exec(stored);
  const iterations = m ? Number(m[1]) : LEGACY_ITERATIONS;
  const expected = Buffer.from(m ? m[2] : stored, "hex");
  const actual = await pbkdf2(password, salt, iterations, expected.length || 64, "sha512");
  const ok = expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
  return { ok, rehash: ok && iterations < PBKDF2_ITERATIONS };
}

// Pentru utilizatori inexistenți calculăm totuși un hash, ca timpul de răspuns să nu dezvăluie
// dacă numele de utilizator există.
const DUMMY_SALT = generateSalt();
export async function dummyPasswordCheck(password: string) {
  await pbkdf2(password, DUMMY_SALT, PBKDF2_ITERATIONS, 64, "sha512");
}

/**
 * true dacă există deja un cont. Erorile de bază de date NU sunt înghițite: dacă am întoarce
 * `false` la o eroare, aplicația ar trimite utilizatorul la /setup ca și cum n-ar avea cont.
 */
export async function isSetupComplete(): Promise<boolean> {
  const row = await (await getDb()).prepare("SELECT COUNT(*)::int AS c FROM users").get<{ c: number }>();
  return (row?.c ?? 0) > 0;
}

// ---------- Context cerere (IP, dispozitiv, locație) ----------

export type RequestMeta = { ip: string; userAgent: string; location: string };

export function clientIp(headers: Headers): string {
  // Pe Vercel, x-forwarded-for e suprascris de platformă (clientul nu-l poate falsifica).
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "necunoscut";
}

export function requestMeta(headers: Headers): RequestMeta {
  const decode = (v: string | null) => {
    try {
      return v ? decodeURIComponent(v) : "";
    } catch {
      return v ?? "";
    }
  };
  const city = decode(headers.get("x-vercel-ip-city"));
  const country = headers.get("x-vercel-ip-country") ?? "";
  return {
    ip: clientIp(headers),
    userAgent: (headers.get("user-agent") ?? "").slice(0, 300),
    location: [city, country].filter(Boolean).join(", ").slice(0, 100),
  };
}

// ---------- Sesiuni ----------

export type AuthMethod = "password" | "passkey" | "totp" | "recovery" | "setup" | "invite";

export async function createSession(
  userId: number,
  rememberMe: boolean,
  method: AuthMethod,
  meta: RequestMeta,
): Promise<{ token: string; expiresAt: string }> {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const days = rememberMe ? 30 : 1;
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  const db = await getDb();
  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, created_at, expires_at, last_auth_at, last_seen_at, ip, user_agent, location, method)
       VALUES (?, ?, ?, ?, now(), now(), ?, ?, ?, ?)`,
    )
    .run(sha256(token), userId, now.toISOString(), expiresAt, meta.ip, meta.userAgent, meta.location, method);
  // Curățenie ocazională a sesiunilor expirate și a provocărilor WebAuthn vechi.
  await db.prepare("DELETE FROM sessions WHERE expires_at < now()").run();
  await db.prepare("DELETE FROM auth_challenges WHERE expires_at < now()").run();

  return { token, expiresAt };
}

export async function destroySession(token: string): Promise<void> {
  try {
    await (await getDb()).prepare("DELETE FROM sessions WHERE id = ?").run(sha256(token));
  } catch {
    // Ignore errors
  }
}

/** Închide toate sesiunile utilizatorului, mai puțin (opțional) cea curentă. */
export async function revokeSessions(userId: number, exceptSessionId?: string) {
  const db = await getDb();
  if (exceptSessionId) await db.prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?").run(userId, exceptSessionId);
  else await db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

/** Sesiunea pentru un token (folosit și de proxy.ts pentru protecția rutelor). */
export async function sessionForToken(token: string | undefined): Promise<CurrentSession | null> {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  try {
    const db = await getDb();
    const id = sha256(token);
    const row = await db
      .prepare(
        `SELECT u.id, u.username, u.created_at, u.is_admin, s.id AS session_id, s.last_auth_at,
                (s.last_seen_at IS NULL OR s.last_seen_at < now() - interval '5 minutes') AS stale
         FROM sessions s JOIN users u ON s.user_id = u.id
         WHERE s.id = ? AND s.expires_at > now() AND u.disabled_at IS NULL`,
      )
      .get<SafeUser & { session_id: string; last_auth_at: string | null; stale: boolean }>(id);
    if (!row) return null;
    // „Văzut ultima dată” se actualizează cel mult o dată la 5 minute, nu la fiecare cerere.
    if (row.stale) await db.prepare("UPDATE sessions SET last_seen_at = now() WHERE id = ?").run(id);
    return {
      id: row.id, username: row.username, created_at: row.created_at, is_admin: !!row.is_admin,
      sessionId: row.session_id, lastAuthAt: row.last_auth_at,
    };
  } catch {
    return null;
  }
}

export async function userForToken(token: string | undefined): Promise<SafeUser | null> {
  const s = await sessionForToken(token);
  return s ? { id: s.id, username: s.username, created_at: s.created_at, is_admin: s.is_admin } : null;
}

export async function getCurrentSession(): Promise<CurrentSession | null> {
  const cookieStore = await cookies();
  return sessionForToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function getCurrentUser(): Promise<SafeUser | null> {
  const s = await getCurrentSession();
  return s ? { id: s.id, username: s.username, created_at: s.created_at, is_admin: s.is_admin } : null;
}

/** Doar administratorul (invitații, lista conturilor). Datele financiare ale altora nu sunt accesibile nici lui. */
export async function requireAdmin(): Promise<{ session: CurrentSession } | { response: NextResponse }> {
  const session = await getCurrentSession();
  if (!session) return { response: NextResponse.json({ error: "Neautentificat." }, { status: 401 }) };
  if (!session.is_admin) return { response: NextResponse.json({ error: "Doar administratorul are acces aici." }, { status: 403 }) };
  return { session };
}

/** Contul e dezactivat de administrator (nu se mai poate autentifica). */
export async function isAccountDisabled(userId: number): Promise<boolean> {
  const row = await (await getDb()).prepare("SELECT disabled_at IS NOT NULL AS disabled FROM users WHERE id = ?").get<{ disabled: boolean }>(userId);
  return !!row?.disabled;
}

export const DISABLED_MESSAGE = "Contul a fost dezactivat de administrator.";

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

// ---------- Reconfirmarea identității pentru acțiuni sensibile ----------

export const REAUTH_WINDOW_MIN = 10;

export function isRecentAuth(s: CurrentSession) {
  return !!s.lastAuthAt && Date.now() - new Date(s.lastAuthAt).getTime() < REAUTH_WINDOW_MIN * 60 * 1000;
}

/**
 * Pentru ștergeri, restaurări, export, schimbarea parolei sau a securității: identitatea trebuie
 * confirmată (Face ID / amprentă, cod 2FA sau parolă) în ultimele minute. Altfel răspundem 403 + `reauth: true`,
 * iar interfața cere confirmarea și repetă automat cererea.
 */
export async function requireRecentAuth(): Promise<{ session: CurrentSession } | { response: NextResponse }> {
  const session = await getCurrentSession();
  if (!session) return { response: NextResponse.json({ error: "Neautentificat." }, { status: 401 }) };
  if (!isRecentAuth(session)) {
    return { response: NextResponse.json({ error: "Confirmă-ți identitatea pentru această acțiune.", reauth: true }, { status: 403 }) };
  }
  return { session };
}

export async function markReauthenticated(sessionId: string) {
  await (await getDb()).prepare("UPDATE sessions SET last_auth_at = now() WHERE id = ?").run(sessionId);
}

// ---------- Al doilea factor (Face ID / amprentă, 2FA) și coduri de recuperare ----------

/** Câte dispozitive cu Face ID / amprentă are contul (passkey-uri WebAuthn, tehnic). */
export async function passkeyCount(userId: number): Promise<number> {
  const row = await (await getDb())
    .prepare("SELECT COUNT(*)::int AS c FROM webauthn_credentials WHERE user_id = ?")
    .get<{ c: number }>(userId);
  return row?.c ?? 0;
}

export type SecondFactors = { biometric: number; totp: boolean };

/** Ce protejează contul pe lângă parolă. Cu oricare activ, parola singură nu mai deschide contul. */
export async function secondFactors(userId: number): Promise<SecondFactors> {
  const row = await (await getDb())
    .prepare(
      `SELECT (SELECT COUNT(*)::int FROM webauthn_credentials WHERE user_id = u.id) AS biometric,
              u.totp_secret IS NOT NULL AS totp
       FROM users u WHERE u.id = ?`,
    )
    .get<{ biometric: number; totp: boolean }>(userId);
  return { biometric: row?.biometric ?? 0, totp: !!row?.totp };
}

export const isProtected = (f: SecondFactors) => f.biometric > 0 || f.totp;

/** Verifică un cod 2FA al contului și îl marchează folosit (același cod nu merge de două ori). */
export async function useTotpCode(userId: number, code: string): Promise<boolean> {
  const db = await getDb();
  const row = await db
    .prepare("SELECT totp_secret, totp_last_step FROM users WHERE id = ?")
    .get<{ totp_secret: string | null; totp_last_step: string | number }>(userId);
  if (!row?.totp_secret) return false;
  const step = matchTotp(row.totp_secret, code, Number(row.totp_last_step));
  if (step === null) return false;
  // Condiția din WHERE face marcarea atomică: două cereri simultane cu același cod nu trec amândouă.
  const res = await db.prepare("UPDATE users SET totp_last_step = ? WHERE id = ? AND totp_last_step < ?").run(step, userId, step);
  return res.changes > 0;
}

const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // fără caractere ușor de confundat

function normalizeRecoveryCode(code: string) {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** 10 coduri noi (le vede utilizatorul o singură dată); cele vechi nu mai sunt valabile. */
export async function regenerateRecoveryCodes(userId: number): Promise<string[]> {
  const codes = Array.from({ length: 10 }, () => {
    const bytes = crypto.randomBytes(12);
    const raw = Array.from(bytes, (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join("");
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  });
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.prepare("DELETE FROM recovery_codes WHERE user_id = ?").run(userId);
    await tx
      .prepare(`INSERT INTO recovery_codes (user_id, code_hash) VALUES ${codes.map(() => "(?, ?)").join(",")}`)
      .run(...codes.flatMap((c) => [userId, sha256(normalizeRecoveryCode(c))]));
    // Lista tocmai a fost văzută și salvată: următoarea verificare periodică abia peste RECOVERY_CHECK_DAYS.
    await tx.prepare("UPDATE users SET recovery_checked_at = now() WHERE id = ?").run(userId);
  });
  return codes;
}

/** La câte zile cerem un cod de recuperare, ca verificare că lista e încă la tine. */
export const RECOVERY_CHECK_DAYS = 90;

/** E timpul pentru verificarea periodică: contul e protejat, are coduri și n-a mai fost verificat de 3 luni. */
export async function recoveryCheckDue(userId: number): Promise<boolean> {
  const row = await (await getDb())
    .prepare(
      `SELECT (recovery_checked_at IS NULL OR recovery_checked_at < now() - interval '${RECOVERY_CHECK_DAYS} days')
              AND EXISTS (SELECT 1 FROM recovery_codes r WHERE r.user_id = u.id AND r.used_at IS NULL) AS due
       FROM users u WHERE u.id = ?`,
    )
    .get<{ due: boolean }>(userId);
  return !!row?.due;
}

/** Verifică un cod de recuperare FĂRĂ să-l consume (verificarea periodică) și reînnoiește data verificării. */
export async function checkRecoveryCode(userId: number, code: string): Promise<boolean> {
  const db = await getDb();
  const hit = await db
    .prepare("SELECT 1 FROM recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL")
    .get(userId, sha256(normalizeRecoveryCode(code)));
  if (!hit) return false;
  await db.prepare("UPDATE users SET recovery_checked_at = now() WHERE id = ?").run(userId);
  return true;
}

/** Consumă un cod de recuperare (o singură folosire). */
export async function useRecoveryCode(userId: number, code: string): Promise<boolean> {
  const res = await (await getDb())
    .prepare("UPDATE recovery_codes SET used_at = now() WHERE user_id = ? AND code_hash = ? AND used_at IS NULL")
    .run(userId, sha256(normalizeRecoveryCode(code)));
  return res.changes > 0;
}

export async function recoveryCodesLeft(userId: number): Promise<number> {
  const row = await (await getDb())
    .prepare("SELECT COUNT(*)::int AS c FROM recovery_codes WHERE user_id = ? AND used_at IS NULL")
    .get<{ c: number }>(userId);
  return row?.c ?? 0;
}

// ---------- Protecție împotriva ghicirii parolei ----------

const MAX_IP_FAILS = 8;
const MAX_ACCOUNT_FAILS = 10;
const WINDOW_MIN = 15;

/** true dacă IP-ul a avut prea multe încercări eșuate în ultima fereastră de timp. */
export async function isLockedOut(ip: string): Promise<boolean> {
  const row = await (await getDb())
    .prepare(`SELECT COUNT(*)::int AS c FROM login_attempts WHERE ip = ? AND attempted_at > now() - interval '${WINDOW_MIN} minutes'`)
    .get<{ c: number }>(ip);
  return (row?.c ?? 0) >= MAX_IP_FAILS;
}

/** Contul e blocat temporar (prea multe parole sau coduri greșite, din orice IP). Face ID / amprenta nu e afectată. */
export async function isAccountLocked(userId: number): Promise<boolean> {
  const row = await (await getDb())
    .prepare("SELECT (locked_until IS NOT NULL AND locked_until > now()) AS locked FROM users WHERE id = ?")
    .get<{ locked: boolean }>(userId);
  return !!row?.locked;
}

export async function recordFailedLogin(ip: string, userId?: number) {
  const db = await getDb();
  await db.prepare("INSERT INTO login_attempts (ip) VALUES (?)").run(ip);
  await db.prepare("DELETE FROM login_attempts WHERE attempted_at < now() - interval '1 day'").run();
  if (userId) {
    await db
      .prepare(
        `UPDATE users SET failed_logins = failed_logins + 1,
           locked_until = CASE WHEN failed_logins + 1 >= ${MAX_ACCOUNT_FAILS}
                               THEN now() + interval '${WINDOW_MIN} minutes' ELSE locked_until END
         WHERE id = ?`,
      )
      .run(userId);
  }
}

export async function clearFailedLogins(ip: string, userId?: number) {
  const db = await getDb();
  await db.prepare("DELETE FROM login_attempts WHERE ip = ?").run(ip);
  if (userId) await db.prepare("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?").run(userId);
}

export const LOCKOUT_MESSAGE = `Prea multe încercări eșuate. Încearcă din nou peste ${WINDOW_MIN} minute.`;

// ---------- Conturi noi și invitații ----------

/** Numele de utilizator: 3–40 caractere, litere/cifre/punct/liniuță/underscore (fără spații, ușor de tastat la login). */
export function validateUsername(username: string): string | null {
  if (username.length < 3 || username.length > 40) return "Numele de utilizator trebuie să aibă între 3 și 40 de caractere.";
  if (!/^[\p{L}\p{N}._-]+$/u.test(username)) return "Numele de utilizator poate conține doar litere, cifre, punct, liniuță și underscore.";
  return null;
}

export const INVITE_DAYS = 7;

/** Creează o invitație și întoarce codul (vizibil o singură dată; în baza de date ajunge doar hash-ul). */
export async function createInvitation(createdBy: number, note: string): Promise<{ id: number; code: string; expiresAt: string }> {
  const code = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const res = await (await getDb())
    .prepare("INSERT INTO invitations (token_hash, note, created_by, expires_at) VALUES (?, ?, ?, ?)")
    .run(sha256(code), note.slice(0, 80), createdBy, expiresAt);
  return { id: res.lastInsertRowid, code, expiresAt };
}

/** Invitația validă (nefolosită, neanulată, neexpirată) pentru un cod, sau null. */
export async function findValidInvitation(code: string): Promise<{ id: number; note: string; expires_at: string } | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(code)) return null;
  const row = await (await getDb())
    .prepare(
      `SELECT id, note, expires_at FROM invitations
       WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()`,
    )
    .get<{ id: number; note: string; expires_at: string }>(sha256(code));
  return row ?? null;
}

// ---------- Istoric ----------

export async function logAuthEvent(
  userId: number | null,
  success: boolean,
  method: string,
  meta: RequestMeta,
  reason = "",
) {
  try {
    const db = await getDb();
    await db
      .prepare("INSERT INTO login_events (user_id, success, method, reason, ip, user_agent, location) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(userId, success ? 1 : 0, method, reason, meta.ip, meta.userAgent, meta.location);
    if (Math.random() < 0.05) await db.prepare("DELETE FROM login_events WHERE created_at < now() - interval '180 days'").run();
  } catch (e) {
    console.error("Istoricul de autentificare nu a putut fi salvat:", e);
  }
}
