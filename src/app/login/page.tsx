"use client";

import { useEffect, useState } from "react";
import { api, Field } from "@/components/ui";
import { loginWithPasskey, passkeyErrorMessage, passkeysSupported } from "@/lib/passkeyClient";

/**
 * Login: passkey (amprentă / Face ID / Windows Hello) e calea principală. Parola merge singură doar cât
 * contul n-are încă passkey; după aceea, parola + un cod de recuperare e varianta de urgență.
 */
export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [needsRecovery, setNeedsRecovery] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(passkeysSupported());
    api<{ setupNeeded: boolean; authenticated: boolean }>("/api/auth/status")
      .then((res) => {
        if (res.setupNeeded) {
          window.location.replace("/setup");
        } else if (res.authenticated) {
          window.location.replace("/");
        } else {
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
  }, []);

  const passkeyLogin = async () => {
    setError(null);
    setBusy(true);
    try {
      await loginWithPasskey(rememberMe);
      window.location.href = "/";
    } catch (err) {
      setError(passkeyErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, recoveryCode: recoveryCode || undefined, rememberMe }),
      });
      const res = await r.json();
      if (r.ok) {
        window.location.href = res.usedRecoveryCode ? "/setari?securitate=recuperare" : "/";
        return;
      }
      if (res.passkeyRequired) setNeedsRecovery(true);
      setError(res.error || "Autentificarea nu a reușit.");
    } catch {
      setError("Eroare la autentificare.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
        <p className="text-ink-soft">Se verifică sesiunea…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-sheet p-6 shadow-sm sm:p-8">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2">
            <span className="h-4 w-2 rounded-sm bg-leu" />
            <h1 className="font-display text-[24px] font-bold">Banii mei</h1>
          </div>
          <p className="mt-1 text-[13px] text-ink-soft">Autentificare securizată</p>
        </div>

        {error && <div className="mb-4 rounded-md bg-rosu-tint p-3 text-[13px] font-medium text-rosu">{error}</div>}

        {supported && (
          <button
            type="button"
            onClick={passkeyLogin}
            disabled={busy}
            className="btn-primary w-full justify-center py-3 text-[15px] font-semibold"
          >
            {busy && !showPassword ? "Se verifică…" : "🔐 Intră cu passkey"}
          </button>
        )}
        <label className="mt-3 flex cursor-pointer select-none items-center gap-2 text-[13px] text-ink-soft">
          <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 rounded border-line accent-leu" />
          <span>Ține-mă minte pe acest dispozitiv</span>
        </label>

        {!showPassword && supported ? (
          <button type="button" className="mt-5 w-full text-center text-[13px] text-albastru hover:underline" onClick={() => setShowPassword(true)}>
            Intră cu parola (sau cu un cod de recuperare)
          </button>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4 border-t border-line pt-5">
            <Field label="Utilizator">
              <input className="field" type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
            </Field>
            <Field label="Parolă">
              <input className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {needsRecovery && (
              <Field label="Cod de recuperare" hint="Unul din cele 10 coduri primite când ai adăugat primul passkey. Fiecare merge o singură dată.">
                <input className="field font-mono" type="text" autoComplete="one-time-code" placeholder="xxxx-xxxx-xxxx" value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)} required />
              </Field>
            )}
            <button type="submit" disabled={busy} className="btn-ghost w-full justify-center border border-line py-2.5 text-[14px] font-semibold">
              {busy ? "Se verifică…" : needsRecovery ? "Intră cu parola + codul" : "Intră cu parola"}
            </button>
          </form>
        )}

        <div className="mt-6 border-t border-line pt-3 text-center text-[12px] text-ink-soft">
          Datele tale sunt stocate privat, într-o bază de date Supabase protejată.
        </div>
      </div>
    </div>
  );
}
