"use client";

import {
  browserSupportsWebAuthn, startAuthentication, startRegistration,
  type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

/** Mesaj clar pentru erorile browserului (anulare, timp expirat, passkey deja adăugat). */
export function passkeyErrorMessage(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "AbortError") return "Operațiunea a fost anulată sau a expirat.";
  if (name === "InvalidStateError") return "Passkey-ul acesta e deja adăugat pe dispozitiv.";
  if (name === "SecurityError") return "Passkey-urile funcționează doar pe adresa principală a aplicației (HTTPS).";
  return e instanceof Error ? e.message : "Passkey-ul nu a funcționat.";
}

export const passkeysSupported = () => typeof window !== "undefined" && browserSupportsWebAuthn();

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

/** Login cu passkey (fără nume de utilizator: browserul arată passkey-urile salvate). */
export async function loginWithPasskey(rememberMe: boolean) {
  const options = await post<PublicKeyCredentialRequestOptionsJSON>("/api/auth/passkey/login/options");
  const response = await startAuthentication({ optionsJSON: options });
  return post<{ ok: true }>("/api/auth/passkey/login/verify", { response, rememberMe });
}

/** Passkey nou pentru contul curent. Întoarce codurile de recuperare dacă e primul. */
export async function registerPasskey(name: string, request: <T>(url: string, method: string, body?: unknown) => Promise<T>) {
  const options = await request<PublicKeyCredentialCreationOptionsJSON>("/api/auth/passkey/register/options", "POST");
  const response = await startRegistration({ optionsJSON: options });
  return request<{ ok: true; name: string; recoveryCodes: string[] | null }>("/api/auth/passkey/register/verify", "POST", { response, name });
}

/** Reconfirmarea identității cu passkey, pe baza opțiunilor primite de la server. */
export async function reauthWithPasskey(options: PublicKeyCredentialRequestOptionsJSON) {
  const response = await startAuthentication({ optionsJSON: options });
  return post<{ ok: true }>("/api/auth/reauth/verify", { response });
}

export async function reauthWithPassword(password: string) {
  return post<{ ok: true }>("/api/auth/reauth/verify", { password });
}

export async function reauthOptions() {
  return post<{ method: "password" } | { method: "passkey"; options: PublicKeyCredentialRequestOptionsJSON }>("/api/auth/reauth/options");
}
