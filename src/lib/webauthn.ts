import crypto from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { AuthenticatorTransportFuture, WebAuthnCredential } from "@simplewebauthn/server";
import { sha256 } from "./auth";
import { getSystemDb as getDb } from "./db";

/**
 * Passkey-uri (WebAuthn): amprentă, Face ID, Windows Hello sau o cheie de securitate.
 * Un passkey e legat de domeniul aplicației (RP ID). Pe un alt domeniu (ex. o previzualizare Vercel)
 * nu funcționează — acolo se intră cu parola (+ codul 2FA).
 */

export const RP_NAME = "Leuța";
const CHALLENGE_COOKIE = "bp_wa";
const CHALLENGE_TTL_MIN = 5;

/** Domeniul și originea așteptate, din cererea curentă (sau WEBAUTHN_RP_ID, dacă e setat). */
export function relyingParty(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost").split(",")[0].trim();
  const hostname = host.split(":")[0];
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  const proto = local ? (req.headers.get("x-forwarded-proto") ?? "http") : "https";
  return { rpID: process.env.WEBAUTHN_RP_ID || hostname, origin: `${proto}://${host}` };
}

export type Purpose = "login" | "register" | "reauth";

/** Salvează provocarea (o singură folosire, câteva minute) și pune în cookie identificatorul ei. */
export async function saveChallenge(res: NextResponse, purpose: Purpose, challenge: string, userId: number | null) {
  const id = crypto.randomBytes(32).toString("hex");
  await (await getDb())
    .prepare(
      `INSERT INTO auth_challenges (id, user_id, purpose, challenge, expires_at)
       VALUES (?, ?, ?, ?, now() + interval '${CHALLENGE_TTL_MIN} minutes')`,
    )
    .run(sha256(id), userId, purpose, challenge);
  res.cookies.set({
    name: CHALLENGE_COOKIE,
    value: id,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
    maxAge: CHALLENGE_TTL_MIN * 60,
  });
}

/** Ia și șterge provocarea (nu poate fi refolosită). null dacă lipsește, a expirat sau e pentru altceva. */
export async function takeChallenge(req: NextRequest, purpose: Purpose, userId: number | null): Promise<string | null> {
  const id = req.cookies.get(CHALLENGE_COOKIE)?.value;
  if (!id) return null;
  const row = await (await getDb())
    .prepare(
      `DELETE FROM auth_challenges WHERE id = ? AND purpose = ? AND expires_at > now()
       RETURNING challenge, user_id`,
    )
    .get<{ challenge: string; user_id: number | null }>(sha256(id), purpose);
  if (!row || (userId !== null && row.user_id !== userId)) return null;
  return row.challenge;
}

export function clearChallengeCookie(res: NextResponse) {
  res.cookies.set({ name: CHALLENGE_COOKIE, value: "", path: "/api/auth", maxAge: 0 });
}

type CredentialRow = {
  id: string;
  user_id: number;
  public_key: string;
  counter: string | number;
  transports: string;
};

export async function credentialById(id: string): Promise<(WebAuthnCredential & { userId: number }) | null> {
  const row = await (await getDb())
    .prepare("SELECT id, user_id, public_key, counter, transports FROM webauthn_credentials WHERE id = ?")
    .get<CredentialRow>(id);
  return row ? toCredential(row) : null;
}

export async function credentialsForUser(userId: number) {
  const rows = await (await getDb())
    .prepare("SELECT id, user_id, public_key, counter, transports FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at")
    .all<CredentialRow>(userId);
  return rows.map(toCredential);
}

function toCredential(r: CredentialRow) {
  return {
    id: r.id,
    userId: r.user_id,
    publicKey: isoBase64URL.toBuffer(r.public_key),
    counter: Number(r.counter),
    transports: (r.transports ? r.transports.split(",") : []) as AuthenticatorTransportFuture[],
  };
}

export function encodePublicKey(key: Parameters<typeof isoBase64URL.fromBuffer>[0]) {
  return isoBase64URL.fromBuffer(key);
}

/** Nume ușor de recunoscut pentru passkey, din browserul care l-a creat. */
export function deviceName(userAgent: string) {
  const ua = userAgent.toLowerCase();
  const os = /iphone|ipad/.test(ua) ? "iPhone/iPad" : /android/.test(ua) ? "Android" : /mac os/.test(ua) ? "Mac" : /windows/.test(ua) ? "Windows" : /linux/.test(ua) ? "Linux" : "Dispozitiv";
  const browser = /edg\//.test(ua) ? "Edge" : /chrome\//.test(ua) ? "Chrome" : /firefox\//.test(ua) ? "Firefox" : /safari\//.test(ua) ? "Safari" : "";
  return browser ? `${os} · ${browser}` : os;
}
