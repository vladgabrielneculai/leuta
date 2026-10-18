"use client";

import Link from "next/link";
import { activeTrip, daysBetween, fmtCur, todayIso, tripLeft, type TripListItem } from "@/lib/trips";
import { Bar, useApi } from "./ui";
import { useQuickAdd } from "./QuickAdd";

/** Cardul de pe Panou cât timp ești în vacanță: cât ți-a rămas și adăugarea rapidă a unei cheltuieli. */
export default function ActiveTripCard() {
  const { data: trips } = useApi<TripListItem[]>("/api/trips");
  const quickAdd = useQuickAdd();
  const trip = trips ? activeTrip(trips) : null;
  if (!trip) return null;

  const { available, spent, left } = tripLeft(trip);
  const daysLeft = daysBetween(todayIso(), trip.end_date);
  const day = daysBetween(trip.start_date, todayIso());
  const total = daysBetween(trip.start_date, trip.end_date);

  return (
    <section className="panel mb-6 p-4 sm:p-5" style={{ borderColor: "var(--c-albastru)" }}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-albastru">
            🧳 În vacanță · ziua {day} din {total}
          </div>
          <h3 className="mt-1 truncate text-[17px] font-semibold text-ink">
            {trip.name}
            {trip.destination && <span className="font-normal text-ink-soft"> · {trip.destination}</span>}
          </h3>
          {available > 0 ? (
            <>
              <p className="num mt-1 text-[14px] text-ink-soft">
                Rămași <strong className={left < 0 ? "text-rosu" : "text-ink"}>{fmtCur(left, trip.currency)}</strong> din {fmtCur(available, trip.currency)}
                {left > 0 && daysLeft > 0 && <> · ~{fmtCur(left / daysLeft, trip.currency)} pe zi</>}
              </p>
              <div className="mt-2 max-w-md">
                <Bar value={spent} max={available} color={left < 0 ? "var(--c-rosu)" : "var(--c-albastru)"} />
              </div>
            </>
          ) : (
            <p className="num mt-1 text-[14px] text-ink-soft">
              Cheltuit până acum: <strong className="text-ink">{fmtCur(spent, trip.currency)}</strong>
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button className="btn-primary flex-1 px-4 py-2 text-[13px] sm:flex-none" onClick={() => quickAdd({ trip: true })}>
            + Cheltuială
          </button>
          <Link href={`/vacante/${trip.id}`} className="btn-ghost flex-1 border border-line-strong/70 px-4 py-2 text-center text-[13px] sm:flex-none">
            Deschide
          </Link>
        </div>
      </div>
    </section>
  );
}
