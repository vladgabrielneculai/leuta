"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Field } from "@/components/ui";

const MIN_PASSWORD = 12;

/** Crearea unui cont nou dintr-un link de invitație (/inregistrare?cod=…). */
function RegisterForm() {
  const code = useSearchParams().get("cod") ?? "";
  const [state, setState] = useState<"checking" | "valid" | "invalid">("checking");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!code) {
      setInviteError("Linkul nu conține un cod de invitație. Deschide exact linkul primit de la administrator.");
      setState("invalid");
      return;
    }
    fetch(`/api/auth/register?cod=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.valid) setState("valid");
        else {
          setInviteError(j.error ?? "Invitația nu este validă.");
          setState("invalid");
        }
      })
      .catch(() => {
        setInviteError("Invitația nu a putut fi verificată. Încearcă din nou.");
        setState("invalid");
      });
  }, [code]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) return setError(`Parola trebuie să aibă cel puțin ${MIN_PASSWORD} caractere.`);
    if (password !== confirm) return setError("Parolele introduse nu coincid.");
    setBusy(true);
    try {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, username: username.trim(), password }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        window.location.href = "/bun-venit";
        return;
      }
      setError(j.error ?? "Contul nu a putut fi creat.");
    } catch {
      setError("Contul nu a putut fi creat. Verifică conexiunea și încearcă din nou.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-modal-pop w-full max-w-sm panel p-6 sm:p-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <Logo className="h-16 w-16 drop-shadow-md" />
        <h1 className="mt-3 font-display text-[26px] font-bold tracking-tight">Bun venit în Leuța</h1>
        <p className="mt-1 text-[13px] text-ink-soft">Creează-ți contul. Datele tale financiare vor fi vizibile doar ție.</p>
      </div>

      {state === "checking" && <p className="text-center text-ink-soft">Se verifică invitația…</p>}

      {state === "invalid" && (
        <div className="rounded-md bg-rosu-tint p-3 text-[13px] font-medium text-rosu">
          {inviteError}
          <a href="/login" className="mt-2 block text-albastru hover:underline">Ai deja cont? Intră în aplicație →</a>
        </div>
      )}

      {state === "valid" && (
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && <div className="rounded-md bg-rosu-tint p-3 text-[13px] font-medium text-rosu">{error}</div>}
          <Field label="Nume de utilizator" hint="Îl folosești la autentificare. Litere, cifre, punct, liniuță.">
            <input
              className="field"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              maxLength={40}
              required
              autoFocus
            />
          </Field>
          <Field label="Parolă" hint={`Cel puțin ${MIN_PASSWORD} caractere. După ce intri, poți adăuga și un passkey (amprentă / Face ID).`}>
            <input className="field" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <Field label="Confirmă parola">
            <input className="field" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </Field>
          <button type="submit" disabled={busy} className="btn-primary w-full justify-center py-3 text-[15px] font-semibold">
            {busy ? "Se creează contul…" : "Creează contul"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="guilloche guilloche-full relative flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))]"><ThemeToggle /></div>
      <Suspense fallback={<p className="text-ink-soft">Se încarcă…</p>}>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
