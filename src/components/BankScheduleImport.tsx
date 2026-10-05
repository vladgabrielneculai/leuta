"use client";

import { useRef, useState } from "react";
import type { ScheduleRow } from "@/lib/loan";
import type { ScheduleMeta } from "@/lib/scheduleParser";
import { lei, monthLabel, pct } from "@/lib/util";
import { Field } from "./ui";

export type ImportedScheduleRow = ScheduleRow & { date?: string };

export type AnnualInsurance = {
  pad_amount: number;
  pad_due_date: string;
  opt_ins_amount: number;
  opt_ins_due_date: string;
};

export type BankImportResult = {
  rows: ImportedScheduleRow[];
  meta: ScheduleMeta | null;
  filename: string;
  annual: AnnualInsurance;
  updateLoan: boolean;
};

const fmtDate = (d?: string) => (d ? d.split("-").reverse().join(".") : "–");

/**
 * Lunile în care rata totală se schimbă vizibil (ex. trecerea la dobânda variabilă). O lună doar cu
 * dobândă (BCR, la schimbarea dobânzii) nu e rata nouă: o arătăm separat și comparăm cu luna de după.
 */
function paymentJumps(rows: ImportedScheduleRow[]) {
  const out: { row: ImportedScheduleRow; from: number; to: number; interestOnly?: ImportedScheduleRow }[] = [];
  for (let i = 2; i < rows.length - 1; i++) {
    const prev = rows[i - 1].payment;
    if (prev <= 0 || rows[i - 1].principal === 0) continue;
    const interestOnly = rows[i].principal === 0 ? rows[i] : undefined;
    const to = interestOnly ? rows[i + 1].payment : rows[i].payment;
    if (Math.abs(to - prev) / prev > 0.05) out.push({ row: rows[i], from: prev, to, interestOnly });
  }
  return out.slice(0, 3);
}

/**
 * Încărcarea graficului de rambursare de la bancă (PDF BCR, Excel, CSV): citire, verificare și confirmare.
 * Asigurările anuale (PAD, facultativă) nu apar în grafic, așa că se completează aici.
 */
