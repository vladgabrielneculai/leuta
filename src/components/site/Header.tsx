"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SITE } from "@/lib/site/config";

/** Bara de sus: transparentă peste prima secțiune, apoi hârtie cu umbră; dedesubt, progresul paginii. */
export default function Header({ home = true }: { home?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const p = max > 0 ? window.scrollY / max : 0;
        if (bar.current) bar.current.style.transform = `scaleX(${p})`;
        setScrolled(window.scrollY > 12);
      });
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);

  const anchor = (id: string) => (home ? `#${id}` : `/#${id}`);

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow] duration-300 ${scrolled ? "bg-paper/90 shadow-[0_1px_0_rgb(var(--line))] backdrop-blur" : ""}`}>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Leuța, pagina principală">
          <img src="/icon-192.png" alt="" width={34} height={34} className="rounded-full" />
          <span className="text-[19px] font-bold tracking-tight">Leuța</span>
        </Link>
        <nav className="ml-auto hidden items-center gap-1 text-[14px] text-ink-soft md:flex" aria-label="Secțiuni">
          <a href={anchor("functii")} className="rounded-md px-3 py-2 hover:bg-sheet hover:text-ink">Funcții</a>
          <a href={anchor("siguranta")} className="rounded-md px-3 py-2 hover:bg-sheet hover:text-ink">Siguranță</a>
          <a href={anchor("intrebari")} className="rounded-md px-3 py-2 hover:bg-sheet hover:text-ink">Întrebări</a>
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-3">
          <a href={`${SITE.appUrl}/login`} className="hidden rounded-md px-3 py-2 text-[14px] font-medium text-ink-soft hover:bg-sheet hover:text-ink sm:inline-flex">
            Intră în cont
          </a>
          <a href={anchor("invitatie")} className="btn-primary !min-h-[38px] !px-4 !py-1.5 !text-[14px]">
            Cere invitație
          </a>
        </div>
      </div>
      <div ref={bar} className="progress-bar h-[3px] w-full" style={{ transform: "scaleX(0)" }} aria-hidden />
    </header>
  );
}
