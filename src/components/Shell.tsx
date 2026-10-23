"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { addMonths, currentMonth, monthLabel } from "@/lib/util";
import { api, useApp } from "./ui";
import Logo from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { ReceiptFooter } from "./receipt";
import { QuickAddProvider, useQuickAdd } from "./QuickAdd";
import { TourProvider } from "./Tour";

// Iconițe (trasee SVG 24×24) folosite în bara de jos și în meniul „Mai mult” de pe telefon.
const ICON = {
  home: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  month: "M4 6h16M4 12h16M4 18h10",
  loans: "M3 7h18v10H3zM3 11h18M7 15h3",
  savings: "M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.6 5 3 5 1.1 5 3-2.2 3-5 3-5-1.1-5-3",
  afford: "M3 4h2l2.4 11h10.2L20 8H6.3M9 20h.01M17 20h.01",
  trips: "M4 8h16v11H4zM9 8V5h6v3M4 13h16M10 13v2h4v-2",
  budget: "M12 3a9 9 0 1 0 9 9h-9zM15 3.5A9 9 0 0 1 20.5 9H15z",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6",
  settings: "M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4",
  admin: "M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z",
  import: "M12 3v12M7 10l5 5 5-5M4 17v3h16v-3",
  repeat: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
};

type NavItem = { href: string; label: string; color: string; icon: string };

const NAV_DAILY: NavItem[] = [
  { href: "/", label: "Panou", color: "var(--c-albastru)", icon: ICON.home },
  { href: "/luna", label: "Luna curentă", color: "var(--c-leu)", icon: ICON.month },
];
// Funcționalități noi, vizibile doar pe versiunea beta (după „Luna curentă”).
const BETA_NAV: NavItem[] = [
  { href: "/import", label: "Import extras", color: "var(--c-mov)", icon: ICON.import },
  { href: "/abonamente", label: "Abonamente", color: "var(--c-galben)", icon: ICON.repeat },
];
const NAV_PLAN: NavItem[] = [
  { href: "/credite", label: "Credite", color: "var(--c-mov)", icon: ICON.loans },
  { href: "/economii", label: "Economii", color: "var(--c-galben)", icon: ICON.savings },
  { href: "/vacante", label: "Vacanțe", color: "var(--c-albastru)", icon: ICON.trips },
  { href: "/achizitii", label: "Îmi permit?", color: "var(--c-albastru)", icon: ICON.afford },
  { href: "/buget", label: "Metode de buget", color: "var(--c-rosu)", icon: ICON.budget },
];
const NAV_ACCOUNT: NavItem[] = [
  { href: "/profil", label: "Profilul meu", color: "var(--c-leu)", icon: ICON.profile },
  { href: "/setari", label: "Setări", color: "var(--c-ink-faint)", icon: ICON.settings },
];
// Vizibil doar administratorului: invitații și lista conturilor.
const ADMIN_NAV: NavItem = { href: "/admin", label: "Administrare", color: "var(--c-mov)", icon: ICON.admin };

/**
 * Meniul e împărțit în trei grupuri mici în loc de o listă lungă: ce folosești zilnic,
 * instrumentele de planificare și contul. Grupurile se citesc mai ușor decât 8–11 intrări la rând.
 */
function navGroups(beta: boolean, admin: boolean): { title: string | null; items: NavItem[] }[] {
  return [
    { title: null, items: [...NAV_DAILY, ...(beta ? BETA_NAV : [])] },
    { title: "Planificare", items: NAV_PLAN },
    { title: "Cont", items: [...NAV_ACCOUNT, ...(admin ? [ADMIN_NAV] : [])] },
  ];
}

