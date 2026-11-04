import type { MetadataRoute } from "next";

/** Manifest PWA: aplicația poate fi instalată pe telefon și se deschide ca o aplicație separată. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Leuța — bugetul tău, ban cu ban",
    short_name: "Leuța",
    description: "Venituri, cheltuieli, credite și economii — lună de lună.",
    start_url: "/",
    display: "standalone",
    background_color: "#050505",
    theme_color: "#050505",
    lang: "ro",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Ținând apăsat pe iconița aplicației (pe Android): adaugi direct o intrare (în vacanță, la vacanța în curs).
    shortcuts: [
      { name: "Adaugă o cheltuială", short_name: "Adaugă", url: "/?add=1", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Luna curentă", short_name: "Luna", url: "/luna", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
