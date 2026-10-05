"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bar as RBar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Summary } from "@/lib/analytics";
import { addMonths, lei, monthLabel, pct, termLabel } from "@/lib/util";
import BankScheduleImport, { type BankImportResult } from "@/components/BankScheduleImport";
import LoanForm, { emptyLoan } from "@/components/LoanForm";
import { api, Bar, chartTooltipStyle, Empty, Modal, Money, PageHeader, Panel, Skeleton, Stat, useApi, useApp } from "@/components/ui";
import { loanFieldsFromSchedule, loanNameFromMeta } from "@/lib/loanImport";

export default function LoansPage() {
  const { month, bump } = useApp();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const { data: s } = useApi<Summary>(`/api/summary?month=${month}`);

  const loans = s?.loans ?? [];
  const active = loans.filter((l) => l.status.balance > 0);
  const totalDebt = active.reduce((a, l) => a + l.status.balance, 0);
  const totalPayment = active.reduce((a, l) => a + l.status.nextPayment + l.status.nextInsurance, 0);
  const interestLeft = active.reduce((a, l) => a + l.status.interestLeft, 0);
  const saved = loans.reduce((a, l) => a + l.interestSaved, 0);
  const totalPaid = loans.reduce((a, l) => a + (l.status.totalPaidSoFar || 0), 0);
  const totalPrincipalPaid = loans.reduce((a, l) => a + (l.status.principalPaid || 0), 0);

  // Credit nou direct din graficul băncii: datele creditului + ratele, salvate împreună.
  const createFromSchedule = async (r: BankImportResult) => {
    setImportError(null);
    setImportBusy(true);
    try {
      const base = emptyLoan();
      const fields = loanFieldsFromSchedule(r.meta, r.rows, { ...base, start_date: "" });
      const createLoan = { ...base, name: loanNameFromMeta(r.meta), ...fields, ...r.annual };
      const entries = r.rows.map(({ date: _date, ...row }) => row);
      const res = await api<{ loanId: number }>("/api/loan-schedule", "POST", {
        createLoan,
        entries,
        source: r.filename.toLowerCase().endsWith(".pdf") ? "pdf" : "file",
      });
      setImporting(false);
      bump();
      router.push(`/credite/${res.loanId}`);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Creditul nu a putut fi creat");
    } finally {
      setImportBusy(false);
    }
  };

  const chartData = loans.map((l) => ({
    name: l.loan.name,
    Achitat: Math.round(l.status.principalPaid || (l.loan.principal - l.status.balance)),
    Rămas: Math.round(l.status.balance),
    "Dobândă de plătit": Math.round(l.status.interestLeft),
  }));

  return (
    <>
      <PageHeader
        title="Credite"
        intro="Situația fiecărui credit la luna selectată, cu plățile anticipate deja făcute și istoricul achitat."
        actions={
          <>
            <button className="btn-ghost" onClick={() => setImporting(true)}>📄 Adaugă din grafic PDF</button>
            <button className="btn-primary" onClick={() => setAdding(true)}>Adaugă credit</button>
          </>
        }
      />

      {!s ? (
        <Skeleton />
      ) : loans.length === 0 ? (
        <Empty title="Niciun credit adăugat">
          Adaugă creditul ipotecar ca să vezi graficul de rambursare, efectul plăților anticipate și trecerea la dobânda variabilă.
          Cel mai simplu: încarcă graficul de rambursare PDF descărcat din aplicația băncii (BCR / George).
        </Empty>
      ) : (
        <>
          <div className="panel mb-6 grid grid-cols-2 gap-6 p-5 lg:grid-cols-5">
            <Stat
              label="Bani deja achitați"
              accent="var(--c-leu)"
              hint={`${lei(totalPrincipalPaid)} principal restituit`}
            >
              <Money value={totalPaid} rate={s.fx.rate} size="lg" tone="leu" />
            </Stat>
            <Stat label="Datorie rămasă (Sold)" accent="var(--c-mov)"><Money value={totalDebt} rate={s.fx.rate} size="lg" /></Stat>
            <Stat label="Rate lunare" accent="var(--c-mov)" hint={`${pct(s.totals.dti)} din venitul lunii`}>
              <Money value={totalPayment} rate={s.fx.rate} size="lg" />
            </Stat>
            <Stat label="Dobândă de plătit" accent="var(--c-rosu)"><Money value={interestLeft} rate={s.fx.rate} size="lg" /></Stat>
            <Stat label="Dobândă economisită" accent="var(--c-leu)" hint="prin plăți anticipate"><Money value={saved} rate={s.fx.rate} size="lg" tone="leu" /></Stat>
          </div>

          <div className="mb-6 grid gap-6 md:grid-cols-2">
            {loans.map((l) => (
              <Link key={l.loan.id} href={`/credite/${l.loan.id}`} className="panel block p-5 transition-colors hover:border-mov">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[20px] font-semibold">{l.loan.name}</h2>
                    <p className="text-[13px] text-ink-soft">
                      {l.loan.bank || "Bancă nespecificată"} · {lei(l.loan.principal)} pe {termLabel(l.loan.term_months)} ·{" "}
                      {l.loan.schedule_type === "annuity" ? "rate egale" : "rate descrescătoare"}
                    </p>
                  </div>
                  <span
                    className="shrink-0 rounded px-2 py-0.5 text-[12px] font-medium"
                    style={l.status.balance <= 0 ? { background: "var(--c-leu-tint)", color: "var(--c-leu)" } : l.status.inFixed ? { background: "var(--c-albastru-tint)", color: "var(--c-albastru)" } : { background: "var(--c-mov-tint)", color: "var(--c-mov)" }}
                  >
                    {l.status.balance <= 0 ? "Achitat complet" : l.status.inFixed ? "Dobândă fixă" : "Dobândă variabilă"}
                  </span>
                </div>
                <div className="mt-4"><Bar value={l.status.paidPct} color="var(--c-leu)" /></div>
                <dl className="num mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-[13px]">
                  <div><dt className="text-ink-soft">Bani deja plătiți</dt><dd className="font-semibold text-leu">{lei(l.status.totalPaidSoFar)}</dd></div>
                  <div><dt className="text-ink-soft">Sold rămas</dt><dd className="font-medium text-mov">{lei(l.status.balance)}</dd></div>
                  <div><dt className="text-ink-soft">Rata următoare</dt><dd className="font-medium">{lei(l.status.nextPayment + l.status.nextInsurance)}</dd></div>
                  <div><dt className="text-ink-soft">Dobânda acum</dt><dd className="font-medium">{pct(l.status.currentRate, 2)}</dd></div>
                  <div><dt className="text-ink-soft">Rate achitate</dt><dd className="font-medium">{l.status.installmentsPaidCount} rate ({pct(l.status.paidPct, 0)})</dd></div>
                  <div><dt className="text-ink-soft">Ultima rată</dt><dd className="font-medium">{monthLabel(l.status.payoffMonth)}</dd></div>
                </dl>
              </Link>
            ))}

          </div>

          {loans.length > 1 && (
            <Panel title="Comparație între credite">
              <div className="h-[280px]">
                <ResponsiveContainer>
                  <BarChart data={chartData} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid stroke="var(--c-line)" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 13 }} width={120} />
                    <Tooltip {...chartTooltipStyle} formatter={(v: number) => lei(v)} />
                    <Legend wrapperStyle={{ fontSize: 13 }} iconType="circle" iconSize={8} />
                    <RBar dataKey="Achitat" stackId="a" fill="var(--c-leu)" />
                    <RBar dataKey="Rămas" stackId="a" fill="var(--c-mov)" />
                    <RBar dataKey="Dobândă de plătit" stackId="a" fill="var(--c-rosu)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-[13px] text-ink-soft">
                Cu mai multe credite, plățile anticipate aduc cel mai mult la cel cu dobânda cea mai mare (metoda avalanșă).
              </p>
            </Panel>
          )}
        </>
      )}

      <Modal open={importing} onClose={() => setImporting(false)} title="Credit nou din graficul băncii">
        <BankScheduleImport
          busy={importBusy}
          confirmLabel={(count) => `Creează creditul (${count} rate)`}
          onConfirm={createFromSchedule}
        />
        {importError && <p className="mt-3 text-[13px] text-rosu">{importError}</p>}
      </Modal>

      <Modal open={adding} onClose={() => setAdding(false)} title="Credit nou">
        <LoanForm
          onCancel={() => setAdding(false)}
          onSaved={(l) => {
            setAdding(false);
            bump();
            router.push(`/credite/${l.id}`);
          }}
        />
      </Modal>
    </>
  );
}
