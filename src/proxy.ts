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
const PUBLIC_PATHS = ["/login", "/setup", "/api/auth/login", "/api/auth/setup", "/api/auth/status"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Header-ul `x-user-id` spune bazei de date al cui sunt datele. Îl ștergem mereu din cererea
  // venită de la client și îl punem doar noi, după validarea sesiunii — deci nu poate fi falsificat.
  const headers = new Headers(req.headers);
  headers.delete("x-user-id");

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
  // Totul, mai puțin fișierele statice ale Next.js și iconițele/manifestul PWA.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|icon-.*\\.png|apple-icon.png|manifest.webmanifest).*)"],
};
