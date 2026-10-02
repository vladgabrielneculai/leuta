import type { MetadataRoute } from "next";

/** Manifest PWA: aplicația poate fi instalată pe telefon și se deschide ca o aplicație separată. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Banii mei — buget personal",
    short_name: "Banii mei",
    description: "Venituri, cheltuieli, credite și economii — lună de lună.",
    start_url: "/",
    display: "standalone",
    background_color: "#EDF1EE",
    theme_color: "#EDF1EE",
    lang: "ro",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