export default function BankScheduleImport({
  initialAnnual,
  showUpdateLoan = false,
  busy = false,
  confirmLabel,
  onConfirm,
}: {
  initialAnnual?: Partial<AnnualInsurance>;
  showUpdateLoan?: boolean;
  busy?: boolean;
  confirmLabel: (count: number) => string;
  onConfirm: (r: BankImportResult) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<{ rows: ImportedScheduleRow[]; meta: ScheduleMeta | null; filename: string } | null>(null);
  const [updateLoan, setUpdateLoan] = useState(true);
  const [annual, setAnnual] = useState<AnnualInsurance>({
    pad_amount: initialAnnual?.pad_amount ?? 0,
    pad_due_date: initialAnnual?.pad_due_date ?? "",
    opt_ins_amount: initialAnnual?.opt_ins_amount ?? 0,
    opt_ins_due_date: initialAnnual?.opt_ins_due_date ?? "",
  });

  const upload = async (file: File) => {
    setError(null);
    setUploading(true);
    setParsed(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/loan-schedule/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Eroare la citirea fișierului");
      setParsed({ rows: data.rows, meta: data.meta ?? null, filename: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la încărcare");
    } finally {
      setUploading(false);
    }
  };

  const rows = parsed?.rows ?? [];
  const meta = parsed?.meta;
  const sum = (f: (r: ImportedScheduleRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const totals = { principal: sum((r) => r.principal), interest: sum((r) => r.interest), fees: sum((r) => r.fee), payment: sum((r) => r.payment) };
  // Verificarea citirii: totalurile din PDF trebuie să iasă la fel din rânduri.
  const totalsOk = !meta?.totals || Math.abs(meta.totals.payment - totals.payment) < 1;
  const jumps = paymentJumps(rows);
  const n = (v: string) => (v === "" ? 0 : Number(v));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-ink-soft">
        Încarcă <strong>graficul de rambursare</strong> descărcat din George / aplicația băncii (PDF BCR) sau un fișier Excel/CSV.
        Ratele, dobânda, asigurarea de viață și soldul vor fi luate exact din grafic.
      </p>

      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) upload(f);
        }}
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-paper/50 p-6 text-center transition-colors hover:border-leu hover:bg-leu-tint/10"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.xlsx,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        <div className="mb-1 text-[26px]">📄</div>
        <div className="text-[14px] font-semibold text-ink">
          {uploading ? "Se citește graficul…" : parsed ? `„${parsed.filename}” — alege alt fișier` : "Apasă aici sau trage PDF-ul de la bancă"}
        </div>
        <div className="mt-1 text-[12px] text-ink-soft">PDF, .xlsx sau .csv</div>
      </div>

      {error && <div className="rounded-md bg-rosu-tint p-3 text-[13px] font-medium text-rosu">{error}</div>}

      {parsed && rows.length > 0 && (
        <>
          <div className="rounded-lg border border-leu/40 bg-leu-tint/20 p-4">
            <div className="mb-2 text-[14px] font-semibold text-ink">
              ✓ {rows.length} rate citite{meta?.bank ? ` din graficul ${meta.bank}` : ""}
              {meta?.generatedAt ? ` din ${fmtDate(meta.generatedAt)}` : ""}
            </div>
            <dl className="num grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-3">
              {meta?.principal !== undefined && <div><dt className="text-ink-soft">Suma împrumutată</dt><dd className="font-medium">{lei(meta.principal)}</dd></div>}
              <div><dt className="text-ink-soft">Credit actual (sold)</dt><dd className="font-semibold text-mov">{lei(meta?.currentBalance ?? rows[0].balance_start, true)}</dd></div>
              {meta?.startDate && <div><dt className="text-ink-soft">Data acordării</dt><dd className="font-medium">{fmtDate(meta.startDate)}</dd></div>}
              <div><dt className="text-ink-soft">Rata următoare</dt><dd className="font-medium">{lei(rows[0].payment, true)} · {fmtDate(rows[0].date) !== "–" ? fmtDate(rows[0].date) : monthLabel(rows[0].month)}</dd></div>
              <div><dt className="text-ink-soft">Ultima rată</dt><dd className="font-medium">{monthLabel(rows[rows.length - 1].month)}</dd></div>
              {meta?.contractNr && <div><dt className="text-ink-soft">Nr. contract</dt><dd className="font-medium">{meta.contractNr}</dd></div>}
              {meta?.scheduleType && <div><dt className="text-ink-soft">Tip rate</dt><dd className="font-medium">{meta.scheduleType === "annuity" ? "Egale (anuități)" : "Descrescătoare"}</dd></div>}
              <div><dt className="text-ink-soft">Dobândă totală rămasă</dt><dd className="font-medium">{lei(totals.interest)}</dd></div>
              <div><dt className="text-ink-soft">Asigurări / costuri</dt><dd className="font-medium">{lei(totals.fees)}</dd></div>
            </dl>
            {meta && meta.ratePeriods.length > 0 && (
              <div className="mt-3 text-[13px]">
                <span className="text-ink-soft">Dobânda: </span>
                {meta.ratePeriods.map((p, i) => (
                  <span key={i} className="mr-3 font-medium">
                    {pct(p.rate, 2)} <span className="font-normal text-ink-soft">({fmtDate(p.from)} – {fmtDate(p.to)})</span>
                  </span>
                ))}
              </div>
            )}
            {jumps.map(({ row, from, to, interestOnly }) => (
              <p key={row.month} className="mt-2 rounded-md bg-galben-tint p-2 text-[12.5px]">
                ⚠️ Din {monthLabel(row.month)} rata totală se schimbă de la {lei(from, true)} la <strong>{lei(to, true)}</strong>
                {interestOnly ? ` (în ${monthLabel(interestOnly.month)} se plătește doar dobânda: ${lei(interestOnly.payment, true)})` : ""}.
              </p>
            ))}
            {!totalsOk && (
              <p className="mt-2 rounded-md bg-rosu-tint p-2 text-[12.5px] text-rosu">
                Totalul ratelor citite ({lei(totals.payment, true)}) diferă de totalul din PDF ({lei(meta!.totals!.payment, true)}). Verifică tabelul de mai jos.
              </p>
            )}

            <div className="mt-3 max-h-[180px] overflow-auto rounded border border-line bg-sheet">
              <table className="num w-full text-left text-[12px]">
                <thead className="sticky top-0 border-b border-line bg-paper">
                  <tr>
                    <th className="p-1.5">Nr</th>
                    <th className="p-1.5">Data</th>
                    <th className="p-1.5 text-right">Principal</th>
                    <th className="p-1.5 text-right">Dobândă</th>
                    <th className="p-1.5 text-right">Asigurare</th>
                    <th className="p-1.5 text-right">Total</th>
                    <th className="p-1.5 text-right">Sold</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.slice(0, 40).map((r) => (
                    <tr key={`${r.installment_nr}-${r.month}`}>
                      <td className="p-1.5">{r.installment_nr}</td>
                      <td className="p-1.5">{r.date ? fmtDate(r.date) : r.month}</td>
                      <td className="p-1.5 text-right">{lei(r.principal, true)}</td>
                      <td className="p-1.5 text-right">{lei(r.interest, true)}</td>
                      <td className="p-1.5 text-right">{lei(r.fee, true)}</td>
                      <td className="p-1.5 text-right font-medium">{lei(r.payment, true)}</td>
                      <td className="p-1.5 text-right">{lei(r.balance_end, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <fieldset className="rounded-md border border-line p-4">
            <legend className="px-1 text-[14px] font-medium">Asigurări anuale (nu apar în grafic)</legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Asigurare PAD (lei/an)">
                <input className="field num" type="number" min="0" step="0.01" value={annual.pad_amount || ""} placeholder="0"
                  onChange={(e) => setAnnual({ ...annual, pad_amount: n(e.target.value) })} />
              </Field>
              <Field label="Scadența PAD" hint="Se plătește în luna asta în fiecare an">
                <input className="field" type="date" value={annual.pad_due_date} onChange={(e) => setAnnual({ ...annual, pad_due_date: e.target.value })} />
              </Field>
              <Field label="Asigurare facultativă (lei/an)" hint="Lasă 0 dacă nu ai">
                <input className="field num" type="number" min="0" step="0.01" value={annual.opt_ins_amount || ""} placeholder="0"
                  onChange={(e) => setAnnual({ ...annual, opt_ins_amount: n(e.target.value) })} />
              </Field>
              <Field label="Scadența asigurării facultative">
                <input className="field" type="date" value={annual.opt_ins_due_date} onChange={(e) => setAnnual({ ...annual, opt_ins_due_date: e.target.value })} />
              </Field>
            </div>
          </fieldset>

          {showUpdateLoan && (
            <label className="flex cursor-pointer items-start gap-2 text-[13px]">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-mov" checked={updateLoan} onChange={(e) => setUpdateLoan(e.target.checked)} />
              <span>
                Actualizează și datele creditului din grafic (suma, data acordării, dobânzile, durata, soldul și rata următoare).
              </span>
            </label>
          )}

          <button
            className="btn-primary w-full justify-center py-2.5 text-[14px] font-semibold"
            disabled={busy}
            onClick={() => onConfirm({ rows, meta: meta ?? null, filename: parsed.filename, annual, updateLoan })}
          >
            {busy ? "Se salvează…" : confirmLabel(rows.length)}
          </button>
        </>
      )}
    </div>
  );
}
