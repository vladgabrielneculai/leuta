"use client";

import { useEffect, useState } from "react";
import Logo from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useRouter } from "next/navigation";
import { api, Field } from "@/components/ui";

export default function SetupPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [seedDemo, setSeedDemo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verifică dacă setup-ul a fost deja realizat
    api<{ setupNeeded: boolean; authenticated: boolean }>("/api/auth/status")
      .then((res) => {
        if (!res.setupNeeded) {
          window.location.replace(res.authenticated ? "/" : "/login");
        } else {
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (username.trim().length < 3) {
      setError("Numele de utilizator trebuie să aibă cel puțin 3 caractere.");
      return;
    }
    if (password.length < 12) {
      setError("Parola trebuie să aibă cel puțin 12 caractere.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Parolele introduse nu coincid.");
      return;
    }

    setBusy(true);
    try {
      const res = await api<{ ok: boolean; error?: string }>("/api/auth/setup", "POST", {
        username: username.trim(),
        password,
        seedDemo,
      });

      if (res.ok) {
        window.location.href = "/";
      } else {
        setError(res.error || "A apărut o eroare.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nu s-a putut salva configurarea.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
        <div className="flex flex-col items-center gap-3">
          <span className="live-dot" />
          <p className="text-ink-soft text-[14px]">Se verifică configurarea inițială…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="guilloche guilloche-full relative flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))]"><ThemeToggle /></div>
      <div className="animate-modal-pop w-full max-w-md rounded-xl border border-line bg-sheet p-6 shadow-sm sm:p-8">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <Logo className="h-12 w-12 drop-shadow-md" />
            <h1 className="font-display text-[26px] font-bold tracking-tight">Leuța</h1>
          </div>
          <p className="mt-2 text-[14px] text-ink-soft">
            Bun venit! Aceasta este prima deschidere a aplicației. Configurează-ți utilizatorul și parola — aplicația e online, deci alege o parolă puternică (minim 12 caractere).
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-rosu-tint p-3 text-[13px] text-rosu font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Nume utilizator">
            <input
              className="field"
              type="text"
              placeholder="ex. vlad"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </Field>

          <Field label="Parolă">
            <input
              className="field"
              type="password"
              placeholder="Alege o parolă"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          <Field label="Confirmă parola">
            <input
              className="field"
              type="password"
              placeholder="Reintrodu parola"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </Field>

          <label className="mt-2 flex items-start gap-3 rounded-lg border border-line bg-paper/60 p-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={seedDemo}
              onChange={(e) => setSeedDemo(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-line text-leu accent-leu"
            />
            <div className="text-[13px]">
              <span className="font-semibold text-ink">Încarcă date demonstrative (Recomandat)</span>
              <p className="text-ink-soft mt-0.5">
                Populează aplicația cu exemple complete (credit ipotecar cu scadențar și plăți anticipate, venituri, cheltuieli, investiții) pentru a o testa imediat înainte de a introduce datele tale.
              </p>
            </div>
          </label>

          <button
            type="submit"
            disabled={busy}
            className="btn-primary mt-2 w-full justify-center py-2.5 text-[15px] font-semibold"
          >
            {busy ? "Se configurează…" : "Creează contul și pornește aplicația"}
          </button>
        </form>

        <div className="mt-6 border-t border-line pt-4 text-center text-[12px] text-ink-soft">
          Datele sunt păstrate privat în baza de date Supabase a aplicației.
        </div>
      </div>
    </div>
  );
}

