/** Tipurile de notificări și canalele implicite (folosite și în pagina Setări). */

export const NOTIFY_KINDS = ["daily", "loan_due", "budget", "weekly", "monthly"] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];
export type Channel = "telegram" | "email";
export type NotifyPrefs = Record<NotifyKind, Record<Channel, boolean>>;

export const KIND_INFO: Record<NotifyKind, { label: string; description: string }> = {
  daily: {
    label: "Reminder de seară (21:00)",
    description: "„Ai trecut cheltuielile de azi?” + ce ai introdus azi, cheltuielile lunii și creditul.",
  },
  loan_due: {
    label: "Scadențe credit și asigurări",
    description: "Cu 3 zile înainte de rată și cu 7 zile înainte de PAD / asigurarea anuală.",
  },
  budget: {
    label: "Alerte de buget",
    description: "O categorie trece de 80% / 100% din media obișnuită sau luna e pe minus.",
  },
  weekly: {
    label: "Rezumat săptămânal",
    description: "Duminică seara: cheltuielile săptămânii pe categorii, comparate cu săptămâna trecută.",
  },
  monthly: {
    label: "Bilanțul lunii",
    description: "Pe 1 ale lunii: venituri, cheltuieli, economii și rata de economisire a lunii trecute.",
  },
};

export const DEFAULT_PREFS: NotifyPrefs = {
  daily: { telegram: true, email: false },
  loan_due: { telegram: true, email: true },
  budget: { telegram: true, email: false },
  weekly: { telegram: false, email: true },
  monthly: { telegram: false, email: true },
};

export function parsePrefs(raw: string | undefined): NotifyPrefs {
  const out: NotifyPrefs = JSON.parse(JSON.stringify(DEFAULT_PREFS));
  try {
    const j = raw ? JSON.parse(raw) : {};
    for (const k of NOTIFY_KINDS) {
      for (const c of ["telegram", "email"] as const) {
        if (typeof j?.[k]?.[c] === "boolean") out[k][c] = j[k][c];
      }
    }
  } catch {
    // setări corupte → implicite
  }
  return out;
}
