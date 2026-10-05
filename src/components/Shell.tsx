"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { addMonths, currentMonth, monthLabel } from "@/lib/util";
import { api, useApp } from "./ui";
import Logo from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/", label: "Panou", color: "var(--c-albastru)" },
  { href: "/luna", label: "Luna curentă", color: "var(--c-leu)" },
  { href: "/credite", label: "Credite", color: "var(--c-mov)" },
  { href: "/economii", label: "Economii", color: "var(--c-galben)" },
  { href: "/achizitii", label: "Îmi permit?", color: "var(--c-albastru)" },
  { href: "/buget", label: "Metode de buget", color: "var(--c-rosu)" },
  { href: "/setari", label: "Setări", color: "var(--c-ink-faint)" },
];

function MonthPicker() {
  const { month, setMonth } = useApp();
  const isNow = month === currentMonth();
  return (
    <div className="rounded-[10px] border border-line bg-sheet p-3 shadow-sm transition-all duration-150 hover:shadow">
      <div className="text-[12px] font-medium text-ink-soft">Luna analizată</div>
      <div className="mt-1 flex items-center justify-between gap-1">
        <button className="btn-ghost px-2 active:scale-95" onClick={() => setMonth(addMonths(month, -1))} aria-label="Luna anterioară">‹</button>
        <span className="whitespace-nowrap font-display text-[15px] font-semibold capitalize text-ink">{monthLabel(month)}</span>
        <button className="btn-ghost px-2 active:scale-95" onClick={() => setMonth(addMonths(month, 1))} aria-label="Luna următoare">›</button>
      </div>
      {!isNow && (
        <button className="mt-1.5 w-full text-[12px] font-medium text-albastru hover:underline transition-colors" onClick={() => setMonth(currentMonth())}>
          Înapoi la luna curentă
        </button>
      )}
    </div>
  );
}

/** Varianta compactă pentru bara de sus pe telefon: luna analizată e mereu vizibilă. */
function MonthPickerCompact() {
  const { month, setMonth } = useApp();
  const isNow = month === currentMonth();
  return (
    <div className="mt-2.5 flex items-center justify-between gap-2 rounded-[10px] border border-line bg-sheet px-1 py-0.5">
      <button className="h-9 w-10 rounded-lg text-[18px] text-ink-soft active:scale-95 active:bg-paper" onClick={() => setMonth(addMonths(month, -1))} aria-label="Luna anterioară">‹</button>
      <button
        className="flex flex-col items-center leading-tight"
        onClick={() => !isNow && setMonth(currentMonth())}
        title={isNow ? undefined : "Înapoi la luna curentă"}
      >
        <span className="font-display text-[15px] font-semibold capitalize text-ink">{monthLabel(month)}</span>
        {!isNow && <span className="text-[11px] font-medium text-albastru">atinge pentru luna curentă</span>}
      </button>
      <button className="h-9 w-10 rounded-lg text-[18px] text-ink-soft active:scale-95 active:bg-paper" onClick={() => setMonth(addMonths(month, 1))} aria-label="Luna următoare">›</button>
    </div>
  );
}

