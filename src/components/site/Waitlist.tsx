"use client";

import Link from "next/link";
import { useState } from "react";
import { SITE } from "@/lib/site/config";
import Barcode from "./Barcode";

type State = { kind: "idle" } | { kind: "busy" } | { kind: "ok"; already: boolean } | { kind: "error"; message: string };

/** Formularul listei de așteptare, ca un bon de completat. Trimite la /api/waitlist (ruta acestui site). */
export default function Waitlist() {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!consent) {
      setState({ kind: "error", message: "Bifează acordul ca să te putem înscrie." });
      return;
    }
    setState({ kind: "busy" });
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent, website: form.get("website") ?? "" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; already?: boolean };
      if (!res.ok) throw new Error(data.error || "Nu am putut trimite. Încearcă din nou în câteva minute.");
      setState({ kind: "ok", already: !!data.already });
    } catch (err) {
      setState({ kind: "error", message: (err as Error).message });
    }
  };

  return (
    <section id="invitatie" className="relative px-4 py-20 sm:px-6 md:py-28">
      <div className="mx-auto max-w-lg">
        <div className="text-center">
          <p className="kicker">Lista de așteptare</p>
          <h2 className="mt-4 text-[32px] font-bold leading-[1.08] sm:text-[48px]">Cere o invitație.</h2>
          <p className="mx-auto mt-4 max-w-md text-[15.5px] text-ink-soft">
            Leuța primește utilizatori noi treptat. Lasă-ți emailul și îți trimitem linkul de creare a contului când îți vine rândul.
          </p>
        </div>

        <div className="panel mt-10 px-6 pb-7 pt-7 sm:px-9">
          {state.kind === "ok" ? (
            <div className="py-4 text-center" role="status">
              <span className="stamp text-[14px]">Înscris pe listă</span>
              <p className="mt-6 text-[17px] font-semibold">{state.already ? "Erai deja pe listă." : "Mulțumim!"}</p>
              <p className="mt-2 text-[14px] text-ink-soft">
                Îți scriem la <b className="text-ink">{email}</b> când contul tău e gata. Poți cere oricând să te scoatem de pe listă.
              </p>
              <div className="rule-dashed my-6" />
              <p className="text-[11.5px] uppercase tracking-[0.2em] text-ink-faint">*** Vă mulțumim! ***</p>
              <Barcode value={email} className="mx-auto mt-3 h-9 w-48 text-ink" />
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <p className="receipt-title">Bon de înscriere</p>
              <div className="rule-dashed my-4" />
              <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-ink-soft">
                Adresa de email
              </label>
              <input
                id="email"
                type="email"
                className="field"
                placeholder="nume@exemplu.ro"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (state.kind === "error") setState({ kind: "idle" });
                }}
              />
              {/* Câmp-capcană pentru roboți: ascuns oamenilor și cititoarelor de ecran. */}
              <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
                <label>
                  Site web
                  <input name="website" tabIndex={-1} autoComplete="off" />
                </label>
              </div>
              <label className="mt-5 flex cursor-pointer items-start gap-3 text-[13.5px] leading-snug text-ink-soft">
                <input type="checkbox" className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[rgb(var(--ink))]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>
                  Am cel puțin {SITE.minAge} ani și sunt de acord să fiu contactat pe email în legătură cu invitația, conform{" "}
                  <Link href="/confidentialitate" className="text-albastru underline underline-offset-2">
                    Politicii de confidențialitate
                  </Link>
                  .
                </span>
              </label>
              {state.kind === "error" && (
                <p className="mt-4 text-[13.5px] text-rosu" role="alert">
                  {state.message}
                </p>
              )}
              <div className="rule-double my-5" />
              <button type="submit" className="btn-primary w-full !py-3 !text-[16px]" disabled={state.kind === "busy" || !email}>
                {state.kind === "busy" ? "Se trimite…" : "Cere invitație"}
              </button>
              <p className="mt-3 text-center text-[12px] text-ink-faint">Fără spam. Un singur email, când e gata contul.</p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
