/**
 * Datele site-ului de prezentare (leuta.ro) într-un singur loc.
 *
 * DE COMPLETAT ÎNAINTE DE LANSARE: numele operatorului și emailul de contact (politica de confidențialitate,
 * termenii și subsolul le citesc de aici). Cât timp au valori între paranteze drepte, site-ul cere motoarelor
 * de căutare să nu-l indexeze (vezi `isDraft`).
 */
export const SITE = {
  name: "Leuța",
  tagline: "Bugetul tău, clar ca un bon.",
  description:
    "Leuța îți arată unde merg banii în fiecare lună: venituri, cheltuieli, credite și economii, pe telefon și pe calculator. Acces pe bază de invitație.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://leuta.ro",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://app.leuta.ro",
  operator: {
    name: "[Nume complet operator]",
    email: "[email de contact]",
  },
  /** Vârsta minimă pentru cont și pentru lista de așteptare (consimțământ GDPR în România). */
  minAge: 16,
  /** Data ultimei actualizări a documentelor legale. */
  legalUpdated: "7 octombrie 2026",
  /** Versiunea textului de acord din formular; se trimite odată cu emailul, ca dovadă a consimțământului. */
  consentVersion: "2026-10-07",
  gaId: process.env.NEXT_PUBLIC_GA_ID || "",
};

export const isDraft = SITE.operator.name.startsWith("[") || SITE.operator.email.startsWith("[");
