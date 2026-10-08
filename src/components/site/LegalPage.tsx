import type { ReactNode } from "react";
import Header from "./Header";
import Footer from "./Footer";
import { SITE, isDraft } from "@/lib/site/config";

/** Cadrul comun al paginilor legale: un bon lung, ușor de citit. */
export default function LegalPage({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <>
      <Header home={false} />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-28 sm:px-6">
        <p className="kicker">{kicker}</p>
        <h1 className="mt-4 text-[32px] font-bold leading-[1.1] sm:text-[44px]">{title}</h1>
        <p className="mt-3 text-[13px] text-ink-faint">Ultima actualizare: {SITE.legalUpdated}</p>
        {isDraft && (
          <p className="mt-6 rounded-md border border-galben/40 bg-galben-tint px-4 py-3 text-[13.5px] text-ink">
            Document în pregătire: datele de identificare și de contact ale operatorului vor fi completate înainte de lansarea publică.
          </p>
        )}
        <article className="panel prose-legal mt-8 px-5 pb-8 pt-4 sm:px-10">{children}</article>
      </main>
      <Footer />
    </>
  );
}

export function Contact() {
  return (
    <>
      <strong>{SITE.operator.name}</strong>, persoană fizică, email: <strong>{SITE.operator.email}</strong>
    </>
  );
}
