import type { Metadata, Viewport } from "next";
import "./site.css";
import CookieConsent from "@/components/site/CookieConsent";
import { SITE, isDraft } from "@/lib/site/config";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} — ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ro_RO",
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    images: [{ url: "/og.png", width: 2400, height: 1260, alt: "Leuța: bugetul tău, clar ca un bon" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
  icons: { apple: "/apple-icon.png" },
  // Cât timp datele operatorului nu sunt completate (site.ts), site-ul nu apare în motoarele de căutare.
  robots: isDraft ? { index: false, follow: false } : { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EAE5DB" },
    { media: "(prefers-color-scheme: dark)", color: "#100F0D" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body>
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
