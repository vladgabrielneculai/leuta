"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "./ui";

/**
 * Tutorialul aplicației: câte un mini-tur pentru fiecare pagină, pornit la prima vizită.
 *
 * Fiecare pas evidențiază un element real din pagină (marcat cu `data-tour="…"`) și explică pe scurt ce face.
 * Pașii diferă între ecranul mare (meniul din stânga) și telefon (bara de jos), pentru că elementele stau în
 * locuri diferite. Un pas al cărui element nu se vede (ex. o secțiune goală) e sărit.
 *
 * Starea stă în preferințele utilizatorului (`user_settings`, cheie/valoare), deci se păstrează pe orice dispozitiv:
 * - `tour_active` = "1" cât timp turul e pornit: se pune la terminarea ghidului de început (conturi noi)
 *   sau din Setări → „Redă tutorialul”; conturile existente nu îl văd de la sine.
 * - `tour_seen` = paginile al căror tur a fost văzut (sau sărit), separate prin virgulă.
 */

type Device = "desktop" | "mobile";
type Step = { target?: string; title: string; text: string; device?: Device };

const WELCOME: Step = {
  title: "Bun venit în Leuța! 👋",
  text: "Îți arăt în câțiva pași unde găsești totul. Durează sub un minut și poți sări oricând.",
};

