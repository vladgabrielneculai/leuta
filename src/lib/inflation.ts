import { getDb, getSetting as setting, setSetting } from "./db";

const PRIMARY_URL =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?geo=RO&unit=RCH_A&coicop18=TOTAL&lastTimePeriod=18";
const FALLBACK_URL =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_manr?geo=RO&coicop=CP00&lastTimePeriod=18";
const DEFAULT_FALLBACK_RATE = 5.0;

export type InflationPoint = {
  period: string; // 'YYYY-MM'
  rate: number;
};

export type InflationInfo = {
  rate: number;
  period: string | null;
  source: string;
  estimated: boolean;
  updatedAt: string | null;
  history: InflationPoint[];
};


function parseEurostatData(json: any): InflationPoint[] {
  if (!json || !json.dimension || !json.dimension.time || !json.value) {
    return [];
  }

  const timeCategory = json.dimension.time.category;
  const timeLabels: string[] = [];

  if (timeCategory.label) {
    const keys = Object.keys(timeCategory.label);
    for (const k of keys) {
      timeLabels.push(timeCategory.label[k]);
    }
  } else if (timeCategory.index) {
    timeLabels.push(...Object.keys(timeCategory.index));
  }

  const points: InflationPoint[] = [];
  timeLabels.forEach((period, idx) => {
    const val = json.value[idx] ?? json.value[String(idx)];
    if (typeof val === "number" && !isNaN(val)) {
      points.push({ period, rate: Number(val.toFixed(2)) });
    }
  });

  return points;
}

async function fetchWithTimeout(url: string, timeoutMs = 9000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "Leuta-App/1.0",
      },
    });
    if (!res.ok) throw new Error(`Serverul a răspuns cu codul ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function storeRates(points: InflationPoint[], source: string) {
  if (!points.length) return;
  const db = await getDb();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO inflation_rates (period, rate, source, updated_at) VALUES ${points.map(() => "(?, ?, ?, ?)").join(",")}
       ON CONFLICT (period) DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source, updated_at = EXCLUDED.updated_at`,
    )
    .run(...points.flatMap((p) => [p.period, p.rate, source, now]));
}

/**
 * Reîmprospătează datele despre rata inflației din România de pe internet.
 * Folosește Eurostat Statistics API (date oficiale agregate lunar de la INSSE România).
 */
export async function refreshInflation(force = false): Promise<{ ok: boolean; rate?: number; error?: string }> {
  const last = Number((await setting("inflation_last_fetch")) ?? 0);
  const now = Date.now();

  // Actualizează cel mult o dată la 12 ore, sau forțat
  if (!force && now - last < 12 * 3600 * 1000) {
    const current = await latestInflation();
    return { ok: true, rate: current.rate };
  }

  let points: InflationPoint[] = [];
  let sourceUsed = "INS / Eurostat (IAPC)";
  let lastError: string | undefined;

  try {
    const data = await fetchWithTimeout(PRIMARY_URL);
    points = parseEurostatData(data);
  } catch (err: any) {
    lastError = err?.message ?? "Eroare la conectare la sursa primară de inflație";
    try {
      const fallbackData = await fetchWithTimeout(FALLBACK_URL);
      points = parseEurostatData(fallbackData);
      sourceUsed = "INS / Eurostat (HICP Alternativ)";
      lastError = undefined;
    } catch (fallbackErr: any) {
      lastError = `Nu s-a putut prelua rata inflației: ${fallbackErr?.message || err?.message}`;
    }
  }

  if (points.length > 0) {
    await storeRates(points, sourceUsed);
    const latest = points[points.length - 1];

    await setSetting("inflation_last_fetch", String(now));
    await setSetting("inflation_last_period", latest.period);
    await setSetting("inflation_source", sourceUsed);

    // Actualizează automat parametrul inflation_pct din setările aplicației
    await setSetting("inflation_pct", String(latest.rate));

    return { ok: true, rate: latest.rate };
  }

  return { ok: false, error: lastError ?? "Nu s-au găsit date valide despre inflație" };
}

/**
 * Returnează cea mai recentă rată a inflației stocată local sau valoarea de rezervă.
 */
export async function latestInflation(): Promise<InflationInfo> {
  const db = await getDb();
  const rows = await db
    .prepare("SELECT period, rate, source, updated_at FROM inflation_rates ORDER BY period DESC")
    .all<{ period: string; rate: number; source: string; updated_at: string }>();

  const configuredPct = Number((await setting("inflation_pct")) ?? DEFAULT_FALLBACK_RATE);

  if (rows.length > 0) {
    const latest = rows[0];
    return {
      rate: configuredPct || latest.rate,
      period: latest.period,
      source: latest.source || "INS / Eurostat",
      estimated: false,
      updatedAt: latest.updated_at,
      history: rows
        .slice(0, 12)
        .reverse()
        .map((r) => ({ period: r.period, rate: r.rate })),
    };
  }

  return {
    rate: configuredPct,
    period: (await setting("inflation_last_period")) ?? null,
    source: (await setting("inflation_source")) ?? "Estimare inițială",
    estimated: true,
    updatedAt: null,
    history: [],
  };
}

/**
 * Returnează rata inflației pentru o lună anume ('YYYY-MM'), sau cea mai apropiată disponibilă.
 */
export async function inflationForMonth(month: string): Promise<{ rate: number; estimated: boolean }> {
  const db = await getDb();
  const row = await db.prepare("SELECT rate FROM inflation_rates WHERE period = ?").get<{ rate: number }>(month);

  if (row) return { rate: row.rate, estimated: false };

  const latest = await latestInflation();
  return { rate: latest.rate, estimated: true };
}

