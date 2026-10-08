"use client";

import { useState } from "react";
import { api, Empty, PageHeader, Panel, Toast, TrashIcon, useApi, useApp } from "@/components/ui";

type Invitation = {
  id: number;
  note: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by_name: string | null;
  status: "active" | "used" | "expired" | "revoked";
};

type Account = {
  id: number;
  username: string;
  created_at: string;
  is_admin: boolean;
  disabled_at: string | null;
  last_active_at: string | null;
  passkeys: number;
  totp: boolean;
};

type WaitlistEntry = {
  id: number;
  email: string;
  created_at: string;
  invited_at: string | null;
  invitation_status: Invitation["status"] | null;
};

const STATUS: Record<Invitation["status"], { label: string; cls: string }> = {
  active: { label: "Activă", cls: "bg-leu-tint text-leu" },
  used: { label: "Folosită", cls: "bg-albastru-tint text-albastru" },
  expired: { label: "Expirată", cls: "bg-line/60 text-ink-soft" },
  revoked: { label: "Anulată", cls: "bg-rosu-tint text-rosu" },
};

function fmt(d: string | null) {
  if (!d) return "–";
  return new Date(d).toLocaleString("ro-RO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDay(d: string) {
  return new Date(d).toLocaleDateString("ro-RO", { day: "2-digit", month: "short", year: "numeric" });
}

/** Linkul de invitație abia creat: se vede o singură dată, cu buton de copiere și de partajare. */
function NewInviteLink({ link, onClose }: { link: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  return (
    <div className="rounded-lg border border-leu/40 bg-leu-tint/40 p-3.5 sm:p-4">
      <p className="text-[13px] font-semibold text-ink">Invitația a fost creată</p>
      <p className="mt-0.5 text-[12.5px] text-ink-soft">
        Trimite linkul persoanei (mesaj, email, WhatsApp). Îl vezi doar acum; merge o singură dată, timp de 7 zile.
      </p>
      <input readOnly value={link} onFocus={(e) => e.target.select()} className="field mt-2.5 font-mono text-[13px]" aria-label="Link de invitație" />
      <div className="mt-2.5 flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
        <button className="btn-primary" onClick={copy}>{copied ? "✓ Copiat" : "Copiază linkul"}</button>
        {canShare && (
          <button className="btn-ghost border border-line" onClick={() => navigator.share({ title: "Invitație Leuța", text: "Îți poți crea contul în Leuța aici:", url: link }).catch(() => undefined)}>
            Trimite…
          </button>
        )}
        <button className="btn-ghost" onClick={onClose}>Gata</button>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { confirm } = useApp();
  const [toast, setToast] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [newLink, setNewLink] = useState<string | null>(null);
  const invites = useApi<Invitation[]>("/api/admin/invitations");
  const accounts = useApi<{ me: number; users: Account[] }>("/api/admin/users");
  const waitlist = useApi<{ rows: WaitlistEntry[]; emailConfigured: boolean }>("/api/admin/waitlist");
  const [inviting, setInviting] = useState<number | null>(null);
  const [waitlistLink, setWaitlistLink] = useState<{ email: string; link: string } | null>(null);

  if (invites.error?.includes("administrator") || accounts.error?.includes("administrator")) {
    return (
      <>
        <PageHeader title="Administrare" />
        <Empty title="Doar administratorul are acces aici" />
      </>
    );
  }

  const createInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ link: string }>("/api/admin/invitations", "POST", { note });
      setNewLink(r.link);
      setNote("");
      invites.reload();
    } catch (err) {
      setToast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (i: Invitation) => {
    if (!(await confirm({ title: "Anulare invitație", message: `Anulezi invitația${i.note ? ` pentru „${i.note}”` : ""}? Linkul nu va mai funcționa.`, confirmText: "Anulează invitația", danger: true }))) return;
    try {
      await api(`/api/admin/invitations?id=${i.id}`, "DELETE");
      invites.reload();
      setToast("Invitația a fost anulată");
    } catch (err) {
      setToast((err as Error).message);
    }
  };

  const toggleDisabled = async (a: Account) => {
    const disabling = !a.disabled_at;
    if (
      disabling &&
      !(await confirm({
        title: "Dezactivare cont",
        message: `Contul „${a.username}” nu se va mai putea autentifica, iar sesiunile lui active se închid. Datele rămân și contul poate fi reactivat oricând.`,
        confirmText: "Dezactivează",
        danger: true,
      }))
    )
      return;
    try {
      await api("/api/admin/users", "PATCH", { id: a.id, disabled: disabling });
      accounts.reload();
      setToast(disabling ? "Contul a fost dezactivat" : "Contul a fost reactivat");
    } catch (err) {
      setToast((err as Error).message);
    }
  };

  const remove = async (a: Account) => {
    if (
      !(await confirm({
        title: "Ștergere definitivă",
        message: `Ștergi contul „${a.username}” și TOATE datele lui (venituri, cheltuieli, credite, obiective, profil)? Acțiunea nu poate fi anulată.`,
        confirmText: "Șterge contul",
        danger: true,
      }))
    )
      return;
    try {
      await api(`/api/admin/users?id=${a.id}`, "DELETE");
      accounts.reload();
      setToast("Contul a fost șters");
    } catch (err) {
      setToast((err as Error).message);
    }
  };

  const inviteFromWaitlist = async (w: WaitlistEntry) => {
    if (
      w.invited_at &&
      !(await confirm({
        title: "Retrimite invitația",
        message: `${w.email} a primit deja o invitație. Trimiți una nouă? Linkul vechi nu va mai funcționa.`,
        confirmText: "Trimite din nou",
      }))
    )
      return;
    setInviting(w.id);
    try {
      const r = await api<{ link: string; emailed: boolean; emailError: string | null }>("/api/admin/waitlist", "POST", { id: w.id });
      if (r.emailed) {
        setWaitlistLink(null);
        setToast(`Invitația a fost trimisă pe email la ${w.email}`);
      } else {
        setWaitlistLink({ email: w.email, link: r.link });
        if (r.emailError) setToast(`Emailul nu a plecat: ${r.emailError}`);
      }
      waitlist.reload();
      invites.reload();
    } catch (err) {
      setToast((err as Error).message);
    } finally {
      setInviting(null);
    }
  };

  const removeFromWaitlist = async (w: WaitlistEntry) => {
    if (!(await confirm({ title: "Scoate de pe listă", message: `Ștergi ${w.email} de pe lista de așteptare?`, confirmText: "Șterge", danger: true }))) return;
    try {
      await api(`/api/admin/waitlist?id=${w.id}`, "DELETE");
      waitlist.reload();
      setToast("Adresa a fost scoasă de pe listă");
    } catch (err) {
      setToast((err as Error).message);
    }
  };

  const activeInvites = invites.data?.filter((i) => i.status === "active").length ?? 0;

  return (
    <>
      <PageHeader
        title="Administrare"
        intro="Invită persoane noi și gestionează conturile. Datele financiare și profilul fiecărui utilizator rămân private — nici administratorul nu le vede."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Invitații" aside={<span className="text-[13px] text-ink-soft">{activeInvites} active</span>}>
          <form onSubmit={createInvite} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="block flex-1">
              <span className="label">Pentru cine e invitația? (opțional)</span>
              <input className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} placeholder="ex. Maria" />
            </label>
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Se creează…" : "+ Invitație nouă"}</button>
          </form>

          {newLink && <div className="mt-4"><NewInviteLink link={newLink} onClose={() => setNewLink(null)} /></div>}

          {invites.data && invites.data.length > 0 ? (
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {invites.data.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate font-medium">{i.note || "Fără notă"}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[i.status].cls}`}>{STATUS[i.status].label}</span>
                    </div>
                    <div className="text-[12px] text-ink-soft">
                      {i.status === "used"
                        ? `Cont creat: ${i.used_by_name ?? "șters"} · ${fmt(i.used_at)}`
                        : i.status === "active"
                          ? `Creată ${fmtDay(i.created_at)} · expiră ${fmt(i.expires_at)}`
                          : `Creată ${fmtDay(i.created_at)}`}
                    </div>
                  </div>
                  {i.status === "active" && (
                    <button className="btn-danger shrink-0 text-[13px]" onClick={() => revoke(i)}>Anulează</button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            invites.data && <p className="mt-4 text-[13px] text-ink-soft">Nicio invitație încă. Creează una și trimite linkul persoanei pe care vrei s-o inviți.</p>
          )}
        </Panel>

        <Panel title="Conturi" aside={<span className="text-[13px] text-ink-soft">{accounts.data?.users.length ?? 0} în total</span>}>
          {!accounts.data ? (
            <p className="text-ink-soft">Se încarcă…</p>
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {accounts.data.users.map((a) => {
                const me = a.id === accounts.data!.me;
                return (
                  // Telefon: datele contului pe un rând, butoanele dedesubt; ecran mare: totul pe un rând.
                  <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 sm:flex-nowrap">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-leu/15 text-[12px] font-semibold uppercase text-leu">
                      {a.username.slice(0, 2)}
                    </span>
                    <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-auto">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate font-medium">{a.username}</span>
                        {me && <span className="rounded-full bg-albastru-tint px-2 py-0.5 text-[11px] font-semibold text-albastru">tu</span>}
                        {a.is_admin && <span className="rounded-full bg-mov-tint px-2 py-0.5 text-[11px] font-semibold text-mov">admin</span>}
                        {a.disabled_at && <span className="rounded-full bg-rosu-tint px-2 py-0.5 text-[11px] font-semibold text-rosu">dezactivat</span>}
                      </div>
                      <div className="text-[12px] text-ink-soft">
                        Creat {fmtDay(a.created_at)} · activ {fmt(a.last_active_at)} · {[a.passkeys > 0 && `Face ID / amprentă ×${a.passkeys}`, a.totp && "2FA"].filter(Boolean).join(" + ") || "doar parolă"}
                      </div>
                    </div>
                    {!a.is_admin && (
                      <div className="ml-12 flex shrink-0 items-center gap-1 sm:ml-0">
                        <button className="btn-ghost border border-line text-[13px] sm:border-0" onClick={() => toggleDisabled(a)}>
                          {a.disabled_at ? "Reactivează" : "Dezactivează"}
                        </button>
                        <button className="btn-danger h-10 w-10 px-0" onClick={() => remove(a)} aria-label={`Șterge contul ${a.username}`} title="Șterge contul">
                          <TrashIcon className="h-[18px] w-[18px]" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-6">
        <Panel
          title="Lista de așteptare"
          aside={<span className="text-[13px] text-ink-soft">{waitlist.data?.rows.filter((w) => !w.invited_at).length ?? 0} în așteptare</span>}
        >
          <p className="text-[13px] text-ink-soft">
            Adresele lăsate pe site-ul de prezentare. „Trimite invitație” creează un link de cont nou
            {waitlist.data?.emailConfigured ? " și îl trimite pe email." : "; emailul nu e configurat (RESEND_API_KEY), deci copiezi linkul și îl trimiți tu."}{" "}
            Adresa dispare de pe listă când persoana își creează contul.
          </p>

          {waitlistLink && (
            <div className="mt-4">
              <NewInviteLink link={waitlistLink.link} onClose={() => setWaitlistLink(null)} />
              <p className="mt-1.5 text-[12px] text-ink-soft">Pentru {waitlistLink.email}</p>
            </div>
          )}

          {!waitlist.data ? (
            <p className="mt-4 text-ink-soft">{waitlist.error ?? "Se încarcă…"}</p>
          ) : waitlist.data.rows.length === 0 ? (
            <p className="mt-4 text-[13px] text-ink-soft">Nimeni pe listă deocamdată.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {waitlist.data.rows.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 sm:flex-nowrap">
                  <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate font-medium">{w.email}</span>
                      {w.invitation_status ? (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[w.invitation_status].cls}`}>
                          Invitație {STATUS[w.invitation_status].label.toLowerCase()}
                        </span>
                      ) : (
                        <span className="rounded-full bg-galben-tint px-2 py-0.5 text-[11px] font-semibold text-galben">În așteptare</span>
                      )}
                    </div>
                    <div className="text-[12px] text-ink-soft">
                      Înscris {fmt(w.created_at)}
                      {w.invited_at ? ` · invitat ${fmt(w.invited_at)}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button className={`${w.invited_at ? "btn-ghost border border-line" : "btn-primary"} text-[13px]`} onClick={() => inviteFromWaitlist(w)} disabled={inviting === w.id}>
                      {inviting === w.id ? "Se trimite…" : w.invited_at ? "Retrimite" : "Trimite invitație"}
                    </button>
                    <button className="btn-danger h-10 w-10 px-0" onClick={() => removeFromWaitlist(w)} aria-label={`Scoate ${w.email} de pe listă`} title="Scoate de pe listă">
                      <TrashIcon className="h-[18px] w-[18px]" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
