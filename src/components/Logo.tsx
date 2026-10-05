"use client";

import { useId } from "react";

/**
 * Sigla Leuța: o monedă verde (bancnota de 1 leu) cu chenar guilloche — liniile fine de pe bancnote —
 * și un „L” al cărui picior urcă, ca un grafic care crește.
 */
export default function Logo({ className = "h-10 w-10" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Leuța">
      <defs>
        <linearGradient id={`${id}g`} x1="10" y1="6" x2="54" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5FA374" />
          <stop offset="0.55" stopColor="#3D7A4E" />
          <stop offset="1" stopColor="#24502F" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="32" y1="2" x2="32" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.35" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill={`url(#${id}g)`} />
      {/* chenar guilloche: două inele punctate decalate */}
      <circle cx="32" cy="32" r="26.5" fill="none" stroke="#F3EBD3" strokeOpacity="0.55" strokeWidth="1.1" strokeDasharray="1.6 2.2" />
      <circle cx="32" cy="32" r="24.6" fill="none" stroke="#F3EBD3" strokeOpacity="0.3" strokeWidth="0.8" strokeDasharray="2.4 1.4" />
      {/* lumină de monedă */}
      <ellipse cx="32" cy="18" rx="22" ry="13" fill={`url(#${id}s)`} />
      {/* „L” cu piciorul ascendent */}
      <path
        d="M22.5 15.5h7v22.2l13.2-6.6 2.9 6.3-17.6 8.9c-2.6 1.3-5.5-.6-5.5-3.5V15.5z"
        fill="#F7F0DA"
      />
      <circle cx="46.3" cy="27.6" r="3.1" fill="#E4B74C" />
    </svg>
  );
}
