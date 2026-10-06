"use client";

import { useCallback, useEffect, useState } from "react";
import { passkeyErrorMessage, passkeysSupported, registerPasskey } from "@/lib/passkeyClient";
import { api, Modal, Panel, useConfirm } from "./ui";

type Passkey = { id: string; name: string; device_type: string; backed_up: number; created_at: string; last_used_at: string | null };
type Session = { key: string; created_at: string; last_seen_at: string | null; ip: string; user_agent: string; location: string; method: string; current: boolean };
type Event = { id: number; success: number; method: string; reason: string; ip: string; user_agent: string; location: string; created_at: string };

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleString("ro-RO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–";

/** „Chrome pe Windows” din user-agent, pentru listele de sesiuni și istoric. */
function device(ua: string) {
  const u = ua.toLowerCase();
  if (!u) return "Dispozitiv necunoscut";
  const os = /iphone|ipad/.test(u) ? "iPhone/iPad" : /android/.test(u) ? "Android" : /mac os/.test(u) ? "Mac" : /windows/.test(u) ? "Windows" : /linux/.test(u) ? "Linux" : "";
  const br = /edg\//.test(u) ? "Edge" : /chrome\//.test(u) ? "Chrome" : /firefox\//.test(u) ? "Firefox" : /safari\//.test(u) ? "Safari" : /node|curl|python/.test(u) ? "script" : "browser";
  return os ? `${br} pe ${os}` : br;
}

const METHOD_LABEL: Record<string, string> = {
  password: "parolă",
  passkey: "passkey",
  recovery: "parolă + cod de recuperare",
  setup: "creare cont",
  invite: "creare cont din invitație",
  reconfirmare: "reconfirmare",
  "passkey-adaugat": "passkey adăugat",
  "passkey-sters": "passkey șters",
  "coduri-regenerate": "coduri de recuperare noi",
  "parola-schimbata": "parolă schimbată",
  "delogare-peste-tot": "delogare de pe celelalte dispozitive",
  "sesiune-inchisa": "sesiune închisă",
};

/**
 * Securitatea contului: passkey-uri (obligatorii după primul), coduri de recuperare,
 * dispozitive conectate și istoricul autentificărilor.
 */
const SESSIONS_SHOWN = 3;

export default function SecurityCenter({ onToast }: { onToast: (msg: string) => void }) {
  const confirm = useConfirm();
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [codesLeft, setCodesLeft] = useState<number | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [fromRecovery, setFromRecovery] = useState(false);
  // Lista de dispozitive poate fi lungă: implicit doar primele câteva (cel curent e primul).
  const [allSessions, setAllSessions] = useState(false);

  const load = useCallback(async () => {
    const [p, s, e, c] = await Promise.all([
      api<{ passkeys: Passkey[] }>("/api/auth/passkey/list"),
      api<{ sessions: Session[] }>("/api/auth/sessions"),
      api<{ events: Event[] }>("/api/auth/events"),
      api<{ left: number }>("/api/auth/recovery-codes"),
    ]);
    setPasskeys(p.passkeys);
    // Dispozitivul curent primul, apoi după ultima activitate (ordinea de pe server).
    setSessions([...s.sessions].sort((a, b) => Number(!!b.current) - Number(!!a.current)));
    setEvents(e.events);
    setCodesLeft(c.left);
  }, []);

  useEffect(() => {
    setSupported(passkeysSupported());
    setFromRecovery(new URLSearchParams(window.location.search).get("securitate") === "recuperare");
    load().catch((e) => setError(e.message));
  }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(passkeyErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const addPasskey = () =>
    run(async () => {
      const res = await registerPasskey("", api);
      if (res.recoveryCodes) setNewCodes(res.recoveryCodes);
      onToast(`Passkey adăugat: ${res.name}`);
      await load();
    });

  const removePasskey = async (p: Passkey) => {
    const last = (passkeys?.length ?? 0) === 1;
    const ok = await confirm({
      title: "Șterge passkey",
      message: last
        ? `„${p.name}” e ultimul passkey. Fără el, contul se va deschide din nou doar cu parola (mai puțin sigur). Continui?`
        : `Ștergi passkey-ul „${p.name}”? Dispozitivul acela nu va mai putea intra în cont.`,
      confirmText: "Șterge",
      danger: true,
    });
    if (!ok) return;
    run(async () => {
      await api(`/api/auth/passkey/list?id=${encodeURIComponent(p.id)}`, "DELETE");
      onToast("Passkey șters");
      await load();
    });
  };

  const regenerateCodes = async () => {
    const ok = await confirm({
      title: "Coduri de recuperare noi",
      message: "Codurile vechi nu vor mai funcționa. Generez 10 coduri noi?",
      confirmText: "Generează",
    });
    if (!ok) return;
    run(async () => {
      const r = await api<{ codes: string[] }>("/api/auth/recovery-codes", "POST");
      setNewCodes(r.codes);
      await load();
    });
  };

  const closeSession = (s: Session) =>
    run(async () => {
      await api(`/api/auth/sessions?key=${s.key}`, "DELETE");
      onToast("Sesiunea a fost închisă");
      await load();
    });

  const closeOthers = async () => {
    const ok = await confirm({ title: "Delogare de peste tot", message: "Închid toate celelalte sesiuni (rămâi conectat doar aici)?", confirmText: "Deloghează" });
    if (!ok) return;
    run(async () => {
      await api("/api/auth/sessions?all=1", "DELETE");
      onToast("Ai fost delogat de pe celelalte dispozitive");
      await load();
    });
  };

  const copyCodes = () => {
    if (!newCodes) return;
    navigator.clipboard?.writeText(newCodes.join("\n")).then(() => onToast("Codurile au fost copiate"));
  };

  const hasPasskey = (passkeys?.length ?? 0) > 0;
  const failed24h = events.filter((e) => !e.success && Date.now() - new Date(e.created_at).getTime() < 86400000).length;

  return (
    <Panel title="Passkey-uri & dispozitive">
      {fromRecovery && (
        <p className="mb-4 rounded-md bg-galben-tint p-3 text-[13px]">
          Ai intrat cu un cod de recuperare. Dacă ai pierdut dispozitivul vechi, șterge-i passkey-ul de mai jos și adaugă unul nou
          pe acest dispozitiv. Mai ai {codesLeft ?? "…"} coduri nefolosite.
        </p>
      )}
      {error && <div className="mb-3 rounded bg-rosu-tint p-2.5 text-[13px] font-medium text-rosu">{error}</div>}

      {/* Passkey-uri */}
      <div className="mb-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[14px] font-semibold">
            Passkey-uri{" "}
            <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${hasPasskey ? "bg-leu-tint text-leu" : "bg-galben-tint text-ink"}`}>
              {hasPasskey ? "obligatoriu la login" : "neactivat"}
            </span>
          </h4>
          {supported ? (
            <button className="btn-primary py-1 text-[13px]" onClick={addPasskey} disabled={busy}>
              + Adaugă passkey pe acest dispozitiv
            </button>
          ) : (
            <span className="text-[12px] text-ink-soft">Browserul acesta nu suportă passkey-uri.</span>
          )}
        </div>
        {!hasPasskey && passkeys && (
          <p className="mb-2 text-[13px] text-ink-soft">
            Adaugă un passkey (amprentă, Face ID, Windows Hello). După primul passkey, parola singură nu mai deschide contul —
            o parolă furată devine inutilă. Primești 10 coduri de recuperare pentru urgențe. Recomandat: adaugă passkey și pe
            telefon, și pe calculator.
          </p>
        )}
        <ul className="divide-y divide-line">
          {passkeys?.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
              <div>
                <div className="font-medium">🔑 {p.name || "Passkey"}</div>
                <div className="text-[12px] text-ink-soft">
                  Adăugat {fmt(p.created_at)} · folosit ultima dată {fmt(p.last_used_at)}
                  {p.backed_up ? " · sincronizat (iCloud / Google)" : ""}
                </div>
              </div>
              <button className="btn-danger py-1 text-[12px]" onClick={() => removePasskey(p)} disabled={busy}>Șterge</button>
            </li>
          ))}
        </ul>
        {hasPasskey && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md bg-paper p-3 text-[13px]">
            <span>
              Coduri de recuperare nefolosite: <strong>{codesLeft ?? "…"}</strong> din 10
              {codesLeft !== null && codesLeft <= 3 ? " — generează altele curând" : ""}
            </span>
            <button className="btn-ghost py-1 text-[13px]" onClick={regenerateCodes} disabled={busy}>Generează coduri noi</button>
          </div>
        )}
      </div>

      {/* Sesiuni */}
      <div className="mb-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[14px] font-semibold">Dispozitive conectate ({sessions.length})</h4>
          {sessions.length > 1 && (
            <button className="btn-ghost py-1 text-[13px]" onClick={closeOthers} disabled={busy}>Deloghează-mă de peste tot</button>
          )}
        </div>
        <ul className="divide-y divide-line">
          {(allSessions ? sessions : sessions.slice(0, SESSIONS_SHOWN)).map((s) => (
            <li key={s.key} className="flex items-center justify-between gap-3 py-2 text-[13px]">
              <div className="min-w-0">
                <div className="font-medium">
                  {device(s.user_agent)}
                  {s.current && <span className="ml-2 rounded-full bg-leu-tint px-2 py-0.5 text-[11px] text-leu">acest dispozitiv</span>}
                </div>
                <div className="text-[12px] text-ink-soft">
                  {[s.location, s.ip].filter(Boolean).join(" · ")} · activ {fmt(s.last_seen_at)} · conectat cu {METHOD_LABEL[s.method] ?? (s.method || "parolă")}
                </div>
              </div>
              {!s.current && <button className="btn-ghost min-h-[36px] shrink-0 border border-line-strong/70 px-2.5 py-1 text-[12px]" onClick={() => closeSession(s)} disabled={busy}>Închide</button>}
            </li>
          ))}
        </ul>
        {sessions.length > SESSIONS_SHOWN && (
          <button className="btn-ghost mt-1 w-full text-[13px]" onClick={() => setAllSessions(!allSessions)}>
            {allSessions ? "Arată mai puține" : `Arată toate (${sessions.length})`}
          </button>
        )}
      </div>

      {/* Istoric */}
      <div>
        <h4 className="mb-2 text-[14px] font-semibold">
          Istoric autentificări
          {failed24h > 0 && <span className="ml-2 rounded-full bg-rosu-tint px-2 py-0.5 text-[11px] text-rosu">{failed24h} eșuate în ultimele 24h</span>}
        </h4>
        <div className="max-h-[260px] overflow-auto rounded border border-line">
          <table className="w-full text-left text-[12px]">
            <tbody className="divide-y divide-line">
              {events.map((e) => (
                <tr key={e.id} className={e.success ? "" : "bg-rosu-tint/40"}>
                  <td className="whitespace-nowrap p-1.5">{fmt(e.created_at)}</td>
                  <td className="p-1.5">{e.success ? "✓" : "✕"} {METHOD_LABEL[e.method] ?? e.method}{e.reason ? ` — ${e.reason}` : ""}</td>
                  <td className="p-1.5 text-ink-soft">{device(e.user_agent)}</td>
                  <td className="hidden p-1.5 text-ink-soft sm:table-cell">{[e.location, e.ip].filter(Boolean).join(" · ")}</td>
                </tr>
              ))}
              {!events.length && (
                <tr><td className="p-2 text-ink-soft">Nicio autentificare înregistrată încă.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!newCodes} onClose={() => setNewCodes(null)} title="Codurile tale de recuperare">
        <p className="mb-3 text-[13px] text-ink-soft">
          Păstrează-le într-un loc sigur (manager de parole, hârtie). Le vezi <strong>doar acum</strong>. Dacă pierzi toate
          dispozitivele cu passkey, intri cu parola + unul dintre coduri. Fiecare cod merge o singură dată.
        </p>
        <div className="grid grid-cols-2 gap-2 rounded-md border border-line bg-paper p-3 font-mono text-[14px]">
          {newCodes?.map((c) => <span key={c}>{c}</span>)}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={copyCodes}>Copiază</button>
          <button className="btn-primary" onClick={() => setNewCodes(null)}>Le-am salvat</button>
        </div>
      </Modal>
    </Panel>
  );
}
