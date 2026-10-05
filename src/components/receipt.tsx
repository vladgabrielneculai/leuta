"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Piesele „de bon” folosite în toată aplicația (același stil ca bonul lunar în PDF):
 * rândul cu puncte între etichetă și sumă, codul de bare decorativ și antetul cu numărul bonului.
 */

/** Generator determinist (FNV-1a + amestec), ca același text să dea mereu același cod de bare. */
function seeded(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Cod de bare decorativ (nu codifică nimic), desenat în culoarea textului. */
export function Barcode({ seed, className = "h-9 w-52" }: { seed: string; className?: string }) {
  const rand = seeded(seed);
  const bars: { x: number; w: number }[] = [];
  const W = 200;
  let x = 0;
  const bar = (w: number) => {
    bars.push({ x, w });
    x += w;
  };
  // Bare de start și de stop, ca la un cod real.
  bar(2.2); x += 1.8; bar(1.1); x += 1.8;
  while (x < W - 10) {
    bar(0.9 + Math.floor(rand() * 3) * 1);
    x += 1.1 + Math.floor(rand() * 3) * 1;
  }
  x = W - 6.1;
  bar(1.1); x += 1.8; bar(2.2);
  return (
    <svg viewBox={`0 0 ${W} 40`} preserveAspectRatio="none" className={className} aria-hidden>
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={40} fill="currentColor" />
      ))}
    </svg>
  );
}

/**
 * Rând de bon: eticheta în stânga, valoarea în dreapta, legate prin puncte.
 * Eticheta se poate rupe pe mai multe rânduri; punctele umplu doar spațiul liber de pe ultimul.
 */
export function Leader({
  label,
  value,
  sub,
  className = "",
  strong = false,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  className?: string;
  strong?: boolean;
}) {
  return (
    <div className={className}>
      <div className={`flex items-baseline gap-1.5 ${strong ? "font-semibold" : ""}`}>
        <span className="min-w-0">{label}</span>
        <span className="leader-dots min-w-[0.75rem] flex-1 sm:min-w-[1.5rem]" aria-hidden />
        <span className="num shrink-0 whitespace-nowrap text-right">{value}</span>
      </div>
      {sub && <div className="mt-0.5 text-right text-[12px] text-ink-faint num">{sub}</div>}
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Data și ora curente, doar în browser (pe server ar da altă oră decât la afișare). */
function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Antetul mărunt de deasupra titlului paginii: „BON NR. 0010 · OCT. 2026 ··· 05.10.2026 14:32”. */
export function ReceiptMeta({ month, label }: { month: string; label: string }) {
  const now = useNow();
  return (
    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-faint sm:text-[11.5px]">
      <span>
        Bon nr. {month.slice(5, 7).padStart(4, "0")} · {label}
      </span>
      <span className="num" suppressHydrationWarning>
        {now ? `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}` : " "}
      </span>
    </div>
  );
}

/** Finalul fiecărei pagini, ca la capătul bonului: mulțumiri și un cod de bare. */
export function ReceiptFooter({ seed }: { seed: string }) {
  const rand = seeded(`cod:${seed}`);
  const digits = (n: number) => Array.from({ length: n }, () => Math.floor(rand() * 10)).join("");
  const code = `LEU ${digits(4)} ${digits(6)}`;
  return (
    <footer className="mx-auto mt-12 flex max-w-xs flex-col items-center gap-2 text-ink-faint" aria-hidden>
      <div className="rule-dashed w-full" />
      <p className="mt-2 font-mono text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-soft">*** Vă mulțumim! ***</p>
      <Barcode seed={seed} className="h-10 w-56 text-ink/80" />
      <p className="font-mono text-[10.5px] tracking-[0.2em]">{code}</p>
    </footer>
  );
}
