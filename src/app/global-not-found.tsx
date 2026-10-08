import type { Metadata } from "next";
import "./(app)/globals.css";

/**
 * Pagina 404 pentru adresele care nu există nicăieri. Există două root layout-uri (aplicația și site-ul de
 * prezentare), deci pagina asta are propriul <html> și importă singură stilurile (vezi experimental.globalNotFound).
 */
export const metadata: Metadata = {
  title: "Pagina nu există · Leuța",
  robots: { index: false, follow: false },
};

export default function GlobalNotFound() {
  return (
    <html lang="ro">
      <body className="flex min-h-screen items-center justify-center bg-paper px-4">
        <div className="panel w-full max-w-sm px-6 pb-7 pt-6 text-center">
          <p className="receipt-title">Bon anulat</p>
          <div className="rule-dashed my-4" />
          <p className="num font-display text-[44px] font-bold leading-none">404</p>
          <p className="mt-3 text-[14px] text-ink-soft">Pagina pe care o cauți nu există sau a fost mutată.</p>
          <a href="/" className="btn-primary mt-6 w-full">
            Înapoi la început
          </a>
        </div>
      </body>
    </html>
  );
}
