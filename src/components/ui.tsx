"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { currentMonth, eur, lei } from "@/lib/util";

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
      {confirmState && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink/55 backdrop-blur-md animate-backdrop-fade"
          onClick={() => handleConfirmClose(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-line bg-sheet p-6 shadow-2xl animate-modal-pop relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Bandă decorativă în stil desktop */}
            <div
              className={`absolute top-0 left-0 right-0 h-1 ${
                confirmState.options.danger
                  ? "bg-gradient-to-r from-rosu via-rosu-soft to-rosu"
                  : "bg-gradient-to-r from-verde via-albastru to-violet"
              }`}
            />

            <div className="flex items-start gap-4">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-sm border ${
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
                  <h3 className="font-display text-[17px] font-bold text-ink leading-tight">
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

            <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-line/50">
              <button
                type="button"
                className="btn-ghost px-4 py-2 text-[13px] font-medium"
                onClick={() => handleConfirmClose(false)}
              >
                {confirmState.options.cancelText || "Renunță"}
              </button>
              <button
                type="button"
                autoFocus
                className={
                  confirmState.options.danger
                    ? "btn-danger px-4 py-2 text-[13px] font-semibold shadow-sm"
                    : "btn-primary px-4 py-2 text-[13px] font-semibold shadow-sm"
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

export async function api<T = unknown>(url: string, method: string = "GET", body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Operația nu a reușit");
  return j as T;
}

// ---------- Afișare sume ----------

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
  const sizes = {
    sm: "text-[14px]",
    md: "text-[17px] font-medium",
    lg: "font-display text-[26px] font-semibold leading-tight",
    xl: "font-display text-[40px] font-semibold leading-none tracking-tight",
  };
  const tones: Record<string, string> = {
    leu: "text-leu", rosu: "text-rosu", galben: "text-galben", albastru: "text-albastru", mov: "text-mov", soft: "text-ink-soft",
  };
  return (
    <span className="num inline-flex flex-col">
      <span className={`${sizes[size]} ${tone ? tones[tone] : ""}`}>{lei(value, decimals)}</span>
      <span className={`text-ink-faint ${size === "xl" || size === "lg" ? "text-[13px] mt-1" : "text-[12px]"}`}>
        {eur(value / r)}
      </span>
    </span>
  );
}

// ---------- Structură ----------

export function PageHeader({ title, intro, actions }: { title: string; intro?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="text-[34px] font-semibold leading-tight">{title}</h1>
        {intro && <p className="mt-1.5 text-ink-soft">{intro}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
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
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          {title && <h2 className="text-[17px] font-semibold">{title}</h2>}
          {aside}
        </div>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
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
      <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full" style={{ background: accent ?? "#D5DDD8" }} />
      <div className="text-[13px] text-ink-soft">{label}</div>
      <div className="mt-0.5">{children}</div>
      {hint && <div className="mt-1 text-[12px] text-ink-soft">{hint}</div>}
    </div>
  );
}

export function Bar({ value, max = 100, color = "#2E5C8A", marker }: { value: number; max?: number; color?: string; marker?: number }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="relative h-2 w-full rounded-full bg-line/70">
      <div className="h-2 rounded-full" style={{ width: `${w}%`, background: color }} />
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
    <div className="rounded-[10px] border border-dashed border-line px-6 py-10 text-center">
      <p className="font-display text-[18px] font-semibold">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-ink-soft">{children}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:p-10" onClick={onClose}>
      <div role="dialog" aria-modal className="panel w-full max-w-xl bg-sheet shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-[18px] font-semibold">{title}</h2>
          <button className="btn-ghost" onClick={onClose} aria-label="Închide">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
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

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div role="status" className="fixed bottom-5 right-5 z-50 rounded-md bg-ink px-4 py-2.5 text-[14px] text-white shadow-lg">
      {message}
    </div>
  );
}

export const LEVEL_STYLE = {
  critic: { color: "#B5456A", bg: "#F4DDE5", label: "Urgent" },
  atentie: { color: "#C99A1E", bg: "#F6ECCB", label: "Atenție" },
  idee: { color: "#2E5C8A", bg: "#DCE6F1", label: "Sugestie" },
  bine: { color: "#3D7A4E", bg: "#DCEBDF", label: "Merge bine" },
} as const;

export const chartTooltipStyle = {
  contentStyle: { background: "#F8FAF8", border: "1px solid #D5DDD8", borderRadius: 8, fontSize: 13 },
  labelStyle: { color: "#1C2B30", fontWeight: 600 },
};
