import postgres from "postgres";

/**
 * Stratul de acces la baza de date (Supabase Postgres).
 *
 * De ce păstrăm API-ul `prepare(sql).all/get/run` din versiunea SQLite:
 * restul aplicației (rute, analytics, seed) a fost scris pe acest model, iar
 * păstrarea lui — doar devenit async — face portarea minimă și ușor de verificat.
 * Parametrii rămân scriși cu `?` și sunt traduși aici în `$1, $2…` pentru Postgres.
 */

export type RunResult = { lastInsertRowid: number; changes: number };

export type Statement = {
  run(...params: unknown[]): Promise<RunResult>;
  all<T = Record<string, unknown>>(...params: unknown[]): Promise<T[]>;
  get<T = Record<string, unknown>>(...params: unknown[]): Promise<T | undefined>;
};

export type DbInterface = {
  prepare(sql: string): Statement;
  /** Rulează unul sau mai multe statement-uri fără parametri. */
  exec(sql: string): Promise<void>;
  /** Rulează `fn` într-o tranzacție; orice excepție face ROLLBACK. */
  transaction<T>(fn: (tx: DbInterface) => Promise<T>): Promise<T>;
};

type Sql = postgres.Sql | postgres.TransactionSql;

declare global {
  // eslint-disable-next-line no-var
  var __pg: postgres.Sql | undefined;
  // eslint-disable-next-line no-var
  var __dbInit: Promise<void> | undefined;
}

// Supabase are pentru aceeași regiune două clustere de pooler (aws-0-… și aws-1-…), iar
// proiectul e doar pe unul din ele. Dacă primim „Tenant or user not found”, încercăm automat
// celălalt cluster, ca un DATABASE_URL cu prefixul greșit să nu blocheze aplicația.
let activeUrl: string | undefined;

function alternatePoolerUrl(url: string): string | null {
  const m = /@aws-(\d)-([a-z0-9-]+)\.pooler\.supabase\.com/.exec(url);
  if (!m) return null;
  const other = m[1] === "0" ? "1" : "0";
  return url.replace(`@aws-${m[1]}-${m[2]}.pooler`, `@aws-${other}-${m[2]}.pooler`);
}

function client(): postgres.Sql {
  if (!global.__pg) {
    const url = activeUrl ?? process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL lipsește din variabilele de mediu.");
    activeUrl = url;
    global.__pg = postgres(url, {
      // Pooler-ul Supabase în mod „transaction” nu suportă prepared statements persistente.
      prepare: false,
      // SSL obligatoriu spre Supabase; dezactivat doar pentru un Postgres local de test.
      ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(url) ? false : "require",
      // Pe Vercel fiecare instanță de funcție are nevoie de foarte puține conexiuni.
      max: 3,
      idle_timeout: 20,
      connect_timeout: 15,
    });
  }
  return global.__pg;
}

/** `?` → `$n`. Interogările aplicației nu conțin `?` în literali, deci înlocuirea simplă e sigură. */
function toPg(query: string): string {
  let i = 0;
  return query.replace(/\?/g, () => `$${++i}`);
}

function normalize(params: unknown[]): postgres.ParameterOrJSON<never>[] {
  return params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p)) as never[];
}

function wrap(sql: Sql): DbInterface {
  const exec = (q: string, params: unknown[]) => sql.unsafe(toPg(q), normalize(params));

  return {
    prepare(q: string): Statement {
      const isInsert = /^\s*insert\s/i.test(q) && !/\breturning\b/i.test(q);
      return {
        async run(...params) {
          // La INSERT cerem rândul înapoi ca să putem expune id-ul, la fel ca lastInsertRowid din SQLite.
          const res = await exec(isInsert ? `${q} RETURNING *` : q, params);
          const first = res[0] as { id?: number } | undefined;
          return { lastInsertRowid: Number(first?.id ?? 0), changes: res.count ?? res.length };
        },
        async all<T>(...params: unknown[]) {
          return (await exec(q, params)) as unknown as T[];
        },
        async get<T>(...params: unknown[]) {
          const rows = await exec(q, params);
          return rows[0] as T | undefined;
        },
      };
    },
    async exec(q: string) {
      await sql.unsafe(q);
    },
    async transaction<T>(fn: (tx: DbInterface) => Promise<T>): Promise<T> {
      if ("savepoint" in sql) return fn(wrap(sql)); // deja într-o tranzacție
      return (await (sql as postgres.Sql).begin((tx) => fn(wrap(tx)))) as T;
    },
  };
}

