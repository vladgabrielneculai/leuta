"use client";

import { useEffect, useState } from "react";
import { api, downloadFile, Field, Modal, Panel, useConfirm } from "./ui";

type DbInfo = {
  path: string;
  sizeBytes: number;
  sizeFormatted: string;
  tables: { name: string; count: number }[];
};

type TableData = {
  table: string;
  columns: { name: string; type: string; pk: number }[];
  rows: Record<string, any>[];
};

export default function DatabaseManager({ onToast, onRefresh }: { onToast: (msg: string) => void; onRefresh: () => void }) {
  const confirm = useConfirm();
  const [info, setInfo] = useState<DbInfo | null>(null);
  const [selectedTable, setSelectedTable] = useState<string>("loans");
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadInfo = () => {
    api<DbInfo>("/api/db/info")
      .then(setInfo)
      .catch(() => undefined);
  };

  useEffect(() => {
    loadInfo();
  }, []);

  const openTableViewer = async (tableName: string) => {
    setSelectedTable(tableName);
    setTableModalOpen(true);
    setTableData(null);
    try {
      const res = await api<TableData>(`/api/db/table?table=${tableName}`);
      setTableData(res);
    } catch (err) {
      onToast("Eroare la citirea tabelului");
    }
  };

  const deleteRow = async (id: any) => {
    if (
      !(await confirm({
        title: "Ștergere rând",
        message: `Sigur dorești să ștergi rândul #${id} din tabelul „${selectedTable}”?`,
        confirmText: "Șterge",
        danger: true,
      }))
    )
      return;
    try {
      await api(`/api/db/table?table=${selectedTable}&id=${id}`, "DELETE");
      const res = await api<TableData>(`/api/db/table?table=${selectedTable}`);
      setTableData(res);
      loadInfo();
      onRefresh();
      onToast("Rândul a fost șters");
    } catch (err) {
      onToast("Nu s-a putut șterge rândul");
    }
  };

  const handleSeed = async () => {
    if (
      !(await confirm({
        title: "Încărcare date demonstrative",
        message:
          "Vrei să încarci datele demonstrative de test? Vor fi adăugate 2 credite, scadențare, venituri și cheltuieli de exemplu.",
        confirmText: "Încarcă date demo",
      }))
    )
      return;
    setBusy(true);
    try {
      await api("/api/seed", "POST", { action: "seed" });
      loadInfo();
      onRefresh();
      onToast("Datele demonstrative au fost încărcate cu succes!");
    } catch (err) {
      onToast("Eroare la încărcare date demo");
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (
      !(await confirm({
        title: "Ștergere completă a bazei de date",
        message:
          "ATENȚIE: Sigur vrei să ștergi TOATE creditele, tranzacțiile, economiile și investițiile? Această acțiune nu poate fi anulată!",
        confirmText: "Șterge tot definitiv",
        danger: true,
      }))
    )
      return;
    setBusy(true);
    try {
      await api("/api/seed", "POST", { action: "clear" });
      loadInfo();
      onRefresh();
      onToast("Toate datele financiare au fost șterse.");
    } catch (err) {
      onToast("Eroare la resetare date");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Bază de date (Supabase · online)">
      <div className="flex flex-col gap-4">
        <div className="rounded-md border border-line bg-sheet p-3.5 text-[13px]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-ink">Baza de date Postgres (Supabase):</span>
            <span className="rounded bg-paper px-2 py-0.5 font-mono text-[12px] text-ink-soft">
              {info?.sizeFormatted ?? "–"}
            </span>
          </div>
          <div className="mt-1 font-mono text-[12px] text-ink-soft break-all select-all">
            {info?.path ?? "Supabase"}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <a
              className="btn-ghost text-[13px] py-1"
              href="/api/backup"
              onClick={(e) => {
                e.preventDefault();
                downloadFile("/api/backup", "buget-backup.json").catch((err) => onToast(err.message));
              }}
            >
              Exportă JSON
            </a>
          </div>
        </div>

        <div>
          <h4 className="text-[14px] font-semibold mb-2">Tabele existente în baza de date:</h4>
          <div className="flex flex-wrap gap-1.5">
            {info?.tables.map((t) => (
              <button
                key={t.name}
                onClick={() => openTableViewer(t.name)}
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-paper px-2.5 py-1 text-[12px] hover:border-albastru hover:text-albastru transition-colors"
                title="Apasă pentru a inspecta tabelul"
              >
                <span className="font-mono font-medium">{t.name}</span>
                <span className="rounded-full bg-line px-1.5 py-0.2 text-[10px] text-ink-soft">
                  {t.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-line pt-3">
          <h4 className="text-[14px] font-semibold mb-1">Date demonstrative & Resetare</h4>
          <p className="text-[12px] text-ink-soft mb-3">
            Poți repopula oricând aplicația cu date de test sau poți reseta totul pentru a începe cu date reale.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary text-[13px] py-1" onClick={handleSeed} disabled={busy}>
              Încarcă date de test (Demo)
            </button>
            <button className="btn-danger text-[13px] py-1" onClick={handleClear} disabled={busy}>
              Șterge toate datele financiare
            </button>
          </div>
        </div>

        <div className="rounded-md bg-paper p-3 text-[12px] text-ink-soft border border-line">
          <strong>Sfat pentru modificări directe:</strong> datele sunt în baza de date Supabase a aplicației. Le poți vedea și edita din Supabase Dashboard → Table Editor, sau poți descărca oricând un backup cu „Exportă JSON”.
        </div>
      </div>

      {/* Modal explorare tabel */}
      <Modal open={tableModalOpen} onClose={() => setTableModalOpen(false)} title={`Tabel: ${selectedTable}`}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-[13px] text-ink-soft">
            <span>Se afișează primele {tableData?.rows.length ?? 0} înregistrări.</span>
            <button className="text-albastru hover:underline text-[12px]" onClick={() => openTableViewer(selectedTable)}>
              Reîmprospătează
            </button>
          </div>

          <div className="max-h-[380px] overflow-auto rounded border border-line">
            {!tableData ? (
              <p className="p-4 text-center text-ink-soft text-[13px]">Se încarcă tabelul…</p>
            ) : tableData.rows.length === 0 ? (
              <p className="p-4 text-center text-ink-soft text-[13px]">Tabelul este gol.</p>
            ) : (
              <table className="w-full text-left text-[12px] font-mono">
                <thead className="sticky top-0 bg-sheet border-b border-line">
                  <tr>
                    {tableData.columns.map((col) => (
                      <th key={col.name} className="p-2 font-semibold">
                        {col.name}
                      </th>
                    ))}
                    <th className="p-2 text-right">Acțiuni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {tableData.rows.map((row, idx) => (
                    <tr key={row.id ?? idx} className="hover:bg-paper">
                      {tableData.columns.map((col) => (
                        <td key={col.name} className="p-2 max-w-[200px] truncate" title={String(row[col.name] ?? "")}>
                          {String(row[col.name] ?? "–")}
                        </td>
                      ))}
                      <td className="p-2 text-right">
                        {row.id !== undefined && (
                          <button
                            onClick={() => deleteRow(row.id)}
                            className="text-rosu hover:underline text-[11px]"
                          >
                            Șterge
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <button className="btn-ghost" onClick={() => setTableModalOpen(false)}>
              Închide
            </button>
          </div>
        </div>
      </Modal>
    </Panel>
  );
}
