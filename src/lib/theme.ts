/**
 * Tema aplicației: „auto” urmează sistemul (zi/noapte), „light”/„dark” o forțează.
 * Alegerea se ține minte pe dispozitiv (localStorage). Atributul data-theme de pe <html> e pus încă
 * înainte de prima randare de scriptul din layout.tsx (THEME_BOOT_SCRIPT), deci nu există „flash” alb.
 */

export type ThemePref = "auto" | "light" | "dark";
export type Theme = "light" | "dark";

export const THEME_KEY = "leuta-tema";
export const THEME_COLORS: Record<Theme, string> = { light: "#EAE5DB", dark: "#100F0D" };

/** Rulat inline în <head>, înainte de CSS/React. Fără dependențe; erorile → tema deschisă. */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}")||"auto";var d=p==="dark"||(p==="auto"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light");}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;

const systemDark = () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

export function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function resolve(pref: ThemePref): Theme {
  return pref === "dark" || (pref === "auto" && systemDark()) ? "dark" : "light";
}

export function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function setMetaColor(theme: Theme) {
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", THEME_COLORS[theme]));
}

function setAttr(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  setMetaColor(theme);
  window.dispatchEvent(new CustomEvent("leuta-theme", { detail: theme }));
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Schimbă tema cu animație: pe browserele cu View Transitions, noua temă se extinde ca un cerc din punctul
 * apăsat; altfel, culorile se estompează lin (clasa theme-fade din globals.css).
 */
export function applyTheme(theme: Theme, origin?: { x: number; y: number }) {
  if (theme === currentTheme()) return setMetaColor(theme);
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  if (reducedMotion()) return setAttr(theme);
  if (doc.startViewTransition && origin) {
    const t = doc.startViewTransition(() => setAttr(theme));
    const r = Math.hypot(Math.max(origin.x, innerWidth - origin.x), Math.max(origin.y, innerHeight - origin.y));
    t.ready
      .then(() =>
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${r}px at ${origin.x}px ${origin.y}px)`] },
          { duration: 520, easing: "cubic-bezier(.2,.7,.2,1)", pseudoElement: "::view-transition-new(root)" },
        ),
      )
      .catch(() => undefined);
    return;
  }
  const root = document.documentElement;
  root.classList.add("theme-fade");
  setAttr(theme);
  window.setTimeout(() => root.classList.remove("theme-fade"), 450);
}

export function savePref(pref: ThemePref, origin?: { x: number; y: number }) {
  try {
    if (pref === "auto") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // stocare indisponibilă (mod privat): tema rămâne doar pentru sesiunea curentă
  }
  applyTheme(resolve(pref), origin);
  window.dispatchEvent(new CustomEvent("leuta-theme-pref", { detail: pref }));
}

/** În modul „auto”, urmărește schimbarea temei sistemului (ex. seara pe telefon). */
export function watchSystemTheme() {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (readPref() === "auto") applyTheme(mq.matches ? "dark" : "light");
  };
  mq.addEventListener("change", onChange);
  setMetaColor(currentTheme());
  return () => mq.removeEventListener("change", onChange);
}
