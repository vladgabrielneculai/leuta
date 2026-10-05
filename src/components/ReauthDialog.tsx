"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { passkeyErrorMessage, reauthOptions, reauthWithPasskey, reauthWithPassword } from "@/lib/passkeyClient";
import { Modal, setReauthHandler } from "./ui";

/**
 * Fereastra „Confirmă că ești tu”: apare automat când o acțiune sensibilă o cere,
 * apoi cererea inițială se repetă singură.
 */
export default function ReauthDialog() {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"passkey" | "password" | null>(null);
  const [options, setOptions] = useState<PublicKeyCredentialRequestOptionsJSON | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const prepare = async () => {
    setError(null);
    setMethod(null);
    try {
      const r = await reauthOptions();
      setMethod(r.method);
      setOptions(r.method === "passkey" ? r.options : null);
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
          setPassword("");
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

  const confirmPasskey = async () => {
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

  const confirmPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await reauthWithPassword(password);
      finish(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Parola este incorectă.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => finish(false)} title="Confirmă că ești tu">
      <p className="mb-4 text-[13.5px] text-ink-soft">
        Acțiunea aceasta e sensibilă (date, export, parolă sau passkey-uri). Confirmă-ți identitatea; confirmarea rămâne
        valabilă 10 minute.
      </p>
      {method === "passkey" && (
        <button className="btn-primary w-full justify-center py-2.5" onClick={confirmPasskey} disabled={busy}>
          {busy ? "Se verifică…" : "🔐 Confirmă cu passkey (amprentă / Face ID)"}
        </button>
      )}
      {method === "password" && (
        <form onSubmit={confirmPassword} className="flex flex-col gap-3">
          <label className="block">
            <span className="label">Parola</span>
            <input className="field" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button type="submit" className="btn-primary w-full justify-center py-2.5" disabled={busy || !password}>
            {busy ? "Se verifică…" : "Confirmă"}
          </button>
        </form>
      )}
      {!method && !error && <p className="text-[13px] text-ink-soft">Se pregătește…</p>}
      {error && <p className="mt-3 text-[13px] text-rosu">{error}</p>}
    </Modal>
  );
}