const TOURS: Record<string, Step[]> = {
  panou: [
    WELCOME,
    { target: "nav", device: "desktop", title: "Meniul", text: "Aici ai toate secțiunile, grupate: ce folosești zilnic, planificarea și contul tău." },
    { target: "tabs", device: "mobile", title: "Bara de jos", text: "Panoul, luna curentă și creditele sunt mereu la un deget distanță." },
    { target: "more", device: "mobile", title: "Mai mult", text: "Aici găsești restul secțiunilor (economii, buget, setări…), cursul euro și tema de zi sau de noapte." },
    { target: "month", title: "Luna analizată", text: "Toate paginile arată luna aleasă aici. Cu săgețile treci la luna trecută sau la următoarea." },
    { target: "add", title: "Adaugi în 2 secunde", text: "De aici treci orice cheltuială, venit sau economie: scrii suma, alegi categoria și gata." },
    { target: "band", title: "Unde merge fiecare leu", text: "Banda arată cum s-a împărțit venitul lunii: costuri fixe, rate, cheltuieli, economii și ce a rămas liber." },
    { target: "stats", title: "Cifrele cheie", text: "Cât ai cheltuit, cât ai pus deoparte, cât din venit merge pe rate și cât valorează averea ta netă.", device: "desktop" },
    { target: "stats", title: "Cifrele cheie", text: "Cât ai cheltuit, cât ai pus deoparte și cât merge pe rate. Glisează spre stânga pentru restul.", device: "mobile" },
    { target: "dash-tabs", title: "Mai multe, la o atingere", text: "Evoluția pe 12 luni, averea netă, obiectivele și creditele sunt în tab-urile de aici, ca ecranul să rămână aerisit." },
    { title: "Gata! 🎉", text: "Pe fiecare pagină nouă îți arăt pe scurt ce găsești acolo. Poți relua tutorialul oricând din Setări." },
  ],
  luna: [
    { target: "title", title: "Luna curentă", text: "Aici treci tot ce intră și iese din cont în luna aleasă, pe categorii." },
    { target: "luna-section", title: "Atinge un rând ca să-l modifici", text: "Un clic pe orice rând îl deschide pentru modificare sau ștergere. „+ Adaugă” de sub fiecare secțiune pune o intrare nouă." },
    { target: "luna-copy", title: "Copiază luna trecută", text: "Intrările marcate „lunar” (salariu, chirie, abonamente) le aduci dintr-o atingere la început de lună." },
    { target: "luna-balance", title: "Bilanțul lunii", text: "Cât a intrat, cât a ieșit și cât a rămas nealocat. Ratele creditelor se adaugă automat." },
  ],
  credite: [
    { target: "title", title: "Creditele tale", text: "Toate creditele, cu soldul, rata lunară și cât ai plătit deja." },
    { target: "credite-add", title: "Adaugă un credit", text: "Completezi datele din contract sau încarci graficul de rambursare PDF de la bancă. Ratele intră apoi singure în bugetul fiecărei luni." },
  ],
  credit: [
    { target: "title", title: "Detaliile creditului", text: "Sus vezi cifrele cheie: cât ai plătit, cât mai ai și rata următoare." },
    { target: "loan-tabs", title: "Totul pe tab-uri", text: "„Simulator” îți arată cât economisești cu plăți anticipate, „Plăți anticipate” le ține evidența, iar „Grafic rate” arată fiecare rată." },
  ],
  economii: [
    { target: "title", title: "Economii", text: "Fondul de urgență vine primul, apoi obiectivele tale: vacanță, mașină, avans pentru casă." },
    { target: "econ-fund", title: "Fondul de urgență", text: "Câte luni de cheltuieli esențiale ai acoperite. Ținta se calculează din profilul tău." },
  ],
  vacante: [{ target: "title", title: "Vacanțe", text: "Cheltuielile din concediu, în moneda locului, ținute separat de bugetul lunar." }],
  vacanta: [{ target: "title", title: "O vacanță", text: "Adaugă cheltuielile pe măsură ce le faci; vezi totalul în lei și în moneda locului." }],
  achizitii: [
    { target: "title", title: "Îmi permit?", text: "Înainte de o cumpărătură mai mare, verifici aici dacă ți-o permiți." },
    { target: "ach-form", title: "Ce vrei să cumperi", text: "Alege o sugestie sau scrie prețul, apoi cum plătești: integral sau în rate." },
    { target: "ach-verdict", title: "Verdictul", text: "Primești un răspuns clar, cu motivele lui, și vezi cât îți rămâne în economii." },
  ],
  buget: [
    { target: "title", title: "Metode de buget", text: "Aceeași lună, văzută prin patru reguli de buget diferite." },
    { target: "buget-methods", title: "Alege o metodă", text: "Cifra de lângă fiecare metodă e scorul tău: cât de aproape ești de ea luna aceasta. Cea mai potrivită e aleasă din start." },
  ],
  profil: [
    { target: "title", title: "Profilul tău", text: "Cu cât știm mai multe despre tine, cu atât recomandările sunt mai potrivite. Profilul e vizibil doar ție." },
    { target: "profil-tabs", title: "Pe secțiuni", text: "Datele personale, venitul și obiectivele sunt pe tab-uri separate. Nu uita să salvezi la final." },
  ],
  setari: [
    { target: "setari-tabs", title: "Setări", text: "Categoriile, tema, notificările, securitatea și copiile de siguranță, fiecare în tab-ul lui." },
    { target: "setari-tour", title: "Tutorialul", text: "De aici poți relua oricând turul aplicației." },
  ],
  import: [{ target: "title", title: "Import extras", text: "Încarci extrasul de cont de la bancă, iar tranzacțiile se trec singure pe categorii." }],
  abonamente: [{ target: "title", title: "Abonamente", text: "Plățile care se repetă (Netflix, telefon, sală) și când urmează următoarea." }],
};

function pageKey(path: string): string | null {
  if (path === "/") return "panou";
  if (/^\/credite\/[^/]+/.test(path)) return "credit";
  if (/^\/vacante\/[^/]+/.test(path)) return "vacanta";
  const first = path.split("/")[1];
  return first && TOURS[first] ? first : null;
}

const isDesktop = () => window.matchMedia("(min-width: 1024px)").matches;

