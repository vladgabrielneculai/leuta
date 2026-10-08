/**
 * Header-e de securitate pentru toate paginile și rutele API:
 * - CSP: scripturi, stiluri, fonturi și cereri doar de pe domeniul aplicației (fără resurse externe);
 *   pagina nu poate fi pusă într-un iframe (anti-clickjacking).
 * - HSTS: browserul folosește mereu HTTPS.
 * - restul: fără ghicirea tipului de fișier, fără referrer către alte site-uri, fără cameră/microfon/locație.
 * 'unsafe-inline' la scripturi e necesar pentru scripturile de hidratare generate de Next.js.
 */
const dev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (dev ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/**
 * Site-ul de prezentare (leuta.ro, vezi SITE_HOSTS și proxy.ts) poate folosi Google Analytics, dar numai dacă
 * NEXT_PUBLIC_GA_ID e setat și doar după acordul vizitatorului. Domeniile Google sunt permise doar pe adresa
 * site-ului; aplicația rămâne fără nicio resursă externă.
 */
const ga = !!process.env.NEXT_PUBLIC_GA_ID;
const siteCsp = ga
  ? csp
      .replace("script-src 'self' 'unsafe-inline'", "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com")
      .replace("img-src 'self' data: blob:", "img-src 'self' data: blob: https://*.google-analytics.com https://*.googletagmanager.com")
      .replace("connect-src 'self'", "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com")
  : csp;
const siteHosts = (process.env.SITE_HOSTS || "leuta.ro,www.leuta.ro").split(",").map((h) => h.trim()).filter(Boolean);
const siteHostRe = `(${siteHosts.map((h) => h.replace(/\./g, "\\.")).join("|")})`;

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Două root layout-uri (app/(app) și app/(site)), deci pagina 404 pentru adrese necunoscute e comună.
  experimental: { globalNotFound: true },
  serverExternalPackages: ["pdf-parse"],
  // Fonturile bonului (citite de pe disc pentru PDF și pentru imaginile de pe Telegram) trebuie incluse
  // în funcțiile Vercel care le folosesc.
  outputFileTracingIncludes: {
    "/api/receipt": ["./src/lib/receipt/fonts/**"],
    "/api/cron/daily": ["./src/lib/receipt/fonts/**"],
    "/api/notifications/test": ["./src/lib/receipt/fonts/**"],
    "/api/telegram/webhook": ["./src/lib/receipt/fonts/**"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/:path*", missing: [{ type: "host", value: siteHostRe }], headers: [{ key: "Content-Security-Policy", value: csp }] },
      { source: "/:path*", has: [{ type: "host", value: siteHostRe }], headers: [{ key: "Content-Security-Policy", value: siteCsp }] },
      { source: "/ecrane/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/media/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      // Datele financiare nu se păstrează în cache-uri intermediare sau în cache-ul browserului.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};
export default nextConfig;
