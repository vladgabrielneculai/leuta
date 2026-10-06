/**
 * Codul de bare decorativ de pe bonuri (aplicație, imaginea de pe Telegram, email). Nu codifică nimic:
 * barele vin dintr-un generator determinist, deci același text dă mereu același cod.
 */

/** Generator determinist (FNV-1a + amestec). */
export function seeded(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export type BarcodeBar = { x: number; w: number };

/** Barele unui cod lat de `width` unități (x și w în aceleași unități), cu bare de start și de stop. */
export function barcodeBars(seed: string, width = 200): BarcodeBar[] {
  const rand = seeded(seed);
  const bars: BarcodeBar[] = [];
  let x = 0;
  const bar = (w: number) => {
    bars.push({ x, w });
    x += w;
  };
  bar(2.2); x += 1.8; bar(1.1); x += 1.8;
  while (x < width - 10) {
    bar(0.9 + Math.floor(rand() * 3));
    x += 1.1 + Math.floor(rand() * 3);
  }
  x = width - 6.1;
  bar(1.1); x += 1.8; bar(2.2);
  return bars;
}

/** Cifrele tipărite sub cod („LEU 1234 567890”), tot deterministe. */
export function barcodeDigits(seed: string) {
  const rand = seeded(`cod:${seed}`);
  const digits = (n: number) => Array.from({ length: n }, () => Math.floor(rand() * 10)).join("");
  return `LEU ${digits(4)} ${digits(6)}`;
}
