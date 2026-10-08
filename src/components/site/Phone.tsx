import type { CSSProperties, ReactNode } from "react";

/**
 * Ramă de telefon desenată în CSS. `width` e o valoare CSS (ex. "min(78vw, 360px)").
 * Conținutul (`children`) stă în zona aplicației, sub bara de stare; coordonatele se dau în
 * pixeli din aplicație înmulțiți cu `var(--u)` (ecranul aplicației are 390 px lățime).
 */
export default function Phone({ width, children, className = "", style }: { width: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`phone ${className}`} style={{ ["--pw" as string]: width, ...style }}>
      <div className="phone-screen">
        <div className="status" aria-hidden>
          <span>9:41</span>
          <span style={{ display: "flex", alignItems: "center", gap: "calc(4 * var(--u))" }}>
            <Bars />
            <span style={{ width: "calc(25 * var(--u))", height: "calc(12 * var(--u))", borderRadius: "calc(4 * var(--u))", background: "currentColor", opacity: 0.9 }} />
          </span>
        </div>
        <div className="island" aria-hidden />
        <div className="app">{children}</div>
      </div>
    </div>
  );
}

function Bars() {
  return (
    <span style={{ display: "flex", alignItems: "flex-end", gap: "calc(2 * var(--u))" }}>
      {[5, 8, 11].map((h) => (
        <span key={h} style={{ width: "calc(4 * var(--u))", height: `calc(${h} * var(--u))`, borderRadius: 1, background: "currentColor" }} />
      ))}
    </span>
  );
}
