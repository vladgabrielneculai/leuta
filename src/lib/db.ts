import { AsyncLocalStorage } from "node:async_hooks";
import { attachDatabasePool } from "@vercel/functions";
import { headers } from "next/headers";
import { Pool, type PoolClient } from "pg";

/**
 * Stratul de acces la baza de date (Supabase Postgres).
 *
 * De ce păstrăm API-ul `prepare(sql).all/get/run` din versiunea SQLite:
 * restul aplicației (rute, analytics, seed) a fost scris pe acest model, iar
 * păstrarea lui — doar devenit async — face portarea minimă și ușor de verificat.
 * Parametrii rămân scriși cu `?` și sunt traduși aici în `$1, $2…` pentru Postgres.
 *
 * De ce `pg` + `attachDatabasePool`: pe Vercel funcția e „înghețată” între cereri. Conexiunile
 * lăsate deschise sunt tăiate între timp de pooler-ul Supabase, iar la trezire driverul folosea
 * un socket mort și cererea atârna zeci de secunde. `attachDatabasePool` (recomandarea Vercel)
 * ține instanța vie cât să închidă curat conexiunile inactive înainte de înghețare.
 *
 * Mai mulți utilizatori: fiecare rând financiar are `user_id`, iar Postgres (row-level security)
 * arată fiecărei cereri doar rândurile utilizatorului logat. Pentru asta, fiecare interogare a
 * unui utilizator rulează într-o tranzacție care setează întâi `app.user_id` (vezi
 * supabase/migrations/0002_multi_user.sql). Id-ul vine din proxy.ts (header `x-user-id`, pus de
 * server după validarea sesiunii — clientul nu îl poate falsifica).
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

type Queryable = Pool | PoolClient;

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
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

/**
 * Curăță valoarea din DATABASE_URL: la copy-paste în Vercel se strecoară ușor spații, ghilimele
 * sau chiar prefixul „DATABASE_URL=”. Driverul `pg` nu le tolerează (interpretează adresa ca
 * relativă și încearcă să se conecteze la host-ul „base”), deci le eliminăm aici.
 */
function cleanUrl(raw: string): string {
  let u = raw.trim().replace(/^DATABASE_URL\s*=\s*/i, "").trim();
  if ((u.startsWith('"') && u.endsWith('"')) || (u.startsWith("'") && u.endsWith("'"))) u = u.slice(1, -1).trim();
  return u.replace(/\s+/g, "");
}

/** Parsează adresa explicit (host, port, user, parolă, bază) în loc să lăsăm driverul s-o ghicească. */
function parseUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL nu este o adresă Postgres validă (verifică valoarea din Vercel → Settings → Environment Variables).");
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) throw new Error("DATABASE_URL trebuie să înceapă cu postgres://");
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "postgres",
  };
}

function pool(): Pool {
  if (!global.__pgPool) {
    const raw = activeUrl ?? process.env.DATABASE_URL;
    if (!raw) throw new Error("DATABASE_URL lipsește din variabilele de mediu.");
    const url = cleanUrl(raw);
    activeUrl = url;
    const conn = parseUrl(url);
    const local = conn.host === "localhost" || conn.host === "127.0.0.1";
    const p = new Pool({
      ...conn,
      // SSL obligatoriu spre Supabase; dezactivat doar pentru un Postgres local de test.
      ssl: local ? false : { rejectUnauthorized: false },
      max: 3,
      // Conexiunile inactive se închid repede (recomandarea Vercel pentru Fluid compute).
      idleTimeoutMillis: 5_000,
      // Nicio cerere nu mai poate atârna: conectarea și interogarea au limite stricte.
      connectionTimeoutMillis: 5_000,
      query_timeout: 15_000,
    });
    // O conexiune moartă din pool nu trebuie să dărâme procesul.
    p.on("error", () => undefined);
    attachDatabasePool(p);
    global.__pgPool = p;
  }
  return global.__pgPool;
}

/** Aruncă pool-ul curent (ex. după o eroare de conexiune), ca următoarea cerere să pornească curat. */
async function resetPool() {
  const p = global.__pgPool;
  global.__pgPool = undefined;
  await p?.end().catch(() => undefined);
}

/** Erori de rețea/conexiune după care merită o singură reîncercare pe o conexiune nouă. */
function isConnectionError(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? e);
  const code = (e as { code?: string })?.code ?? "";
  return (
    ["ECONNRESET", "EPIPE", "ETIMEDOUT", "ECONNREFUSED", "57P01", "08006", "08003", "08001"].includes(code) ||
    /timeout|terminated|Connection terminated|socket|ECONNRESET|closed/i.test(msg)
  );
}

