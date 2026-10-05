/**
 * Header-e de securitate pentru toate paginile și rutele API:
 * - CSP: scripturi, stiluri, fonturi și cereri doar de pe domeniul aplicației (fără resurse externe);
 *   pagina nu poate fi pusă într-un iframe (anti-clickjacking).
 * - HSTS: browserul folosește mereu HTTPS.
 * - restul: fără ghicirea tipului de fișier, fără referrer către alte site-uri, fără cameră/microfon/locație.
 * 'unsafe-inline' la scripturi e necesar pentru scripturile de hidratare generate de Next.js.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"),
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

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
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
  serverExternalPackages: ["pdf-parse"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Datele financiare nu se păstrează în cache-uri intermediare sau în cache-ul browserului.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};
export default nextConfig;