/** Datele implicite (categorii + setări) — garantate o singură dată per instanță de server. */
async function init(db: DbInterface) {
  const defaultsCats: [string, string, string, string][] = [
    ["Salariu", "income", "needs", "#3D7A4E"],
    ["Tichete de masă", "income", "needs", "#5E9A6C"],
    ["Venituri extra", "income", "needs", "#6A4E99"],
    ["Chirie", "fixed", "needs", "#2E5C8A"],
    ["Internet și telefon", "fixed", "needs", "#27496D"],
    ["Asigurări", "fixed", "needs", "#27496D"],
    ["Abonamente", "fixed", "wants", "#6A4E99"],
    ["Întreținere și apă", "variable", "needs", "#2E5C8A"],
    ["Energie electrică (curent)", "variable", "needs", "#4A7BA8"],
    ["Gaze naturale", "variable", "needs", "#6B93BC"],
    ["Alimente", "variable", "needs", "#B5456A"],
    ["Transport și mașină", "variable", "needs", "#C9657F"],
    ["Sănătate", "variable", "needs", "#8E3553"],
    ["Restaurante și ieșiri", "variable", "wants", "#8A6BB8"],
    ["Cumpărături", "variable", "wants", "#A38BC9"],
    ["Călătorii", "variable", "wants", "#553D7D"],
    ["Cadouri", "variable", "wants", "#C4B3DD"],
    ["Neprevăzute", "variable", "needs", "#DB8BA4"],
    ["Economii", "saving", "savings", "#C99A1E"],
  ];
  const defaults: Record<string, string> = {
    emergency_months: "6",
    expected_invest_return: "7",
    invest_tax_pct: "10",
    inflation_pct: "5",
    custom_needs: "50",
    custom_wants: "25",
    custom_savings: "25",
    enable_investments: "0",
  };

  // Un singur round-trip: categoriile lipsă (după nume normalizat) + setările lipsă.
  const values = defaultsCats.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`).join(",");
  // Cele două INSERT-uri rulează în paralel: la pornirea la rece a unei funcții contează fiecare round-trip.
  const cats = client().unsafe(
    `INSERT INTO categories (name, kind, bucket, color)
     SELECT v.name, v.kind, v.bucket, v.color FROM (VALUES ${values}) AS v(name, kind, bucket, color)
     WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE lower(trim(c.name)) = lower(trim(v.name)))
     ON CONFLICT DO NOTHING`,
    defaultsCats.flat(),
  );
  const keys = Object.keys(defaults);
  const sets = client().unsafe(
    `INSERT INTO settings (key, value) VALUES ${keys.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(",")}
     ON CONFLICT (key) DO NOTHING`,
    keys.flatMap((k) => [k, defaults[k]]),
  );
  await Promise.all([cats, sets]);
  void db;
}

/** Returnează conexiunea; la prima utilizare pe instanță asigură datele implicite. */
export async function getDb(): Promise<DbInterface> {
  client();
  if (!global.__dbInit) {
    global.__dbInit = init(wrap(client())).catch(async (e) => {
      const alt = activeUrl && /tenant or user not found/i.test(String(e?.message)) ? alternatePoolerUrl(activeUrl) : null;
      if (alt) {
        await global.__pg?.end({ timeout: 1 }).catch(() => undefined);
        global.__pg = undefined;
        activeUrl = alt;
        try {
          await init(wrap(client()));
          return;
        } catch (e2) {
          global.__dbInit = undefined;
          throw e2;
        }
      }
      global.__dbInit = undefined; // reîncearcă la următoarea cerere
      throw e;
    });
  }
  await global.__dbInit;
  return wrap(client()); // după init, clientul activ poate fi cel de pe clusterul alternativ
}

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await (await getDb()).prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setSetting(key: string, value: string) {
  await (await getDb())
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value")
    .run(key, value);
}

export async function getSetting(key: string): Promise<string | undefined> {
  const row = await (await getDb()).prepare("SELECT value FROM settings WHERE key = ?").get<{ value: string }>(key);
  return row?.value;
}

/** Tabelele care au coloană `id` generată automat (pentru resetarea secvențelor după restaurare). */
export const IDENTITY_TABLES = [
  "categories", "goals", "investments", "entries", "loans",
  "loan_prepayments", "loan_schedules", "planned_purchases",
];

export function num(v: string | undefined, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