function Icon({ d, className = "h-[21px] w-[21px]", strokeWidth = 1.7 }: { d: string; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

type StatusUser = { id: number; username: string; isAdmin: boolean; firstName: string };

function MonthPicker() {
  const { month, setMonth } = useApp();
  const isNow = month === currentMonth();
  return (
    <div className="panel p-3" data-tour="month">
      <div className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">Luna analizată</div>
      <div className="mt-1 flex items-center justify-between gap-1">
        <button className="btn-ghost px-2 active:scale-95" onClick={() => setMonth(addMonths(month, -1))} aria-label="Luna anterioară">‹</button>
        <span className="whitespace-nowrap font-display text-[14.5px] font-semibold capitalize text-ink">{monthLabel(month)}</span>
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

/** Varianta compactă, în mijlocul barei de sus pe telefon: luna analizată e mereu vizibilă. */
function MonthPickerCompact() {
  const { month, setMonth } = useApp();
  const isNow = month === currentMonth();
  return (
    <div className="flex min-w-0 flex-1 items-center justify-center" data-tour="month">
      <button className="h-10 w-10 shrink-0 rounded-full text-[20px] text-ink-soft active:scale-95 active:bg-sheet" onClick={() => setMonth(addMonths(month, -1))} aria-label="Luna anterioară">‹</button>
      <button
        className="flex min-w-0 flex-col items-center px-1 leading-tight"
        onClick={() => !isNow && setMonth(currentMonth())}
        title={isNow ? undefined : "Înapoi la luna curentă"}
      >
        <span className="truncate font-display text-[14.5px] font-semibold capitalize text-ink">{monthLabel(month)}</span>
        {!isNow && <span className="text-[11px] font-medium text-albastru">înapoi la azi</span>}
      </button>
      <button className="h-10 w-10 shrink-0 rounded-full text-[20px] text-ink-soft active:scale-95 active:bg-sheet" onClick={() => setMonth(addMonths(month, 1))} aria-label="Luna următoare">›</button>
    </div>
  );
}

// Bara de jos pe telefon: Panou și Luna în stânga, „+ Adaugă” la mijloc (acțiunea zilnică),
// Credite și „Mai mult” (toate secțiunile) în dreapta.
const TABS_LEFT = [
  { href: "/", label: "Panou", icon: ICON.home },
  { href: "/luna", label: "Luna", icon: ICON.month },
];
const TABS_RIGHT = [{ href: "/credite", label: "Credite", icon: ICON.loans }];
const TABS = [...TABS_LEFT, ...TABS_RIGHT];

const SECURITY_SNOOZE = "leuta-securitate-amanat";
const SNOOZE_DAYS = 14;

/** Butonul „+” din mijlocul barei de jos: deschide adăugarea rapidă. */
function AddTab({ onOpen }: { onOpen: () => void }) {
  const quickAdd = useQuickAdd();
  return (
    <div className="flex justify-center">
      <button
        onClick={() => {
          onOpen();
          quickAdd();
        }}
        className="flex flex-col items-center gap-0.5 pb-2 pt-1 text-[11px] font-semibold text-ink"
        aria-label="Adaugă o intrare"
        data-tour="add"
      >
        <span className="-mt-4 flex h-11 w-11 items-center justify-center rounded-full bg-ink text-sheet shadow-[0_3px_10px_rgb(var(--shadow)/0.3)] ring-4 ring-paper transition-transform active:scale-90">
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

function MarketIndicators() {
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<StatusUser | null>(null);
  const [secured, setSecured] = useState(true);
  const [beta, setBeta] = useState(false);
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
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

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
                onClick={() => setOpen(false)}
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

  // „Mai mult” e activ când meniul e deschis sau pagina curentă nu are tab propriu (ex. Economii, Setări).
  const moreOn = open || !TABS.some((t) => active(t.href));
  const tab = (t: { href: string; label: string; icon: string }) => {
    const on = active(t.href) && !open;
    return (
      <Link
        key={t.href}
        href={t.href}
        onClick={() => setOpen(false)}
        aria-current={on ? "page" : undefined}
        className={`flex flex-col items-center gap-0.5 pt-1.5 pb-2 text-[11px] font-medium transition-colors ${on ? "text-ink" : "text-ink-faint"}`}
      >
        <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${on ? "bg-ink/8" : ""}`}>
          <Icon d={t.icon} strokeWidth={on ? 2.2 : 1.7} />
        </span>
        {t.label}
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

      {/* Pe telefon, bara de sus are un singur rând: sigla, luna analizată și profilul.
          Tema se schimbă din „Mai mult”. */}
      <div className="lg:hidden sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur-sm px-3 pb-1.5 pt-[max(0.375rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-1">
          <Link href="/" className="relative flex shrink-0 items-center" aria-label="Leuța — Panou">
            <Logo className="h-8 w-8" />
            {beta && <span className="absolute -bottom-1 -right-2 rounded-full bg-mov px-1 text-[8.5px] font-bold uppercase leading-[13px] tracking-wider text-sheet" title="Versiunea de test">Beta</span>}
          </Link>
          <MonthPickerCompact />
          {user ? (
            <Link
              href="/profil"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-leu/15 text-[12px] font-semibold uppercase text-leu active:scale-95"
              title="Profilul meu"
              aria-label="Profilul meu"
            >
              {initials(user)}
            </Link>
          ) : (
            <span className="h-9 w-9 shrink-0" aria-hidden />
          )}
        </div>
      </div>

      {/* Meniul complet (toate secțiunile + indicatori) — se deschide din tab-ul „Mai mult”. */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end bg-ink/30 backdrop-blur-[2px] animate-backdrop-fade" onClick={() => setOpen(false)}>
          <div
            className="sheet-up max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-[20px] border-t border-line bg-paper px-4 pt-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden />
            <div className="flex flex-col gap-4">
              {/* Pe telefon, secțiunile sunt dale cu iconiță: se recunosc dintr-o privire și se ating ușor. */}
              <nav className="flex flex-col gap-3" aria-label="Toate secțiunile">
                {groups.map((g) => (
                  <div key={g.title ?? "zilnic"}>
                    {g.title && <div className="mb-1.5 px-1 font-mono text-[10.5px] font-medium uppercase tracking-widest text-ink-faint">{g.title}</div>}
                    <div className="grid grid-cols-3 gap-2">
                      {g.items.map((n) => {
                        const isCurrent = active(n.href);
                        return (
                          <Link
                            key={n.href}
                            href={n.href}
                            onClick={() => setOpen(false)}
                            aria-current={isCurrent ? "page" : undefined}
                            className={`flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-md border px-1 py-2.5 text-center text-[12px] font-medium leading-tight transition-colors active:scale-[0.97] ${
                              isCurrent ? "border-ink bg-sheet text-ink" : "border-line bg-sheet/70 text-ink-soft"
                            }`}
                          >
                            <span className="relative">
                              <Icon d={n.icon} className="h-6 w-6" strokeWidth={isCurrent ? 2 : 1.7} />
                              <span className="absolute -bottom-1 left-1/2 h-[3px] w-4 -translate-x-1/2 rounded-full" style={{ background: n.color }} aria-hidden />
                            </span>
                            <span className="mt-1">{n.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>
              <div className="flex items-center justify-between rounded-md border border-line bg-sheet/70 px-3 py-2 text-[13px] text-ink-soft">
                <span>Tema aplicației</span>
                <ThemeToggle />
              </div>
              <MarketIndicators />
              {user && (
                <button onClick={handleLogout} className="btn-danger w-full border border-rosu/30">
                  Ieșire din cont ({user.username})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <nav
        className="lg:hidden fixed inset-x-0 bottom-0 z-60 border-t border-line bg-paper/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
        aria-label="Navigare rapidă"
        data-tour="tabs"
      >
        <div className="grid grid-cols-5">
          {TABS_LEFT.map((t) => tab(t))}
          <AddTab onOpen={() => setOpen(false)} />
          {TABS_RIGHT.map((t) => tab(t))}
          <button
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            data-tour="more"
            className={`flex flex-col items-center gap-0.5 pt-1.5 pb-2 text-[11px] font-medium transition-colors ${moreOn ? "text-ink" : "text-ink-faint"}`}
          >
            <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${moreOn ? "bg-ink/8" : ""}`}>
              <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
                {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} />}
              </svg>
            </span>
            {open ? "Închide" : "Mai mult"}
          </button>
        </div>
      </nav>

      <main key={path} className="page-enter mx-auto w-full max-w-[1240px] px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-8 sm:pt-6 lg:py-10">
        {!secured && !securitySnoozed && !path.startsWith("/setari") && (
          <div className="mb-4 flex items-center gap-1 rounded-lg border border-galben/40 bg-galben-tint text-[13px] sm:mb-5">
            <Link href="/setari#securitate" className="flex min-w-0 flex-1 items-center justify-between gap-3 py-2.5 pl-3.5 hover:underline sm:py-3 sm:pl-4">
              <span>
                🔐 <strong>Protejează-ți contul cu autentificarea în doi pași (2FA)</strong>
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
        <ReceiptFooter seed={path} />
      </main>
    </div>
    </TourProvider>
    </QuickAddProvider>
  );
}
