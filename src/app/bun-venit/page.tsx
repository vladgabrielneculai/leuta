"use client";

import { useEffect, useState } from "react";
import LoanForm from "@/components/LoanForm";
import Logo from "@/components/Logo";
import { GoalsRiskFields, PersonalFields, WorkFields, fromDraft, toDraft, type ProfileDraft } from "@/components/ProfileFields";
import { ThemeToggle } from "@/components/ThemeToggle";
import { api, Field, Modal, Skeleton, useApi } from "@/components/ui";
import type { Loan } from "@/lib/loan";
import type { Profile } from "@/lib/profile";
import { currentMonth, lei } from "@/lib/util";

type ProfileResponse = { profile: Profile; age: number | null; emergency: { months: number; reasons: string[] } };
type Category = { id: number; name: string; kind: string };
type Goal = { id: number; type: string; name: string; initial: number };

const STEPS = [
  { key: "about", title: "Despre tine", intro: "Câteva date de bază, ca aplicația să ți se adreseze pe nume și să-ți dea recomandări potrivite vârstei." },
  { key: "work", title: "Ocupație și venit", intro: "Tipul venitului decide cât de mare ar trebui să fie fondul tău de urgență." },
  { key: "loans", title: "Credite", intro: "Ratele se adaugă automat în bugetul fiecărei luni. Poți sări pasul dacă nu ai credite." },
  { key: "goals", title: "Obiective și risc", intro: "Ce vrei să construiești și cât de confortabil ești cu riscul." },
  { key: "done", title: "Gata!", intro: "" },
] as const;

