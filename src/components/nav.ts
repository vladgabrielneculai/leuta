/**
 * Secțiunile aplicației, folosite de meniul lateral (ecran mare) și, pe telefon, de bara de jos
 * și de paginile-hub „Planuri” și „Eu”. Ținute într-un singur loc, ca meniurile să nu se despartă.
 */

// Iconițe (trasee SVG 24×24).
export const ICON = {
  home: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  month: "M4 6h16M4 12h16M4 18h10",
  loans: "M3 7h18v10H3zM3 11h18M7 15h3",
  savings: "M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.6 5 3 5 1.1 5 3-2.2 3-5 3-5-1.1-5-3",
  afford: "M3 4h2l2.4 11h10.2L20 8H6.3M9 20h.01M17 20h.01",
  trips: "M4 8h16v11H4zM9 8V5h6v3M4 13h16M10 13v2h4v-2",
  budget: "M12 3a9 9 0 1 0 9 9h-9zM15 3.5A9 9 0 0 1 20.5 9H15z",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6",
  settings: "M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4",
  admin: "M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z",
  import: "M12 3v12M7 10l5 5 5-5M4 17v3h16v-3",
  repeat: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5",
  year: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  plans: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
};

export type NavItem = { href: string; label: string; color: string; icon: string; /** o frază, pe dalele de pe telefon */ hint?: string };

export const NAV_DAILY: NavItem[] = [
  { href: "/", label: "Panou", color: "var(--c-albastru)", icon: ICON.home },
  { href: "/luna", label: "Luna curentă", color: "var(--c-leu)", icon: ICON.month },
];
// Funcționalități noi, vizibile doar pe versiunea beta (după „Luna curentă”).
export const BETA_NAV: NavItem[] = [
  { href: "/import", label: "Import extras", color: "var(--c-mov)", icon: ICON.import, hint: "Tranzacțiile din extrasul băncii" },
  { href: "/abonamente", label: "Abonamente", color: "var(--c-galben)", icon: ICON.repeat, hint: "Plățile care se repetă" },
  { href: "/cautare", label: "Caută", color: "var(--c-albastru)", icon: ICON.search, hint: "Orice intrare, din orice lună" },
  { href: "/anual", label: "Anul în cifre", color: "var(--c-leu)", icon: ICON.year, hint: "Bilanțul anului" },
];
export const NAV_PLAN: NavItem[] = [
  { href: "/credite", label: "Credite", color: "var(--c-mov)", icon: ICON.loans, hint: "Rate, sold și plăți anticipate" },
  { href: "/economii", label: "Economii", color: "var(--c-galben)", icon: ICON.savings, hint: "Fondul de urgență și obiectivele" },
  { href: "/vacante", label: "Vacanțe", color: "var(--c-albastru)", icon: ICON.trips, hint: "Cheltuielile din concediu" },
  { href: "/achizitii", label: "Îmi permit?", color: "var(--c-albastru)", icon: ICON.afford, hint: "Verifici o cumpărătură mare" },
  { href: "/buget", label: "Metode de buget", color: "var(--c-rosu)", icon: ICON.budget, hint: "Luna prin 4 reguli de buget" },
];
export const NAV_ACCOUNT: NavItem[] = [
  { href: "/profil", label: "Profilul meu", color: "var(--c-leu)", icon: ICON.profile, hint: "Date, venit și obiective" },
  { href: "/setari", label: "Setări", color: "var(--c-ink-faint)", icon: ICON.settings, hint: "Categorii, notificări, securitate, date" },
];
// Vizibil doar administratorului: invitații și lista conturilor.
export const ADMIN_NAV: NavItem = { href: "/admin", label: "Administrare", color: "var(--c-mov)", icon: ICON.admin, hint: "Invitații și conturi" };

/**
 * Meniul e împărțit în trei grupuri mici în loc de o listă lungă: ce folosești zilnic,
 * instrumentele de planificare și contul. Grupurile se citesc mai ușor decât 8–11 intrări la rând.
 */
export function navGroups(beta: boolean, admin: boolean): { title: string | null; items: NavItem[] }[] {
  return [
    { title: null, items: [...NAV_DAILY, ...(beta ? BETA_NAV : [])] },
    { title: "Planificare", items: NAV_PLAN },
    { title: "Cont", items: [...NAV_ACCOUNT, ...(admin ? [ADMIN_NAV] : [])] },
  ];
}

/** Pe telefon: paginile din hub-ul „Planuri” (inclusiv uneltele beta) și din „Eu”. */
export const PLAN_HREFS = ["/planuri", ...[...NAV_PLAN, ...BETA_NAV].map((n) => n.href)];
export const ACCOUNT_HREFS = ["/eu", ...[...NAV_ACCOUNT, ADMIN_NAV].map((n) => n.href)];

/** Dacă `path` e pagina `href` sau o subpagină a ei („/” se potrivește doar cu el însuși). */
export function within(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

/**
 * Pe telefon, unde duce „‹” din bara de sus: detaliile duc la listă, secțiunile din „Planuri” la hub,
 * profilul și setările la „Eu”. Paginile din bara de jos nu au buton înapoi (null).
 */
export function parentOf(path: string): { href: string; label: string } | null {
  if (path === "/planuri" || path === "/eu") return null;
  const detail = path.match(/^\/(credite|vacante)\/[^/]+/);
  if (detail) {
    const item = NAV_PLAN.find((n) => n.href === `/${detail[1]}`)!;
    return { href: item.href, label: item.label };
  }
  if (PLAN_HREFS.some((h) => within(path, h))) return { href: "/planuri", label: "Planuri" };
  if (ACCOUNT_HREFS.some((h) => within(path, h))) return { href: "/eu", label: "Eu" };
  return null;
}

/** Numele secțiunii curente, afișat în bara de sus pe paginile fără alegerea lunii. */
export function sectionLabel(path: string): string | null {
  if (path === "/planuri") return "Planuri";
  if (path === "/eu") return "Eu";
  const all = [...NAV_DAILY, ...BETA_NAV, ...NAV_PLAN, ...NAV_ACCOUNT, ADMIN_NAV];
  return all.find((n) => n.href !== "/" && within(path, n.href))?.label ?? null;
}

/** Paginile unde contează luna analizată: aici, pe telefon, bara de sus arată alegerea lunii. */
export const MONTH_PAGES = ["/", "/luna", "/buget"];
