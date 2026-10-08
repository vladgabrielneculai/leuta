"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import {
  biometricLabel, passkeyErrorMessage, reauthOptions, reauthWithCode, reauthWithPasskey, type ReauthMethod,
} from "@/lib/passkeyClient";
import { Modal, setReauthHandler } from "./ui";

type CodeMode = "totp" | "recovery" | "password";

const CODE_FIELD: Record<CodeMode, { label: string; placeholder: string; inputMode?: "numeric"; mono?: boolean; type?: string }> = {
  totp: { label: "Codul din aplicația de autentificare", placeholder: "123 456", inputMode: "numeric", mono: true },
  recovery: { label: "Un cod de recuperare", placeholder: "xxxx-xxxx-xxxx", mono: true },
  password: { label: "Parola", placeholder: "", type: "password" },
};

/**
 * Fereastra „Confirmă că ești tu”: apare automat când o acțiune sensibilă o cere,
 * apoi cererea inițială se repetă singură.
 */
export default function ReauthDialog() {
  const [open, setOpen] = useState(false);
  const [methods, setMethods] = useState<ReauthMethod[] | null>(null);
  const [options, setOptions] = useState<PublicKeyCredentialRequestOptionsJSON | null>(null);
  const [mode, setMode] = useState<CodeMode>("password");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const prepare = async () => {
    setError(null);
    setMethods(null);
    try {
      const r = await reauthOptions();
      setMethods(r.methods);
      setOptions(r.options ?? null);
      setMode(r.methods.includes("totp") ? "totp" : r.methods.includes("password") ? "password" : "recovery");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confirmarea nu a putut porni.");
    }
  };

  useEffect(() => {
    setReauthHandler(
      () =>
        new Promise<boolean>((resolve) => {
          resolver.current?.(false);
          resolver.current = resolve;
          setValue("");
          setOpen(true);
          prepare();
        }),
    );
    return () => setReauthHandler(null);
  }, []);

  const finish = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpen(false);
  };

  const confirmBiometric = async () => {
    if (!options) return;
    setBusy(true);
    setError(null);
    try {
      await reauthWithPasskey(options);
      finish(true);
    } catch (e) {
      setError(passkeyErrorMessage(e));
      prepare(); // provocarea s-a consumat — cerem una nouă pentru încercarea următoare
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await reauthWithCode(mode === "totp" ? { totpCode: value } : mode === "recovery" ? { recoveryCode: value } : { password: value });
      finish(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmarea nu a reușit.");
    } finally {
      setBusy(false);
    }
  };

  const field = CODE_FIELD[mode];
  const switchTo = (m: CodeMode) => {
    setMode(m);
    setValue("");
    setError(null);
  };

  return (
    <Modal open={open} onClose={() => finish(false)} title="Confirmă că ești tu">
      <p className="mb-4 text-[13.5px] text-ink-soft">
        Acțiunea aceasta e sensibilă (date, export, parolă sau securitate). Confirmă-ți identitatea; confirmarea rămâne
        valabilă 10 minute.
      </p>
      {methods?.includes("biometric") && (
        <button className="btn-primary mb-4 w-full justify-center py-2.5" onClick={confirmBiometric} disabled={busy}>
          {busy ? "Se verifică…" : `🔐 Confirmă cu ${biometricLabel()}`}
        </button>
      )}
      {methods && (
        <form onSubmit={confirmCode} className="flex flex-col gap-3">
          <label className="block">
            <span className="label">{field.label}</span>
            <input
              className={`field ${field.mono ? "font-mono tracking-wider" : ""}`}
              type={field.type ?? "text"}
              inputMode={field.inputMode}
              autoComplete={mode === "password" ? "current-password" : "one-time-code"}
              placeholder={field.placeholder}
              autoFocus={!methods.includes("biometric")}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </label>
          <button type="submit" className={`${methods.includes("biometric") ? "btn-ghost border border-line" : "btn-primary"} w-full justify-center py-2.5`} disabled={busy || !value}>
            {busy ? "Se verifică…" : "Confirmă"}
          </button>
          {methods.includes("totp") && (
            <button type="button" className="text-center text-[12.5px] text-albastru hover:underline" onClick={() => switchTo(mode === "totp" ? "recovery" : "totp")}>
              {mode === "totp" ? "Nu ai telefonul la tine? Folosește un cod de recuperare" : "Folosește codul din aplicația de autentificare"}
            </button>
          )}
        </form>
      )}
      {!methods && !error && <p className="text-[13px] text-ink-soft">Se pregătește…</p>}
      {error && <p className="mt-3 text-[13px] text-rosu">{error}</p>}
    </Modal>
  );
}
