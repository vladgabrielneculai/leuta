/**
 * Versiunea beta (beta-app.leuta.ro) rulează pe aceeași bază de date ca producția, deci conturile sunt aceleași.
 * Accesul se limitează din variabila de mediu `BETA_USERS` (nume de utilizator separate prin virgulă), setată
 * doar pe mediul de beta din Vercel. Fără ea (producția, local) nu există nicio restricție.
 *
 * Funcționalitățile noi se ascund tot după `isBetaDeployment()`, ca să nu apară în producție nici dacă
 * ramura `staging` ajunge pe `main` înainte de lansarea lor.
 */

function betaUsers(): Set<string> | null {
  const raw = process.env.BETA_USERS?.trim();
  if (!raw) return null;
  return new Set(raw.split(",").map((u) => u.trim().toLowerCase()).filter(Boolean));
}

export function isBetaDeployment(): boolean {
  return betaUsers() !== null;
}

/** Pe producție oricine are acces; pe beta doar cei din `BETA_USERS` (fără diferență între majuscule și minuscule). */
export function hasBetaAccess(username: string): boolean {
  const users = betaUsers();
  return users === null || users.has(username.trim().toLowerCase());
}

export const PRODUCTION_URL = "https://app.leuta.ro";

export const BETA_DENIED_MESSAGE = `Versiunea beta e disponibilă doar testerilor. Contul tău funcționează pe ${PRODUCTION_URL.replace("https://", "")}.`;

export const BETA_NO_ACCOUNTS_MESSAGE =
  `Conturile noi și resetarea parolei se fac pe ${PRODUCTION_URL.replace("https://", "")}, nu pe versiunea beta.`;
