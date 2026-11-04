import { getDb, getSetting } from "./db";
import { currentBudgetMonth, payCycleFrom, todayRo, type PayCycle } from "./payCycle";
import { profileFromRow, type Profile } from "./profile";

/** Profilul utilizatorului curent (gol dacă nu l-a completat încă). */
export async function loadProfile(): Promise<Profile> {
  const row = await (await getDb()).prepare("SELECT * FROM user_profiles").get<Record<string, unknown>>();
  return profileFromRow(row);
}

/** Cum se împart intrările pe luni pentru utilizatorul curent: calendaristic sau de la salariu la salariu. */
export async function loadPayCycle(): Promise<PayCycle> {
  const [profile, enabled, weekend] = await Promise.all([loadProfile(), getSetting("budget_from_payday"), getSetting("payday_weekend")]);
  return payCycleFrom({ budget_from_payday: enabled, payday_weekend: weekend }, profile.payday);
}

/** Luna de buget în care suntem acum, pentru utilizatorul curent. */
export async function currentBudgetMonthForUser(at: Date = new Date()): Promise<string> {
  return currentBudgetMonth(await loadPayCycle(), todayRo(at));
}
