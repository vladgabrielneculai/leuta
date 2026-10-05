import { getDb } from "./db";
import { profileFromRow, type Profile } from "./profile";

/** Profilul utilizatorului curent (gol dacă nu l-a completat încă). */
export async function loadProfile(): Promise<Profile> {
  const row = await (await getDb()).prepare("SELECT * FROM user_profiles").get<Record<string, unknown>>();
  return profileFromRow(row);
}
