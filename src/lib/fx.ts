import { getDb, getSetting as setting, setSetting } from "./db";

const DAILY_URL = "https://curs.bnr.ro/nbrfxrates.xml";
const MULTI_DAY_URL = "https://curs.bnr.ro/nbrfxrates10days.xml";
const YEAR_URL = (y: number) => `https://curs.bnr.ro/files/xml/years/nbrfxrates${y}.xml`;
const FALLBACK = 5.0;

type Parsed = { eur: [string, number][]; all: [string, string, number][] };

/** Cursul EUR (pentru buget) și toate monedele publicate (pentru vacanțe), în lei pe o unitate. */
function parseCubes(xml: string): Parsed {
  const out: Parsed = { eur: [], all: [] };
  const cubeRe = /<Cube date="(\d{4}-\d{2}-\d{2})">([\s\S]*?)<\/Cube>/g;
  const rateRe = /<Rate currency="([A-Z]{3})"(?:\s+multiplier="(\d+)")?[^>]*>([\d.]+)<\/Rate>/g;
  let m: RegExpExecArray | null;
  while ((m = cubeRe.exec(xml))) {
    let r: RegExpExecArray | null;
    while ((r = rateRe.exec(m[2]))) {
      const ron = Number(r[3]) / Number(r[2] ?? 1); // ex. 100 HUF = 1,2345 lei → 0,012345 lei pe forint
      out.all.push([m[1], r[1], ron]);
      if (r[1] === "EUR") out.eur.push([m[1], Number(r[3])]);
    }
  }
  return out;
}

