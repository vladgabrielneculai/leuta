"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GoalsRiskFields, PersonalFields, WorkFields, fromDraft, toDraft, type ProfileDraft } from "@/components/ProfileFields";
import { api, PageHeader, Panel, Skeleton, Toast, useApi, useApp } from "@/components/ui";
import { daysUntilPayday, displayName, OCCUPATIONS, type Profile } from "@/lib/profile";

type ProfileResponse = { profile: Profile; age: number | null; emergency: { months: number; reasons: string[] } };

export default function ProfilePage() {
  const { bump } = useApp();
  const { data, setData } = useApi<ProfileResponse>("/api/profile");
  const { data: me } = useApi<{ user: { username: string } | null }>("/api/auth/status");
  const { data: settings } = useApi<Record<string, string>>("/api/settings");
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (data && !draft) {
      const d = toDraft(data.profile);
      setDraft(d);
      setSaved(JSON.stringify(d));
    }
  }, [data, draft]);

  if (!data || !draft) return <Skeleton />;

  const dirty = JSON.stringify(draft) !== saved;
  const set = (patch: Partial<ProfileDraft>) => setDraft({ ...draft, ...patch });

  const save = async () => {
    setBusy(true);
    try {
      const r = await api<ProfileResponse>("/api/profile", "PUT", fromDraft(draft));
      setData(r);
      const d = toDraft(r.profile);
      setDraft(d);
      setSaved(JSON.stringify(d));
      bump(); // recomandările (fond de urgență, buget) se recalculează
      setToast("Profilul a fost salvat");
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    try {
      await api("/api/auth/logout", "POST");
    } finally {
      window.location.href = "/login";
    }
  };

  const p = data.profile;
  const username = me?.user?.username ?? "";
  const autoFund = settings?.emergency_auto !== "0";
  const occupation = OCCUPATIONS.find((o) => o.v === p.occupation)?.label;

  return (
    <>
      <PageHeader
        title="Profilul meu"
        intro="Cu cât știm mai multe despre situația ta, cu atât recomandările (fondul de urgență, bugetul, sfaturile lunii) sunt mai potrivite. Profilul e vizibil doar ție."
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <form
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Panel title="Date personale">
            <PersonalFields d={draft} set={set} />
          </Panel>
          <Panel title="Ocupație și venit">
            <WorkFields d={draft} set={set} />
          </Panel>
          <Panel title="Obiective și profil de risc">
            <GoalsRiskFields d={draft} set={set} />
          </Panel>
          <div className="hidden justify-end sm:flex">
            <button className="btn-primary" type="submit" disabled={!dirty || busy}>{busy ? "Se salvează…" : "Salvează profilul"}</button>
          </div>
        </form>

        <aside className="flex flex-col gap-5 xl:sticky xl:top-8 xl:self-start">
          <Panel>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-leu/15 font-display text-[18px] font-semibold uppercase text-leu">
                {(p.first_name || username).slice(0, 2)}
              </span>
              <div className="min-w-0">
                <div className="truncate font-display text-[18px] font-semibold">{displayName(p, username)}</div>
                <div className="truncate text-[13px] text-ink-soft">
                  @{username}
                  {data.age !== null && ` · ${data.age} ani`}
                  {occupation && ` · ${occupation}`}
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Ce înseamnă profilul tău">
            <div className="flex flex-col gap-3 text-[14px]">
              <div>
                <div className="text-[13px] text-ink-soft">Fond de urgență recomandat</div>
                <div className="font-display text-[22px] font-semibold text-galben">{data.emergency.months} luni</div>
                <p className="text-[12.5px] text-ink-soft">
                  de cheltuieli esențiale, pentru că {data.emergency.reasons.join(", ")}.{" "}
                  {autoFund ? "Ținta din Economii se calculează automat așa." : "Ai setat manual numărul de luni în Setări."}
                </p>
              </div>
              {p.payday && (
                <div className="border-t border-line pt-3">
                  <div className="text-[13px] text-ink-soft">Următorul salariu</div>
                  <div className="font-medium">
                    {daysUntilPayday(p.payday) === 0 ? "azi" : `peste ${daysUntilPayday(p.payday)} zile`} (pe {p.payday} ale lunii)
                  </div>
                  <p className="text-[12.5px] text-ink-soft">Panoul îți arată cât poți cheltui pe zi până atunci.</p>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Cont">
            <div className="flex flex-col gap-2">
              <Link href="/setari" className="btn-ghost justify-start border border-line">🔐 Parolă, passkey și dispozitive</Link>
              <button className="btn-danger justify-start border border-rosu/30" onClick={logout}>Ieșire din cont</button>
            </div>
          </Panel>
        </aside>
      </div>

      {/* Telefon: butonul de salvare apare deasupra barei de jos doar când ai modificări. */}
      {dirty && (
        <div className="sheet-up fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex items-center justify-between gap-3 rounded-md border border-line bg-sheet p-2 pl-4 shadow-xl sm:hidden">
          <span className="text-[13px] text-ink-soft">Modificări nesalvate</span>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy ? "Se salvează…" : "Salvează"}</button>
        </div>
      )}

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
