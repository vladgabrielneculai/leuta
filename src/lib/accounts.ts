/**
 * Conturi și transferuri (beta). Logica e aici, fără bază de date, ca să poată fi testată direct.
 *
 * Soldul unui cont = soldul de pornire + ce s-a întâmplat pe el de la data de pornire (inclusiv):
 * - venituri: +; cheltuieli, costuri fixe și economii: − (un retur, sumă negativă, adaugă înapoi);
 * - transferuri primite: +; trimise: −.
 * Intrările dinainte de data de pornire sunt deja cuprinse în soldul de pornire, deci nu se mai adună.
 * Ratele creditelor (calculate automat) nu sunt legate de un cont.
 */

export type AccountKind = "cash" | "current" | "savings" | "card" | "other";

export const ACCOUNT_KINDS: { kind: AccountKind; label: string }[] = [
  { kind: "current", label: "Cont curent" },
  { kind: "cash", label: "Numerar" },
  { kind: "savings", label: "Cont de economii" },
  { kind: "card", label: "Card / portofel digital" },
  { kind: "other", label: "Altul" },
];

export type Account = {
  id: number;
  name: string;
  kind: AccountKind;
  currency: string;
  opening_balance: number;
  opening_date: string; // YYYY-MM-DD
  archived: number;
};

export type AccountEntry = {
  account_id: number | null;
  kind: string;
  amount: number;
  currency: string;
  month: string; // YYYY-MM
  day: string | null; // YYYY-MM-DD
};

export type Transfer = {
  id: number;
  from_account_id: number;
  to_account_id: number;
  amount: number;
  to_amount: number | null;
  date: string;
  note: string;
};

/** Cursul EUR→RON al unei luni. */
export type Rate = (month: string) => number;

/** O sumă din moneda `from` în moneda `to` (doar RON și EUR au curs; alte perechi rămân neschimbate). */
export function convert(amount: number, from: string, to: string, month: string, rate: Rate) {
  if (from === to) return amount;
  if (from === "EUR" && to === "RON") return amount * rate(month);
  if (from === "RON" && to === "EUR") return amount / rate(month);
  return amount;
}

/** Ziua unei intrări pentru comparația cu data de pornire: ziua tranzacției sau, dacă lipsește, prima zi a lunii. */
const entryDay = (e: AccountEntry) => e.day ?? `${e.month}-01`;

export type AccountBalance = Account & { balance: number; incoming: number; outgoing: number; entries: number };

export function balances(accounts: Account[], entries: AccountEntry[], transfers: Transfer[], rate: Rate): AccountBalance[] {
  return accounts.map((a) => {
    let incoming = 0;
    let outgoing = 0;
    let count = 0;
    for (const e of entries) {
      if (e.account_id !== a.id || entryDay(e) < a.opening_date) continue;
      const v = convert(e.amount, e.currency, a.currency, e.month, rate);
      count += 1;
      if (e.kind === "income") incoming += v;
      else outgoing += v; // retur (v < 0) → scade ieșirile
    }
    for (const t of transfers) {
      if (t.date < a.opening_date) continue;
      if (t.from_account_id === a.id) outgoing += t.amount;
      if (t.to_account_id === a.id) incoming += t.to_amount ?? t.amount;
    }
    const balance = Math.round((a.opening_balance + incoming - outgoing) * 100) / 100;
    return { ...a, balance, incoming, outgoing, entries: count };
  });
}

/** Totalul conturilor active, în lei. */
export function totalRon(list: AccountBalance[], month: string, rate: Rate) {
  return list.filter((a) => !a.archived).reduce((s, a) => s + convert(a.balance, a.currency, "RON", month, rate), 0);
}

/** Verificările unui transfer înainte de salvare; aruncă mesaje pentru utilizator. */
export function checkTransfer(t: { from_account_id: unknown; to_account_id: unknown; amount: unknown; to_amount?: unknown }) {
  const from = Number(t.from_account_id);
  const to = Number(t.to_account_id);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from <= 0 || to <= 0) throw new Error("Alege conturile.");
  if (from === to) throw new Error("Alege două conturi diferite.");
  const amount = Number(t.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Suma trebuie să fie mai mare decât 0.");
  const toAmount = t.to_amount === undefined || t.to_amount === null || t.to_amount === "" ? null : Number(t.to_amount);
  if (toAmount !== null && (!Number.isFinite(toAmount) || toAmount <= 0)) throw new Error("Suma primită trebuie să fie mai mare decât 0.");
  return { from_account_id: from, to_account_id: to, amount, to_amount: toAmount };
}
