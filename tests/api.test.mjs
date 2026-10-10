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
import crypto from "node:crypto";

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
  assert.equal((await asNew("/api/db/info")).status, 403, "fără informații despre baza de date");
  assert.equal((await asNew("/api/db/table?table=entries")).status, 403, "fără explorarea tabelelor");
  assert.equal((await call("/api/db/info")).status, 200, "administratorul vede în continuare baza de date");
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

/** Codul TOTP (RFC 6238) pentru o cheie base32, ca o aplicație de autentificare. */
function totp(secret, offsetSteps = 0) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offsetSteps));
  const h = crypto.createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}

test("2FA: activare cu cod, login în doi pași, cod refolosit refuzat; resetare prin link de la administrator", async (t) => {
  const me = await call("/api/auth/status");
  if (!me.json.user?.isAdmin) return t.skip("TEST_USER nu este administrator");

  const inv = await call("/api/admin/invitations", { method: "POST", body: { note: "[test 2fa]" } });
  const code = new URL(inv.json.link).searchParams.get("cod");
  const username = `test2fa_${Date.now()}`;
  const password = "parola-de-test-123";
  const reg = await fetch(BASE + "/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, username, password }),
  });
  assert.equal(reg.status, 200, "înregistrare");
  const c1 = reg.headers.get("set-cookie").split(";")[0];
  const as = (c) => async (p, method = "GET", body) => {
    const r = await fetch(BASE + p, { method, headers: { "content-type": "application/json", cookie: c }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: await r.json().catch(() => null), headers: r.headers };
  };
  const login = (body, pass = password) => fetch(BASE + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password: pass, ...body }) });
  const u1 = as(c1);

  try {
    assert.equal((await u1("/api/auth/status")).json.secured, false, "cont nou = doar parolă");
    assert.deepEqual((await u1("/api/auth/reauth/options", "POST")).json.methods, ["password"]);

    // Activarea: cheia nu se salvează decât după un cod corect.
    const start = await u1("/api/auth/totp", "POST", { action: "start" });
    assert.equal(start.status, 200);
    assert.match(start.json.secret, /^[A-Z2-7]{32}$/);
    assert.match(start.json.uri, /^otpauth:\/\/totp\//);
    assert.match(start.json.qr, /^data:image\/png;base64,/);
    assert.equal((await u1("/api/auth/totp", "POST", { action: "enable", code: "000000" === totp(start.json.secret) ? "111111" : "000000" })).status, 400);
    assert.equal((await u1("/api/auth/totp")).json.enabled, false);
    const enableCode = totp(start.json.secret);
    const enabled = await u1("/api/auth/totp", "POST", { action: "enable", code: enableCode });
    assert.equal(enabled.status, 200, "activare");
    assert.equal(enabled.json.recoveryCodes, undefined, "fără coduri de recuperare");
    assert.equal((await u1("/api/auth/status")).json.secured, true);

    // Login: parola singură nu mai ajunge; parola greșită nu dezvăluie pasul 2.
    assert.equal((await login({}, "gresit-gresit-1")).status, 401);
    const step1 = await login({});
    assert.equal(step1.status, 403);
    assert.equal((await step1.json()).secondFactor.totp, true);
    assert.equal((await login({ totpCode: "12345" })).status, 401, "cod invalid");
    assert.equal((await login({ recoveryCode: "aaaa-bbbb-cccc" })).status, 403, "codurile de recuperare nu mai există");

    // Codul folosit la activare nu mai merge; următorul interval da (ceasul aplicației poate fi înainte).
    assert.equal((await login({ totpCode: enableCode })).status, 401, "același cod nu merge de două ori");
    const ok = await login({ totpCode: totp(start.json.secret, 1) });
    assert.equal(ok.status, 200, "parola + cod 2FA");
    const c2 = ok.headers.get("set-cookie").split(";")[0];

    // Reconfirmarea cere codul 2FA, nu parola.
    assert.deepEqual((await as(c2)("/api/auth/reauth/options", "POST")).json.methods, ["totp"]);
    assert.equal((await as(c2)("/api/auth/reauth/verify", "POST", { password })).status, 401, "parola singură nu reconfirmă");

    // Resetare: adminul creează linkul; persoana își alege altă parolă, 2FA se dezactivează, sesiunile se închid.
    const created = (await call("/api/admin/users")).json.users.find((u) => u.username === username);
    const reset = await call("/api/admin/users/reset", { method: "POST", body: { id: created.id } });
    assert.equal(reset.status, 200);
    const rcode = new URL(reset.json.link).searchParams.get("cod");
    assert.equal((await call(`/api/auth/reset?cod=${rcode}`, { auth: false })).json.username, username);
    assert.equal((await call("/api/auth/reset", { method: "POST", auth: false, body: { code: rcode, password: "scurta" } })).status, 400);
    const done = await fetch(BASE + "/api/auth/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: rcode, password: "parola-noua-de-test" }) });
    assert.equal(done.status, 200, "parolă nouă");
    assert.equal((await as(c2)("/api/auth/status")).json.authenticated, false, "sesiunile vechi s-au închis");
    assert.equal((await call("/api/auth/reset", { method: "POST", auth: false, body: { code: rcode, password: "alta-parola-de-test" } })).status, 404, "linkul merge o singură dată");
    assert.equal((await login({}, password)).status, 401, "parola veche nu mai merge");
    assert.equal((await login({}, "parola-noua-de-test")).status, 200, "parola nouă, fără 2FA");
  } finally {
    const created = (await call("/api/admin/users")).json.users.find((u) => u.username === username);
    if (created) await call(`/api/admin/users?id=${created.id}`, { method: "DELETE" });
  }
});

test("bonul lunii: PDF pentru o lună validă, 400 pentru o lună invalidă", async () => {
  const res = await fetch(BASE + "/api/receipt?month=1999-01", { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  assert.match(res.headers.get("content-disposition") ?? "", /Leuta-bon-1999-01\.pdf/);
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  assert.equal((await call("/api/receipt?month=1999-13")).status, 400);
  assert.equal((await call("/api/receipt?month=1999-01", { auth: false })).status, 401);
});
