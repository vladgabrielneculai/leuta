"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Field } from "@/components/ui";

const MIN_PASSWORD = 12;

/** Parolă nouă dintr-un link de resetare primit de la administrator (/resetare?cod=…). */
function ResetForm() {
  const code = useSearchParams().get("cod") ?? "";
  const [state, setState] = useState<"checking" | "valid" | "invalid">("checking");
  const [username, setUsername] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!code) {
      setLinkError("Linkul nu conține codul de resetare. Deschide exact linkul primit de la administrator.");
      setState("invalid");
      return;
    }
    fetch(`/api/auth/reset?cod=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.valid) {
          setUsername(j.username);
          setState("valid");
        } else {
          setLinkError(j.error ?? "Linkul de resetare nu este valid.");
          setState("invalid");
        }
      })
      .catch(() => {
        setLinkError("Linkul nu a putut fi verificat. Încearcă din nou.");
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
      const r = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, password }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        window.location.href = "/setari";
        return;
      }
      setError(j.error ?? "Parola nu a putut fi schimbată.");
    } catch {
      setError("Parola nu a putut fi schimbată. Verifică conexiunea și încearcă din nou.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-modal-pop w-full max-w-sm panel p-6 sm:p-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <Logo className="h-16 w-16 drop-shadow-md" />
        <h1 className="mt-3 font-display text-[26px] font-bold tracking-tight">Parolă nouă</h1>
        <p className="mt-1 text-[13px] text-ink-soft">
          {state === "valid" ? <>Pentru contul <strong className="text-ink">{username}</strong>. Datele tale rămân neatinse.</> : "Resetarea accesului în Leuța."}
        </p>
      </div>

      {state === "checking" && <p className="text-center text-ink-soft">Se verifică linkul…</p>}

      {state === "invalid" && (
        <div className="rounded-md bg-rosu-tint p-3 text-[13px] font-medium text-rosu">
          {linkError}
          <a href="/login" className="mt-2 block text-albastru hover:underline">Înapoi la login →</a>
        </div>
      )}

      {state === "valid" && (
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && <div className="rounded-md bg-rosu-tint p-3 text-[13px] font-medium text-rosu">{error}</div>}
          <input type="text" autoComplete="username" value={username} readOnly hidden />
          <Field label="Parola nouă" hint={`Cel puțin ${MIN_PASSWORD} caractere.`}>
            <input className="field" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
          </Field>
          <Field label="Confirmă parola">
            <input className="field" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </Field>
          <p className="rounded-md bg-paper p-3 text-[12.5px] text-ink-soft">
            Din motive de siguranță, 2FA și Face ID / amprenta se dezactivează, iar celelalte dispozitive sunt deconectate.
            Le reactivezi din Setări imediat după.
          </p>
          <button type="submit" disabled={busy} className="btn-primary w-full justify-center py-3 text-[15px] font-semibold">
            {busy ? "Se salvează…" : "Salvează și intră"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function ResetPage() {
  return (
    <div className="guilloche guilloche-full relative flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))]"><ThemeToggle /></div>
      <Suspense fallback={<p className="text-ink-soft">Se încarcă…</p>}>
        <ResetForm />
      </Suspense>
    </div>
  );
}
