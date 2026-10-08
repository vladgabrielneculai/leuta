"use client";

import { Modal } from "./ui";

/** Lista nouă de coduri de recuperare, afișată o singură dată (Setări și verificarea periodică). */
export default function RecoveryCodesModal({ codes, onClose, onCopied }: { codes: string[] | null; onClose: () => void; onCopied?: () => void }) {
  const copy = () => {
    if (codes) navigator.clipboard?.writeText(codes.join("\n")).then(() => onCopied?.());
  };
  return (
    <Modal open={!!codes} onClose={onClose} title="Codurile tale de recuperare">
      <p className="mb-3 text-[13px] text-ink-soft">
        Păstrează-le într-un loc sigur (manager de parole, hârtie). Le vezi <strong>doar acum</strong>. Sunt pentru urgențe:
        dacă pierzi telefonul, intri cu parola + unul dintre coduri. Fiecare cod merge o singură dată. O dată la 3 luni,
        Leuța îți cere unul ca să verifice că lista e încă la tine.
      </p>
      <div className="grid grid-cols-2 gap-2 rounded-md border border-line bg-paper p-3 font-mono text-[14px]">
        {codes?.map((c) => <span key={c}>{c}</span>)}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={copy}>Copiază</button>
        <button className="btn-primary" onClick={onClose}>Le-am salvat</button>
      </div>
    </Modal>
  );
}
