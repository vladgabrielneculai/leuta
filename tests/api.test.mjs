/**
 * Teste end-to-end pentru API-ul aplicației (rulează contra unui server pornit).
 *
 *   BASE_URL=http://localhost:3100 TEST_USER=vlad TEST_PASS=... npm test
 *
 * Testele care scriu date își creează propriile rânduri (marcate „[test]”) și le șterg la final,
 * deci pot rula și contra bazei de date reale fără să-ți atingă datele.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const USER = process.env.TEST_USER;
const PASS = process.env.TEST_PASS;
let cookie = "";

async function call(path, { method = "GET", body, auth = true } = {}) {
  const res = await fetch(BASE + path, {
    method,
    redirect: "manual",
    headers: { "content-type": "application/json", ...(auth && cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, headers: res.headers };
}

before(async () => {
  assert.ok(USER && PASS, "Setează TEST_USER și TEST_PASS");
  const res = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  assert.equal(res.status, 200, "login");
  cookie = res.headers.get("set-cookie").split(";")[0];
});

after(async () => {
  // Curățenie: tot ce a creat testul.
  const entries = (await call("/api/crud/entries?month=1999-01")).json ?? [];
  for (const e of entries) await call(`/api/crud/entries?id=${e.id}`, { method: "DELETE" });
});

test("API-ul refuză cererile fără sesiune", async () => {
  for (const p of ["/api/summary", "/api/backup", "/api/crud/entries", "/api/db/info", "/api/settings"]) {
    const r = await call(p, { auth: false });
    assert.equal(r.status, 401, p);
  }
});

test("paginile fără sesiune redirecționează la /login", async () => {
  const r = await call("/luna", { auth: false });
  assert.equal(r.status, 307);
  assert.match(r.headers.get("location"), /\/login$/);
});

test("parolă greșită → 401, setup-ul e închis după crearea contului", async () => {
  const bad = await call("/api/auth/login", { method: "POST", auth: false, body: { username: USER, password: "gresit-" + Date.now() } });
  assert.ok([401, 429].includes(bad.status));
  const setup = await call("/api/auth/setup", { method: "POST", auth: false, body: { username: "intrus", password: "12345678" } });
  assert.equal(setup.status, 400);
});

test("status confirmă utilizatorul autentificat", async () => {
  const r = await call("/api/auth/status");
  assert.equal(r.json.authenticated, true);
  assert.equal(r.json.user.username.toLowerCase(), USER.toLowerCase());
});

test("summary întoarce totaluri numerice și metodele de buget", async () => {
  const r = await call("/api/summary?month=2026-09");
  assert.equal(r.status, 200);
  assert.equal(typeof r.json.totals.income, "number");
  assert.equal(typeof r.json.fx.rate, "number");
  assert.equal(r.json.methods.length, 4);
});

test("CRUD pe intrări: creare, filtrare, modificare, ștergere", async () => {
  const cats = (await call("/api/crud/categories?kind=variable")).json;
  assert.ok(cats.length > 0);
  const created = await call("/api/crud/entries", {
    method: "POST",
    body: { month: "1999-01", kind: "variable", category_id: cats[0].id, goal_id: "", investment_id: "", description: "[test]", amount: 12.5, currency: "RON", recurring: true },
  });
  assert.equal(created.status, 200);
  assert.equal(created.json.amount, 12.5);
  assert.equal(created.json.goal_id, null);
  assert.equal(created.json.recurring, 1);

  const listed = (await call("/api/crud/entries?month=1999-01")).json;
  assert.ok(listed.some((e) => e.id === created.json.id));

  const upd = await call("/api/crud/entries", { method: "PUT", body: { id: created.json.id, amount: 20 } });
  assert.equal(upd.json.amount, 20);

  const del = await call(`/api/crud/entries?id=${created.json.id}`, { method: "DELETE" });
  assert.equal(del.json.ok, true);
});

test("copierea lunii nu dublează intrările recurente", async () => {
  await call("/api/crud/entries", {
    method: "POST",
    body: { month: "1999-01", kind: "fixed", category_id: "", goal_id: "", investment_id: "", description: "[test] recurent", amount: 1, currency: "RON", recurring: true },
  });
  // copiem în aceeași lună: intrarea există deja → trebuie sărită
  const r = await call("/api/copy-month", { method: "POST", body: { from: "1999-01", to: "1999-01" } });
  assert.equal(r.json.copied, 0);
  assert.ok(r.json.skipped >= 1);
});

test("categoriile nu se pot duplica (indiferent de majuscule/spații)", async () => {
  const cats = (await call("/api/crud/categories")).json;
  const name = cats[0].name;
  const r = await call("/api/crud/categories", { method: "POST", body: { name: `  ${name.toUpperCase()} `, kind: cats[0].kind } });
  assert.equal(r.json.id, cats[0].id);
});

test("conturile nu își văd datele unul altuia (doar dacă TEST_USER2/TEST_PASS2 sunt setate)", { skip: !process.env.TEST_USER2 }, async () => {
  const res = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: process.env.TEST_USER2, password: process.env.TEST_PASS2 }),
  });
  assert.equal(res.status, 200, "login user 2");
  const cookie2 = res.headers.get("set-cookie").split(";")[0];
  const as2 = (p, init = {}) => fetch(BASE + p, { ...init, headers: { "content-type": "application/json", cookie: cookie2 } }).then((r) => r.json());

  const mine = await call("/api/crud/entries", {
    method: "POST",
    body: { month: "1999-02", kind: "variable", category_id: "", goal_id: "", investment_id: "", description: "[test] privat", amount: 1, currency: "RON", recurring: false },
  });
  const seenBy2 = await as2("/api/crud/entries?month=1999-02");
  assert.ok(!seenBy2.some((e) => e.id === mine.json.id), "utilizatorul 2 nu vede intrarea utilizatorului 1");
  // Nici nu o poate modifica sau șterge
  const put2 = await fetch(BASE + "/api/crud/entries", { method: "PUT", headers: { "content-type": "application/json", cookie: cookie2 }, body: JSON.stringify({ id: mine.json.id, amount: 999 }) });
  assert.equal(put2.status, 404, "modificarea datelor altui cont = 404");
  const del2 = await fetch(BASE + `/api/crud/entries?id=${mine.json.id}`, { method: "DELETE", headers: { cookie: cookie2 } });
  assert.equal(del2.status, 404, "ștergerea datelor altui cont = 404");
  const still = (await call("/api/crud/entries?month=1999-02")).json.find((e) => e.id === mine.json.id);
  assert.equal(still?.amount, 1, "intrarea a rămas neatinsă");
  await call(`/api/crud/entries?id=${mine.json.id}`, { method: "DELETE" });
});

test("backup-ul conține toate tabelele financiare", async () => {
  const r = await call("/api/backup");
  assert.equal(r.status, 200);
  for (const t of ["user_settings", "categories", "entries", "loans", "goals", "loan_schedules", "planned_purchases"]) {
    assert.ok(Array.isArray(r.json.data[t]), t);
  }
});

test("invitații: cont nou dintr-un link de o singură folosire, fără acces de admin, cu profil privat", async (t) => {
  const me = await call("/api/auth/status");
  if (!me.json.user?.isAdmin) return t.skip("TEST_USER nu este administrator");

  const inv = await call("/api/admin/invitations", { method: "POST", body: { note: "[test]" } });
  assert.equal(inv.status, 200);
  const code = new URL(inv.json.link).searchParams.get("cod");
  assert.equal((await call(`/api/auth/register?cod=${code}`, { auth: false })).json.valid, true);

  const username = `test_${Date.now()}`;
  const reg = await fetch(BASE + "/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, username, password: "parola-de-test-123" }),
  });
  assert.equal(reg.status, 200, "înregistrare");
  const cookieNew = reg.headers.get("set-cookie").split(";")[0];
  const asNew = (p, init = {}) => fetch(BASE + p, { ...init, headers: { "content-type": "application/json", cookie: cookieNew } });

  // Linkul nu mai merge a doua oară.
  const again = await call("/api/auth/register", { method: "POST", auth: false, body: { code, username: `${username}_2`, password: "parola-de-test-123" } });
  assert.equal(again.status, 404, "invitația e de o singură folosire");

  // Contul nou: ghidul de început e în curs, nu e admin, nu vede datele nimănui.
  const status = await (await asNew("/api/auth/status")).json();
  assert.equal(status.onboardingPending, true);
  assert.equal(status.user.isAdmin, false);
  assert.equal((await asNew("/api/admin/users")).status, 403, "fără acces la administrare");
  assert.deepEqual(await (await asNew("/api/crud/loans")).json(), [], "fără creditele altora");

  // Profilul influențează fondul de urgență.
  const saved = await (await asNew("/api/profile", { method: "PUT", body: JSON.stringify({ occupation: "freelancer", income_stability: "variable" }) })).json();
  assert.equal(saved.emergency.months, 6, "venit variabil → 6 luni");

  // Curățenie: adminul șterge contul de test (cu toate datele lui).
  const users = (await call("/api/admin/users")).json.users;
  const created = users.find((u) => u.username === username);
  assert.ok(created, "contul apare în lista adminului");
  assert.equal((await call(`/api/admin/users?id=${created.id}`, { method: "DELETE" })).status, 200);
  assert.equal((await asNew("/api/auth/status").then((r) => r.json())).authenticated, false, "sesiunea contului șters nu mai e validă");
});
