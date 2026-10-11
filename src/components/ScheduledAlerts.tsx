"use client";

import Link from "next/link";
import type { Alert } from "@/lib/scheduledServer";
import { lei } from "@/lib/util";
import { useApi } from "./ui";

const fmtDate = (d: string) => d.split("-").reverse().join(".");
const money = (n: number, currency: string) => (currency === "EUR" ? `${n.toFixed(2).replace(".", ",")} €` : lei(n));

/** Pe panou (beta): abonamentele care se reînnoiesc în următoarele zile și cele care s-au scumpit. */
export function ScheduledAlerts() {
  const { data } = useApi<{ alerts: Alert[] }>("/api/scheduled");
  const alerts = data?.alerts ?? [];
  if (!alerts.length) return null;
  return (
    <section className="mb-6 rounded-md border border-galben/50 bg-galben/10 p-4 text-[13.5px]">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="font-semibold text-ink">Abonamente</span>
        <Link href="/abonamente" className="text-[12.5px] font-semibold text-leu hover:underline">Vezi toate →</Link>
      </div>
      <ul className="flex flex-col gap-1">
        {alerts.slice(0, 4).map((a, i) => (
          <li key={i}>
            {a.type === "renewal" ? (
              <>🔁 <strong>{a.name}</strong>: {money(a.amount, a.currency)} {a.days <= 0 ? "azi" : a.days === 1 ? "mâine" : `pe ${fmtDate(a.date)}`}</>
            ) : (
              <>📈 <strong>{a.name}</strong> s-a scumpit: {money(a.previous, a.currency)} → {money(a.amount, a.currency)}</>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
