"use client";

import { useId } from "react";
import { NOTE_BRIGHT, rosette } from "@/lib/rosette";

// Trasee calculate o singură dată (sigla apare des, la mărimi mici).
const RINGS = [rosette(32, 28.5, 25, { lobes: 40, turns: 11, depth: 0.32, step: 0.05 }), rosette(32, 28.5, 19, { lobes: 30, turns: 7, depth: 0.42, step: 0.05 })];

/**
 * Sigla Leuța: o dală închisă, cu rozeta de ghioș a bancnotelor abia vizibilă în fundal, un „L”
 * al cărui picior urcă (ca un grafic care crește) și, dedesubt, cele cinci benzi în culorile bancnotelor.
 * `tile={false}` o desenează fără colțuri rotunjite (pentru iconițele pe care sistemul le decupează singur).
 */
export default function Logo({ className = "h-10 w-10", tile = true }: { className?: string; tile?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Leuța">
      <LogoArt id={id} tile={tile} />
    </svg>
  );
}

/** Conținutul siglei (fără `<svg>`), refolosit și de animația de început. */
export function LogoArt({ id, tile = true }: { id: string; tile?: boolean }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1A1C1A" />
          <stop offset="1" stopColor="#090A09" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx={tile ? 14 : 0} fill={`url(#${id}bg)`} />
      {tile && <rect x="0.4" y="0.4" width="63.2" height="63.2" rx="13.6" fill="none" stroke="#FFFFFF" strokeOpacity="0.09" strokeWidth="0.8" />}
      <g fill="none" stroke={NOTE_BRIGHT[0]} strokeWidth="0.25">
        <path d={RINGS[0]} strokeOpacity="0.3" />
        <path d={RINGS[1]} strokeOpacity="0.18" />
      </g>
      {/* „L” cu piciorul ascendent și punctul galben (50 de lei) */}
      <g transform="translate(-2 -2.5)">
        <path d="M22.5 15.5h7v22.2l13.2-6.6 2.9 6.3-17.6 8.9c-2.6 1.3-5.5-.6-5.5-3.5V15.5z" fill="#FAFAF9" />
        <circle cx="46.3" cy="27.6" r="3.1" fill={NOTE_BRIGHT[3]} />
      </g>
      {/* benzile bancnotelor: 1, 5, 10, 50, 100 lei */}
      {NOTE_BRIGHT.map((c, i) => (
        <rect key={c} x={16.3 + i * 6.6} y="51" width="5" height="2.2" rx="1.1" fill={c} />
      ))}
    </>
  );
}
