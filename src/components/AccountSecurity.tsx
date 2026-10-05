"use client";

import { useState } from "react";
import { api, Field, Panel } from "./ui";

export default function AccountSecurity({ onToast }: { onToast: (msg: string) => void }) {
  const [newUsername, setNewUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError("Introdu parola curentă pentru a confirma modificările.");
      return;
    }

    if (newPassword && newPassword.length < 12) {
      setError("Noua parolă trebuie să aibă cel puțin 12 caractere.");
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      setError("Noua parolă și confirmarea nu coincid.");
      return;
    }

    if (!newUsername.trim() && !newPassword) {
      setError("Introdu un utilizator nou sau o parolă nouă.");
      return;
    }

    setBusy(true);
    try {
      await api("/api/auth/change-credentials", "POST", {
        newUsername: newUsername.trim() || undefined,
        currentPassword,
        newPassword: newPassword || undefined,
      });

      setNewUsername("");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onToast("Datele de autentificare au fost actualizate!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nu s-au putut actualiza datele.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Securitate & Cont">
      <p className="mb-4 text-[13px] text-ink-soft">
        Schimbă numele de utilizator sau parola contului tău.
      </p>

      {error && (
        <div className="mb-3 rounded bg-rosu-tint p-2.5 text-[13px] text-rosu font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="Utilizator nou (opțional)">
          <input
            className="field"
            type="text"
            placeholder="Lasă gol dacă nu vrei să-l schimbi"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
          />
        </Field>

        <Field label="Parolă curentă">
          <input
            className="field"
            type="password"
            placeholder="Confirmă cu parola actuală"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </Field>

        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Parolă nouă">
            <input
              className="field"
              type="password"
              placeholder="Parolă nouă"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirmă noua parolă">
            <input
              className="field"
              type="password"
              placeholder="Reintrodu parola nouă"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </Field>
        </div>

        <button type="submit" disabled={busy} className="btn-primary mt-1 self-start">
          {busy ? "Se actualizează…" : "Actualizează credențialele"}
        </button>
      </form>
    </Panel>
  );
}

