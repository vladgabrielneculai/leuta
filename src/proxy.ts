import { NextRequest, NextResponse } from "next/server";
import { clientIp, destroySession, SESSION_COOKIE, userForToken } from "@/lib/auth";
import { BETA_DENIED_MESSAGE, hasBetaAccess } from "@/lib/beta";
import { rateLimit } from "@/lib/rateLimit";

/**
 * Poarta de autentificare pe server.
 *
 * Local, verificarea se făcea doar în browser (Shell.tsx). Online asta nu ajunge:
 * oricine ar putea apela direct /api/... și ar vedea datele financiare. De aceea
 * fiecare cerere (pagină sau API) trece pe aici și e validată contra tabelei `sessions`.
 */

// Rute accesibile fără sesiune: ecranele de login/setup și endpoint-urile lor.
const PUBLIC_PATHS = [
  "/login", "/setup", "/api/auth/login", "/api/auth/setup", "/api/auth/status",
  // Crearea unui cont nou dintr-o invitație (codul e verificat în rută).
  "/inregistrare", "/api/auth/register",
  // Parolă nouă dintr-un link de resetare creat de administrator (codul e verificat în rută).
  "/resetare", "/api/auth/reset",
  "/api/auth/passkey/login/options", "/api/auth/passkey/login/verify",
  // Apelate de servicii externe, autentificate în rută: Telegram (secret în header) și Vercel Cron (CRON_SECRET).
  "/api/telegram/webhook", "/api/cron/daily",
  // Formularul listei de așteptare de pe site-ul de prezentare (limitat per IP în rută).
  "/api/waitlist",
  // Regulile pentru roboți (aplicația nu se indexează).
  "/robots.txt",
];

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Limite de cereri per IP pe minut (vezi lib/rateLimit.ts). Rutele publice de autentificare au o limită
 * strictă (ghicirea parolelor/codurilor, provocări WebAuthn create fără cont); restul API-ului, una largă,
 * peste ce face aplicația în uz normal. Telegram și Vercel Cron vin de pe IP-urile lor și au secretul lor.
 */
const STRICT_PATHS = new Set([
  "/api/auth/login", "/api/auth/setup", "/api/auth/register", "/api/auth/reset", "/api/auth/reauth/verify",
  "/api/auth/passkey/login/options", "/api/auth/passkey/login/verify", "/api/waitlist",
]);
const UNLIMITED_PATHS = new Set(["/api/telegram/webhook", "/api/cron/daily"]);
const STRICT_PER_MIN = 60;
const API_PER_MIN = 300;

function tooManyRequests(req: NextRequest, pathname: string) {
  if (!pathname.startsWith("/api/") || UNLIMITED_PATHS.has(pathname)) return null;
  const ip = clientIp(req.headers);
  const checks = [rateLimit(`api:${ip}`, API_PER_MIN, 60_000)];
  if (STRICT_PATHS.has(pathname)) checks.push(rateLimit(`auth:${ip}`, STRICT_PER_MIN, 60_000));
  const blocked = checks.find((c) => !c.ok);
  if (!blocked) return null;
  return NextResponse.json(
    { error: "Prea multe cereri. Încearcă din nou peste un minut." },
    { status: 429, headers: { "Retry-After": String(blocked.retryAfterSec) } },
  );
}

/**
 * Protecție CSRF suplimentară (pe lângă cookie-ul SameSite=Lax): o cerere care modifică date trebuie să
 * vină din aplicația însăși. Browserele trimit mereu `Origin` / `Sec-Fetch-Site` la POST/PUT/DELETE.
 */
