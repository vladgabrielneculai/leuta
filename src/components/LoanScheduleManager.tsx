"use client";

import { useRef, useState } from "react";
import type { Loan, Row, SimResult } from "@/lib/loan";
import { addMonths, currentMonth, lei, monthDiff, monthLabel, pct, type Strategy } from "@/lib/util";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [importMode, setImportMode] = useState<"file" | "manual" | "contract">("file");

  // File upload state
  const [uploading, setUploading] = useState(false);
  const [uploadedFilename, setUploadedFilename] = useState<string | null>(null);
  const [uploadedRows, setUploadedRows] = useState<CustomScheduleRow[] | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

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

  // Upload fisier Excel / PDF
  const handleFileUpload = async (file: File) => {
    setUploadError(null);
    setUploading(true);
    setUploadedRows(null);
    setUploadedFilename(file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("loanId", String(loan.id));

      const res = await fetch("/api/loan-schedule/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Eroare la parsarea fișierului");

      setUploadedRows(data.rows);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Eroare la încărcare");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveUploadedSchedule = async () => {
    if (!uploadedRows || uploadedRows.length === 0) return;
    setBusy(true);
    try {
      await api("/api/loan-schedule", "POST", { loanId: loan.id, entries: uploadedRows });
      setModalOpen(false);
      setUploadedRows(null);
      setUploadedFilename(null);
      onUpdated();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Nu s-a putut salva");
    } finally {
      setBusy(false);
    }
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
      await api("/api/loan-schedule", "POST", { loanId: loan.id, entries });
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

      await api("/api/loan-schedule", "POST", { loanId: loan.id, entries });
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
        title: "Resetare scadențar bancar",
        message: "Sigur vrei să resetezi schema la calculul automat conform formulei anuităților?",
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

  return (
    <Panel
      title="Schema de rambursare & Recalculator plată anticipată"
      aside={
        <div className="flex flex-wrap items-center gap-2">
          {hasCustom ? (
            <span className="rounded-full bg-leu-tint px-2.5 py-0.5 text-[12px] font-medium text-leu">
              Scadențar bancă activ ({customSchedule.length} rate)
            </span>
          ) : (
            <span className="rounded-full bg-paper px-2.5 py-0.5 text-[12px] text-ink-soft border border-line">
              Grafic estimat automat
            </span>
          )}
          <button className="btn-ghost text-[13px] py-1" onClick={() => setModalOpen(true)}>
            {hasCustom ? "Modifică / Încarcă fișier" : "Importă fișier Excel / PDF"}
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
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Import scadențar bancă (Excel / PDF)">
        <div className="flex flex-col gap-4">
          {/* Meniu mod import */}
          <div className="flex border-b border-line gap-2 pb-2">
            <button
              className={`px-3 py-1.5 text-[13px] font-semibold rounded-md ${
                importMode === "file" ? "bg-leu text-white" : "bg-paper text-ink-soft hover:text-ink"
              }`}
              onClick={() => setImportMode("file")}
            >
              📄 Încarcă fișier Excel / PDF
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

          {/* 1. Modul Încarcă fișier */}
          {importMode === "file" && (
            <div className="flex flex-col gap-4">
              <p className="text-[13px] text-ink-soft">
                Încarcă direct fișierul <strong>Excel (.xlsx, .xls)</strong> sau <strong>PDF (.pdf)</strong> descărcat din aplicația băncii tale (Banca Transilvania, BCR, ING, Raiffeisen, BRD etc.). Coloanele vor fi citite automat!
              </p>

              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-paper/50 p-8 text-center cursor-pointer hover:border-leu hover:bg-leu-tint/10 transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.pdf,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f);
                  }}
                />
                <div className="text-[28px] mb-2">📁</div>
                <div className="text-[14px] font-semibold text-ink">
                  {uploading ? "Se citește fișierul…" : "Apasă aici sau trage fișierul Excel / PDF"}
                </div>
                <div className="text-[12px] text-ink-soft mt-1">
                  Acceptă .xlsx, .xls, .pdf și .csv
                </div>
              </div>

              {uploadError && (
                <div className="rounded-md bg-rosu-tint p-3 text-[13px] text-rosu font-medium">
                  {uploadError}
                </div>
              )}

              {/* Previzualizare rânduri extrase */}
              {uploadedRows && uploadedRows.length > 0 && (
                <div className="rounded-lg border border-leu/40 bg-leu-tint/20 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-[14px] text-ink">
                      ✓ Au fost identificate {uploadedRows.length} rate din „{uploadedFilename}”!
                    </span>
                  </div>

                  <p className="text-[12px] text-ink-soft mb-3">
                    Iată primele rate recunoscute din fișier:
                  </p>

                  <div className="max-h-[180px] overflow-auto rounded border border-line bg-sheet">
                    <table className="w-full text-[12px] font-mono text-left">
                      <thead className="sticky top-0 bg-paper border-b border-line">
                        <tr>
                          <th className="p-1.5">Nr</th>
                          <th className="p-1.5">Luna</th>
                          <th className="p-1.5 text-right">Sold</th>
                          <th className="p-1.5 text-right">Principal</th>
                          <th className="p-1.5 text-right">Dobândă</th>
                          <th className="p-1.5 text-right">Rată</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {uploadedRows.slice(0, 6).map((r) => (
                          <tr key={r.installment_nr}>
                            <td className="p-1.5">{r.installment_nr}</td>
                            <td className="p-1.5">
                              <div className="flex items-center gap-1.5">
                                <span>{r.month}</span>
                                {(r.is_paid === 1 || r.month < now) && (
                                  <span className="rounded bg-leu-tint px-1.5 py-0.5 text-[10px] font-semibold text-leu border border-leu/30">
                                    ✓ Achitată
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-1.5 text-right">{lei(r.balance_start)}</td>
                            <td className="p-1.5 text-right">{lei(r.principal)}</td>
                            <td className="p-1.5 text-right">{lei(r.interest)}</td>
                            <td className="p-1.5 text-right font-medium">{lei(r.payment)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    className="btn-primary mt-4 w-full justify-center py-2.5 text-[14px] font-semibold"
                    onClick={handleSaveUploadedSchedule}
                    disabled={busy}
                  >
                    {busy ? "Se salvează…" : `Confirmă și salvează scadențarul (${uploadedRows.length} rate)`}
                  </button>
                </div>
              )}
            </div>
          )}

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