/** Primul element vizibil cu `data-tour="name"` (meniul de pe desktop și cel de pe telefon pot avea același nume). */
function findTarget(name: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`);
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return el;
  }
  return null;
}

type TourCtx = { replay: () => Promise<void> };
const Ctx = createContext<TourCtx>({ replay: async () => undefined });

/** Pornește din nou tutorialul (din Setări): toate paginile își arată din nou turul. */
export function useTourReplay() {
  return useContext(Ctx).replay;
}

/** Pornește tutorialul pentru un cont nou (la finalul ghidului de început). Erorile nu blochează ghidul. */
export async function enableTour() {
  await api("/api/settings", "PUT", { tour_active: "1", tour_seen: "" }).catch(() => undefined);
}

export function TourProvider({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [state, setState] = useState<{ active: boolean; seen: Set<string> } | null>(null);
  const [run, setRun] = useState<{ key: string; steps: Step[] } | null>(null);

  useEffect(() => {
    api<Record<string, string>>("/api/settings")
      .then((s) => setState({ active: s.tour_active === "1", seen: new Set((s.tour_seen ?? "").split(",").filter(Boolean)) }))
      .catch(() => undefined);
  }, []);

  // La fiecare pagină nouă: dacă turul e pornit și pagina n-a fost văzută, așteptăm să se încarce conținutul,
  // apoi păstrăm doar pașii ale căror elemente se văd.
  useEffect(() => {
    setRun(null);
    const key = pageKey(path);
    if (!state?.active || !key || state.seen.has(key)) return;
    let cancelled = false;
    let tries = 0;
    const device: Device = isDesktop() ? "desktop" : "mobile";
    const candidates = TOURS[key].filter((s) => !s.device || s.device === device);
    const attempt = () => {
      if (cancelled) return;
      tries++;
      // Datele paginii vin de la server: așteptăm (cel mult ~4 s) să apară măcar primul element țintit.
      const firstTarget = candidates.find((s) => s.target)?.target;
      if (firstTarget && !findTarget(firstTarget) && tries < 20) return void setTimeout(attempt, 200);
      const steps = candidates.filter((s) => !s.target || findTarget(s.target));
      if (steps.length) setRun({ key, steps });
    };
    const t = setTimeout(attempt, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [path, state]);

  const save = useCallback((patch: Record<string, string>) => {
    api("/api/settings", "PUT", patch).catch(() => undefined);
  }, []);

  const finish = useCallback(
    (key: string) => {
      setRun(null);
      setState((s) => {
        if (!s) return s;
        const seen = new Set(s.seen).add(key);
        save({ tour_seen: [...seen].join(",") });
        return { ...s, seen };
      });
    },
    [save],
  );

  const stopAll = useCallback(() => {
    setRun(null);
    setState((s) => (s ? { ...s, active: false } : s));
    save({ tour_active: "0" });
  }, [save]);

  const replay = useCallback(async () => {
    await api("/api/settings", "PUT", { tour_active: "1", tour_seen: "" });
    setState({ active: true, seen: new Set() });
    window.location.href = "/";
  }, []);

  return (
    <Ctx.Provider value={{ replay }}>
      {children}
      {run && <TourOverlay key={`${run.key}:${path}`} steps={run.steps} onDone={() => finish(run.key)} onStopAll={stopAll} />}
    </Ctx.Provider>
  );
}

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 6;
const GAP = 12;

function TourOverlay({ steps, onDone, onStopAll }: { steps: Step[]; onDone: () => void; onStopAll: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(180);
  const step = steps[i];
  const last = i === steps.length - 1;

  // Elementul pasului curent: îl aducem în ecran, apoi îi urmărim poziția (derulare, rotirea telefonului).
  useEffect(() => {
    const el = step.target ? findTarget(step.target) : null;
    if (!el) {
      setRect(null);
      setVp({ w: window.innerWidth, h: window.innerHeight });
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fixed = (() => {
      for (let n: HTMLElement | null = el; n; n = n.parentElement) if (getComputedStyle(n).position === "fixed") return true;
      return false;
    })();
    const r0 = el.getBoundingClientRect();
    // Ce e deja în ecran (sau fix pe ecran, ca bara de jos) nu mai mutăm.
    if (!fixed && (r0.top < 70 || r0.bottom > window.innerHeight - 90)) {
      el.scrollIntoView({ block: r0.height > window.innerHeight * 0.6 ? "start" : "center", behavior: reduced ? "auto" : "smooth" });
    }
    let raf = 0;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      setVp({ w: window.innerWidth, h: window.innerHeight });
    };
    const loop = () => {
      measure();
      raf = requestAnimationFrame(loop);
    };
    // Cât timp se derulează lin, urmărim elementul cadru cu cadru; apoi doar la derulare / redimensionare.
    loop();
    const stopLoop = setTimeout(() => cancelAnimationFrame(raf), 700);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(stopLoop);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [step]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
    cardRef.current?.focus({ preventScroll: true });
  }, [i, rect === null]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
      else if (e.key === "ArrowRight") last ? onDone() : setI((x) => x + 1);
      else if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last, onDone]);

  if (typeof document === "undefined") return null;

  // Unde stă fereastra cu explicația: sub element, deasupra lui, lângă el (ecran mare) sau jos, pe toată lățimea.
  const w = Math.min(360, vp.w - 32);
  let pos: React.CSSProperties;
  if (!rect) {
    pos = { left: (vp.w - w) / 2, top: Math.max(16, (vp.h - cardH) / 2) };
  } else {
    const below = rect.top + rect.height + PAD + GAP;
    const above = rect.top - PAD - GAP - cardH;
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - w / 2), vp.w - w - 16);
    const right = rect.left + rect.width + PAD + GAP;
    // Elementele înguste de pe ecran mare (meniul din stânga): explicația stă alături, nu peste ele.
    // Pe telefon, explicația nu coboară peste bara de navigare de jos (decât dacă chiar ea e evidențiată).
    const floor = vp.w < 1024 && rect.top < vp.h - 90 ? vp.h - 84 : vp.h - 16;
    if (rect.width < vp.w / 4 && right + w < vp.w - 16) pos = { left: right, top: Math.min(Math.max(16, rect.top), vp.h - cardH - 16) };
    else if (below + cardH < floor) pos = { left, top: below };
    else if (above > 16) pos = { left, top: above };
    else if (right + w < vp.w - 16) pos = { left: right, top: Math.min(Math.max(16, rect.top), vp.h - cardH - 16) };
    else pos = { left: (vp.w - w) / 2, top: vp.h - cardH - 16 };
  }

  return createPortal(
    <div className="fixed inset-0 z-[120]" aria-live="polite">
      {/* Fundalul întunecat blochează clicurile în pagină; „gaura” din jurul elementului e doar vizuală. */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-[10px] ring-2 ring-sheet/80 transition-all duration-300 ease-out motion-reduce:transition-none"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 200vmax rgb(20 18 14 / 0.58)",
          }}
          aria-hidden
        />
      ) : (
        <div className="absolute inset-0 bg-[rgb(20_18_14/0.58)] animate-backdrop-fade" aria-hidden />
      )}

      <div
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="absolute rounded-[8px] border border-line bg-sheet p-4 shadow-2xl outline-none transition-[top,left] duration-300 ease-out motion-reduce:transition-none"
        style={{ ...pos, width: w }}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex gap-1" aria-hidden>
            {steps.map((_, k) => (
              <span key={k} className={`h-1 rounded-full transition-all ${k === i ? "w-5 bg-leu" : "w-1.5 bg-line-strong"}`} />
            ))}
          </div>
          <span className="font-mono text-[11px] text-ink-faint">
            {i + 1} / {steps.length}
          </span>
        </div>
        <h2 id="tour-title" className="font-display text-[16px] font-semibold leading-snug text-ink">{step.title}</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft">{step.text}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" className="text-[12.5px] text-ink-faint hover:text-ink hover:underline" onClick={i === 0 && steps.length > 1 ? onStopAll : onDone}>
            {i === 0 && steps.length > 1 ? "Fără tutorial" : "Sari peste"}
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <button type="button" className="btn-ghost border border-line px-3 py-1.5 text-[13px]" onClick={() => setI(i - 1)}>
                Înapoi
              </button>
            )}
            <button type="button" className="btn-primary px-4 py-1.5 text-[13px]" onClick={() => (last ? onDone() : setI(i + 1))} autoFocus>
              {last ? "Am înțeles" : "Următorul"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
