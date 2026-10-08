// Randează SVG-urile în PNG (transparent), JPG (fond alb, pentru înregistrarea mărcii) și PDF vectorial.
// Rulare din rădăcina proiectului:  node brand/scripts/exporta.mjs brand/svg brand
// Necesită Playwright cu Chromium (npm i -g playwright && npx playwright install chromium).
import { createRequire } from "module";
import fs from "fs";
import path from "path";
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node22/lib/node_modules/")("playwright")); }
const [, , svgDir, outDir] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage();
const size = (f) => {
  const m = fs.readFileSync(f, "utf8").match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  return [Number(m[1]), Number(m[2])];
};
async function shot(file, out, { width, height, bg = "transparent", pad = 0, type = "png" }) {
  const [vw, vh] = size(file);
  const svg = fs.readFileSync(file, "utf8").replace(/ width="[\d.]+" height="[\d.]+"/, "");
  // încadrăm desenul în suprafața dată, centrat, cu margine `pad` (fracțiune din latura mică)
  const W = width, H = height ?? Math.round((width * vh) / vw);
  const m = pad * Math.min(W, H);
  const k = Math.min((W - 2 * m) / vw, (H - 2 * m) / vh);
  const dw = vw * k, dh = vh * k;
  await page.setViewportSize({ width: W, height: H });
  await page.setContent(`<html><body style="margin:0;background:${bg};width:${W}px;height:${H}px;overflow:hidden">
    <div style="position:absolute;left:${(W - dw) / 2}px;top:${(H - dh) / 2}px;width:${dw}px;height:${dh}px">${svg.replace("<svg ", '<svg width="100%" height="100%" ')}</div></body></html>`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, type, omitBackground: bg === "transparent", ...(type === "jpeg" ? { quality: 95 } : {}) });
}
async function pdf(file, out) {
  const [vw, vh] = size(file);
  const mm = 0.2645833; // 1px CSS
  const scale = 4; // ~ 4× dimensiunea nominală
  const svg = fs.readFileSync(file, "utf8").replace(/ width="[\d.]+" height="[\d.]+"/, ` width="${vw * scale}" height="${vh * scale}"`);
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.pdf({ path: out, width: `${vw * scale * mm + 0.1}mm`, height: `${vh * scale * mm + 0.1}mm`, printBackground: true, pageRanges: "1" });
}

const files = fs.readdirSync(svgDir).filter((f) => f.endsWith(".svg"));
for (const f of files) {
  const src = path.join(svgDir, f), base = f.replace(".svg", "");
  const isLogo = base.startsWith("leuta-logo");
  await shot(src, path.join(outDir, "png", `${base}.png`), isLogo ? { width: 3000 } : { width: 2048 });
  await shot(src, path.join(outDir, "png", `${base}-mic.png`), isLogo ? { width: 800 } : { width: 512 });
  if (!f.includes("alb") && !f.includes("aplicatie")) await pdf(src, path.join(outDir, "pdf", `${base}.pdf`));
}
// Înregistrarea mărcii (OSIM / EUIPO): JPG pe fond alb, 945×945 px = 8×8 cm la 300 dpi.
const reg = [
  ["leuta-logo.svg", "marca-logo-color.jpg"],
  ["leuta-logo-negru.svg", "marca-logo-alb-negru.jpg"],
  ["leuta-simbol.svg", "marca-simbol-color.jpg"],
  ["leuta-simbol-negru.svg", "marca-simbol-alb-negru.jpg"],
];
for (const [src, out] of reg) await shot(path.join(svgDir, src), path.join(outDir, "inregistrare-marca", out), { width: 945, height: 945, bg: "#ffffff", pad: 0.06, type: "jpeg" });
// Previzualizare: toate variantele pe o singură planșă.
await shot(path.join(svgDir, "leuta-logo.svg"), path.join(outDir, "previzualizare", "pe-alb.png"), { width: 900, height: 360, bg: "#ffffff", pad: 0.1 });
await shot(path.join(svgDir, "leuta-logo-fundal-inchis.svg"), path.join(outDir, "previzualizare", "pe-fundal-inchis.png"), { width: 900, height: 360, bg: "#100F0D", pad: 0.1 });
await shot(path.join(svgDir, "leuta-logo-alb.svg"), path.join(outDir, "previzualizare", "alb-pe-culoare.png"), { width: 900, height: 360, bg: "#2E5C8A", pad: 0.1 });
await browser.close();
// 945 px = 8 cm doar la 300 dpi: scriem rezoluția în fișierele JPG (câmpul JFIF), ca programele să le deschidă la 8×8 cm.
for (const [, out] of reg) {
  const f = path.join(outDir, "inregistrare-marca", out);
  const b = fs.readFileSync(f);
  if (b[2] === 0xff && b[3] === 0xe0 && b.toString("latin1", 6, 10) === "JFIF") {
    b[13] = 1; // unitate: dpi
    b.writeUInt16BE(300, 14);
    b.writeUInt16BE(300, 16);
    fs.writeFileSync(f, b);
  }
}
