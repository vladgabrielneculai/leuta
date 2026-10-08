/** Cod de bare decorativ, determinist (aceeași intrare → aceleași bare), ca la finalul bonului din aplicație. */
export default function Barcode({ value, className = "" }: { value: string; className?: string }) {
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  let seed = 0;
  for (const ch of value) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  for (let i = 0; i < 46; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const w = 1 + ((seed >>> 16) % 3);
    const gap = 1 + ((seed >>> 8) % 2);
    bars.push({ x, w });
    x += w + gap;
  }
  return (
    <svg viewBox={`0 0 ${x} 40`} preserveAspectRatio="none" className={className} aria-hidden>
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={40} fill="currentColor" />
      ))}
    </svg>
  );
}
