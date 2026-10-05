"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { currentMonth, eur, lei, monthLabel, money } from "@/lib/util";
import { ReceiptMeta } from "./receipt";
import ReauthDialog from "./ReauthDialog";
import { watchSystemTheme } from "@/lib/theme";

// ---------- Context aplicație: luna selectată și cursul EUR ----------

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

type AppCtx = {
  month: string;
  setMonth: (m: string) => void;
  eurRate: number;
  fxDate: string | null;
  fxError: string | null;
  refreshFx: () => void;
  inflationRate: number;
  inflationPeriod: string | null;
  inflationSource: string | null;
  inflationError: string | null;
  refreshInflation: () => void;
  confirm: (opts: string | ConfirmOptions) => Promise<boolean>;
  version: number;
  bump: () => void;
};

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [month, setMonthState] = useState(currentMonth());
  const [eurRate, setEurRate] = useState(5);
  const [fxDate, setFxDate] = useState<string | null>(null);
  const [fxError, setFxError] = useState<string | null>(null);

  const [inflationRate, setInflationRate] = useState(8.2);
  const [inflationPeriod, setInflationPeriod] = useState<string | null>(null);
  const [inflationSource, setInflationSource] = useState<string | null>(null);
  const [inflationError, setInflationError] = useState<string | null>(null);

  const [confirmState, setConfirmState] = useState<{
    options: ConfirmOptions;
    resolve: (val: boolean) => void;
  } | null>(null);

  const [version, setVersion] = useState(0);

  useEffect(() => watchSystemTheme(), []);

  useEffect(() => {
    const saved = sessionStorage.getItem("luna");
    if (saved && /^\d{4}-\d{2}$/.test(saved)) setMonthState(saved);
  }, []);

  const setMonth = (m: string) => {
    setMonthState(m);
    sessionStorage.setItem("luna", m);
  };

  // force=true doar la apăsarea butonului ↻; la deschidere respectăm cache-ul de pe server
  // (BNR: 3 ore, inflație: 12 ore) ca aplicația să pornească repede și pe telefon.
  const refreshFx = useCallback((force = true) => {
    fetch(`/api/fx${force ? "?force=1" : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setEurRate(d.rate);
        setFxDate(d.date);
        setFxError(d.error);
      })
      .catch(() => setFxError("Cursul BNR nu a putut fi preluat"));
  }, []);

  const refreshInflation = useCallback((force = true) => {
    fetch(`/api/inflation${force ? "?force=1" : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (typeof d.rate === "number") setInflationRate(d.rate);
        setInflationPeriod(d.period ?? null);
        setInflationSource(d.source ?? null);
        setInflationError(d.error ?? null);
      })
      .catch(() => setInflationError("Inflația nu a putut fi preluată"));
  }, []);

  useEffect(() => {
    // Pe ecranele de login/setup nu există încă sesiune, deci API-urile ar răspunde 401.
    if (["/login", "/setup"].includes(window.location.pathname)) return;
    refreshFx(false);
    refreshInflation(false);
  }, [refreshFx, refreshInflation]);

  const confirm = useCallback((opts: string | ConfirmOptions) => {
    const options: ConfirmOptions = typeof opts === "string" ? { message: opts } : opts;
    return new Promise<boolean>((resolve) => {
      setConfirmState({ options, resolve });
    });
  }, []);

  const handleConfirmClose = (result: boolean) => {
    if (confirmState) {
      confirmState.resolve(result);
      setConfirmState(null);
    }
  };

  useEffect(() => {
    if (!confirmState) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleConfirmClose(false);
      } else if (e.key === "Enter") {
        handleConfirmClose(true);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [confirmState]);

  return (
    <Ctx.Provider
      value={{
        month,
        setMonth,
        eurRate,
        fxDate,
        fxError,
        refreshFx,
        inflationRate,
        inflationPeriod,
        inflationSource,
        inflationError,
        refreshInflation,
        confirm,
        version,
        bump: () => setVersion((v) => v + 1),
      }}
    >
      {children}
      <ReauthDialog />
      {confirmState && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/55 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md animate-backdrop-fade sm:items-center sm:p-4"
          onClick={() => handleConfirmClose(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-[6px] border border-line bg-sheet p-6 shadow-2xl animate-modal-pop relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Bandă decorativă în stil desktop */}
            <div
              className={`absolute top-0 left-0 right-0 h-1 ${
                confirmState.options.danger
                  ? "bg-gradient-to-r from-rosu via-rosu-soft to-rosu"
                  : "bg-ink"
              }`}
            />

            <div className="flex items-start gap-4">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md shadow-sm border ${
                  confirmState.options.danger
                    ? "bg-rosu/10 border-rosu/25 text-rosu"
                    : "bg-albastru/10 border-albastru/25 text-albastru"
                }`}
              >
                {confirmState.options.danger ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="receipt-title text-[14.5px] text-ink leading-tight">
                    {confirmState.options.title || (confirmState.options.danger ? "Confirmare acțiune" : "Confirmare")}
                  </h3>
                  <button
                    type="button"
                    onClick={() => handleConfirmClose(false)}
                    className="text-ink-soft hover:text-ink -mr-1 -mt-1 p-1 rounded-lg hover:bg-line/40 transition-colors"
                    aria-label="Închide"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <p className="mt-2 text-[13.5px] text-ink-soft leading-relaxed">
                  {confirmState.options.message}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 border-t border-line/50 pt-3 sm:flex-row sm:items-center sm:justify-end sm:gap-2.5">
              <button
                type="button"
                className="btn-ghost min-h-[44px] px-4 py-2 text-[14px] font-medium sm:min-h-0 sm:text-[13px]"
                onClick={() => handleConfirmClose(false)}
              >
                {confirmState.options.cancelText || "Renunță"}
              </button>
              <button
                type="button"
                autoFocus
                className={
                  confirmState.options.danger
                    ? "btn-danger min-h-[44px] bg-rosu-tint/60 px-4 py-2 text-[14px] font-semibold shadow-sm sm:min-h-0 sm:bg-transparent sm:text-[13px]"
                    : "btn-primary min-h-[44px] px-4 py-2 text-[14px] font-semibold shadow-sm sm:min-h-0 sm:text-[13px]"
                }
                onClick={() => handleConfirmClose(true)}
              >
                {confirmState.options.confirmText || (confirmState.options.danger ? "Șterge" : "Confirmă")}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useConfirm() {
  const { confirm } = useApp();
  return confirm;
}

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("AppProvider lipsește");
  return c;
}

// ---------- Date de la API ----------

export function useApi<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { version } = useApp();

  const load = useCallback(() => {
    if (!url) return;
    setLoading(true);
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Datele nu au putut fi încărcate");
        setData(j);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, version, ...deps]);

  useEffect(load, [load]);
  return { data, error, loading, reload: load, setData };
}

// ---------- Reconfirmarea identității ----------
// Acțiunile sensibile (ștergeri, export, restaurare, parolă, passkey-uri) răspund 403 + `reauth: true`
// dacă identitatea n-a fost confirmată în ultimele minute. Atunci cerem passkey-ul / parola și repetăm cererea.

let reauthHandler: (() => Promise<boolean>) | null = null;
export function setReauthHandler(h: (() => Promise<boolean>) | null) {
  reauthHandler = h;
}

async function fetchWithReauth(doFetch: () => Promise<Response>): Promise<Response> {
  const r = await doFetch();
  if (r.status !== 403 || !reauthHandler) return r;
  const j = await r.clone().json().catch(() => null);
  if (!j?.reauth) return r;
  return (await reauthHandler()) ? doFetch() : r;
}

export async function api<T = unknown>(url: string, method: string = "GET", body?: unknown): Promise<T> {
  const r = await fetchWithReauth(() =>
    fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Operația nu a reușit");
  return j as T;
}

/** Descarcă un fișier de la API (ex. backup-ul), cu reconfirmare dacă e nevoie. */
export async function downloadFile(url: string, fallbackName: string) {
  const r = await fetchWithReauth(() => fetch(url, { cache: "no-store" }));
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error ?? "Descărcarea nu a reușit");
  }
  const name = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? fallbackName;
  const href = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
  URL.revokeObjectURL(href);
}

// ---------- Afișare sume ----------

/**
 * Valoarea „numără” lin până la cifra nouă (la încărcare de la 0, apoi de la valoarea anterioară),
 * ca schimbarea lunii să se vadă. Fără animație dacă utilizatorul a cerut mișcare redusă.
 */
export function useCountUp(value: number, duration = 750) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (!Number.isFinite(value)) return setShown(value);
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = value;
      return setShown(value);
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = a + (value - a) * eased;
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return shown;
}

export function Money({
  value,
  rate,
  size = "md",
  tone,
  decimals = false,
}: {
  value: number;
  rate?: number;
  size?: "sm" | "md" | "lg" | "xl";
  tone?: "leu" | "rosu" | "galben" | "albastru" | "mov" | "soft";
  decimals?: boolean;
}) {
  const { eurRate } = useApp();
  const r = rate ?? eurRate;
  const animated = useCountUp(value);
  const v = size === "sm" ? value : animated;
  const sizes = {
    sm: "text-[14px]",
    md: "text-[17px] font-medium",
    lg: "font-display text-[18px] sm:text-[22px] font-semibold leading-tight tracking-[-0.03em]",
    xl: "font-display text-[32px] sm:text-[40px] font-bold leading-none tracking-[-0.04em]",
  };
  const tones: Record<string, string> = {
    leu: "text-leu", rosu: "text-rosu", galben: "text-galben", albastru: "text-albastru", mov: "text-mov", soft: "text-ink-soft",
  };
  return (
    <span className="num inline-flex flex-col">
      {size === "lg" || size === "xl" ? (
        // Cifrele mari: „lei” mai mic, lângă sumă, ca să încapă pe un rând chiar și cu zecimale.
        <span className={`whitespace-nowrap ${sizes[size]} ${tone ? tones[tone] : ""}`}>
          {money(v)}
          <span className="ml-1 inline-block text-[0.55em] font-semibold opacity-70">lei</span>
        </span>
      ) : (
        <span className={`${sizes[size]} ${tone ? tones[tone] : ""}`}>{lei(v, decimals)}</span>
      )}
      <span className={`text-ink-faint ${size === "xl" || size === "lg" ? "text-[13px] mt-1" : "text-[12px]"}`}>
        {eur(v / r)}
      </span>
    </span>
  );
}

// ---------- Structură ----------

/** Antetul paginii, ca începutul unui bon: numărul bonului și ora, titlul, apoi o linie dublă. */
export function PageHeader({ title, intro, actions }: { title: string; intro?: ReactNode; actions?: ReactNode }) {
  const { month } = useApp();
  return (
    <header className="mb-6 sm:mb-8">
      <ReceiptMeta month={month} label={monthLabel(month, true)} />
      <div className="flex flex-wrap items-end justify-between gap-3 sm:gap-4">
        <div className="max-w-2xl">
          <h1 className="text-[24px] font-bold leading-tight sm:text-[31px]">{title}</h1>
          {intro && <p className="mt-1.5 text-[14px] text-ink-soft sm:text-[15px]">{intro}</p>}
        </div>
        {actions && <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap [&>*]:w-full sm:[&>*]:w-auto [&>.btn-danger]:border [&>.btn-danger]:border-rosu/30 [&>.btn-ghost]:border [&>.btn-ghost]:border-line-strong/70">{actions}</div>}
      </div>
      <div className="rule-double mt-4" aria-hidden />
    </header>
  );
}

export function Panel({
  title,
  aside,
  children,
  className = "",
  pad = true,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || aside) && (
        // Pe telefon, butoanele „fantomă” din antet primesc contur, ca să se vadă că sunt butoane când trec sub titlu.
        <div className="relative flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pb-3 pt-3.5 sm:px-5 [&_.btn-ghost]:border [&_.btn-ghost]:border-line [&_.btn-ghost]:bg-field/60 sm:[&_.btn-ghost]:border-0 sm:[&_.btn-ghost]:bg-transparent">
          {title && <h2 className="receipt-title min-w-0">{title}</h2>}
          {aside}
          <span className="rule-dashed absolute inset-x-4 bottom-0 sm:inset-x-5" aria-hidden />
        </div>
      )}
      <div className={pad ? "p-4 sm:p-5" : ""}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  children,
  hint,
  accent,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="relative pl-3.5">
      <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full" style={{ background: accent ?? "var(--c-line)" }} />
      <div className="font-mono text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-soft">{label}</div>
      <div className="mt-0.5">{children}</div>
      {hint && <div className="mt-1 text-[12px] text-ink-soft">{hint}</div>}
    </div>
  );
}

export function Bar({ value, max = 100, color = "var(--c-albastru)", marker }: { value: number; max?: number; color?: string; marker?: number }) {
  const target = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  // Bara se umple de la 0 la prima afișare, apoi alunecă la valoarea nouă.
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(target));
    return () => cancelAnimationFrame(id);
  }, [target]);
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-line/70">
      <div className="h-2 rounded-full transition-[width] duration-700 ease-out" style={{ width: `${w}%`, background: color }} />
      {marker !== undefined && max > 0 && (
        <span
          className="absolute -top-1 h-4 w-[2px] bg-ink"
          style={{ left: `${Math.min(100, (marker / max) * 100)}%` }}
          aria-hidden
        />
      )}
    </div>
  );
}

export function Delta({ now, before, invert = false }: { now: number; before: number | null | undefined; invert?: boolean }) {
  if (before === null || before === undefined || before === 0) return null;
  const d = ((now - before) / Math.abs(before)) * 100;
  if (!Number.isFinite(d) || Math.abs(d) < 0.5) return <span className="text-ink-faint">la fel ca luna trecută</span>;
  const good = invert ? d < 0 : d > 0;
  return (
    <span className={good ? "text-leu" : "text-rosu"}>
      {d > 0 ? "▲" : "▼"} {Math.abs(d).toFixed(0)}% față de luna trecută
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-[4px] border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="font-display text-[16px] font-semibold uppercase tracking-[0.04em]">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-ink-soft">{children}</div>}
    </div>
  );
}

/** Blochează scroll-ul paginii din spate cât timp e deschisă o fereastră (altfel pe telefon „fuge” fundalul). */
function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

/**
 * Fereastră de dialog. Pe telefon apare ca un panou care urcă de jos, pe toată lățimea, cu titlul fix sus
 * și conținutul derulabil; pe ecrane mari, centrată. E randată direct în <body> (portal), ca să stea
 * mereu peste barele de navigare, indiferent unde e folosită în pagină.
 */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  useScrollLock(open);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 backdrop-blur-[2px] animate-backdrop-fade sm:items-start sm:overflow-y-auto sm:p-10"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className="sheet-up flex max-h-[92dvh] w-full flex-col rounded-t-[18px] border border-line bg-sheet shadow-2xl sm:max-h-none sm:max-w-xl sm:rounded-[6px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line sm:hidden" aria-hidden />
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-dashed border-line-strong px-4 py-2.5 sm:px-5 sm:py-3">
          <h2 className="receipt-title min-w-0 text-[14px] sm:text-[14.5px]">{title}</h2>
          <button className="btn-ghost h-10 w-10 shrink-0 px-0 text-[16px]" onClick={onClose} aria-label="Închide">✕</button>
        </div>
        <div className="overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:overflow-visible sm:p-5">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-ink-faint">{hint}</span>}
    </label>
  );
}

/** Schelet de încărcare: forma paginii, cu o strălucire care trece peste ea. */
export function Skeleton({ variant = "page" }: { variant?: "page" | "block" }) {
  const block = (cls: string) => <div className={`shimmer rounded-[4px] bg-line/50 ${cls}`} />;
  if (variant === "block") return block("h-40 w-full");
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Se încarcă">
      <div className="flex flex-col gap-2">
        {block("h-9 w-64")}
        {block("h-4 w-96 max-w-full")}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>{block("h-24 w-full")}</div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {block("h-72 w-full")}
        {block("h-72 w-full")}
      </div>
    </div>
  );
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message || typeof document === "undefined") return null;
  // Pe telefon, centrat deasupra barei de navigare de jos; pe ecrane mari, în colțul din dreapta.
  return createPortal(
    <div
      role="status"
      className="sheet-up fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[90] rounded-md bg-ink px-4 py-3 text-center text-[14px] text-sheet shadow-lg sm:inset-x-auto sm:right-5 sm:rounded-md sm:py-2.5 sm:text-left lg:bottom-5"
    >
      {message}
    </div>,
    document.body,
  );
}

// ---------- Iconițe mici pentru acțiuni (pe telefon înlocuiesc textul butoanelor) ----------

export function PencilIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4zM13.5 6.5l4 4" />
    </svg>
  );
}

export function TrashIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}

export const LEVEL_STYLE = {
  critic: { color: "var(--c-rosu)", bg: "var(--c-rosu-tint)", label: "Urgent" },
  atentie: { color: "var(--c-galben)", bg: "var(--c-galben-tint)", label: "Atenție" },
  idee: { color: "var(--c-albastru)", bg: "var(--c-albastru-tint)", label: "Sugestie" },
  bine: { color: "var(--c-leu)", bg: "var(--c-leu-tint)", label: "Merge bine" },
} as const;

export const chartTooltipStyle = {
  contentStyle: { background: "var(--c-sheet)", border: "1px dashed var(--c-ink-faint)", borderRadius: 2, fontSize: 12.5, fontFamily: '"IBM Plex Mono", ui-monospace, monospace' },
  labelStyle: { color: "var(--c-ink)", fontWeight: 600 },
};
