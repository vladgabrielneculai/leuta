"use client";

import { useEffect, useState } from "react";
import IntroSplash from "@/components/IntroSplash";
import Logo from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { api, Field } from "@/components/ui";
import { parseInviteCode } from "@/lib/invite";
import { biometricLabel, loginWithPasskey, passkeyErrorMessage, passkeysSupported } from "@/lib/passkeyClient";
import { SITE } from "@/lib/site/config";

/** Animația de început rămâne montată cât timp se verifică sesiunea și după, ca să nu se reia de la capăt. */
export default function LoginPage() {
  return (
    <>
      <IntroSplash />
      <LoginScreen />
    </>
  );
}

type SecondFactor = { totp: boolean; biometric: boolean };

/**
 * Login: Face ID / amprentă dintr-o atingere, sau utilizator + parolă. Dacă contul are 2FA (ori Face ID /
 * amprentă, iar acum intri de pe alt dispozitiv), după parola corectă se cere al doilea pas: codul din aplicația
 * de autentificare sau un cod de recuperare. Fila „Cont nou” duce la crearea contului dintr-o invitație.
 */
function LoginScreen() {
  const [tab, setTab] = useState<"login" | "new">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step2, setStep2] = useState<SecondFactor | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"bio" | "form" | null>(null);
  const [loading, setLoading] = useState(true);
  const [supported, setSupported] = useState(false);
  const [bioLabel, setBioLabel] = useState("Face ID / amprentă");
  const [invite, setInvite] = useState("");

  useEffect(() => {
    setSupported(passkeysSupported());
    setBioLabel(biometricLabel());
    if (new URLSearchParams(window.location.search).has("cont-nou")) setTab("new");
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

  const biometricLogin = async () => {
    setError(null);
    setBusy("bio");
    try {
      await loginWithPasskey(rememberMe);
      window.location.href = "/";
    } catch (err) {
      setError(passkeyErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy("form");
    try {
      const second = step2 ? (useRecovery || !step2.totp ? { recoveryCode: code } : { totpCode: code }) : {};
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, rememberMe, ...second }),
      });
      const res = await r.json();
      if (r.ok) {
        window.location.href = res.usedRecoveryCode ? "/setari?securitate=recuperare" : "/";
        return;
      }
      if (res.secondFactor && !step2) {
        // Parola e bună; urmează codul. Mesajul de pe server nu e o eroare, ci instrucțiunea pasului 2.
        setStep2(res.secondFactor);
        setUseRecovery(!res.secondFactor.totp);
        setCode("");
        return;
      }
      setError(res.error || "Autentificarea nu a reușit.");
    } catch {
      setError("Eroare la autentificare.");
    } finally {
      setBusy(null);
    }
  };

  const backToPassword = () => {
    setStep2(null);
    setCode("");
    setPassword("");
    setError(null);
  };

  const openInvite = (e: React.FormEvent) => {
    e.preventDefault();
    const c = parseInviteCode(invite);
    if (!c) return setError("Codul nu pare complet. Lipește exact linkul sau codul primit de la administrator.");
    window.location.href = `/inregistrare?cod=${encodeURIComponent(c)}`;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
        <p className="text-ink-soft">Se verifică sesiunea…</p>
      </div>
    );
  }

  const recoveryMode = !!step2 && (useRecovery || !step2.totp);
  const tabClass = (t: typeof tab) =>
    `flex-1 rounded-[6px] py-2 text-[13.5px] font-semibold transition-colors ${tab === t ? "bg-paper text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`;

  return (
    <div className="guilloche guilloche-full relative flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))]"><ThemeToggle /></div>
      <div className="animate-modal-pop w-full max-w-sm panel p-6 sm:p-8">
        <div className="mb-5 flex flex-col items-center text-center">
          <Logo className="h-16 w-16 drop-shadow-md" />
          <h1 className="mt-3 font-display text-[28px] font-bold tracking-[-0.03em]">Leuța</h1>
          <p className="mt-0.5 text-[13px] text-ink-soft">Bugetul tău, ban cu ban</p>
        </div>

        <div className="mb-5 flex gap-1 rounded-[8px] bg-line/50 p-1" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "login"} className={tabClass("login")} onClick={() => { setTab("login"); setError(null); }}>
            Intră în cont
          </button>
          <button type="button" role="tab" aria-selected={tab === "new"} className={tabClass("new")} onClick={() => { setTab("new"); setError(null); }}>
            Cont nou
          </button>
        </div>

        {error && <div className="mb-4 rounded-md bg-rosu-tint p-3 text-[13px] font-medium text-rosu">{error}</div>}

        {tab === "login" ? (
          <>
            {supported && !step2 && (
              <>
                <button type="button" onClick={biometricLogin} disabled={!!busy} className="btn-primary w-full justify-center py-3 text-[15px] font-semibold">
                  {busy === "bio" ? "Se verifică…" : `🔐 Intră cu ${bioLabel}`}
                </button>
                <div className="my-4 flex items-center gap-3 text-[12px] text-ink-faint">
                  <span className="h-px flex-1 border-t border-dashed border-line-strong" />
                  sau cu parola
                  <span className="h-px flex-1 border-t border-dashed border-line-strong" />
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {!step2 ? (
                <>
                  <Field label="Utilizator">
                    <input className="field" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" value={username} onChange={(e) => setUsername(e.target.value)} required />
                  </Field>
                  <Field label="Parolă">
                    <input className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  </Field>
                </>
              ) : (
                <>
                  <p className="rounded-md bg-paper p-3 text-[13px]">
                    {recoveryMode ? (
                      <>
                        Pasul 2 pentru <strong>{username.trim()}</strong>: scrie unul dintre cele 10 coduri de recuperare. Fiecare
                        merge o singură dată; după ce intri, poți genera altele din Setări.
                      </>
                    ) : (
                      <>
                        Pasul 2 pentru <strong>{username.trim()}</strong>: deschide aplicația de autentificare și scrie codul de 6
                        cifre pentru Leuța.
                      </>
                    )}
                  </p>
                  <Field label={recoveryMode ? "Cod de recuperare" : "Cod de autentificare (2FA)"}>
                    <input
                      key={recoveryMode ? "rec" : "totp"}
                      className="field font-mono tracking-wider"
                      type="text"
                      inputMode={recoveryMode ? "text" : "numeric"}
                      autoComplete="one-time-code"
                      autoCapitalize="none"
                      placeholder={recoveryMode ? "xxxx-xxxx-xxxx" : "123 456"}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      required
                      autoFocus
                    />
                  </Field>
                </>
              )}
              <button type="submit" disabled={!!busy} className={`${supported && !step2 ? "btn-ghost border border-line" : "btn-primary"} w-full justify-center py-2.5 text-[14px] font-semibold`}>
                {busy === "form" ? "Se verifică…" : step2 ? "Intră" : "Intră cu parola"}
              </button>
              {step2 && (
                <div className="flex flex-col items-center gap-2 text-[12px]">
                  {step2.totp && (
                    <button type="button" className="text-ink-soft hover:text-ink hover:underline" onClick={() => { setUseRecovery(!useRecovery); setCode(""); setError(null); }}>
                      {useRecovery ? "Folosește codul din aplicația de autentificare" : "Ai pierdut telefonul? Intră cu un cod de recuperare"}
                    </button>
                  )}
                  <button type="button" className="text-ink-soft hover:underline" onClick={backToPassword}>← Alt utilizator</button>
                </div>
              )}
            </form>

            <label className="mt-4 flex cursor-pointer select-none items-center gap-2 text-[13px] text-ink-soft">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 rounded border-line accent-leu" />
              <span>Ține-mă minte pe acest dispozitiv</span>
            </label>
          </>
        ) : (
          <form onSubmit={openInvite} className="flex flex-col gap-4">
            <p className="text-[13px] text-ink-soft">
              Leuța e deocamdată doar pe bază de invitație. Lipește aici linkul sau codul primit și îți creezi contul în
              câțiva pași.
            </p>
            <Field label="Linkul sau codul de invitație">
              <input
                className="field font-mono text-[13px]"
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="https://app.leuta.ro/inregistrare?cod=…"
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <button type="submit" className="btn-primary w-full justify-center py-3 text-[15px] font-semibold">Creează contul</button>
            <p className="text-center text-[12.5px] text-ink-soft">
              Nu ai invitație?{" "}
              <a href={`${SITE.url}/#invitatie`} className="text-albastru hover:underline">Înscrie-te pe lista de așteptare</a>
            </p>
          </form>
        )}

        <div className="mt-6 border-t border-dashed border-line-strong pt-3 text-center text-[12px] text-ink-soft">
          Datele tale sunt stocate privat, într-o bază de date Supabase protejată.
        </div>
      </div>
    </div>
  );
}
