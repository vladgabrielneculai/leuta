/**
 * Generează iconițele aplicației din sigla din components/Logo.tsx (aceleași forme):
 *   src/app/icon.svg (favicon), public/icon-192.png, public/icon-512.png (colțuri rotunjite),
 *   public/icon-maskable-512.png (Android, conținutul în zona sigură de 80%), public/apple-icon.png (iOS, plin),
 *   public/email/logo.png (sigla din emailuri).
 * Rulare: NODE_PATH=$(npm root -g) node --experimental-strip-types scripts/icons.mts   (PNG-urile se fac cu Playwright)
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { NOTE_BRIGHT, rosette } from "../src/lib/rosette.ts";

const L = "M22.5 15.5h7v22.2l13.2-6.6 2.9 6.3-17.6 8.9c-2.6 1.3-5.5-.6-5.5-3.5V15.5z";

function art({ tile, scale = 1, step = 0.03 }: { tile: boolean; scale?: number; step?: number }) {
  const r1 = rosette(32, 28.5, 25, { lobes: 40, turns: 11, depth: 0.32, step });
  const r2 = rosette(32, 28.5, 19, { lobes: 30, turns: 7, depth: 0.42, step });
  const inner = [
    `<g fill="none" stroke="${NOTE_BRIGHT[0]}" stroke-width="0.25"><path d="${r1}" stroke-opacity="0.3"/><path d="${r2}" stroke-opacity="0.18"/></g>`,
    `<g transform="translate(-2 -2.5)"><path d="${L}" fill="#FAFAF9"/><circle cx="46.3" cy="27.6" r="3.1" fill="${NOTE_BRIGHT[3]}"/></g>`,
    ...NOTE_BRIGHT.map((c, i) => `<rect x="${(16.3 + i * 6.6).toFixed(1)}" y="51" width="5" height="2.2" rx="1.1" fill="${c}"/>`),
  ].join("");
  const s = scale === 1 ? inner : `<g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${inner}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#1A1C1A"/><stop offset="1" stop-color="#090A09"/></linearGradient></defs>
<rect width="64" height="64" rx="${tile ? 14 : 0}" fill="url(#bg)"/>${tile ? `<rect x="0.4" y="0.4" width="63.2" height="63.2" rx="13.6" fill="none" stroke="#FFFFFF" stroke-opacity="0.09" stroke-width="0.8"/>` : ""}
${s}
</svg>
`;
}

writeFileSync("src/app/icon.svg", art({ tile: true, step: 0.06 }));

// Playwright nu e dependență a proiectului: se ia din instalarea globală (NODE_PATH=$(npm root -g)).
const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch();
const page = await browser.newPage();
async function png(svg: string, size: number, out: string) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await png(art({ tile: true }), 192, "public/icon-192.png");
await png(art({ tile: true }), 512, "public/icon-512.png");
await png(art({ tile: false, scale: 0.8 }), 512, "public/icon-maskable-512.png");
await png(art({ tile: false }), 180, "public/apple-icon.png");
await png(art({ tile: true }), 128, "public/email/logo.png");
await browser.close();
console.log("Iconițe generate.");
