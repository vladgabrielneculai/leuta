"use client";

import type { ReactNode } from "react";
import { Field } from "./ui";
import {
  EXPERIENCES, GOALS, HORIZONS, OCCUPATIONS, RISKS, ROMANIAN_COUNTIES, STABILITY, type GoalKey, type Profile,
} from "@/lib/profile";

export type ProfileDraft = Omit<Profile, "net_income" | "payday" | "onboarding_done_at"> & {
  net_income: string;
  payday: string;
};

export function toDraft(p: Profile): ProfileDraft {
  return { ...p, net_income: p.net_income ? String(p.net_income) : "", payday: p.payday ? String(p.payday) : "" };
}

export function fromDraft(d: ProfileDraft) {
  return { ...d, net_income: d.net_income ? Number(d.net_income) : null, payday: d.payday ? Number(d.payday) : null };
}

type Props = { d: ProfileDraft; set: (patch: Partial<ProfileDraft>) => void };

/** Carduri de tip „radio”: o singură alegere, ușor de atins pe telefon. */
export function ChoiceCards<T extends string>({
  value, options, onChange, columns = 2, label,
}: {
  value: T | "";
  options: { v: T; label: string; hint?: string }[];
  onChange: (v: T | "") => void;
  columns?: 1 | 2 | 3;
  label: string;
}) {
  const cols = { 1: "grid-cols-1 sm:grid-cols-2", 2: "grid-cols-2", 3: "grid-cols-1 sm:grid-cols-3" }[columns];
  return (
    <div role="radiogroup" aria-label={label} className={`grid gap-2 ${cols}`}>
      {options.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on ? "" : o.v)}
            className={`min-h-[44px] min-w-0 rounded-lg border px-2.5 py-2.5 text-left sm:px-3 transition-all duration-150 active:scale-[0.98] ${
              on ? "border-albastru bg-albastru-tint text-ink shadow-sm" : "border-line bg-field text-ink-soft hover:border-line-strong hover:text-ink"
            }`}
          >
            <span className="flex items-center gap-2 text-[14px] font-semibold">
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? "border-albastru" : "border-line-strong"}`}>
                {on && <span className="h-2 w-2 rounded-full bg-albastru" />}
              </span>
              {o.label}
            </span>
            {o.hint && <span className="mt-0.5 block pl-6 text-[12px] text-ink-faint">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div className="label">{title}</div>
      {hint && <p className="-mt-0.5 mb-2 text-[12px] text-ink-faint">{hint}</p>}
      {children}
    </div>
  );
}

export function PersonalFields({ d, set }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Prenume">
        <input className="field" autoComplete="given-name" value={d.first_name} onChange={(e) => set({ first_name: e.target.value })} maxLength={60} />
      </Field>
      <Field label="Nume">
        <input className="field" autoComplete="family-name" value={d.last_name} onChange={(e) => set({ last_name: e.target.value })} maxLength={60} />
      </Field>
      <Field label="Data nașterii" hint="Pentru recomandări potrivite vârstei (ex. pensie).">
        <input className="field" type="date" autoComplete="bday" value={d.birth_date ?? ""} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set({ birth_date: e.target.value || null })} />
      </Field>
      <Field label="Județ">
        <select className="field" value={d.county} onChange={(e) => set({ county: e.target.value })}>
          <option value="">Alege județul</option>
          {ROMANIAN_COUNTIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Oraș / localitate">
        <input className="field" autoComplete="address-level2" value={d.city} onChange={(e) => set({ city: e.target.value })} maxLength={80} />
      </Field>
      <Field label="Telefon (opțional)">
        <input className="field" type="tel" inputMode="tel" autoComplete="tel" value={d.phone} onChange={(e) => set({ phone: e.target.value })} maxLength={30} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Email (opțional)" hint="Pentru contact; rezumatele pe email se setează separat, în Setări → Notificări.">
          <input className="field" type="email" inputMode="email" autoComplete="email" value={d.email} onChange={(e) => set({ email: e.target.value })} maxLength={120} />
        </Field>
      </div>
    </div>
  );
}

export function WorkFields({ d, set }: Props) {
  return (
    <div className="flex flex-col gap-5">
      <Group title="Care e sursa ta principală de venit?">
        <ChoiceCards label="Ocupație" value={d.occupation} options={OCCUPATIONS} onChange={(v) => set({ occupation: v })} />
      </Group>
      <Field label="Meserie / domeniu (opțional)">
        <input className="field" value={d.job_title} onChange={(e) => set({ job_title: e.target.value })} placeholder="ex. inginer software, asistentă medicală" maxLength={80} />
      </Field>
      <Group title="Cum e venitul tău?" hint="Un venit variabil cere un fond de urgență mai mare.">
        <ChoiceCards label="Stabilitatea venitului" value={d.income_stability} options={STABILITY} onChange={(v) => set({ income_stability: v })} columns={1} />
      </Group>
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_120px]">
        <Field label="Venit net lunar estimat" hint="Cât intră în cont, în medie.">
          <input className="field num" type="number" inputMode="decimal" min={0} step="0.01" value={d.net_income} onChange={(e) => set({ net_income: e.target.value })} placeholder="ex. 6500" />
        </Field>
        <Field label="Ziua salariului" hint="Ziua din lună în care primești banii.">
          <input className="field num" type="number" inputMode="numeric" min={1} max={31} value={d.payday} onChange={(e) => set({ payday: e.target.value })} placeholder="ex. 10" />
        </Field>
        <Field label="Moneda">
          <select className="field" value={d.currency} onChange={(e) => set({ currency: e.target.value as "RON" | "EUR" })}>
            <option value="RON">RON</option>
            <option value="EUR">EUR</option>
          </select>
        </Field>
      </div>
    </div>
  );
}

export function GoalsRiskFields({ d, set }: Props) {
  const toggle = (g: GoalKey) => set({ goals: d.goals.includes(g) ? d.goals.filter((x) => x !== g) : [...d.goals, g] });
  return (
    <div className="flex flex-col gap-5">
      <Group title="Ce obiective ai?" hint="Alege oricâte.">
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => {
            const on = d.goals.includes(g.v);
            return (
              <button
                key={g.v}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(g.v)}
                className={`min-h-[40px] rounded-full border px-3.5 py-1.5 text-[14px] font-medium transition-all active:scale-[0.97] ${
                  on ? "border-leu bg-leu-tint text-leu" : "border-line bg-field text-ink-soft hover:border-line-strong hover:text-ink"
                }`}
              >
                <span className="mr-1.5" aria-hidden>{g.icon}</span>
                {g.label}
              </button>
            );
          })}
        </div>
      </Group>
      <Group title="Cum reacționezi la risc?">
        <ChoiceCards label="Toleranța la risc" value={d.risk_tolerance} options={RISKS} onChange={(v) => set({ risk_tolerance: v })} columns={3} />
      </Group>
      <Group title="Pe ce orizont de timp economisești?">
        <ChoiceCards label="Orizont de timp" value={d.horizon} options={HORIZONS} onChange={(v) => set({ horizon: v })} columns={3} />
      </Group>
      <Field label="Experiență cu investițiile">
        <select className="field" value={d.investing_experience} onChange={(e) => set({ investing_experience: e.target.value as ProfileDraft["investing_experience"] })}>
          <option value="">Alege</option>
          {EXPERIENCES.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
        </select>
      </Field>
    </div>
  );
}
