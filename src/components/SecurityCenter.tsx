"use client";

import { useCallback, useEffect, useState } from "react";
import { biometricAvailable, biometricLabel, passkeyErrorMessage, registerPasskey } from "@/lib/passkeyClient";
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
  passkey: "Face ID / amprentă",
  totp: "parolă + cod 2FA",
  recovery: "parolă + cod de recuperare",
  setup: "creare cont",
  invite: "creare cont din invitație",
  reconfirmare: "reconfirmare",
  "passkey-adaugat": "Face ID / amprentă activată",
  "passkey-sters": "Face ID / amprentă scoasă",
  "totp-activat": "2FA activat",
  "totp-dezactivat": "2FA dezactivat",
  "coduri-regenerate": "coduri de recuperare noi",
  "parola-schimbata": "parolă schimbată",
  "delogare-peste-tot": "delogare de pe celelalte dispozitive",
  "sesiune-inchisa": "sesiune închisă",
};

type TotpSetup = { secret: string; uri: string; qr: string };

/**
 * Securitatea contului: Face ID / amprentă pe fiecare dispozitiv, autentificare în doi pași cu o aplicație
 * (2FA), coduri de recuperare, dispozitive conectate și istoricul autentificărilor. Cu Face ID / amprentă sau
 * 2FA activ, parola singură nu mai deschide contul.
 */
const SESSIONS_SHOWN = 3;

