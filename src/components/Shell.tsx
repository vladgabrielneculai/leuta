"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { addMonths, monthLabel } from "@/lib/util";
import { cycleActive, rangeLabel } from "@/lib/payCycle";
import { api, useApp } from "./ui";
import Logo from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { QuickAddProvider, useQuickAdd } from "./QuickAdd";
import { TourProvider } from "./Tour";
import { ICON, MONTH_PAGES, navGroups, parentOf, PLAN_HREFS, ACCOUNT_HREFS, sectionLabel, within } from "./nav";

export function Icon({ d, className = "h-[21px] w-[21px]", strokeWidth = 1.7 }: { d: string; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

type StatusUser = { id: number; username: string; isAdmin: boolean; firstName: string };

function MonthPicker() {
  const { month, setMonth, nowMonth, cycle } = useApp();
  const isNow = month === nowMonth;
  const range = cycleActive(cycle) ? rangeLabel(month, cycle) : null;
  return (
    <div className="panel p-3" data-tour="month">
      <div className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">Luna analizată</div>
      <div className="mt-1 flex items-center justify-between gap-1">
        <button className="btn-ghost px-2 active:scale-95" onClick={() => setMonth(addMonths(month, -1))} aria-label="Luna anterioară">‹</button>
        <span className="whitespace-nowrap font-display text-[14.5px] font-semibold capitalize text-ink">{monthLabel(month)}</span>
        <button className="btn-ghost px-2 active:scale-95" onClick={() => setMonth(addMonths(month, 1))} aria-label="Luna următoare">›</button>
      </div>
      {range && <div className="text-center text-[11.5px] text-ink-faint" title="Luna de buget începe în ziua salariului">{range}</div>}
      {!isNow && (
        <button className="mt-1.5 w-full text-[12px] font-medium text-albastru hover:underline transition-colors" onClick={() => setMonth(nowMonth)}>
          Înapoi la luna curentă
        </button>
      )}
    </div>
  );
}

/** Varianta compactă, în mijlocul barei de sus pe telefon: luna analizată e mereu vizibilă. */
function MonthPickerCompact() {
  const { month, setMonth, nowMonth, cycle } = useApp();
  const isNow = month === nowMonth;
  const range = cycleActive(cycle) ? rangeLabel(month, cycle) : null;
  // Glisarea orizontală pe alegerea lunii schimbă luna (spre stânga: luna următoare), ca pe un calendar.
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      className="flex min-w-0 flex-1 touch-pan-y items-center justify-center"
      data-tour="month"
      onTouchStart={(e) => (start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const s0 = start.current;
        start.current = null;
        if (!s0) return;
        const dx = e.changedTouches[0].clientX - s0.x;
        const dy = e.changedTouches[0].clientY - s0.y;
        if (Math.abs(dx) > 40 && Math.abs(dy) < 30) setMonth(addMonths(month, dx < 0 ? 1 : -1));
      }}
    >
      <button className="h-10 w-10 shrink-0 rounded-full text-[20px] text-ink-soft active:scale-95 active:bg-sheet" onClick={() => setMonth(addMonths(month, -1))} aria-label="Luna anterioară">‹</button>
      <button
        className="flex min-w-0 flex-col items-center px-1 leading-tight"
        onClick={() => !isNow && setMonth(nowMonth)}
        title={isNow ? undefined : "Înapoi la luna curentă"}
      >
        <span className="truncate font-display text-[14.5px] font-semibold capitalize text-ink">{monthLabel(month)}</span>
        {!isNow ? (
          <span className="text-[11px] font-medium text-albastru">înapoi la azi</span>
        ) : (
          range && <span className="text-[11px] text-ink-faint">{range}</span>
        )}
      </button>
      <button className="h-10 w-10 shrink-0 rounded-full text-[20px] text-ink-soft active:scale-95 active:bg-sheet" onClick={() => setMonth(addMonths(month, 1))} aria-label="Luna următoare">›</button>
    </div>
  );
}

// Bara de jos pe telefon: Acasă și Luna în stânga, „+ Adaugă” la mijloc (acțiunea zilnică),
// apoi cele două hub-uri: „Planuri” (credite, economii, vacanțe…) și „Eu” (profil, setări, temă, ieșire).
// Fiecare tab e activ și pe paginile din „grupul” lui.
type Tab = { href: string; label: string; icon: string; group: string[] };
const TABS_LEFT: Tab[] = [
  { href: "/", label: "Acasă", icon: ICON.home, group: ["/"] },
  { href: "/luna", label: "Luna", icon: ICON.month, group: ["/luna"] },
];
const TABS_RIGHT: Tab[] = [
  { href: "/planuri", label: "Planuri", icon: ICON.plans, group: PLAN_HREFS },
  { href: "/eu", label: "Eu", icon: ICON.profile, group: ACCOUNT_HREFS },
];

const SECURITY_SNOOZE = "leuta-securitate-amanat";
const SNOOZE_DAYS = 14;

/** Butonul „+” din mijlocul barei de jos: deschide adăugarea rapidă. */
function AddTab() {
  const quickAdd = useQuickAdd();
  return (
    <div className="flex justify-center">
      <button
        onClick={() => quickAdd()}
        className="flex flex-col items-center gap-0.5 pb-2 pt-1 text-[11px] font-semibold text-ink"
        aria-label="Adaugă o intrare"
        data-tour="add"
      >
        {/* Butonul principal are culoarea accentului (verdele bancnotei de 1 leu). */}
        <span className="-mt-3 flex h-10 w-11 items-center justify-center rounded-[14px] bg-leu text-on-accent shadow-[0_4px_12px_rgb(var(--leu)/0.35)] transition-transform active:scale-90">
          <Icon d="M12 5v14M5 12h14" className="h-6 w-6" strokeWidth={2.4} />
        </span>
        Adaugă
      </button>
    </div>
  );
}

/** Cursul BNR și inflația, pe un singur rând compact (detaliile apar la trecerea cu mouse-ul). */
/** Pe ecran mare, același „+ Adaugă” ca în bara de jos de pe telefon, sub luna analizată. */
function AddButton() {
  const quickAdd = useQuickAdd();
  return (
    <button onClick={() => quickAdd()} className="btn-primary w-full gap-2 py-2.5" data-tour="add">
      <Icon d="M12 5v14M5 12h14" className="h-4 w-4" strokeWidth={2.4} />
      Adaugă o intrare
    </button>
  );
}

export function MarketIndicators() {
  const { eurRate, fxDate, fxError, refreshFx, inflationRate, inflationPeriod, inflationError, refreshInflation } = useApp();
  const formattedPeriod = inflationPeriod ? monthLabel(inflationPeriod) : "an curent";
  const failed = fxError || inflationError;
  return (
    <div className="flex items-center gap-2 rounded-md border border-line bg-sheet/60 px-3 py-2 text-[12px]">
      <span className="live-dot shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-ink-soft" title={`Curs BNR ${fxDate ? fxDate.split("-").reverse().join(".") : "estimativ"} · inflație INS ${formattedPeriod}`}>
        <span className="num font-semibold text-ink">€ {eurRate.toFixed(4)}</span>
        <span className="mx-1.5 text-ink-faint">·</span>
        infl. <span className="num font-semibold text-rosu">{inflationRate.toFixed(1)}%</span>
      </span>
      <button
        onClick={() => {
          refreshFx();
          refreshInflation();
        }}
        className={`shrink-0 transition-colors hover:text-albastru ${failed ? "text-rosu" : "text-ink-faint"}`}
        title={failed ? "Eroare de sincronizare. Reîncearcă" : "Actualizează cursul și inflația"}
        aria-label="Actualizează cursul și inflația"
      >
        ↻
      </button>
    </div>
  );
}

function initials(u: StatusUser) {
  return (u.firstName || u.username).slice(0, 2);
}

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [user, setUser] = useState<StatusUser | null>(null);
  const [secured, setSecured] = useState(true);
  const { beta, setBeta } = useApp();
  // Îndemnul spre 2FA poate fi amânat (câteva zile), ca să nu ocupe mereu partea de sus a ecranului.
  const [securitySnoozed, setSecuritySnoozed] = useState(true);
  useEffect(() => {
    try {
      const until = Number(localStorage.getItem(SECURITY_SNOOZE) || 0);
      setSecuritySnoozed(until > Date.now());
    } catch {
      setSecuritySnoozed(false);
    }
  }, []);
  const snoozeSecurity = () => {
    setSecuritySnoozed(true);
    try {
      localStorage.setItem(SECURITY_SNOOZE, String(Date.now() + SNOOZE_DAYS * 86_400_000));
    } catch {}
  };
  const isAuthPage = path === "/login" || path === "/setup" || path === "/inregistrare" || path === "/resetare";
  // Ghidul de început ocupă tot ecranul, fără meniul aplicației.
  const isFocusPage = path === "/bun-venit";
  // Paginile protejate ajung în browser doar cu sesiune validă (verificată pe server în proxy.ts),
  // deci nu mai blocăm randarea cu ecranul de încărcare: datele paginii pornesc imediat,
  // în paralel cu cererea de status (care aduce doar numele utilizatorului).
  const [checking, setChecking] = useState(false);
  const active = (href: string) => within(path, href);
  const parent = parentOf(path);
  const showMonth = MONTH_PAGES.includes(path);

  useEffect(() => {
    api<{ setupNeeded: boolean; authenticated: boolean; user: StatusUser | null; secured?: boolean; onboardingPending?: boolean; beta?: boolean }>("/api/auth/status")
      .then((res) => {
        setBeta(!!res.beta);
        if (res.setupNeeded) {
          if (path !== "/setup") window.location.replace("/setup");
        } else if (!res.authenticated) {
          if (path !== "/login" && path !== "/inregistrare" && path !== "/resetare") window.location.replace("/login");
        } else {
          setUser(res.user);
          setSecured(res.secured !== false);
          if (isAuthPage) window.location.replace(res.onboardingPending ? "/bun-venit" : "/");
          // Un cont nou trece întâi prin ghidul de început (îl poate amâna de acolo).
          else if (res.onboardingPending && path !== "/bun-venit") window.location.replace("/bun-venit");
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

  if (isAuthPage || isFocusPage) {
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

  const groups = navGroups(beta, !!user?.isAdmin);
  const nav = (
    <nav className="flex flex-col gap-4" aria-label="Navigare principală" data-tour="nav">
      {groups.map((g) => (
        <div key={g.title ?? "zilnic"} className="flex flex-col gap-0.5">
          {g.title && <div className="px-3 pb-1 font-mono text-[10.5px] font-medium uppercase tracking-widest text-ink-faint">{g.title}</div>}
          {g.items.map((n) => {
            const isCurrent = active(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`group flex items-center gap-2.5 rounded-md px-3 py-[7px] text-[14px] font-medium transition-all duration-150 active:scale-[0.99] ${
                  isCurrent
                    ? "bg-sheet text-ink shadow-[0_1px_2px_rgb(var(--shadow)/0.12)]"
                    : "text-ink-soft hover:bg-sheet/60 hover:text-ink"
                }`}
              >
                <span className="relative flex">
                  <Icon d={n.icon} className="h-[18px] w-[18px]" strokeWidth={isCurrent ? 2 : 1.7} />
                </span>
                <span>{n.label}</span>
                {isCurrent && <span className="ml-auto h-4 w-1.5 rounded-full" style={{ background: n.color }} aria-hidden />}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const tab = (t: Tab) => {
    const on = t.group.some((h) => within(path, h));
    return (
      <Link
        key={t.href}
        href={t.href}
        data-tour={t.href === "/planuri" ? "plans" : t.href === "/eu" ? "me" : undefined}
        aria-current={on ? "page" : undefined}
        className={`flex flex-col items-center gap-0.5 pt-1.5 pb-2 text-[11px] font-medium transition-colors ${on ? "text-ink" : "text-ink-faint"}`}
      >
        <span className="flex h-7 w-12 items-center justify-center">
          <Icon d={t.icon} strokeWidth={on ? 2.1 : 1.6} />
        </span>
        {t.label}
        {/* Tab-ul activ: o linie scurtă verde sub etichetă. */}
        <span className={`h-[2px] w-3.5 rounded-full transition-colors ${on ? "bg-leu" : "bg-transparent"}`} aria-hidden />
      </Link>
    );
  };

  return (
    <QuickAddProvider>
    <TourProvider>
    <div className="min-h-screen overflow-x-clip lg:grid lg:grid-cols-[256px_1fr]">
      {/* Meniul lateral are înălțimea ecranului; pe ecrane joase (sau cu zoom) se derulează separat de pagină,
          ca indicatorii de jos (cursul EUR, inflația) să rămână accesibili. */}
      <aside className="hidden lg:flex lg:flex-col lg:gap-6 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:overscroll-contain border-r border-line bg-canvas/60 px-4 py-6">
        <div className="flex items-start justify-between gap-2 px-1.5">
          <Link href="/" className="group flex items-center gap-2.5">
            <Logo className="h-10 w-10 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105" />
            <div>
              <div className="flex items-center gap-1.5 font-display text-[22px] font-bold leading-none tracking-[-0.03em] text-ink transition-colors group-hover:text-leu">
                Leuța
                {beta && <span className="rounded-full bg-mov/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-mov" title="Versiunea de test">Beta</span>}
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
        <div className="flex flex-col gap-2.5">
          <MonthPicker />
          <AddButton />
        </div>
        {nav}
        <div className="mt-auto flex flex-col gap-3 px-1">
          {user && (
            <div className="flex items-center justify-between border-t border-line/80 pt-3 text-[13px]">
              <Link href="/profil" className="flex min-w-0 items-center gap-2 truncate hover:text-leu" title="Profilul meu">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-leu/15 font-semibold text-leu text-[11px] uppercase shadow-xs">
                  {initials(user)}
                </span>
                <span className="truncate font-medium text-ink">{user.firstName || user.username}</span>
              </Link>
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

      {/* Pe telefon, bara de sus are un singur rând. Pe Acasă, Luna și Buget arată luna analizată (glisezi ca s-o schimbi);
          pe celelalte pagini, numele secțiunii. Pe subpagini, sigla devine „‹ Înapoi” spre pagina-părinte. */}
      <div className="lg:hidden sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur-sm px-3 pb-1.5 pt-[max(0.375rem,env(safe-area-inset-top))]">
        <div className="flex min-h-10 items-center justify-between gap-1">
          {parent ? (
            <Link href={parent.href} className="flex h-10 w-16 shrink-0 items-center gap-0.5 text-[14px] font-medium text-ink-soft active:text-ink" aria-label={`Înapoi la ${parent.label}`}>
              <span className="text-[22px] leading-none" aria-hidden>‹</span>
              <span className="truncate">{parent.label}</span>
            </Link>
          ) : (
            <Link href="/" className="relative flex w-16 shrink-0 items-center" aria-label="Leuța — Acasă">
              <span className="flex flex-col items-start gap-[3px]">
                <span className="font-display text-[18px] font-bold leading-none tracking-[-0.05em] text-ink">Leuța</span>
                {/* Cele cinci liniuțe în culorile bancnotelor (1, 5, 10, 50, 100 lei), semnul Leuței. */}
                <span className="flex gap-[2px]" aria-hidden>
                  {["var(--c-leu)", "var(--c-mov)", "var(--c-rosu)", "var(--c-galben)", "var(--c-albastru)"].map((c) => (
                    <span key={c} className="h-[2px] w-[6px] rounded-full" style={{ background: c }} />
                  ))}
                </span>
              </span>
              {beta && <span className="absolute left-[50px] -top-0.5 rounded-full bg-mov px-1 text-[8.5px] font-bold uppercase leading-[13px] tracking-wider text-sheet" title="Versiunea de test">Beta</span>}
            </Link>
          )}
          {showMonth ? (
            <MonthPickerCompact />
          ) : (
            <span className="min-w-0 flex-1 truncate text-center font-display text-[15px] font-semibold text-ink">{sectionLabel(path) ?? "Leuța"}</span>
          )}
          <span className="w-16 shrink-0" aria-hidden />
        </div>
      </div>

      <nav
        className="lg:hidden fixed inset-x-0 bottom-0 z-60 border-t border-line bg-paper/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
        aria-label="Navigare rapidă"
        data-tour="tabs"
      >
        <div className="grid grid-cols-5">
          {TABS_LEFT.map((t) => tab(t))}
          <AddTab />
          {TABS_RIGHT.map((t) => tab(t))}
        </div>
      </nav>

      <main key={path} className="page-enter mx-auto w-full max-w-[1240px] px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-8 sm:pt-6 lg:py-10">
        {!secured && !securitySnoozed && !path.startsWith("/setari") && (
          // Pe telefon, îndemnul apare doar pe Acasă, nu deasupra fiecărei pagini.
          <div className={`mb-4 items-center gap-1 rounded-lg border border-galben/40 bg-galben-tint text-[13px] sm:mb-5 ${path === "/" ? "flex" : "hidden lg:flex"}`}>
            <Link href="/setari#securitate" className="flex min-w-0 flex-1 items-center justify-between gap-3 py-2.5 pl-3.5 hover:underline sm:py-3 sm:pl-4">
              <span>
                <strong>Protejează-ți contul cu autentificarea în doi pași (2FA)</strong>
                <span className="hidden sm:inline">
                  . După asta, o parolă furată nu mai ajunge pentru a intra în aplicație.
                </span>
              </span>
              <span className="shrink-0 font-semibold text-albastru">Setări →</span>
            </Link>
            <button
              onClick={snoozeSecurity}
              className="flex h-11 w-11 shrink-0 items-center justify-center text-[15px] text-ink-faint hover:text-ink"
              aria-label={`Amână ${SNOOZE_DAYS} zile`}
              title={`Amână ${SNOOZE_DAYS} zile`}
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
    </TourProvider>
    </QuickAddProvider>
  );
}