async function fetchText(url: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/xml,text/xml,*/*",
      },
    });
    if (!res.ok) throw new Error(`BNR a răspuns cu ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Salvează cursul EUR într-un singur INSERT (un an întreg = ~250 rânduri, deci un singur round-trip) și,
 * dacă `allCurrencies`, toate monedele (doar vacanțele au nevoie de ele).
 */
async function store({ eur: rates, all }: Parsed, allCurrencies = true) {
  const db = await getDb();
  if (rates.length) {
    const placeholders = rates.map(() => "(?, ?)").join(",");
    await db
      .prepare(`INSERT INTO fx_rates (date, eur_ron) VALUES ${placeholders} ON CONFLICT (date) DO UPDATE SET eur_ron = EXCLUDED.eur_ron`)
      .run(...rates.flat());
  }
  if (!allCurrencies) return;
  // Un an întreg are ~9.000 de cursuri: le scriem în bucăți, ca să nu depășim limita de parametri a Postgres.
  for (let i = 0; i < all.length; i += 2000) {
    const chunk = all.slice(i, i + 2000);
    await db
      .prepare(
        `INSERT INTO fx_rates_currency (date, currency, ron) VALUES ${chunk.map(() => "(?, ?, ?)").join(",")}
         ON CONFLICT (currency, date) DO UPDATE SET ron = EXCLUDED.ron`,
      )
      .run(...chunk.flat());
  }
}

// O singură reîmprospătare în desfășurare per instanță: dacă pagina cere /api/summary și
// /api/fx în același timp, a doua cerere așteaptă rezultatul primei în loc să descarce din nou.
let inFlight: Promise<{ ok: boolean; error?: string }> | null = null;

/** Actualizează cursul zilnic și, la nevoie, istoricul pe ani. */
export function refreshRates(months: string[] = [], force = false): Promise<{ ok: boolean; error?: string }> {
  if (inFlight && !force) return inFlight;
  const run = doRefreshRates(months, force).finally(() => {
    if (inFlight === run) inFlight = null;
  });
  inFlight = run;
  return run;
}

async function doRefreshRates(months: string[], force: boolean): Promise<{ ok: boolean; error?: string }> {
  const db = await getDb();
  let error: string | undefined;

  const [lastRaw, attemptRaw] = await Promise.all([setting("fx_last_fetch"), setting("fx_last_attempt")]);
  const last = Number(lastRaw ?? 0);
  const lastAttempt = Number(attemptRaw ?? 0);
  // Actualizează cel mult o dată la 3 ore (sau forțat). După un eșec (BNR indisponibil),
  // nu reîncercăm mai des de 15 minute, ca să nu încetinim fiecare deschidere a aplicației.
  const stale = Date.now() - last > 3 * 3600 * 1000;
  const recentlyFailed = Date.now() - lastAttempt < 15 * 60 * 1000;
  if (force || (stale && !recentlyFailed)) {
    await setSetting("fx_last_attempt", String(Date.now()));
    let parsed: Parsed = { eur: [], all: [] };
    try {
      const xml = await fetchText(DAILY_URL);
      parsed = parseCubes(xml);
    } catch {
      // Încearcă fallback la feed-ul de 10 zile
      try {
        const xml10 = await fetchText(MULTI_DAY_URL);
        parsed = parseCubes(xml10);
      } catch (e) {
        error = e instanceof Error ? e.message : "Cursul BNR nu a putut fi preluat";
      }
    }

    if (parsed.eur.length > 0) {
      await store(parsed);
      await setSetting("fx_last_fetch", String(Date.now()));
      error = undefined;
    }
  }

  const years = new Set(months.map((m) => Number(m.slice(0, 4))));
  const thisYear = new Date().getFullYear();
  for (const y of years) {
    if (y < 2005 || y > thisYear) continue;
    const has = (await db.prepare("SELECT COUNT(*)::int AS c FROM fx_rates WHERE date LIKE ?").get<{ c: number }>(`${y}-%`))!;
    const tried = await setting(`fx_year_${y}`);
    // Anul curent: ~250 zile lucrătoare/an → ne așteptăm la ~60% din zilele scurse.
    // (Înainte pragul era 1, deci un singur curs recent oprea descărcarea anului, iar lunile
    // Ian–Aug foloseau cursul din decembrie anul trecut.)
    const dayOfYear = Math.floor((Date.now() - new Date(thisYear, 0, 1).getTime()) / 86_400_000);
    const minNeeded = y === thisYear ? Math.max(1, Math.floor(dayOfYear * 0.6) - 10) : 200;
    if (has.c >= minNeeded || (!force && tried && Date.now() - Number(tried) < 24 * 3600 * 1000)) continue;
    try {
      // Bugetul are nevoie doar de EUR; restul monedelor pe an le ia ensureCurrencyHistory, când le cere o vacanță.
      await store(parseCubes(await fetchText(YEAR_URL(y))), false);
    } catch (e) {
      error = error ?? (e instanceof Error ? e.message : "Istoricul BNR nu a putut fi preluat");
    }
    await setSetting(`fx_year_${y}`, String(Date.now()));
  }

  // Ultima eroare se păstrează în setări, ca bannerul din UI să o poată afișa chiar dacă
  // reîmprospătarea a rulat în fundal (după ce răspunsul a fost deja trimis).
  await setSetting("fx_last_error", error ?? "");
  return { ok: !error, error };
}

export type RateInfo = { rate: number; date: string | null; estimated: boolean };

/** Toate cursurile, crescător după dată — încărcate o dată și folosite în memorie de analytics. */
export async function loadRates(): Promise<{ date: string; eur_ron: number }[]> {
  return (await getDb()).prepare("SELECT date, eur_ron FROM fx_rates ORDER BY date ASC").all<{ date: string; eur_ron: number }>();
}

/** Ultimul curs publicat până la sfârșitul lunii date (calcul în memorie, pe lista din loadRates). */
export function rateForMonthFrom(rates: { date: string; eur_ron: number }[], month: string): RateInfo {
  const end = `${month}-31`;
  let before: { date: string; eur_ron: number } | undefined;
  for (const r of rates) {
    if (r.date <= end) before = r;
    else break;
  }
  if (before) return { rate: before.eur_ron, date: before.date, estimated: false };
  if (rates.length) return { rate: rates[0].eur_ron, date: rates[0].date, estimated: true };
  return { rate: FALLBACK, date: null, estimated: true };
}

export async function rateForMonth(month: string): Promise<RateInfo> {
  return rateForMonthFrom(await loadRates(), month);
}

export async function latestRate(): Promise<RateInfo> {
  const row = await (await getDb())
    .prepare("SELECT date, eur_ron FROM fx_rates ORDER BY date DESC LIMIT 1")
    .get<{ date: string; eur_ron: number }>();
  return row ? { rate: row.eur_ron, date: row.date, estimated: false } : { rate: FALLBACK, date: null, estimated: true };
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
/** Data pentru care cerem cursurile: cel mult azi (o vacanță viitoare folosește ultimul curs publicat). */
const rateDay = (date: string) => (date > isoDay(new Date()) ? isoDay(new Date()) : date);

/**
 * Descarcă istoricul pe anul datei pentru toate monedele, dacă în cele 10 zile dinaintea ei (din același an)
 * nu avem niciun curs salvat: vacanță din alt an sau prima folosire după ce s-a adăugat tabelul.
 * Un an trecut descărcat cu succes nu se mai cere; altfel, cel mult o încercare pe zi pentru fiecare an.
 */
export async function ensureCurrencyHistory(date: string) {
  const day = rateDay(date);
  const y = Number(day.slice(0, 4));
  const thisYear = new Date().getFullYear();
  if (!Number.isFinite(Date.parse(day)) || y < 2005 || y > thisYear) return;
  const tried = await setting(`fx_cur_year_${y}`);
  if (tried === "done") return;
  const tenDaysBefore = isoDay(new Date(Date.parse(day) - 10 * 86_400_000));
  const from = tenDaysBefore < `${y}-01-01` ? `${y}-01-01` : tenDaysBefore;
  const has = await (await getDb())
    .prepare("SELECT 1 FROM fx_rates_currency WHERE currency = 'EUR' AND date BETWEEN ? AND ? LIMIT 1")
    .get(from, day);
  if (has) return;
  if (tried && Date.now() - Number(tried) < 24 * 3600 * 1000) return;
  await setSetting(`fx_cur_year_${y}`, String(Date.now()));
  try {
    const parsed = parseCubes(await fetchText(YEAR_URL(y)));
    await store(parsed);
    if (y < thisYear && parsed.eur.length) await setSetting(`fx_cur_year_${y}`, "done");
  } catch {
    // BNR indisponibil: rămâne cursul cel mai apropiat pe care îl avem
  }
}

/**
 * Cursul BNR (lei pentru o unitate) al fiecărei monede, la data dată: ultimul publicat până atunci sau,
 * pentru o dată dinaintea istoricului salvat, primul de după (marcat estimativ). Folosește doar ce e salvat;
 * istoricul lipsă îl aduce ensureCurrencyHistory.
 * `null` = moneda nu e cotată de BNR (ex. dinarul tunisian); RON nu apare, cursul lui e 1.
 */
export async function currencyRates(currencies: string[], date: string): Promise<Record<string, RateInfo | null>> {
  const codes = [...new Set(currencies)].filter((c) => /^[A-Z]{3}$/.test(c) && c !== "RON");
  const out: Record<string, RateInfo | null> = {};
  if (!codes.length) return out;
  const day = rateDay(date);
  const db = await getDb();
  const marks = codes.map(() => "?").join(",");
  type Row = { currency: string; date: string; ron: number };
  const before = await db
    .prepare(
      `SELECT DISTINCT ON (currency) currency, date, ron FROM fx_rates_currency
       WHERE currency IN (${marks}) AND date <= ? ORDER BY currency, date DESC`,
    )
    .all<Row>(...codes, day);
  for (const r of before) out[r.currency] = { rate: r.ron, date: r.date, estimated: false };
  const missing = codes.filter((c) => !out[c]);
  if (missing.length) {
    const after = await db
      .prepare(
        `SELECT DISTINCT ON (currency) currency, date, ron FROM fx_rates_currency
         WHERE currency IN (${missing.map(() => "?").join(",")}) AND date > ? ORDER BY currency, date ASC`,
      )
      .all<Row>(...missing, day);
    for (const r of after) out[r.currency] = { rate: r.ron, date: r.date, estimated: true };
  }
  for (const c of codes) out[c] ??= c === "EUR" ? await rateForMonth(day.slice(0, 7)) : null;
  return out;
}
