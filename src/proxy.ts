import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, userForToken } from "@/lib/auth";

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
  "/api/auth/passkey/login/options", "/api/auth/passkey/login/verify",
  // Apelate de servicii externe, autentificate în rută: Telegram (secret în header) și Vercel Cron (CRON_SECRET).
  "/api/telegram/webhook", "/api/cron/daily",
  // Lista de așteptare, apelată de serverul site-ului de prezentare (cheia WAITLIST_KEY e verificată în rută).
  "/api/waitlist",
];

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

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

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Header-ul `x-user-id` spune bazei de date al cui sunt datele. Îl ștergem mereu din cererea
  // venită de la client și îl punem doar noi, după validarea sesiunii — deci nu poate fi falsificat.
  const headers = new Headers(req.headers);
  headers.delete("x-user-id");

  if (pathname.startsWith("/api/") && isCrossSite(req)) {
    return NextResponse.json({ error: "Cerere respinsă." }, { status: 403 });
  }

  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next({ request: { headers } });

  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value);
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
  // Totul, mai puțin fișierele statice ale Next.js, iconițele/manifestul PWA și imaginile din emailuri
  // (sigla din /email/ e încărcată de clientul de email, fără sesiune).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|icon-.*\\.png|apple-icon.png|manifest.webmanifest|email/).*)"],
};
