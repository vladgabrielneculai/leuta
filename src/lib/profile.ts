/**
 * Profilul utilizatorului: câmpurile, opțiunile afișate și regulile prin care profilul
 * influențează calculele (fondul de urgență, bugetul recomandat, sfaturile lunii).
 * Fără importuri de server — modulul e folosit și în browser (formulare), și pe server (analiză).
 */

export type Occupation = "employee" | "self_employed" | "business" | "freelancer" | "retired" | "student" | "unemployed" | "other";
export type IncomeStability = "stable" | "variable";
export type Risk = "low" | "medium" | "high";
export type Horizon = "short" | "medium" | "long";
export type Experience = "none" | "beginner" | "intermediate" | "advanced";
export type GoalKey = "emergency" | "debt_free" | "home" | "car" | "retirement" | "education" | "travel" | "investing" | "family";

export type Profile = {
  first_name: string;
  last_name: string;
  birth_date: string | null;
  city: string;
  county: string;
  email: string;
  phone: string;
  occupation: Occupation | "";
  job_title: string;
  income_stability: IncomeStability | "";
  net_income: number | null;
  payday: number | null;
  currency: "RON" | "EUR";
  goals: GoalKey[];
  risk_tolerance: Risk | "";
  horizon: Horizon | "";
  investing_experience: Experience | "";
  onboarding_done_at: string | null;
};

export const EMPTY_PROFILE: Profile = {
  first_name: "",
  last_name: "",
  birth_date: null,
  city: "",
  county: "",
  email: "",
  phone: "",
  occupation: "",
  job_title: "",
  income_stability: "",
  net_income: null,
  payday: null,
  currency: "RON",
  goals: [],
  risk_tolerance: "",
  horizon: "",
  investing_experience: "",
  onboarding_done_at: null,
};

export const OCCUPATIONS: { v: Occupation; label: string }[] = [
  { v: "employee", label: "Angajat(ă)" },
  { v: "self_employed", label: "PFA / II" },
  { v: "business", label: "Antreprenor (SRL)" },
  { v: "freelancer", label: "Freelancer / proiecte" },
  { v: "retired", label: "Pensionar(ă)" },
  { v: "student", label: "Student(ă)" },
  { v: "unemployed", label: "Fără loc de muncă" },
  { v: "other", label: "Altceva" },
];

export const STABILITY: { v: IncomeStability; label: string; hint: string }[] = [
  { v: "stable", label: "Stabil", hint: "aproximativ aceeași sumă în fiecare lună" },
  { v: "variable", label: "Variabil", hint: "diferă de la o lună la alta (comisioane, proiecte, sezon)" },
];

export const GOALS: { v: GoalKey; label: string; icon: string }[] = [
  { v: "emergency", label: "Fond de urgență", icon: "🛟" },
  { v: "debt_free", label: "Scap de datorii", icon: "⛓️" },
  { v: "home", label: "Locuință", icon: "🏠" },
  { v: "car", label: "Mașină", icon: "🚗" },
  { v: "retirement", label: "Pensie", icon: "🌅" },
  { v: "education", label: "Educație", icon: "🎓" },
  { v: "travel", label: "Călătorii", icon: "✈️" },
  { v: "investing", label: "Să încep să investesc", icon: "📈" },
  { v: "family", label: "Familie / copii", icon: "👨‍👩‍👧" },
];

export const RISKS: { v: Risk; label: string; hint: string }[] = [
  { v: "low", label: "Prudent", hint: "prefer siguranța, chiar dacă randamentul e mic" },
  { v: "medium", label: "Echilibrat", hint: "accept scăderi temporare pentru un câștig mai bun" },
  { v: "high", label: "Dinamic", hint: "accept fluctuații mari pe termen lung" },
];

export const HORIZONS: { v: Horizon; label: string; hint: string }[] = [
  { v: "short", label: "Sub 3 ani", hint: "am nevoie de bani curând" },
  { v: "medium", label: "3–10 ani", hint: "planuri pe termen mediu" },
  { v: "long", label: "Peste 10 ani", hint: "pensie, independență financiară" },
];

export const EXPERIENCES: { v: Experience; label: string }[] = [
  { v: "none", label: "Niciuna" },
  { v: "beginner", label: "Începător (depozite, titluri de stat)" },
  { v: "intermediate", label: "Medie (ETF-uri, fonduri)" },
  { v: "advanced", label: "Avansată (acțiuni, portofoliu propriu)" },
];

export const ROMANIAN_COUNTIES = [
  "Alba", "Arad", "Argeș", "Bacău", "Bihor", "Bistrița-Năsăud", "Botoșani", "Brăila", "Brașov", "București", "Buzău",
  "Călărași", "Caraș-Severin", "Cluj", "Constanța", "Covasna", "Dâmbovița", "Dolj", "Galați", "Giurgiu", "Gorj",
  "Harghita", "Hunedoara", "Ialomița", "Iași", "Ilfov", "Maramureș", "Mehedinți", "Mureș", "Neamț", "Olt", "Prahova",
  "Sălaj", "Satu Mare", "Sibiu", "Suceava", "Teleorman", "Timiș", "Tulcea", "Vâlcea", "Vaslui", "Vrancea", "Străinătate",
];

const oneOf = <T extends string>(v: unknown, list: { v: T }[]): T | "" =>
  list.some((o) => o.v === v) ? (v as T) : "";