function isCrossSite(req: NextRequest) {
  if (SAFE_METHODS.has(req.method)) return false;
  if (req.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = req.headers.get("origin");
  if (!origin) return false; // clienți non-browser (fără cookie-ul cuiva) — nu sunt un vector CSRF
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim();
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/**
 * Site-ul de prezentare și aplicația sunt în același proiect, pe adrese diferite:
 * - leuta.ro (SITE_HOSTS) arată paginile din app/(site)/site, la adresele lor scurte („/”, „/termeni”…);
 *   orice altă pagină cerută acolo (ex. /login) trimite la aplicație (APP_URL);
 * - app.leuta.ro (și orice altă adresă, ex. previzualizările Vercel) e aplicația; paginile legale merg și aici,
 *   iar prima pagină a site-ului se poate vedea la /site.
 */
const SITE_HOSTS = (process.env.SITE_HOSTS || "leuta.ro,www.leuta.ro").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
const APP_URL = (process.env.APP_URL || "https://app.leuta.ro").replace(/\/$/, "");
const SITE_PAGES = ["/confidentialitate", "/termeni", "/cookies"];

function hostOf(req: NextRequest) {
  return (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}

/** Cererile de pe adresa site-ului: paginile de prezentare sau redirecționare spre aplicație. */
function siteRoute(req: NextRequest, headers: Headers) {
  const { pathname, search } = req.nextUrl;
  const rewrite = (to: string) => {
    const url = req.nextUrl.clone();
    url.pathname = to;
    return NextResponse.rewrite(url, { request: { headers } });
  };
  if (pathname === "/") return rewrite("/site");
  if (SITE_PAGES.includes(pathname)) return rewrite(`/site${pathname}`);
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml") return rewrite(`/site${pathname}`);
  if (pathname === "/site" || pathname.startsWith("/site/")) {
    // Adresa canonică e fără /site; redirecționarea păstrează adresa cerută (leuta.ro sau www).
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || req.nextUrl.protocol.replace(":", "");
    const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host).split(",")[0].trim();
    return NextResponse.redirect(`${proto}://${host}${pathname.slice(5) || "/"}${search}`, 308);
  }
  if (pathname === "/api/waitlist") return NextResponse.next({ request: { headers } });
  return NextResponse.redirect(`${APP_URL}${pathname}${search}`, 308);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Header-ul `x-user-id` spune bazei de date al cui sunt datele. Îl ștergem mereu din cererea
  // venită de la client și îl punem doar noi, după validarea sesiunii — deci nu poate fi falsificat.
  const headers = new Headers(req.headers);
  headers.delete("x-user-id");

  if (pathname.startsWith("/api/") && isCrossSite(req)) {
    return NextResponse.json({ error: "Cerere respinsă." }, { status: 403 });
  }
  const limited = tooManyRequests(req, pathname);
  if (limited) return limited;

  if (SITE_HOSTS.includes(hostOf(req))) return siteRoute(req, headers);

  // Pe adresa aplicației: paginile legale și prima pagină a site-ului (/site) sunt publice.
  if (SITE_PAGES.includes(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = `/site${pathname}`;
    return NextResponse.rewrite(url, { request: { headers } });
  }
  if (pathname === "/site" || pathname.startsWith("/site/")) return NextResponse.next({ request: { headers } });

  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next({ request: { headers } });

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = await userForToken(token);
  // Pe beta, o sesiune a unui cont fără acces (ex. deschisă înainte de restricție) se închide.
  if (user && !hasBetaAccess(user.username)) {
    await destroySession(token!);
    const res = pathname.startsWith("/api/")
      ? NextResponse.json({ error: BETA_DENIED_MESSAGE, betaDenied: true }, { status: 403 })
      : NextResponse.redirect(Object.assign(req.nextUrl.clone(), { pathname: "/login", search: "?beta=0" }));
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }
  if (user) {
    headers.set("x-user-id", String(user.id));
    return NextResponse.next({ request: { headers } });
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Totul, mai puțin fișierele statice ale Next.js, iconițele/manifestul PWA, imaginile din emailuri
  // (sigla din /email/ e încărcată de clientul de email, fără sesiune) și imaginile/clipul site-ului de prezentare.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|icon-.*\\.png|apple-icon.png|manifest.webmanifest|email/|ecrane/|media/|og.png).*)"],
};