export default function SecurityCenter({ onToast }: { onToast: (msg: string) => void }) {
  const confirm = useConfirm();
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [totp, setTotp] = useState<{ enabled: boolean; enabledAt: string | null } | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [codesLeft, setCodesLeft] = useState<number | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [setupError, setSetupError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bioReady, setBioReady] = useState(true);
  const [bioLabel, setBioLabel] = useState("Face ID / amprentă");
  const [fromRecovery, setFromRecovery] = useState(false);
  // Lista de dispozitive poate fi lungă: implicit doar primele câteva (cel curent e primul).
  const [allSessions, setAllSessions] = useState(false);

  const load = useCallback(async () => {
    const [p, t, s, e, c] = await Promise.all([
      api<{ passkeys: Passkey[] }>("/api/auth/passkey/list"),
      api<{ enabled: boolean; enabledAt: string | null }>("/api/auth/totp"),
      api<{ sessions: Session[] }>("/api/auth/sessions"),
      api<{ events: Event[] }>("/api/auth/events"),
      api<{ left: number }>("/api/auth/recovery-codes"),
    ]);
    setPasskeys(p.passkeys);
    setTotp(t);
    // Dispozitivul curent primul, apoi după ultima activitate (ordinea de pe server).
    setSessions([...s.sessions].sort((a, b) => Number(!!b.current) - Number(!!a.current)));
    setEvents(e.events);
    setCodesLeft(c.left);
  }, []);

  useEffect(() => {
    biometricAvailable().then(setBioReady);
    setBioLabel(biometricLabel());
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

  const addBiometric = () =>
    run(async () => {
      const res = await registerPasskey("", api);
      if (res.recoveryCodes) setNewCodes(res.recoveryCodes);
      onToast(`${bioLabel} activat pe ${res.name}`);
      await load();
    });

  const hasBiometric = (passkeys?.length ?? 0) > 0;
  const secured = hasBiometric || !!totp?.enabled;

  const removeBiometric = async (p: Passkey) => {
    const lastFactor = (passkeys?.length ?? 0) === 1 && !totp?.enabled;
    const ok = await confirm({
      title: "Scoate Face ID / amprenta",
      message: lastFactor
        ? `„${p.name}” e ultima protecție a contului. Fără ea, contul se va deschide din nou doar cu parola (mai puțin sigur). Continui?`
        : `Scoți Face ID / amprenta de pe „${p.name}”? Dispozitivul acela nu va mai putea intra fără parolă și cod.`,
      confirmText: "Scoate",
      danger: true,
    });
    if (!ok) return;
    run(async () => {
      await api(`/api/auth/passkey/list?id=${encodeURIComponent(p.id)}`, "DELETE");
      onToast("Dispozitiv scos");
      await load();
    });
  };

  const startTotp = () =>
    run(async () => {
      setSetupCode("");
      setSetupError(null);
      setSetup(await api<TotpSetup>("/api/auth/totp", "POST", { action: "start" }));
    });

  const enableTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError(null);
    setBusy(true);
    try {
      const r = await api<{ ok: true; recoveryCodes: string[] | null }>("/api/auth/totp", "POST", { action: "enable", code: setupCode });
      setSetup(null);
      if (r.recoveryCodes) setNewCodes(r.recoveryCodes);
      onToast("Autentificarea în doi pași e activă");
      await load();
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : "Codul nu a putut fi verificat.");
    } finally {
      setBusy(false);
    }
  };

  const disableTotp = async () => {
    const ok = await confirm({
      title: "Dezactivează 2FA",
      message: hasBiometric
        ? "Codurile din aplicația de autentificare nu vor mai funcționa. Contul rămâne protejat cu Face ID / amprentă. Continui?"
        : "2FA e ultima protecție a contului. Fără ea, contul se va deschide din nou doar cu parola (mai puțin sigur). Continui?",
      confirmText: "Dezactivează",
      danger: true,
    });
    if (!ok) return;
    run(async () => {
      await api("/api/auth/totp", "DELETE");
      onToast("2FA dezactivat");
      await load();
    });
  };

  const regenerateCodes = async () => {
    const ok = await confirm({
      title: "Coduri de recuperare noi",
      message: "Codurile vechi nu vor mai funcționa, nici cele nefolosite. Generez 10 coduri noi?",
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

  const copy = (text: string, msg: string) => {
    navigator.clipboard?.writeText(text).then(() => onToast(msg));
  };

  const failed24h = events.filter((e) => !e.success && Date.now() - new Date(e.created_at).getTime() < 86400000).length;
  const badge = (on: boolean, text: string) => (
    <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${on ? "bg-leu-tint text-leu" : "bg-galben-tint text-ink"}`}>{text}</span>
  );

  return (
    <Panel title="Securitate & dispozitive">
      {fromRecovery && (
        <div className="mb-4 rounded-md bg-galben-tint p-3 text-[13px]">
          <p>
            Ai intrat cu un cod de recuperare; mai ai <strong>{codesLeft ?? "…"}</strong> nefolosite. Dacă ai pierdut
            telefonul, scoate-l de mai jos și activează Face ID / amprenta sau 2FA pe dispozitivul nou. Dacă nu mai ai
            lista de coduri, generează una nouă acum.
          </p>
          {secured && (
            <button className="btn-primary mt-2 py-1 text-[13px]" onClick={regenerateCodes} disabled={busy}>Generează coduri noi</button>
          )}
        </div>
      )}
      {error && <div className="mb-3 rounded bg-rosu-tint p-2.5 text-[13px] font-medium text-rosu">{error}</div>}

      {!secured && passkeys && totp && (
        <p className="mb-4 rounded-md bg-paper p-3 text-[13px] text-ink-soft">
          Acum contul se deschide doar cu parola. Activează <strong>Face ID / amprentă</strong> (intri dintr-o atingere) sau{" "}
          <strong>autentificarea în doi pași</strong> (parola + un cod din telefon). Ideal amândouă: 2FA te ajută să intri de pe
          orice calculator. Primești și 10 coduri de recuperare pentru urgențe.
        </p>
      )}

      {/* Face ID / amprentă */}
      <div className="mb-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[14px] font-semibold">
            Face ID / amprentă {badge(hasBiometric, hasBiometric ? `${passkeys?.length} ${passkeys?.length === 1 ? "dispozitiv" : "dispozitive"}` : "neactivat")}
          </h4>
          {bioReady ? (
            <button className="btn-primary py-1 text-[13px]" onClick={addBiometric} disabled={busy}>
              + Activează {bioLabel} aici
            </button>
          ) : (
            <span className="text-[12px] text-ink-soft">Dispozitivul acesta n-are Face ID, amprentă sau Windows Hello configurate.</span>
          )}
        </div>
        <p className="mb-2 text-[12.5px] text-ink-soft">
          Intri dintr-o atingere, fără parolă. Amprenta și fața nu pleacă niciodată de pe dispozitiv: telefonul doar confirmă că ești tu.
          Activează pe fiecare dispozitiv pe care îl folosești.
        </p>
        <ul className="divide-y divide-line">
          {passkeys?.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
              <div>
                <div className="font-medium">📱 {p.name || "Dispozitiv"}</div>
                <div className="text-[12px] text-ink-soft">
                  Activat {fmt(p.created_at)} · folosit ultima dată {fmt(p.last_used_at)}
                  {p.backed_up ? " · sincronizat (iCloud / Google)" : ""}
                </div>
              </div>
              <button className="btn-danger py-1 text-[12px]" onClick={() => removeBiometric(p)} disabled={busy}>Scoate</button>
            </li>
          ))}
        </ul>
      </div>

      {/* 2FA */}
      <div className="mb-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[14px] font-semibold">
            Autentificare în doi pași (2FA) {badge(!!totp?.enabled, totp?.enabled ? "activă" : "neactivată")}
          </h4>
          {totp?.enabled ? (
            <button className="btn-ghost py-1 text-[13px]" onClick={disableTotp} disabled={busy}>Dezactivează</button>
          ) : (
            <button className="btn-primary py-1 text-[13px]" onClick={startTotp} disabled={busy || !totp}>+ Activează 2FA</button>
          )}
        </div>
        <p className="text-[12.5px] text-ink-soft">
          {totp?.enabled
            ? `Activă din ${fmt(totp.enabledAt)}. La login cu parola, Leuța îți cere și codul de 6 cifre din aplicația de autentificare.`
            : "După parolă, Leuța îți cere un cod de 6 cifre care se schimbă la 30 de secunde, generat de o aplicație de pe telefon (Google Authenticator, Microsoft Authenticator, 1Password sau Parole pe iPhone)."}
        </p>
      </div>

      {/* Coduri de recuperare */}
      {secured && (
        <div className="mb-5 rounded-md bg-paper p-3 text-[13px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Coduri de recuperare nefolosite: <strong>{codesLeft ?? "…"}</strong> din 10
              {codesLeft !== null && codesLeft <= 3 ? " — generează altele curând" : ""}
            </span>
            <button className="btn-ghost py-1 text-[13px]" onClick={regenerateCodes} disabled={busy}>Generează coduri noi</button>
          </div>
          <p className="mt-1 text-[12px] text-ink-soft">
            Ai pierdut lista sau ai folosit câteva? Generează alte 10 oricând; cele vechi nu mai merg. Un cod de recuperare +
            parola deschid contul când nu ai la tine telefonul.
          </p>
        </div>
      )}

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

      <Modal open={!!setup} onClose={() => setSetup(null)} title="Activează autentificarea în doi pași">
        <ol className="mb-3 list-decimal space-y-1 pl-5 text-[13px] text-ink-soft">
          <li>Deschide aplicația de autentificare de pe telefon (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
          <li>Adaugă un cont nou și scanează codul QR. Pe telefon poți apăsa direct „Deschide în aplicație”.</li>
          <li>Scrie mai jos codul de 6 cifre afișat pentru Leuța.</li>
        </ol>
        {setup && (
          <div className="flex flex-col items-center gap-2">
            <img src={setup.qr} alt="Cod QR pentru aplicația de autentificare" width={200} height={200} className="rounded-md bg-white p-2" />
            <a href={setup.uri} className="text-[13px] text-albastru hover:underline sm:hidden">Deschide în aplicație</a>
            <button type="button" className="font-mono text-[12px] tracking-wider text-ink-soft hover:text-ink" onClick={() => copy(setup.secret, "Cheia a fost copiată")} title="Copiază cheia">
              {setup.secret.replace(/(.{4})/g, "$1 ").trim()} ⧉
            </button>
            <span className="text-[11.5px] text-ink-faint">Nu poți scana? Adaugă cheia de mai sus de mână (tip: „bazat pe timp”).</span>
          </div>
        )}
        <form onSubmit={enableTotp} className="mt-4 flex flex-col gap-3">
          <label className="block">
            <span className="label">Codul din aplicație</span>
            <input
              className="field text-center font-mono text-[18px] tracking-[0.3em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={7}
              value={setupCode}
              onChange={(e) => setSetupCode(e.target.value)}
              required
            />
          </label>
          {setupError && <p className="text-[13px] text-rosu">{setupError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setSetup(null)}>Renunță</button>
            <button type="submit" className="btn-primary" disabled={busy || setupCode.replace(/\s/g, "").length < 6}>
              {busy ? "Se verifică…" : "Activează"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!newCodes} onClose={() => setNewCodes(null)} title="Codurile tale de recuperare">
        <p className="mb-3 text-[13px] text-ink-soft">
          Păstrează-le într-un loc sigur (manager de parole, hârtie). Le vezi <strong>doar acum</strong>. Dacă nu ai la tine
          telefonul, intri cu parola + unul dintre coduri. Fiecare cod merge o singură dată; poți genera altele oricând din Setări.
        </p>
        <div className="grid grid-cols-2 gap-2 rounded-md border border-line bg-paper p-3 font-mono text-[14px]">
          {newCodes?.map((c) => <span key={c}>{c}</span>)}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => newCodes && copy(newCodes.join("\n"), "Codurile au fost copiate")}>Copiază</button>
          <button className="btn-primary" onClick={() => setNewCodes(null)}>Le-am salvat</button>
        </div>
      </Modal>
    </Panel>
  );
}
