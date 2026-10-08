"use client";

import { useEffect, useState } from "react";
import RecoveryCodesModal from "./RecoveryCodesModal";
import { api, Modal, useConfirm } from "./ui";

const SNOOZE_KEY = "leuta-verificare-coduri-amanata";
const SNOOZE_DAYS = 3;

/**
 * Verificarea periodică a codurilor de recuperare (la 3 luni, cerută de /api/auth/status). Utilizatorul scrie un
 * cod, care NU se consumă; dacă nu mai are lista, generează una nouă pe loc. Poate amâna câteva zile.
 */
export default function RecoveryCheck({ due }: { due: boolean }) {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  useEffect(() => {
    if (!due) return;
    let snoozed = false;
    try {
      snoozed = Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now();
    } catch {}
    setOpen(!snoozed);
  }, [due]);

  const later = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000));
    } catch {}
    setOpen(false);
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/recovery-codes/check", "POST", { code });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Codul nu a putut fi verificat.");
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    const ok = await confirm({
      title: "Coduri de recuperare noi",
      message: "Lista veche nu va mai funcționa, nici codurile nefolosite din ea. Generez 10 coduri noi?",
      confirmText: "Generează",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ codes: string[] }>("/api/auth/recovery-codes", "POST");
      setOpen(false);
      setNewCodes(r.codes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Codurile nu au putut fi generate.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal open={open} onClose={later} title="Verificare de rutină">
        {done ? (
          <>
            <p className="text-[13.5px]">✓ Totul e în regulă: lista de coduri de recuperare e la tine. Codul folosit acum rămâne valabil.</p>
            <p className="mt-2 text-[12.5px] text-ink-soft">Următoarea verificare: peste 3 luni.</p>
            <div className="mt-4 flex justify-end">
              <button className="btn-primary" onClick={() => setOpen(false)}>Gata</button>
            </div>
          </>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-3">
            <p className="text-[13.5px] text-ink-soft">
              O dată la 3 luni verificăm că ai încă la tine <strong>codurile de recuperare</strong>, singura cale de a intra dacă
              pierzi telefonul. Scrie oricare dintre codurile nefolosite. Doar îl verificăm: rămâne valabil.
            </p>
            <label className="block">
              <span className="label">Un cod de recuperare</span>
              <input
                className="field font-mono tracking-wider"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="xxxx-xxxx-xxxx"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoFocus
              />
            </label>
            {error && <p className="text-[13px] text-rosu">{error}</p>}
            <button type="submit" className="btn-primary w-full justify-center py-2.5" disabled={busy || !code.trim()}>
              {busy ? "Se verifică…" : "Verifică"}
            </button>
            <div className="flex flex-wrap justify-between gap-2 text-[12.5px]">
              <button type="button" className="text-albastru hover:underline" onClick={regenerate} disabled={busy}>
                Nu mai am lista → generează una nouă
              </button>
              <button type="button" className="text-ink-soft hover:underline" onClick={later}>Amână {SNOOZE_DAYS} zile</button>
            </div>
          </form>
        )}
      </Modal>
      <RecoveryCodesModal codes={newCodes} onClose={() => setNewCodes(null)} />
    </>
  );
}