/** `?` → `$n`. Interogările aplicației nu conțin `?` în literali, deci înlocuirea simplă e sigură. */
function toPg(query: string): string {
  let i = 0;
  return query.replace(/\?/g, () => `$${++i}`);
}

function normalize(params: unknown[]): unknown[] {
  return params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));
}

/**
 * Rulează o interogare. Cu `userId`: într-o tranzacție scurtă cu `app.user_id` setat (RLS).
 * Fără `userId` („sistem”): direct, iar tabelele utilizatorilor rămân invizibile.
 */
async function run(target: PoolClient | null, userId: number | null, q: string, params: unknown[]) {
  const text = toPg(q);
  const values = normalize(params);
  if (target) return target.query(text, values); // deja într-o tranzacție (fără reîncercare)

  const once = async () => {
    if (userId === null) return pool().query(text, values);
    const client = await pool().connect();
    try {
      // BEGIN + set_config într-un singur round-trip (userId e un întreg validat, deci sigur de inclus).
      await client.query(`BEGIN; SELECT set_config('app.user_id', '${userId}', true)`);
      const res = await client.query(text, values);
      await client.query("COMMIT");
      return res;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  };

  try {
    return await once();
  } catch (e) {
    if (!isConnectionError(e)) throw e;
    await resetPool();
    return once(); // o singură reîncercare, pe o conexiune proaspătă
  }
}

function wrap(target: PoolClient | null, userId: number | null): DbInterface {
  return {
    prepare(q: string): Statement {
      const isInsert = /^\s*insert\s/i.test(q) && !/\breturning\b/i.test(q);
      return {
        async run(...params) {
          // La INSERT cerem rândul înapoi ca să putem expune id-ul, la fel ca lastInsertRowid din SQLite.
          const res = await run(target, userId, isInsert ? `${q} RETURNING *` : q, params);
          const first = res.rows[0] as { id?: number } | undefined;
          return { lastInsertRowid: Number(first?.id ?? 0), changes: res.rowCount ?? res.rows.length };
        },
        async all<T>(...params: unknown[]) {
          return (await run(target, userId, q, params)).rows as T[];
        },
        async get<T>(...params: unknown[]) {
          return (await run(target, userId, q, params)).rows[0] as T | undefined;
        },
      };
    },
    async exec(q: string) {
      await run(target, userId, q, []);
    },
    async transaction<T>(fn: (tx: DbInterface) => Promise<T>): Promise<T> {
      if (target) return fn(wrap(target, userId)); // deja într-o tranzacție
      const client = await pool().connect();
      try {
        await client.query(userId === null ? "BEGIN" : `BEGIN; SELECT set_config('app.user_id', '${userId}', true)`);
        const res = await fn(wrap(client, userId));
        await client.query("COMMIT");
        return res;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

/** Pornirea conexiunii (o dată per instanță), cu comutare automată aws-0/aws-1 dacă e nevoie. */
async function ensureConnected() {
  if (!global.__dbInit) {
    global.__dbInit = pool().query("SELECT 1").then(() => undefined).catch(async (e) => {
      const alt = activeUrl && /tenant or user not found/i.test(String(e?.message)) ? alternatePoolerUrl(activeUrl) : null;
      if (alt) {
        await resetPool();
        activeUrl = alt;
        try {
          await pool().query("SELECT 1");
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
}

// ---------- Date implicite per utilizator ----------

const DEFAULT_SETTINGS: Record<string, string> = {
  emergency_months: "6",
  expected_invest_return: "7",
  invest_tax_pct: "10",
  inflation_pct: "5",
  custom_needs: "50",
  custom_wants: "25",
  custom_savings: "25",
  enable_investments: "0",
};

async function ensureUserDefaults(userId: number) {
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

  const db = wrap(null, userId);
  const values = defaultsCats.map(() => "(?, ?, ?, ?)").join(",");
  const keys = Object.keys(DEFAULT_SETTINGS);
  await Promise.all([
    // Categoriile implicite lipsă (după nume normalizat) — ca în versiunea originală.
    db
      .prepare(
        `INSERT INTO categories (name, kind, bucket, color)
         SELECT v.name, v.kind, v.bucket, v.color FROM (VALUES ${values}) AS v(name, kind, bucket, color)
         WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE lower(trim(c.name)) = lower(trim(v.name)))
         ON CONFLICT DO NOTHING`,
      )
      .run(...defaultsCats.flat()),
    db
      .prepare(`INSERT INTO user_settings (key, value) VALUES ${keys.map(() => "(?, ?)").join(",")} ON CONFLICT DO NOTHING`)
      .run(...keys.flatMap((k) => [k, DEFAULT_SETTINGS[k]])),
  ]);
}

declare global {
  // eslint-disable-next-line no-var
  var __userDefaults: Map<number, Promise<void>> | undefined;
}

// ---------- Puncte de intrare ----------

/**
 * Contextul „rulează ca utilizatorul X” pentru codul fără sesiune de browser (cron-ul de notificări,
 * webhook-ul Telegram): în interiorul lui, getDb()/getSettings()/buildSummary() văd datele acelui cont.
 */
const userContext = new AsyncLocalStorage<number>();

export function runAsUser<T>(userId: number, fn: () => Promise<T>): Promise<T> {
  if (!Number.isInteger(userId) || userId <= 0) throw new Error("Utilizator invalid");
  return userContext.run(userId, fn);
}

/** Id-ul utilizatorului cererii curente (pus de proxy.ts după validarea sesiunii), sau null. */
export async function currentUserId(): Promise<number | null> {
  const ctx = userContext.getStore();
  if (ctx) return ctx;
  try {
    const raw = (await headers()).get("x-user-id");
    const id = raw ? Number(raw) : NaN;
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null; // în afara unei cereri
  }
}

/** Baza de date pentru un utilizator anume (datele implicite sunt garantate la prima folosire). */
export async function getDbFor(userId: number): Promise<DbInterface> {
  if (!Number.isInteger(userId) || userId <= 0) throw new Error("Utilizator invalid");
  await ensureConnected();
  const cache = (global.__userDefaults ??= new Map());
  if (!cache.has(userId)) {
    cache.set(userId, ensureUserDefaults(userId).catch((e) => { cache.delete(userId); throw e; }));
  }
  await cache.get(userId);
  return wrap(null, userId);
}

/** Acces „sistem”: doar tabelele comune (utilizatori, sesiuni, curs, inflație, setări de sistem). */
export async function getSystemDb(): Promise<DbInterface> {
  await ensureConnected();
  return wrap(null, null);
}

/**
 * Baza de date pentru cererea curentă: a utilizatorului logat dacă există, altfel acces „sistem”.
 * Codul paginilor/rutelor rămâne neschimbat — izolarea o face Postgres.
 */
export async function getDb(): Promise<DbInterface> {
  const uid = await currentUserId();
  return uid ? getDbFor(uid) : getSystemDb();
}

// ---------- Setări ----------

/** Chei de sistem (comune tuturor): evidența descărcărilor BNR/Eurostat. Restul sunt preferințe personale. */
export function isSystemSetting(key: string) {
  return /^(fx_|inflation_last_|inflation_source$)/.test(key);
}

/** Setările de sistem + preferințele utilizatorului curent, într-un singur obiect (ca înainte). */
export async function getSettings(): Promise<Record<string, string>> {
  const [sys, own] = await Promise.all([
    (await getSystemDb()).prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>(),
    (await currentUserId())
      ? (await getDb()).prepare("SELECT key, value FROM user_settings").all<{ key: string; value: string }>()
      : Promise.resolve([] as { key: string; value: string }[]),
  ]);
  return { ...DEFAULT_SETTINGS, ...Object.fromEntries([...sys, ...own].map((r) => [r.key, r.value])) };
}

/** Scrie o setare: cheile de sistem în `settings`, preferințele în `user_settings` (utilizatorul curent). */
export async function setSetting(key: string, value: string) {
  if (isSystemSetting(key)) {
    await (await getSystemDb())
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value")
      .run(key, value);
    return;
  }
  if (!(await currentUserId())) return; // preferință personală fără utilizator: nimic de scris
  await (await getDb())
    .prepare("INSERT INTO user_settings (key, value) VALUES (?, ?) ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value")
    .run(key, value);
}

export async function getSetting(key: string): Promise<string | undefined> {
  if (isSystemSetting(key)) {
    const row = await (await getSystemDb()).prepare("SELECT value FROM settings WHERE key = ?").get<{ value: string }>(key);
    return row?.value;
  }
  if (!(await currentUserId())) return DEFAULT_SETTINGS[key];
  const row = await (await getDb()).prepare("SELECT value FROM user_settings WHERE key = ?").get<{ value: string }>(key);
  return row?.value ?? DEFAULT_SETTINGS[key];
}

export function num(v: string | undefined, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