// Bara de jos pe telefon: secțiunile folosite zilnic, la un deget distanță.
const TABS = [
  { href: "/", label: "Panou", icon: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10" },
  { href: "/luna", label: "Luna", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/credite", label: "Credite", icon: "M3 7h18v10H3zM3 11h18M7 15h3" },
  { href: "/economii", label: "Economii", icon: "M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.6 5 3 5 1.1 5 3-2.2 3-5 3-5-1.1-5-3" },
];

function MarketIndicators() {
  const {
    eurRate,
    fxDate,
    fxError,
    refreshFx,
    inflationRate,
    inflationPeriod,
    inflationError,
    refreshInflation,
  } = useApp();

  const formattedPeriod = inflationPeriod ? monthLabel(inflationPeriod) : "an curent";

  return (
    <div className="rounded-[10px] border border-line bg-sheet/90 p-3 shadow-sm backdrop-blur-sm transition-all duration-200 hover:shadow-md">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
        <div className="flex items-center gap-1.5">
          <span className="live-dot" />
          <span>Piețe & Indicatori RO</span>
        </div>
        <button
          onClick={() => {
            refreshFx();
            refreshInflation();
          }}
          className="text-ink-faint hover:text-albastru transition-colors"
          title="Actualizează de pe internet"
        >
          ↻
        </button>
      </div>

      <div className="mt-2.5 flex flex-col gap-2">
        {/* Curs Valutar BNR */}
        <div className="flex items-baseline justify-between text-[12px]">
          <div className="flex flex-col">
            <span className="text-ink-soft font-medium">1 EUR (BNR)</span>
            <span className="text-[10px] text-ink-faint">
              {fxDate ? fxDate.split("-").reverse().join(".") : "estimativ"}
            </span>
          </div>
          <span className="num font-semibold text-ink">{eurRate.toFixed(4)} lei</span>
        </div>

        {/* Rata Inflației România */}
        <div className="flex items-baseline justify-between text-[12px] border-t border-line/60 pt-2">
          <div className="flex flex-col">
            <span className="text-ink-soft font-medium">Inflație RO (INS)</span>
            <span className="text-[10px] text-ink-faint capitalize">{formattedPeriod}</span>
          </div>
          <span className="num font-semibold text-rosu">{inflationRate.toFixed(1)}%</span>
        </div>
      </div>

      {(fxError || inflationError) && (
        <div className="mt-2 border-t border-line/60 pt-1 text-[11px] text-rosu">
          <button
            onClick={() => {
              if (fxError) refreshFx();
              if (inflationError) refreshInflation();
            }}
            className="hover:underline"
          >
            Eroare sincronizare. Reîncearcă
          </button>
        </div>
      )}
    </div>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<{ id: number; username: string } | null>(null);
  const [hasPasskey, setHasPasskey] = useState(true);
  const isAuthPage = path === "/login" || path === "/setup";
  // Paginile protejate ajung în browser doar cu sesiune validă (verificată pe server în proxy.ts),
  // deci nu mai blocăm randarea cu ecranul de încărcare: datele paginii pornesc imediat,
  // în paralel cu cererea de status (care aduce doar numele utilizatorului).
  const [checking, setChecking] = useState(false);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  useEffect(() => {
    api<{ setupNeeded: boolean; authenticated: boolean; user: { id: number; username: string } | null; hasPasskey?: boolean }>("/api/auth/status")
      .then((res) => {
        if (res.setupNeeded) {
          if (path !== "/setup") window.location.replace("/setup");
        } else if (!res.authenticated) {
          if (path !== "/login") window.location.replace("/login");
        } else {
          setUser(res.user);
          setHasPasskey(res.hasPasskey !== false);
          if (isAuthPage) window.location.replace("/");
        }
      })
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, [path, isAuthPage]);

  const handleLogout = async () => {
    try {
      await api("/api/auth/logout", "POST");
    } finally {
      window.location.href = "/login";
    }
  };

  if (isAuthPage) {
    return <main className="page-enter">{children}</main>;
  }

  if (checking) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-4 text-center">
          <Logo className="h-14 w-14 animate-pulse" />
          <div className="flex gap-1" aria-hidden>
            {["var(--c-leu)", "var(--c-mov)", "var(--c-rosu)", "var(--c-galben)", "var(--c-albastru)"].map((c) => (
              <span key={c} className="h-1 w-5 rounded-full animate-pulse" style={{ background: c }} />
            ))}
          </div>
          <p className="text-[14px] text-ink-soft animate-pulse">Se inițializează spațiul financiar…</p>
        </div>
      </div>
    );
  }

  const nav = (
    <nav className="flex flex-col gap-1" aria-label="Navigare principală">
      {NAV.map((n) => {
        const isCurrent = active(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-medium transition-all duration-150 active:scale-[0.99] ${
              isCurrent
                ? "bg-sheet text-ink shadow-[inset_0_0_0_1px_var(--c-line),0_1px_3px_rgba(0,0,0,0.03)]"
                : "text-ink-soft hover:bg-sheet/60 hover:text-ink"
            }`}
          >
            <span
              className={`h-4 w-1.5 rounded-full transition-all duration-200 ${
                isCurrent ? "scale-100 opacity-100" : "opacity-40 group-hover:opacity-75"
              }`}
              style={{ background: n.color }}
            />
            <span>{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="hidden lg:flex lg:flex-col lg:gap-6 lg:sticky lg:top-0 lg:h-screen border-r border-line bg-canvas/60 px-4 py-6">
        <div className="flex items-start justify-between gap-2 px-1.5">
          <Link href="/" className="group flex items-center gap-2.5">
            <Logo className="h-10 w-10 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105" />
            <div>
              <div className="font-display text-[23px] font-bold leading-none tracking-tight text-ink transition-colors group-hover:text-leu">
                Leuța
              </div>
              <div className="mt-1.5 flex gap-1" aria-hidden>
                {["var(--c-leu)", "var(--c-mov)", "var(--c-rosu)", "var(--c-galben)", "var(--c-albastru)"].map((c) => (
                  <span key={c} className="h-1 w-4 rounded-full" style={{ background: c }} />
                ))}
              </div>
            </div>
          </Link>
          <ThemeToggle />
        </div>
        <MonthPicker />
        {nav}
        <div className="mt-auto flex flex-col gap-3 px-1">
          {user && (
            <div className="flex items-center justify-between border-t border-line/80 pt-3 text-[13px]">
              <div className="flex items-center gap-2 truncate">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-leu/15 font-semibold text-leu text-[11px] uppercase shadow-sm">
                  {user.username.slice(0, 2)}
                </span>
                <span className="truncate font-medium text-ink" title={user.username}>{user.username}</span>
              </div>
              <button
                onClick={handleLogout}
                className="text-[12px] font-medium text-rosu hover:underline transition-colors"
                title="Deconectare"
              >
                Ieșire
              </button>
            </div>
          )}
          <MarketIndicators />
        </div>
      </aside>

      <div className="lg:hidden sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo className="h-8 w-8" />
            <span className="font-display text-[20px] font-bold">Leuța</span>
            {user && (
              <span className="rounded bg-line/60 px-1.5 py-0.5 text-[11px] text-ink-soft">
                {user.username}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle className="h-8 w-8" />
            {user && (
              <button onClick={handleLogout} className="px-1 py-2 text-[13px] text-rosu hover:underline">
                Ieșire
              </button>
            )}
          </div>
        </div>
        <MonthPickerCompact />
      </div>

      {/* Meniul complet (toate secțiunile + indicatori) — se deschide din tab-ul „Mai mult”. */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end bg-ink/30 backdrop-blur-[2px]" onClick={() => setOpen(false)}>
          <div
            className="page-enter max-h-[85vh] overflow-y-auto rounded-t-[20px] border-t border-line bg-paper px-4 pt-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden />
            <div className="flex flex-col gap-4">
              {nav}
              <MarketIndicators />
            </div>
          </div>
        </div>
      )}

      <nav
        className="lg:hidden fixed inset-x-0 bottom-0 z-[60] border-t border-line bg-paper/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
        aria-label="Navigare rapidă"
      >
        <div className="grid grid-cols-5">
          {TABS.map((t) => {
            const on = active(t.href) && !open;
            return (
              <Link
                key={t.href}
                href={t.href}
                onClick={() => setOpen(false)}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${on ? "text-albastru" : "text-ink-soft"}`}
              >
                <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={on ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={t.icon} />
                </svg>
                {t.label}
              </Link>
            );
          })}
          <button
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${open || !TABS.some((t) => active(t.href)) ? "text-albastru" : "text-ink-soft"}`}
          >
            <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} />}
            </svg>
            {open ? "Închide" : "Mai mult"}
          </button>
        </div>
      </nav>

      <main key={path} className="page-enter mx-auto w-full max-w-[1240px] px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-8 lg:py-10">
        {!hasPasskey && !path.startsWith("/setari") && (
          <Link
            href="/setari"
            className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-galben/40 bg-galben-tint px-4 py-3 text-[13px] hover:border-galben"
          >
            <span>
              🔐 <strong>Protejează-ți contul cu un passkey</strong> (amprentă / Face ID). După asta, o parolă furată nu mai
              ajunge pentru a intra în aplicație.
            </span>
            <span className="shrink-0 font-semibold text-albastru">Setări →</span>
          </Link>
        )}
        {children}
      </main>
    </div>
  );
}