/** Ghidul de început pentru un cont nou: 4 pași scurți + rezumat, fiecare poate fi amânat. */
export default function OnboardingPage() {
  const { data, setData } = useApi<ProfileResponse>("/api/profile");
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pasul „venit”: adaugă salariul ca venit lunar recurent în luna curentă.
  const [addSalary, setAddSalary] = useState(true);
  const [salaryAdded, setSalaryAdded] = useState(false);
  // Pasul „credite”
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loanOpen, setLoanOpen] = useState(false);
  // Pasul „obiective”
  const [fundSaved, setFundSaved] = useState("");
  const [trackInvestments, setTrackInvestments] = useState(false);

  useEffect(() => {
    if (data && !draft) setDraft(toDraft(data.profile));
  }, [data, draft]);

  useEffect(() => {
    api<Loan[]>("/api/crud/loans").then(setLoans).catch(() => undefined);
  }, []);

  if (!data || !draft) {
    return <div className="mx-auto max-w-2xl p-4"><Skeleton /></div>;
  }

  const set = (patch: Partial<ProfileDraft>) => setDraft({ ...draft, ...patch });
  const current = STEPS[step];

  const saveProfile = async (extra: Record<string, unknown> = {}) => {
    const r = await api<ProfileResponse>("/api/profile", "PUT", { ...fromDraft(draft), fromOnboarding: true, ...extra });
    setData(r);
    return r;
  };

  /** Salvările „laterale” ale fiecărui pas (salariul, fondul de urgență, modulul de investiții). */
  const sideEffects = async () => {
    if (current.key === "work" && addSalary && !salaryAdded && Number(draft.net_income) > 0) {
      const [cats, entries] = await Promise.all([
        api<Category[]>("/api/crud/categories"),
        api<{ category_id: number | null; kind: string }[]>(`/api/crud/entries?month=${currentMonth()}`),
      ]);
      const salary = cats.find((c) => c.kind === "income" && c.name.toLowerCase().startsWith("salariu"));
      const exists = entries.some((e) => e.kind === "income" && e.category_id === salary?.id);
      if (salary && !exists) {
        await api("/api/crud/entries", "POST", {
          month: currentMonth(),
          kind: "income",
          category_id: salary.id,
          goal_id: null,
          investment_id: null,
          description: "Salariu net lunar",
          amount: Number(draft.net_income),
          currency: draft.currency,
          recurring: 1,
        });
      }
      setSalaryAdded(true);
    }
    if (current.key === "goals") {
      if (Number(fundSaved) > 0) {
        const goals = await api<Goal[]>("/api/crud/goals");
        const fund = goals.find((g) => g.type === "emergency");
        if (fund) await api("/api/crud/goals", "PUT", { ...fund, initial: Number(fundSaved) });
        else {
          await api("/api/crud/goals", "POST", {
            name: "Fond de urgență", type: "emergency", target: 0, initial: Number(fundSaved), deadline: null, color: "#C99A1E",
          });
        }
      }
      if (trackInvestments) await api("/api/settings", "PUT", { enable_investments: "1" });
    }
  };

  const next = async () => {
    setError(null);
    setBusy(true);
    try {
      await sideEffects();
      const finishing = step === STEPS.length - 2;
      await saveProfile(finishing ? { onboardingDone: true } : {});
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const later = async () => {
    setBusy(true);
    try {
      await saveProfile({ onboardingDone: true });
    } catch {
      // Chiar dacă salvarea pică, nu ținem utilizatorul blocat în ghid.
    }
    window.location.href = "/";
  };

  const progress = Math.round((step / (STEPS.length - 1)) * 100);

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Logo className="h-8 w-8" />
            <span className="font-display text-[18px] font-bold">Leuța</span>
          </div>
          <div className="flex items-center gap-1.5">
            {current.key !== "done" && (
              <button className="btn-ghost text-[13px]" onClick={later} disabled={busy}>Completez mai târziu</button>
            )}
            <ThemeToggle className="h-9 w-9" />
          </div>
        </div>
        <div className="mx-auto mt-3 max-w-2xl">
          <div className="flex items-center justify-between text-[12px] text-ink-soft">
            <span>{current.key === "done" ? "Profil completat" : `Pasul ${step + 1} din ${STEPS.length - 1}`}</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-leu transition-[width] duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </header>

      <main key={step} className="page-enter mx-auto max-w-2xl px-4 pb-32 pt-6 sm:pt-8">
        {step === 0 && (
          <p className="mb-1 text-[14px] font-medium text-leu">Bun venit! Hai să-ți configurăm contul în 2 minute.</p>
        )}
        <h1 className="text-[27px] font-semibold leading-tight tracking-tight sm:text-[32px]">{current.title}</h1>
        {current.intro && <p className="mt-1.5 text-[14px] text-ink-soft sm:text-[15px]">{current.intro}</p>}

        <div className="mt-6">
          {current.key === "about" && <PersonalFields d={draft} set={set} />}

          {current.key === "work" && (
            <div className="flex flex-col gap-5">
              <WorkFields d={draft} set={set} />
              {Number(draft.net_income) > 0 && !salaryAdded && (
                <label className="flex items-start gap-3 rounded-lg border border-line bg-sheet p-3.5">
                  <input type="checkbox" className="mt-0.5 h-[18px] w-[18px] shrink-0" checked={addSalary} onChange={(e) => setAddSalary(e.target.checked)} />
                  <span className="text-[14px]">
                    Adaugă <strong>{lei(Number(draft.net_income))}</strong> ca salariu lunar în bugetul lunii curente
                    <span className="block text-[12.5px] text-ink-soft">Marcat „lunar”, se copiază ușor în lunile următoare. Îl poți modifica oricând.</span>
                  </span>
                </label>
              )}
            </div>
          )}

          {current.key === "loans" && (
            <div className="flex flex-col gap-4">
              {loans.length > 0 && (
                <ul className="divide-y divide-line rounded-lg border border-line bg-sheet">
                  {loans.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{l.name}</div>
                        <div className="truncate text-[12.5px] text-ink-soft">{[l.bank, lei(l.principal)].filter(Boolean).join(" · ")}</div>
                      </div>
                      <span className="shrink-0 text-[12px] font-semibold text-leu">✓ adăugat</span>
                    </li>
                  ))}
                </ul>
              )}
              <button className="btn-ghost min-h-[52px] w-full border border-dashed border-line-strong text-[15px]" onClick={() => setLoanOpen(true)}>
                + {loans.length ? "Adaugă încă un credit" : "Adaugă un credit"}
              </button>
              <p className="text-[13px] text-ink-soft">
                Ai graficul de rambursare în PDF? Îl poți încărca mai târziu din pagina Credite, pentru cifre exacte.
              </p>
            </div>
          )}

          {current.key === "goals" && (
            <div className="flex flex-col gap-5">
              <GoalsRiskFields d={draft} set={set} />
              <Field label="Ai deja bani puși deoparte pentru urgențe? (opțional)" hint="Devin punctul de plecare al fondului tău de urgență.">
                <input className="field num" type="number" inputMode="decimal" min={0} step={100} value={fundSaved} onChange={(e) => setFundSaved(e.target.value)} placeholder="ex. 5000" />
              </Field>
              <label className="flex items-start gap-3 rounded-lg border border-line bg-sheet p-3.5">
                <input type="checkbox" className="mt-0.5 h-[18px] w-[18px] shrink-0" checked={trackInvestments} onChange={(e) => setTrackInvestments(e.target.checked)} />
                <span className="text-[14px]">
                  Am investiții sau vreau să le urmăresc
                  <span className="block text-[12.5px] text-ink-soft">Activează secțiunea de investiții (ETF-uri, fonduri, titluri de stat).</span>
                </span>
              </label>
            </div>
          )}

          {current.key === "done" && (
            <div className="flex flex-col gap-4">
              <div className="rounded-md border border-leu/40 bg-leu-tint/40 p-4 sm:p-5">
                <p className="font-display text-[20px] font-semibold">
                  {draft.first_name ? `Mulțumim, ${draft.first_name}!` : "Mulțumim!"} Contul tău e pregătit.
                </p>
                <ul className="mt-3 flex flex-col gap-2 text-[14px] text-ink-soft">
                  <li>
                    🛟 Fondul tău de urgență recomandat: <strong className="text-ink">{data.emergency.months} luni</strong> de cheltuieli
                    esențiale ({data.emergency.reasons.join(", ")}).
                  </li>
                  {loans.length > 0 && <li>🏦 {loans.length === 1 ? "Creditul tău e" : `Cele ${loans.length} credite sunt`} incluse automat în bugetul lunar.</li>}
                  {salaryAdded && <li>💼 Salariul e trecut în luna curentă.</li>}
                  <li>📊 Bugetul „Recomandat pentru tine” ține cont de obiectivele tale.</li>
                </ul>
              </div>
              <p className="text-[14px] text-ink-soft">
                Pasul următor: trece cheltuielile lunii în <strong className="text-ink">Luna curentă</strong>. Profilul îl poți modifica oricând din
                <strong className="text-ink"> Profilul meu</strong>.
              </p>
            </div>
          )}

          {error && <p className="mt-4 rounded-md bg-rosu-tint p-3 text-[13px] font-medium text-rosu">{error}</p>}
        </div>
      </main>

      {/* Navigarea între pași: mereu la îndemână, jos. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-2">
          {current.key === "done" ? (
            <a href="/" className="btn-primary min-h-[48px] flex-1 text-[15px] font-semibold">Mergi la panou →</a>
          ) : (
            <>
              {step > 0 && (
                <button className="btn-ghost min-h-[48px] border border-line px-5" onClick={() => setStep(step - 1)} disabled={busy}>
                  Înapoi
                </button>
              )}
              <button className="btn-primary min-h-[48px] flex-1 text-[15px] font-semibold" onClick={next} disabled={busy}>
                {busy ? "Se salvează…" : step === STEPS.length - 2 ? "Finalizează" : current.key === "loans" && loans.length === 0 ? "Nu am credite — continuă" : "Continuă"}
              </button>
            </>
          )}
        </div>
      </div>

      <Modal open={loanOpen} onClose={() => setLoanOpen(false)} title="Credit nou">
        <LoanForm
          onCancel={() => setLoanOpen(false)}
          onSaved={(l) => {
            setLoanOpen(false);
            setLoans([...loans, l]);
          }}
        />
      </Modal>
    </div>
  );
}
