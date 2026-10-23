"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fmtCur, PHASE_STYLE, periodLabel, tripLeft, tripPhase, type TripListItem } from "@/lib/trips";
import { TripForm } from "@/components/Trips";
import { Bar, Empty, Modal, PageHeader, Skeleton, useApi, useApp } from "@/components/ui";

function TripCard({ t }: { t: TripListItem }) {
  const phase = tripPhase(t);
  const { available, spent, left } = tripLeft(t);
  // Ce s-a plătit în alte monede decât cea a vacanței apare separat, fără conversie.
  const others = Object.entries(t.spent).filter(([c, v]) => c !== t.currency && v > 0);
  return (
    <Link href={`/vacante/${t.id}`} className="panel block p-5 transition-colors hover:border-albastru">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[19px] font-semibold">{t.name}</h2>
          <p className="text-[13px] text-ink-soft">
            {t.destination && <>{t.destination} · </>}
            {periodLabel(t)}
          </p>
        </div>
        <span className="shrink-0 rounded-sm px-2 py-0.5 text-[12px] font-medium" style={{ color: PHASE_STYLE[phase].color, background: PHASE_STYLE[phase].bg }}>
          {PHASE_STYLE[phase].label}
        </span>
      </div>
      {available > 0 ? (
        <>
          <div className="mt-4">
            <Bar value={spent} max={available} color={left < 0 ? "var(--c-rosu)" : "var(--c-albastru)"} />
          </div>
          <p className="num mt-2 text-[13px] text-ink-soft">
            Cheltuit <strong className="text-ink">{fmtCur(spent, t.currency)}</strong> din {fmtCur(available, t.currency)}
            {left < 0 ? <span className="text-rosu"> · depășit cu {fmtCur(-left, t.currency)}</span> : <> · rămași {fmtCur(left, t.currency)}</>}
          </p>
        </>
      ) : (
        <p className="num mt-4 text-[13px] text-ink-soft">
          Cheltuit <strong className="text-ink">{fmtCur(spent, t.currency)}</strong>
        </p>
      )}
      {others.length > 0 && <p className="num mt-1 text-[12px] text-ink-faint">+ {others.map(([c, v]) => fmtCur(v, c)).join(" + ")}</p>}
    </Link>
  );
}

export default function TripsPage() {
  const router = useRouter();
  const { bump } = useApp();
  const [adding, setAdding] = useState(false);
  const { data: trips, error } = useApi<TripListItem[]>("/api/trips");

  const current = (trips ?? []).filter((t) => tripPhase(t) !== "incheiata").reverse(); // cea mai apropiată prima
  const past = (trips ?? []).filter((t) => tripPhase(t) === "incheiata");

  return (
    <>
      <PageHeader
        title="Vacanțe"
        intro="Cheltuielile din concedii, în moneda locului, separat de bugetul lunar."
        actions={<button className="btn-primary" onClick={() => setAdding(true)}>+ Vacanță nouă</button>}
      />

      {error ? (
        <Empty title="Vacanțele nu s-au putut încărca">{error}</Empty>
      ) : !trips ? (
        <Skeleton variant="block" />
      ) : trips.length === 0 ? (
        <Empty title="Nicio vacanță încă">
          Creează o vacanță, alege moneda locului (euro, liră turcească, forint…) și trece banii pe care îi ai deja. Fiecare cheltuială scade
          direct din ei, fără conversii. Nimic de aici nu intră în bugetul lunar.
          <div className="mt-4">
            <button className="btn-primary" onClick={() => setAdding(true)}>Creează prima vacanță</button>
          </div>
        </Empty>
      ) : (
        <>
          {current.length > 0 && (
            <div className="mb-8 grid gap-6 md:grid-cols-2">
              {current.map((t) => <TripCard key={t.id} t={t} />)}
            </div>
          )}
          {past.length > 0 && (
            <>
              <h2 className="receipt-title mb-3">Vacanțe încheiate</h2>
              <div className="grid gap-6 md:grid-cols-2">
                {past.map((t) => <TripCard key={t.id} t={t} />)}
              </div>
            </>
          )}
        </>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Vacanță nouă">
        <TripForm
          onCancel={() => setAdding(false)}
          onSaved={(t) => {
            setAdding(false);
            bump();
            router.push(`/vacante/${t.id}`);
          }}
        />
      </Modal>
    </>
  );
}
