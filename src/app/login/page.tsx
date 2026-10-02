"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Field } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const res = await api<{ ok: boolean; error?: string }>("/api/auth/login", "POST", {
        username: username.trim(),
        password,
        rememberMe,
      });

      if (res.ok) {
        window.location.href = "/";
      } else {
        setError(res.error || "Utilizator sau parolă incorectă.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la autentificare.");
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
          <p className="mt-1 text-[13px] text-ink-soft">
            Autentificare securizată
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-rosu-tint p-3 text-[13px] text-rosu font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Utilizator">
            <input
              className="field"
              type="text"
              placeholder="Introdu numele de utilizator"
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
              placeholder="Introdu parola"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          <label className="flex items-center gap-2 cursor-pointer select-none text-[13px] text-ink-soft">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-line text-leu accent-leu"
            />
            <span>Ține-mă minte pe acest dispozitiv</span>
          </label>

          <button
            type="submit"
            disabled={busy}
            className="btn-primary mt-2 w-full justify-center py-2.5 text-[15px] font-semibold"
          >
            {busy ? "Se verifică…" : "Intră în aplicație"}
          </button>
        </form>

        <div className="mt-6 border-t border-line pt-3 text-center text-[12px] text-ink-soft">
          Datele tale sunt stocate privat, într-o bază de date Supabase protejată.
        </div>
      </div>
    </div>
  );
}

