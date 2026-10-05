"use client";

import { useState } from "react";
import type { Loan, ScheduleRow, SimResult } from "@/lib/loan";
import { loanFieldsFromSchedule } from "@/lib/loanImport";
import { addMonths, currentMonth, lei, type Strategy } from "@/lib/util";
import BankScheduleImport, { type BankImportResult } from "./BankScheduleImport";
import LoanStatusForm, { type LoanStatusDraft } from "./LoanStatusForm";
import { api, Field, Modal, Panel, useConfirm } from "./ui";

type CustomScheduleRow = {
  installment_nr: number;
  month: string;
  balance_start: number;
  principal: number;
  interest: number;
  fee: number;
  payment: number;
  balance_end: number;
  is_paid: number;
};

export default function LoanScheduleManager({
  loan,
  simResult,
  customSchedule,
  onUpdated,
  onPrepaymentAdded,
}: {
  loan: Loan;
  simResult: SimResult;
  customSchedule?: CustomScheduleRow[] | null;
  onUpdated: () => void;
  onPrepaymentAdded: (amount: number, month: string, strategy: Strategy, note: string) => void;
}) {
  const confirm = useConfirm();
  const now = currentMonth();
  const [modalOpen, setModalOpen] = useState(false);
  const [importMode, setImportMode] = useState<"file" | "status" | "manual" | "contract">("file");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Manual paste state
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Playground state
  const [testAmount, setTestAmount] = useState(15000);
  const [testMonth, setTestMonth] = useState(addMonths(now, 1));
  const [testStrategy, setTestStrategy] = useState<Strategy>("term");
  const [appliedToast, setAppliedToast] = useState(false);

  // Recalculare instantanee pentru playground:
  const activeRows = simResult.rows;
  const targetIdx = Math.max(0, activeRows.findIndex((r) => r.month === testMonth));
  const targetRow = activeRows[targetIdx] ?? activeRows[0];
  const balanceAtPrepay = targetRow ? targetRow.balanceStart : loan.principal;

  const effectivePrepay = Math.min(testAmount, balanceAtPrepay);
  const newBalance = Math.max(0, balanceAtPrepay - effectivePrepay);
  const currentRateAnnual = targetRow?.rate ?? loan.fixed_rate;
  const r = currentRateAnnual / 100 / 12;
  const remainingMonths = Math.max(1, activeRows.length - targetIdx);

  // 1. Reducere perioada
  let newRemainingMonths = remainingMonths;
  let monthsSaved = 0;
  if (testStrategy === "term" && effectivePrepay > 0 && newBalance > 0) {
    if (r > 0 && targetRow && targetRow.payment > newBalance * r) {
      const nper = -Math.log(1 - (newBalance * r) / targetRow.payment) / Math.log(1 + r);
      newRemainingMonths = Math.ceil(nper);
      monthsSaved = Math.max(0, remainingMonths - newRemainingMonths);
    } else {
      monthsSaved = Math.round(effectivePrepay / (targetRow?.principal || 1));
      newRemainingMonths = Math.max(1, remainingMonths - monthsSaved);
    }
  }

  // 2. Reducere rata
  let newPayment = targetRow?.payment ?? 0;
  let paymentDiff = 0;
  if (testStrategy === "installment" && effectivePrepay > 0 && newBalance > 0) {
    if (r > 0) {
      newPayment = (newBalance * r) / (1 - Math.pow(1 + r, -remainingMonths));
    } else {
      newPayment = newBalance / remainingMonths;
    }
    paymentDiff = Math.max(0, (targetRow?.payment ?? 0) - newPayment);
  }

  const estimatedInterestSaved =
    testStrategy === "term"
      ? monthsSaved * (targetRow?.interest ?? 0) * 0.95
      : remainingMonths * paymentDiff - effectivePrepay;

  const handleDownloadCsv = () => {
    const rows = customSchedule && customSchedule.length > 0 ? customSchedule : simResult.rows;
    const header = "Nr. rata,Luna,Sold initial,Principal,Dobanda,Comision,Rata lunara,Sold final\n";
    const body = rows
      .map((r: any, idx: number) => {
        const nr = r.installment_nr ?? idx + 1;
        const m = r.month;
        const bStart = (r.balance_start ?? r.balanceStart ?? 0).toFixed(2);
        const princ = (r.principal ?? 0).toFixed(2);
        const dob = (r.interest ?? 0).toFixed(2);
        const fee = (r.fee ?? 0).toFixed(2);
        const pmt = (r.payment ?? 0).toFixed(2);
        const bEnd = (r.balance_end ?? r.balanceEnd ?? 0).toFixed(2);
        return `${nr},${m},${bStart},${princ},${dob},${fee},${pmt},${bEnd}`;
      })
      .join("\n");

    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scadentar-${loan.name.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleApplyPrepayment = () => {
    if (testAmount <= 0) return;
    onPrepaymentAdded(
      testAmount,
      testMonth,
      testStrategy,
      `Simulare recalculată: economie ${lei(Math.max(0, estimatedInterestSaved))}`
    );
    setAppliedToast(true);
    setTimeout(() => setAppliedToast(false), 4000);
  };

  /** Salvează graficul (și, opțional, datele creditului) — de aici înainte e sursa calculelor. */
  const saveSchedule = async (entries: ScheduleRow[], source: string, loanPatch: Partial<Loan> = {}) => {
    setSaveError(null);
    setBusy(true);
    try {
      const clean = entries.map(({ installment_nr, month, balance_start, principal, interest, fee, payment, balance_end, is_paid }) => ({
        installment_nr, month, balance_start, principal, interest, fee, payment, balance_end, is_paid,
      }));
      await api("/api/loan-schedule", "POST", { loanId: loan.id, entries: clean, loanPatch, source });
      setModalOpen(false);
      onUpdated();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Nu s-a putut salva");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmImport = (r: BankImportResult) => {
    const patch = r.updateLoan ? loanFieldsFromSchedule(r.meta, r.rows, loan) : {};
    return saveSchedule(r.rows, r.filename.toLowerCase().endsWith(".pdf") ? "pdf" : "file", { ...patch, ...r.annual });
  };

  const handleSaveStatus = (draft: LoanStatusDraft, rows: ScheduleRow[]) => {
    const balance = rows[0]?.balance_start ?? 0;
    const lastRow = rows[rows.length - 1];
    return saveSchedule(rows, "manual", {
      ...draft,
      current_balance: balance,
      status_date: new Date().toISOString().slice(0, 10),
      already_paid_principal: loan.principal > balance ? Math.round((loan.principal - balance) * 100) / 100 : loan.already_paid_principal,
      insurance_monthly: draft.next_fees,
      // Durata creditului: până la maturitate (numărul ratei = indexul lunii de la acordare + 1).
      term_months: lastRow ? Math.max(1, lastRow.installment_nr) : loan.term_months,
    });
  };

  const handleImportText = async () => {
    setImportError(null);
    if (!importText.trim()) {
      setImportError("Introdu sau lipește datele tabelului.");
      return;
    }

    try {
      const lines = importText.trim().split("\n");
      const entries: Omit<CustomScheduleRow, "id">[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        if (i === 0 && (line.toLowerCase().includes("rata") || line.toLowerCase().includes("sold") || line.toLowerCase().includes("luna"))) {
          continue;
        }

        const parts = line.split(/[\t;,|]+/).map((s) => s.trim().replace(/\./g, "").replace(",", "."));
        if (parts.length < 5) continue;

        const nr = parseInt(parts[0], 10) || i + 1;
        const monthVal = parts[1].length === 7 ? parts[1] : addMonths(loan.start_date.slice(0, 7), nr);
        const bStart = parseFloat(parts[2]) || 0;
        const princ = parseFloat(parts[3]) || 0;
        const dob = parseFloat(parts[4]) || 0;
        const pmt = parts.length >= 6 ? parseFloat(parts[5]) : princ + dob;
        const bEnd = parts.length >= 7 ? parseFloat(parts[6]) : Math.max(0, bStart - princ);

        entries.push({
          installment_nr: nr,
          month: monthVal,
          balance_start: bStart,
          principal: princ,
          interest: dob,
          fee: 0,
          payment: pmt,
          balance_end: bEnd,
          is_paid: monthVal < now ? 1 : 0,
        });
      }

      if (entries.length === 0) {
        setImportError("Nu s-au putut extrage rânduri valide din text.");
        return;
      }

      setBusy(true);
      await api("/api/loan-schedule", "POST", { loanId: loan.id, entries, source: "text" });
      setModalOpen(false);
      setImportText("");
      onUpdated();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Eroare la import");
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateFromContract = async () => {
    setBusy(true);
    try {
      const entries: Omit<CustomScheduleRow, "id">[] = simResult.rows.map((r, idx) => ({
        installment_nr: idx + 1,
        month: r.month,
        balance_start: r.balanceStart,
        principal: r.principal,
        interest: r.interest,
        fee: r.fee,
        payment: r.payment,
        balance_end: r.balanceEnd,
        is_paid: r.month < now ? 1 : 0,
      }));

      await api("/api/loan-schedule", "POST", { loanId: loan.id, entries, source: "contract" });
      setModalOpen(false);
      onUpdated();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Eroare la generare");
    } finally {
      setBusy(false);
    }
  };

  const handleResetSchedule = async () => {
    if (
      !(await confirm({
        title: "Renunță la graficul băncii",
        message: "Sigur vrei să ștergi graficul încărcat? Creditul va fi calculat din nou doar din parametrii contractului (dobândă, perioadă).",
        confirmText: "Resetează",
        danger: true,
      }))
    )
      return;
    setBusy(true);
    try {
      await api(`/api/loan-schedule?loanId=${loan.id}`, "DELETE");
      onUpdated();
    } finally {
      setBusy(false);
    }
  };

  const hasCustom = customSchedule && customSchedule.length > 0;
  const SOURCE_LABEL: Record<string, string> = {
    pdf: "grafic PDF bancă",
    file: "fișier bancă",
    manual: "situația la zi",
    text: "text importat",
    contract: "generat din contract",
  };
  const activeSource = Number(loan.use_schedule) === 1 ? SOURCE_LABEL[loan.schedule_source ?? ""] ?? "grafic bancă" : null;

  return (
    <Panel
      title="Schema de rambursare & Recalculator plată anticipată"
      aside={
        <div className="flex flex-wrap items-center gap-2">
          {hasCustom && activeSource ? (
            <span className="rounded-full bg-leu-tint px-2.5 py-0.5 text-[12px] font-medium text-leu" title="Ratele, dobânda, asigurarea și soldul se iau din acest grafic">
              Sursa calculelor: {activeSource} ({customSchedule.length} rate)
            </span>
          ) : (
            <span className="rounded-full bg-paper px-2.5 py-0.5 text-[12px] text-ink-soft border border-line">
              Grafic estimat automat
            </span>
          )}
          <button className="btn-ghost text-[13px] py-1" onClick={() => setModalOpen(true)}>
            {hasCustom ? "Actualizează graficul / situația la zi" : "Încarcă grafic PDF / situația la zi"}
          </button>
          <button className="btn-ghost text-[13px] py-1" onClick={handleDownloadCsv}>
            Exportă CSV
          </button>
          {hasCustom && (
            <button className="btn-danger text-[13px] py-1" onClick={handleResetSchedule} disabled={busy}>
              Resetează
            </button>
          )}
        </div>
      }
      className="mb-6"
    >
      <div className="mb-6 rounded-lg border border-mov/30 bg-mov-tint/30 p-5">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h4 className="font-semibold text-[15px] text-ink">
              Simulator rapid de recalculare pe schema actuală
            </h4>
            <p className="text-[13px] text-ink-soft">
              Introdu o plată anticipată pentru a vedea recalcularea imediată a perioadei, a noii rate și a dobânzii economisite.
            </p>
          </div>
          {appliedToast && (
            <span className="rounded-md bg-leu px-3 py-1 text-[13px] font-semibold text-white animate-fade">
              Plata a fost adăugată în credit!
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4 items-end">
          <Field label="Sumă plată anticipată (lei)">
            <input
              className="field num font-semibold"
              type="number"
              min={100}
              step={500}
              value={testAmount || ""}
              onChange={(e) => setTestAmount(Number(e.target.value) || 0)}
            />
          </Field>

          <Field label="Luna efectuării plății">
            <input
              className="field"
              type="month"
              value={testMonth}
              onChange={(e) => setTestMonth(e.target.value)}
            />
          </Field>

          <Field label="Efect dorit la recalculare">
            <select
              className="field font-medium"
              value={testStrategy}
              onChange={(e) => setTestStrategy(e.target.value as Strategy)}
            >
              <option value="term">Scurtarea perioadei (păstrează rata)</option>
              <option value="installment">Scăderea ratei (păstrează perioada)</option>
            </select>
          </Field>

          <div>
            <button
              className="btn-primary w-full justify-center py-2 text-[14px]"
              onClick={handleApplyPrepayment}
              disabled={testAmount <= 0}
            >
              Aplică în credit
            </button>
          </div>
        </div>

        {/* Rezultate recalculare */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-mov/20 pt-4">
          <div className="rounded-md bg-paper p-3 border border-line">
            <div className="text-[12px] text-ink-soft">Sold înainte de plată</div>
            <div className="num font-semibold text-[16px] text-ink">{lei(balanceAtPrepay)}</div>
          </div>
          <div className="rounded-md bg-paper p-3 border border-line">
            <div className="text-[12px] text-ink-soft">Noul sold după plată</div>
            <div className="num font-semibold text-[16px] text-mov">{lei(newBalance)}</div>
          </div>
          <div className="rounded-md bg-paper p-3 border border-line">
            <div className="text-[12px] text-ink-soft">
              {testStrategy === "term" ? "Perioadă economisită" : "Rata lunară nouă"}
            </div>
            <div className="num font-semibold text-[16px] text-leu">
              {testStrategy === "term" ? `${monthsSaved} luni (~${(monthsSaved / 12).toFixed(1)} ani)` : `${lei(newPayment)} (-${lei(paymentDiff)}/lună)`}
            </div>
          </div>
          <div className="rounded-md bg-paper p-3 border border-line">
            <div className="text-[12px] text-ink-soft">Dobândă estimată salvată</div>
            <div className="num font-semibold text-[16px] text-leu font-display">
              {lei(Math.max(0, estimatedInterestSaved))}
            </div>
          </div>
        </div>
      </div>

      {/* Modal pentru import / citire automată scadențar */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Graficul de rambursare de la bancă">
        <div className="flex flex-col gap-4">
          {/* Meniu mod import */}
          <div className="flex flex-wrap border-b border-line gap-2 pb-2">
            <button
              className={`px-3 py-1.5 text-[13px] font-semibold rounded-md ${
                importMode === "file" ? "bg-leu text-white" : "bg-paper text-ink-soft hover:text-ink"
              }`}
              onClick={() => setImportMode("file")}
            >
              📄 Grafic PDF / Excel
            </button>
            <button
              className={`px-3 py-1.5 text-[13px] font-semibold rounded-md ${
                importMode === "status" ? "bg-leu text-white" : "bg-paper text-ink-soft hover:text-ink"
              }`}
              onClick={() => setImportMode("status")}
            >
              🏦 Situația la zi (manual)
            </button>
            <button
              className={`px-3 py-1.5 text-[13px] font-semibold rounded-md ${
                importMode === "contract" ? "bg-leu text-white" : "bg-paper text-ink-soft hover:text-ink"
              }`}
              onClick={() => setImportMode("contract")}
            >
              ⚙️ Generează din contract
            </button>
            <button
              className={`px-3 py-1.5 text-[13px] font-semibold rounded-md ${
                importMode === "manual" ? "bg-leu text-white" : "bg-paper text-ink-soft hover:text-ink"
              }`}
              onClick={() => setImportMode("manual")}
            >
              📋 Lipește text manual
            </button>
          </div>

          {/* 1. Graficul băncii (PDF BCR / Excel) */}
          {importMode === "file" && (
            <BankScheduleImport
              showUpdateLoan
              busy={busy}
              initialAnnual={{
                pad_amount: loan.pad_amount ?? 0,
                pad_due_date: loan.pad_due_date ?? "",
                opt_ins_amount: loan.opt_ins_amount ?? 0,
                opt_ins_due_date: loan.opt_ins_due_date ?? "",
              }}
              confirmLabel={(count) => `Folosește graficul băncii (${count} rate)`}
              onConfirm={handleConfirmImport}
            />
          )}

          {/* Situația la zi din aplicația băncii → grafic reconstruit */}
          {importMode === "status" && <LoanStatusForm loan={loan} busy={busy} onSave={handleSaveStatus} />}

          {saveError && <div className="rounded-md bg-rosu-tint p-3 text-[13px] font-medium text-rosu">{saveError}</div>}

          {/* 2. Modul Generează din contract */}
          {importMode === "contract" && (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-ink-soft">
                Generează automat scadențarul complet pe toată durata creditului ({loan.term_months} luni) folosind parametrii stabiliți în contract (dobândă fixă, marjă, IRCC).
              </p>
              <button
                className="btn-primary self-start mt-2"
                onClick={handleGenerateFromContract}
                disabled={busy}
              >
                {busy ? "Se generează…" : "Generează scadențarul din contract"}
              </button>
            </div>
          )}

          {/* 3. Modul Lipește text manual */}
          {importMode === "manual" && (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-ink-soft">
                Lipește rândurile tabelare copiate manual din extrasul de cont sau Excel (coloane: Nr. rată, Lună, Sold, Principal, Dobândă, Rată):
              </p>
              <Field label="Text tabelar">
                <textarea
                  className="field min-h-[160px] font-mono text-[12px]"
                  placeholder={"1\t2024-04\t320000\t550.20\t1560.80\t2111.00\t319449.80\n2\t2024-05\t319449.80\t552.80\t1558.20\t2111.00\t318897.00"}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
              </Field>
              {importError && <p className="text-[13px] text-rosu">{importError}</p>}
              <button
                className="btn-primary self-start"
                onClick={handleImportText}
                disabled={busy || !importText.trim()}
              >
                {busy ? "Se salvează…" : "Salvează scadențarul din text"}
              </button>
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-line">
            <button className="btn-ghost" onClick={() => setModalOpen(false)}>
              Închide
            </button>
          </div>
        </div>
      </Modal>
    </Panel>
  );
}
