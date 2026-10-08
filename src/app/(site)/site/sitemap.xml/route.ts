import { SITE } from "@/lib/site/config";

/** sitemap.xml pentru leuta.ro (proxy.ts trimite aici /sitemap.xml de pe adresa site-ului). */
export function GET() {
  const urls = ["", "/confidentialitate", "/termeni", "/cookies"]
    .map((p) => `  <url><loc>${SITE.url}${p}</loc><changefreq>monthly</changefreq><priority>${p ? "0.3" : "1.0"}</priority></url>`)
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
