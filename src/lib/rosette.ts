/**
 * Rozeta de ghioș (guilloche) de pe bancnote, ca traseu SVG: o curbă hipotrohoidă închisă.
 * `lobes` / `turns` dau numărul de petale și de câte ori se rotește curba până se închide;
 * `depth` cât de adânci sunt petalele. Rezultatul e determinist (același pe server și în browser).
 */
export function rosette(cx: number, cy: number, outer: number, { lobes = 24, turns = 7, depth = 0.55, step = 0.03 } = {}) {
  const a = outer / (1 + depth); // R − r
  const d = depth * a;
  const k = lobes / turns; // (R − r) / r
  const end = Math.PI * 2 * turns;
  let path = "";
  for (let t = 0; t <= end + step / 2; t += step) {
    const x = cx + a * Math.cos(t) + d * Math.cos(k * t);
    const y = cy + a * Math.sin(t) - d * Math.sin(k * t);
    path += `${path ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return path + "Z";
}

/** Culorile bancnotelor (1, 5, 10, 50, 100 lei), în varianta luminoasă, pentru siglă și iconițe. */
export const NOTE_BRIGHT = ["#6CCB8F", "#A38DDE", "#E87CA0", "#E4B74C", "#6EA4DC"];
