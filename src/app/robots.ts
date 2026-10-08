import type { MetadataRoute } from "next";

/** Aplicația (app.leuta.ro) e privată: nu se indexează. Site-ul de prezentare are propriile reguli (app/(site)/site/robots.txt). */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
