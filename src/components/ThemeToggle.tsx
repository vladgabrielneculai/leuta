"use client";

import { useEffect, useState } from "react";
import { currentTheme, readPref, savePref, type Theme, type ThemePref } from "@/lib/theme";

function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");
  const [pref, setPref] = useState<ThemePref>("auto");
  useEffect(() => {
    setTheme(currentTheme());
    setPref(readPref());
    const onTheme = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    const onPref = (e: Event) => setPref((e as CustomEvent<ThemePref>).detail);
    window.addEventListener("leuta-theme", onTheme);
    window.addEventListener("leuta-theme-pref", onPref);
    return () => {
      window.removeEventListener("leuta-theme", onTheme);
      window.removeEventListener("leuta-theme-pref", onPref);
    };
  }, []);
  return { theme, pref };
}

const originOf = (e: React.MouseEvent) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/** Butonul ☀️/🌙 din bara aplicației: comută între zi și noapte (alegere explicită). */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={(e) => savePref(dark ? "light" : "dark", originOf(e))}
      className={`relative flex h-9 w-9 items-center justify-center rounded-full border border-line bg-sheet text-ink-soft shadow-sm transition-all duration-200 hover:text-ink hover:shadow active:scale-90 ${className}`}
      aria-label={dark ? "Treci pe tema de zi" : "Treci pe tema de noapte"}
      title={dark ? "Tema de zi" : "Tema de noapte"}
    >
      {/* Soare și lună suprapuse: unul se rotește în cadru, celălalt iese. */}
      <svg viewBox="0 0 24 24" className={`absolute h-[18px] w-[18px] transition-all duration-500 ${dark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"}`} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      <svg viewBox="0 0 24 24" className={`absolute h-[18px] w-[18px] transition-all duration-500 ${dark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"}`} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
      </svg>
    </button>
  );
}

/** Alegerea completă (Setări): Auto / Zi / Noapte. */
export function ThemeChooser() {
  const { pref } = useTheme();
  const opts: { v: ThemePref; label: string; hint: string }[] = [
    { v: "auto", label: "🖥️ Auto", hint: "ca telefonul / calculatorul" },
    { v: "light", label: "☀️ Zi", hint: "mereu deschisă" },
    { v: "dark", label: "🌙 Noapte", hint: "mereu închisă" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tema aplicației">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={pref === o.v}
          onClick={(e) => savePref(o.v, originOf(e))}
          className={`rounded-lg border px-3 py-2.5 text-left transition-all duration-150 active:scale-[0.98] ${
            pref === o.v ? "border-albastru bg-albastru-tint text-ink shadow-sm" : "border-line bg-field text-ink-soft hover:border-line-strong hover:text-ink"
          }`}
        >
          <div className="text-[14px] font-semibold">{o.label}</div>
          <div className="text-[12px] text-ink-faint">{o.hint}</div>
        </button>
      ))}
    </div>
  );
}
