import type { CSSProperties } from "react";

/**
 * Cifrele contului demonstrativ (aceleași ca în aplicație) și piesele mici refolosite pe prima pagină:
 * benzile bancnotelor și iconițele pe dale colorate, ca în lista de intrări din aplicație.
 */
export const DEMO = {
  income: 10080,
  fixed: 300,
  loans: 2760.72,
  budget: 4900,
  saving: 1600,
  spent: 2480.1,
  daysLeft: 20,
};

/** Culorile bancnotelor: 1, 5, 10, 50 și 100 de lei. */
export const BANDS = ["var(--c-leu)", "var(--c-mov)", "var(--c-rosu)", "var(--c-galben)", "var(--c-albastru)"];

export function NoteBands({ size = "md", className = "", style }: { size?: "xs" | "md"; className?: string; style?: CSSProperties }) {
  const bar = size === "xs" ? "h-[2px] w-2" : "h-1 w-7";
  return (
    <div className={`flex ${size === "xs" ? "gap-[3px]" : "gap-1"} ${className}`} style={style} aria-hidden>
      {BANDS.map((c) => (
        <span key={c} className={`${bar} rounded-full`} style={{ background: c }} />
      ))}
    </div>
  );
}

const ICON = {
  cart: "M3 4h2l2.4 11h10.2L20 8H6.3M9 20h.01M17 20h.01",
  car: "M5 16h14M6 16l1.5-5h9L18 16M7 19v-3M17 19v-3M8 13h.01M16 13h.01",
  coffee: "M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3",
  wallet: "M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  afford: "M3 4h2l2.4 11h10.2L20 8H6.3M9 20h.01M17 20h.01",
  budget: "M12 3a9 9 0 1 0 9 9h-9zM15 3.5A9 9 0 0 1 20.5 9H15z",
  doc: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5",
  bell: "M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4",
  euro: "M17 6a7 7 0 1 0 0 12M4 10h9M4 14h9",
  import: "M12 3v12M7 10l5 5 5-5M4 17v3h16v-3",
};
export type IconName = keyof typeof ICON;

/** Iconiță pe o dală în culoarea dată, foarte deschisă (ca în lista de intrări din aplicație). */
export function TileIcon({ icon, color, size = "md" }: { icon: IconName; color: string; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-7 w-7 rounded-lg" : "h-9 w-9 rounded-[10px]";
  const svg = size === "sm" ? "h-[15px] w-[15px]" : "h-[18px] w-[18px]";
  return (
    <span className={`flex shrink-0 items-center justify-center ${box}`} style={{ color, background: `color-mix(in srgb, ${color} 13%, var(--c-sheet))` }} aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={svg}>
        <path d={ICON[icon]} />
      </svg>
    </span>
  );
}
