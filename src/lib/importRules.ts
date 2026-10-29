/**
 * Categoria propusă pentru o tranzacție importată:
 * 1. regulile utilizatorului („kaufland” → Alimente), învățate din corecturile lui la import;
 * 2. comercianți cunoscuți din România, legați de categoriile implicite ale aplicației.
 * O plată primește doar categorii de cheltuieli sau economii, o încasare doar categorii de venit.
 */

export type ImportRule = { pattern: string; category_id: number };
export type ImportCategory = { id: number; name: string; kind: string };
export type Suggestion = { categoryId: number | null; source: "rule" | "auto" | null };

const KEYWORDS: Record<string, string[]> = {
  "Alimente": [
    "kaufland", "lidl", "carrefour", "mega image", "profi", "penny", "auchan", "cora", "selgros", "metro cash",
    "megaimage", "la doi pasi", "annabella", "freshful", "bringo", "sezamo", "supermarket", "hipermarket", "brutaria", "macelaria",
  ],
  "Restaurante și ieșiri": [
    "glovo", "tazz", "bolt food", "foodpanda", "wolt", "mcdonald", "mc donald", "kfc", "burger king", "starbucks",
    "5 to go", "gregorys", "restaurant", "bistro", "pizza", "pizzeria", "burger", "cafe", "coffee", "simigeria", "trattoria",
  ],
  "Transport și mașină": [
    "omv", "petrom", "mol", "rompetrol", "lukoil", "socar", "gazprom", "bolt", "uber", "metrorex", "stb", "cfr calatori",
    "parcare", "parking", "rovinieta", "spalatorie auto", "service auto", "vulcanizare",
  ],
  "Abonamente": [
    "netflix", "spotify", "youtube", "hbo", "disney", "apple.com", "icloud", "google one", "amazon prime", "prime video",
    "voyo", "openai", "chatgpt", "microsoft", "adobe", "playstation", "xbox", "abonament",
  ],
  "Internet și telefon": ["digi", "rcs", "rds", "orange", "vodafone", "telekom", "yoxo"],
  "Energie electrică (curent)": ["enel", "electrica", "hidroelectrica", "ppc energie", "ppc", "cez vanzare", "energie electrica"],
  "Gaze naturale": ["engie", "distrigaz", "eon gaz", "e.on gaz", "gaze naturale"],
  "Întreținere și apă": ["asociatia de proprietari", "asociatia proprietarilor", "apa nova", "aquatim", "apavital", "compania de apa", "intretinere"],
  "Sănătate": [
    "catena", "dona", "help net", "sensiblu", "dr max", "dr.max", "farmacia", "farmacie", "regina maria", "medlife",
    "sanador", "synevo", "bioclinica", "medicover", "clinica", "stomatolog",
  ],
  "Cumpărături": [
    "emag", "altex", "flanco", "dedeman", "ikea", "decathlon", "h&m", "zara", "dm drogerie", "notino", "fashion days",
    "about you", "leroy merlin", "hornbach", "jysk", "pepco", "sephora", "temu", "aliexpress", "amazon", "answear",
  ],
  "Asigurări": ["allianz", "groupama", "omniasig", "generali", "asirom", "signal iduna", "uniqa", "euroins", "grawe", "asigurare"],
  "Călătorii": ["booking.com", "airbnb", "wizz", "ryanair", "tarom", "hotel", "travel"],
  "Chirie": ["chirie"],
  "Economii": ["depozit", "economii", "cont de economii", "round up"],
  "Salariu": ["salariu", "salarii", "salar", "drepturi salariale", "stat de plata"],
  "Tichete de masă": ["edenred", "pluxee", "sodexo", "up romania", "tichete de masa"],
};

// Ca în statementImport.ts; copiat ca modulul să nu depindă de alt fișier (testele îl rulează direct cu Node).
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Cuvântul trebuie să apară întreg („mol” nu se potrivește în „molid”). */
function contains(text: string, word: string) {
  return new RegExp(`(^|[^a-z0-9])${escape(word)}($|[^a-z0-9])`).test(text);
}

function allowed(cat: ImportCategory, amount: number) {
  return amount > 0 ? cat.kind === "income" : cat.kind !== "income";
}

export function suggestCategory(
  tx: { details: string; description: string; amount: number },
  rules: ImportRule[],
  categories: ImportCategory[],
): Suggestion {
  const text = normalize(`${tx.description} ${tx.details}`);
  const byId = new Map(categories.map((c) => [c.id, c]));

  // Regula cu tiparul cel mai lung (cea mai specifică) câștigă.
  let best: ImportRule | null = null;
  for (const r of rules) {
    const cat = byId.get(r.category_id);
    if (!cat || !allowed(cat, tx.amount) || !r.pattern || !text.includes(r.pattern)) continue;
    if (!best || r.pattern.length > best.pattern.length) best = r;
  }
  if (best) return { categoryId: best.category_id, source: "rule" };

  const byName = new Map(categories.map((c) => [normalize(c.name), c]));
  let found: { cat: ImportCategory; len: number } | null = null;
  for (const [name, words] of Object.entries(KEYWORDS)) {
    const cat = byName.get(normalize(name));
    if (!cat || !allowed(cat, tx.amount)) continue;
    for (const w of words) {
      if (contains(text, w) && (!found || w.length > found.len)) found = { cat, len: w.length };
    }
  }
  return found ? { categoryId: found.cat.id, source: "auto" } : { categoryId: null, source: null };
}

/** Tiparul reținut când utilizatorul alege categoria: numele comerciantului fără cifre („KAUFLAND 1234” → „kaufland”). */
export function learnPattern(merchant: string): string | null {
  const words = normalize(merchant)
    .replace(/[^a-z0-9&.' -]/g, " ")
    .split(" ")
    .filter((w) => w && !/\d/.test(w) && w.length > 1)
    .slice(0, 3);
  const p = words.join(" ").trim();
  return p.length >= 3 ? p : null;
}
