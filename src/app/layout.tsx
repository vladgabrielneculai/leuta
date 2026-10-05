import type { Metadata, Viewport } from "next";
import "./globals.css";
import Shell from "@/components/Shell";
import { AppProvider } from "@/components/ui";
import { THEME_BOOT_SCRIPT, THEME_COLORS } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Leuța",
  description: "Leuța — bugetul tău lunar: venituri, cheltuieli, credite și economii, ban cu ban.",
  manifest: "/manifest.webmanifest",
  // Permite „Adaugă pe ecranul principal” pe iPhone, cu aspect de aplicație (fără bara Safari).
  appleWebApp: { capable: true, title: "Leuța", statusBarStyle: "default" },
  icons: { apple: "/apple-icon.png" },
  // Aplicație personală: nu vrem să apară în motoarele de căutare.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // conținutul ajunge sub notch; marginile sigure sunt tratate în Shell
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme e pus de scriptul de mai jos înainte de randare → suppressHydrationWarning.
    <html lang="ro" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <AppProvider>
          <Shell>{children}</Shell>
        </AppProvider>
      </body>
    </html>
  );
}
