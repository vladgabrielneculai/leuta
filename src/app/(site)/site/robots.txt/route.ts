import { SITE, isDraft } from "@/lib/site/config";

/** robots.txt pentru leuta.ro (proxy.ts trimite aici /robots.txt de pe adresa site-ului). */
export function GET() {
  const body = isDraft
    ? // Până la completarea datelor operatorului (lib/site/config.ts), site-ul nu se indexează.
      "User-agent: *\nDisallow: /\n"
    : `User-agent: *\nAllow: /\n\nSitemap: ${SITE.url}/sitemap.xml\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
