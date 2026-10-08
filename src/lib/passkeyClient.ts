"use client";

import {
  browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startAuthentication, startRegistration,
  type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

/**
 * Face ID / amprentă în browser = WebAuthn (tehnic, un „passkey” păstrat de dispozitiv). Biometria nu părăsește
 * niciodată telefonul sau calculatorul: dispozitivul doar semnează, după ce te-a recunoscut.
 */

/** Mesaj clar pentru erorile browserului (anulare, timp expirat, dispozitiv deja adăugat). */
export function passkeyErrorMessage(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "AbortError") return "Operațiunea a fost anulată sau a expirat.";
  if (name === "InvalidStateError") return "Face ID / amprenta e deja activată pe acest dispozitiv.";
  if (name === "SecurityError") return "Face ID / amprenta funcționează doar pe adresa principală a aplicației (HTTPS).";
  if (name === "NotSupportedError") return "Dispozitivul acesta nu are Face ID, amprentă sau Windows Hello configurate.";
  return e instanceof Error ? e.message : "Face ID / amprenta nu a funcționat.";
}

export const passkeysSupported = () => typeof window !== "undefined" && browserSupportsWebAuthn();

/** Dispozitivul are biometrie (sau PIN-ul de Windows Hello) pregătită pentru site-uri. */
export async function biometricAvailable(): Promise<boolean> {
  if (!passkeysSupported()) return false;
  return platformAuthenticatorIsAvailable().catch(() => false);
}

/** Numele pe care îl recunoaște omul: „Face ID” pe iPhone, „amprentă” pe Android, „Windows Hello” pe PC. */
export function biometricLabel(): string {
  if (typeof navigator === "undefined") return "Face ID / amprentă";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad/.test(ua)) return "Face ID / Touch ID";
  if (/android/.test(ua)) return "amprentă";
  if (/windows/.test(ua)) return "Windows Hello";
  if (/mac os/.test(ua)) return "Touch ID";
  return "Face ID / amprentă";
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error ?? "Operația nu a reușit"), { status: r.status, data: j });
  return j as T;
}

/** Login cu Face ID / amprentă (fără nume de utilizator: dispozitivul știe ce cont are salvat). */
export async function loginWithPasskey(rememberMe: boolean) {
  const options = await post<PublicKeyCredentialRequestOptionsJSON>("/api/auth/passkey/login/options");
  const response = await startAuthentication({ optionsJSON: options });
  return post<{ ok: true }>("/api/auth/passkey/login/verify", { response, rememberMe });
}

/** Face ID / amprentă pe dispozitivul curent. Întoarce codurile de recuperare dacă e prima protecție a contului. */
export async function registerPasskey(name: string, request: <T>(url: string, method: string, body?: unknown) => Promise<T>) {
  const options = await request<PublicKeyCredentialCreationOptionsJSON>("/api/auth/passkey/register/options", "POST");
  const response = await startRegistration({ optionsJSON: options });
  return request<{ ok: true; name: string; recoveryCodes: string[] | null }>("/api/auth/passkey/register/verify", "POST", { response, name });
}

/** Reconfirmarea identității cu Face ID / amprentă, pe baza opțiunilor primite de la server. */
export async function reauthWithPasskey(options: PublicKeyCredentialRequestOptionsJSON) {
  const response = await startAuthentication({ optionsJSON: options });
  return post<{ ok: true }>("/api/auth/reauth/verify", { response });
}

export async function reauthWithCode(body: { password: string } | { totpCode: string } | { recoveryCode: string }) {
  return post<{ ok: true }>("/api/auth/reauth/verify", body);
}

export type ReauthMethod = "biometric" | "totp" | "recovery" | "password";

export async function reauthOptions() {
  return post<{ methods: ReauthMethod[]; options?: PublicKeyCredentialRequestOptionsJSON | null }>("/api/auth/reauth/options");
}
