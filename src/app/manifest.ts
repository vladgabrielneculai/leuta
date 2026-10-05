import type { MetadataRoute } from "next";

/** Manifest PWA: aplicația poate fi instalată pe telefon și se deschide ca o aplicație separată. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Leuța — bugetul tău, ban cu ban",
    short_name: "Leuța",
    description: "Venituri, cheltuieli, credite și economii — lună de lună.",
    start_url: "/",
    display: "standalone",
    background_color: "#0B1417",
    theme_color: "#0B1417",
    lang: "ro",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
