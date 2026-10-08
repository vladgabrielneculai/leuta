import Link from "next/link";
import { SITE } from "@/lib/site/config";
import { CookieSettingsLink } from "./CookieConsent";

export default function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 text-[13.5px] text-ink-soft sm:px-6 md:grid-cols-[1.3fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <img src="/icon-192.png" alt="" width={30} height={30} className="rounded-full" />
            <span className="text-[17px] font-bold text-ink">Leuța</span>
          </div>
          <p className="mt-3 max-w-xs">{SITE.tagline} Bugetul lunar, creditele și economiile tale, ban cu ban.</p>
          <div className="mt-4 flex gap-1.5" aria-hidden>
            {["leu", "mov", "rosu", "galben", "albastru"].map((c) => (
              <span key={c} className="h-1.5 w-7 rounded-full" style={{ background: `var(--c-${c})` }} />
            ))}
          </div>
        </div>
        <nav aria-label="Aplicație" className="flex flex-col gap-2">
          <p className="receipt-title mb-1 text-ink">Aplicația</p>
          <a href={`${SITE.appUrl}/login`} className="hover:text-ink">Intră în cont</a>
          <a href="/#invitatie" className="hover:text-ink">Cere o invitație</a>
          <a href="/#intrebari" className="hover:text-ink">Întrebări frecvente</a>
        </nav>
        <nav aria-label="Informații legale" className="flex flex-col items-start gap-2">
          <p className="receipt-title mb-1 text-ink">Legal</p>
          <Link href="/confidentialitate" className="hover:text-ink">Politica de confidențialitate</Link>
          <Link href="/termeni" className="hover:text-ink">Termeni și condiții</Link>
          <Link href="/cookies" className="hover:text-ink">Politica de cookie-uri</Link>
          <CookieSettingsLink />
        </nav>
      </div>
      <div className="border-t border-dashed border-line-strong/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-5 text-[12px] text-ink-faint sm:flex-row sm:justify-between sm:px-6">
          <span>
            © {new Date().getFullYear()} Leuța · Operator: {SITE.operator.name} · {SITE.operator.email}
          </span>
          <span>Leuța nu oferă consultanță financiară.</span>
        </div>
      </div>
    </footer>
  );
}
