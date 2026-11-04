"use client";

import Link from "next/link";
import { useState } from "react";
import { SITE } from "@/lib/site/config";
import Reveal from "./Reveal";

type State = { kind: "idle" } | { kind: "busy" } | { kind: "ok"; already: boolean } | { kind: "error"; message: string };

/** Formularul listei de așteptare. Trimite la /api/waitlist (ruta acestui site). */
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
    <section id="invitatie" className="border-t border-line">
      <div className="mx-auto grid max-w-6xl items-start gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:gap-12 md:py-24">
        <Reveal>
          <p className="kicker">Lista de așteptare</p>
          <h2 className="mt-3 text-[32px] font-semibold leading-[1.04] sm:text-[48px]">Cere o invitație.</h2>
          <p className="mt-4 max-w-md text-ink-soft">
            Leuța primește utilizatori noi treptat. Lasă-ți emailul și îți trimitem linkul de creare a contului când îți vine rândul.
          </p>
        </Reveal>

        <Reveal delay={80} className="panel px-6 pb-7 pt-7 sm:px-8">
          {state.kind === "ok" ? (
            <div className="py-4 text-center" role="status">
              <span className="stamp">Înscris pe listă</span>
              <p className="mt-5 text-[19px] font-semibold tracking-[-0.02em]">{state.already ? "Erai deja pe listă." : "Mulțumim!"}</p>
              <p className="mt-2 text-[14px] text-ink-soft">
                Îți scriem la <b className="text-ink">{email}</b> când contul tău e gata. Poți cere oricând să te scoatem de pe listă.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
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
              <div aria-hidden className="absolute left-[-9999px] h-px w-px overflow-hidden">
                <label>
                  Site web
                  <input name="website" tabIndex={-1} autoComplete="off" />
                </label>
              </div>
              <label className="mt-5 flex cursor-pointer items-start gap-3 text-[13.5px] leading-snug text-ink-soft">
                <input type="checkbox" className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[rgb(var(--leu))]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>
                  Am cel puțin {SITE.minAge} ani și sunt de acord să fiu contactat pe email în legătură cu invitația, conform{" "}
                  <Link href="/confidentialitate" className="text-leu underline underline-offset-2">
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
              <button type="submit" className="btn-primary mt-6 w-full text-[16px]!" disabled={state.kind === "busy" || !email}>
                {state.kind === "busy" ? "Se trimite…" : "Cere invitație"}
              </button>
              <p className="mt-3 text-center text-[12px] text-ink-faint">Fără spam. Un singur email, când e gata contul.</p>
            </form>
          )}
        </Reveal>
      </div>
    </section>
  );
}