const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/** Curăță datele venite din formular (orice câmp lipsă sau invalid devine gol). */
export function sanitizeProfile(input: Record<string, unknown>): Omit<Profile, "onboarding_done_at"> {
  const birth = text(input.birth_date, 10);
  const income = Number(input.net_income);
  const payday = Number(input.payday);
  const goals = Array.isArray(input.goals) ? input.goals : String(input.goals ?? "").split(",");
  return {
    first_name: text(input.first_name, 60),
    last_name: text(input.last_name, 60),
    birth_date: /^\d{4}-\d{2}-\d{2}$/.test(birth) ? birth : null,
    city: text(input.city, 80),
    county: ROMANIAN_COUNTIES.includes(text(input.county, 40)) ? text(input.county, 40) : "",
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(input.email, 120)) ? text(input.email, 120) : "",
    phone: text(input.phone, 30).replace(/[^\d+ ()-]/g, ""),
    occupation: oneOf(input.occupation, OCCUPATIONS),
    job_title: text(input.job_title, 80),
    income_stability: oneOf(input.income_stability, STABILITY),
    net_income: Number.isFinite(income) && income > 0 ? Math.round(income * 100) / 100 : null,
    payday: Number.isInteger(payday) && payday >= 1 && payday <= 31 ? payday : null,
    currency: input.currency === "EUR" ? "EUR" : "RON",
    goals: [...new Set(goals.map((g) => String(g).trim()).filter((g): g is GoalKey => GOALS.some((o) => o.v === g)))],
    risk_tolerance: oneOf(input.risk_tolerance, RISKS),
    horizon: oneOf(input.horizon, HORIZONS),
    investing_experience: oneOf(input.investing_experience, EXPERIENCES),
  };
}

/** Rândul din baza de date → Profile (goals e stocat ca listă separată prin virgulă). */
export function profileFromRow(row: Record<string, unknown> | undefined): Profile {
  if (!row) return { ...EMPTY_PROFILE };
  return {
    ...sanitizeProfile(row),
    onboarding_done_at: (row.onboarding_done_at as string | null) ?? null,
  };
}

export function ageFrom(birthDate: string | null, today = new Date()): number | null {
  if (!birthDate) return null;
  const b = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(b.getTime())) return null;
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age >= 0 && age < 120 ? age : null;
}

/** Profilul are informațiile din care se poate calcula o recomandare (ocupația sau stabilitatea venitului). */
export function hasFinancialProfile(p: Profile) {
  return !!(p.occupation || p.income_stability);
}

/**
 * Câte luni de cheltuieli esențiale ar trebui să acopere fondul de urgență, după profil.
 * Punct de plecare: 3 luni pentru un venit stabil. Venitul variabil sau pe cont propriu, lipsa
 * unui loc de muncă și prudența cresc ținta; rezultatul e între 3 și 12 luni.
 */
export function recommendedEmergencyMonths(p: Profile): { months: number; reasons: string[] } {
  let months = 3;
  const reasons: string[] = [];
  const ownAccount = p.occupation === "self_employed" || p.occupation === "business" || p.occupation === "freelancer";
  if (p.income_stability === "variable" || ownAccount) {
    months = 6;
    reasons.push(ownAccount ? "lucrezi pe cont propriu" : "venitul tău e variabil");
  }
  if (p.occupation === "unemployed") {
    months = Math.max(months, 6);
    reasons.push("nu ai momentan un loc de muncă");
  }
  if (p.goals.includes("family")) {
    months += 1;
    reasons.push("ai în plan sau în grijă o familie");
  }
  if (p.risk_tolerance === "low") {
    months += 1;
    reasons.push("preferi siguranța");
  }
  if (p.occupation === "retired" && p.income_stability !== "variable") {
    months = Math.max(3, months);
  }
  if (!reasons.length) reasons.push("venitul tău e stabil");
  return { months: Math.min(12, Math.max(3, months)), reasons };
}

/** Procentul recomandat pentru economii în bugetul „Recomandat pentru tine”, ajustat după profil. */
export function profileSavingsAdjustment(p: Profile, age: number | null): { delta: number; note: string | null } {
  if (p.goals.includes("retirement") && age !== null && age >= 40) {
    return { delta: 5, note: "Ai pensia printre obiective și peste 40 de ani: merită să economisești puțin mai mult." };
  }
  if (p.goals.includes("home") || p.goals.includes("debt_free")) {
    return { delta: 5, note: p.goals.includes("home") ? "Strângi pentru o locuință: economiile au o pondere mai mare." : "Vrei să scapi de datorii: rambursarea anticipată primește o pondere mai mare." };
  }
  if (p.occupation === "student") {
    return { delta: -5, note: "Ca student(ă), un procent mai mic de economii e realist; important e obiceiul." };
  }
  return { delta: 0, note: null };
}

/** Câte zile mai sunt până la următoarea zi de salariu (0 = azi). */
export function daysUntilPayday(payday: number, today = new Date()): number {
  const y = today.getFullYear();
  const m = today.getMonth();
  const clampDay = (yy: number, mm: number) => Math.min(payday, new Date(yy, mm + 1, 0).getDate());
  const thisMonth = new Date(y, m, clampDay(y, m));
  const start = new Date(y, m, today.getDate());
  if (thisMonth >= start) return Math.round((thisMonth.getTime() - start.getTime()) / 86_400_000);
  const next = new Date(y, m + 1, clampDay(y, m + 1));
  return Math.round((next.getTime() - start.getTime()) / 86_400_000);
}

export function displayName(p: Profile, fallback: string) {
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || fallback;
}
