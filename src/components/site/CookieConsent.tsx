"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import { SITE } from "@/lib/site/config";

/**
 * Banner de cookie-uri pentru Google Analytics. Apare doar dacă NEXT_PUBLIC_GA_ID e setat.
 * Scriptul Google se încarcă numai după „Accept”; „Refuz” e la fel de vizibil (cerință GDPR/ePrivacy).
 * Alegerea se păstrează 6 luni în localStorage; „Setări cookie-uri” din subsol redeschide bannerul.
 */
const KEY = "leuta-site-cookies";
const MAX_AGE = 1000 * 60 * 60 * 24 * 182;
export const OPEN_EVENT = "leuta:cookie-settings";

type Choice = "accepted" | "rejected";

function readChoice(): Choice | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { choice, at } = JSON.parse(raw) as { choice: Choice; at: number };
    return Date.now() - at < MAX_AGE ? choice : null;
  } catch {
    return null;
  }
}

/** Șterge cookie-urile _ga* setate anterior, când vizitatorul își retrage acordul. */
function clearGaCookies() {
  const host = location.hostname;
  const domains = ["", host, "." + host, "." + host.split(".").slice(-2).join(".")];
  document.cookie
    .split(";")
    .map((c) => c.split("=")[0].trim())
    .filter((n) => n.startsWith("_ga"))
    .forEach((n) => domains.forEach((d) => (document.cookie = `${n}=; Max-Age=0; path=/${d ? `; domain=${d}` : ""}`)));
}

export default function CookieConsent() {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!SITE.gaId) return;
    const c = readChoice();
    setChoice(c);
    setOpen(c === null);
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, []);

  if (!SITE.gaId) return null;

  const decide = (c: Choice) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ choice: c, at: Date.now() }));
    } catch {}
    if (c === "rejected" && choice === "accepted") {
      clearGaCookies();
      location.reload(); // scriptul Google deja încărcat nu se poate „descărca” altfel
      return;
    }
    setChoice(c);
    setOpen(false);
  };

  return (
    <>
      {choice === "accepted" && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${SITE.gaId}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${SITE.gaId}',{anonymize_ip:true});`}
          </Script>
        </>
      )}
      {open && (
        <div role="dialog" aria-labelledby="cookie-title" className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-xl sm:bottom-5">
          <div className="panel px-5 pb-5 pt-5 shadow-2xl">
            <p id="cookie-title" className="receipt-title">Cookie-uri</p>
            <p className="mt-2 text-[13.5px] text-ink-soft">
              Folosim Google Analytics ca să vedem câți oameni vizitează site-ul și de unde vin. Se activează doar dacă accepți. Detalii în{" "}
              <Link href="/cookies" className="text-albastru underline underline-offset-2">
                Politica de cookie-uri
              </Link>
              .
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" className="btn-ghost !min-h-[42px]" onClick={() => decide("rejected")}>
                Refuz
              </button>
              <button type="button" className="btn-primary !min-h-[42px]" onClick={() => decide("accepted")}>
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Link din subsol care redeschide bannerul (apare doar când Google Analytics e activ). */
export function CookieSettingsLink() {
  if (!SITE.gaId) return null;
  return (
    <button type="button" className="hover:text-ink" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
      Setări cookie-uri
    </button>
  );
}
