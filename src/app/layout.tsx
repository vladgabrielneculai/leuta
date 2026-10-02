import type { Metadata, Viewport } from "next";
import "./globals.css";
import Shell from "@/components/Shell";
import { AppProvider } from "@/components/ui";

export const metadata: Metadata = {
  title: "Banii mei",
  description: "Gestiunea lunară a veniturilor, cheltuielilor, creditelor și economiilor",
  manifest: "/manifest.webmanifest",
  // Permite „Adaugă pe ecranul principal” pe iPhone, cu aspect de aplicație (fără bara Safari).
  appleWebApp: { capable: true, title: "Banii mei", statusBarStyle: "default" },
  icons: { apple: "/apple-icon.png" },
  // Aplicație personală: nu vrem să apară în motoarele de căutare.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // conținutul ajunge sub notch; marginile sigure sunt tratate în Shell
  themeColor: "#EDF1EE",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body>
        <AppProvider>
          <Shell>{children}</Shell>
        </AppProvider>
      </body>
    </html>
  );
}
