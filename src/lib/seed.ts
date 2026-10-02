import { getDb, type DbInterface } from "./db";
import { addMonths, currentMonth } from "./util";

export async function clearAllFinancialData(dbArg?: DbInterface): Promise<void> {
  const db = dbArg ?? (await getDb());
  await db.transaction(async (db) => {
    await db.exec(`
      DELETE FROM entries;
      DELETE FROM loan_prepayments;
      DELETE FROM loan_schedules;
      DELETE FROM loans;
      DELETE FROM investment_values;
      DELETE FROM investments;
      DELETE FROM goals;
    `);
  });
}

export async function seedDemoData(dbArg?: DbInterface): Promise<{ success: boolean; message: string }> {
  const db = dbArg ?? (await getDb());
  const now = currentMonth();
  const m0 = now;
  const m1 = addMonths(now, -1);
  const m2 = addMonths(now, -2);
  const m3 = addMonths(now, -3);

  const months = [m3, m2, m1, m0];

  // Verifica daca modulul de investitii este activat in setari
  const settingRow = await db.prepare("SELECT value FROM user_settings WHERE key = 'enable_investments'").get<{ value?: string }>();
  const enableInvestments = settingRow?.value === "1";

  await db.transaction(async (db) => {
    // 1. Asigură categoriile de bază
    const catMap = new Map<string, number>();
    const rows = await db.prepare("SELECT id, name FROM categories").all<{ id: number; name: string }>();
    for (const r of rows) catMap.set(r.name, r.id);

    const getCat = (name: string): number | null => catMap.get(name) ?? null;

    // 2. Obiective economii
    await db.prepare("DELETE FROM goals").run();

    const insGoal = db.prepare(`
      INSERT INTO goals (name, type, target, initial, deadline, color)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const gEmergency = (await insGoal.run("Fond de urgență (6 luni)", "emergency", 36000, 16000, null, "#3D7A4E")).lastInsertRowid;
    const gVacanta = (await insGoal.run("Vacanță de vară", "goal", 9000, 3200, addMonths(now, 5) + "-01", "#C99A1E")).lastInsertRowid;

    // 3. Investiții (doar dacă sunt activate)
    await db.prepare("DELETE FROM investments").run();
    await db.prepare("DELETE FROM investment_values").run();

    let invBet: number | null = null;
    let invSp500: number | null = null;

    if (enableInvestments) {
      const insInv = db.prepare(`
        INSERT INTO investments (name, type, expected_return)
        VALUES (?, ?, ?)
      `);
      invBet = Number((await insInv.run("ETF BET Patria-Tradeville", "ETF", 9)).lastInsertRowid);
      invSp500 = Number((await insInv.run("iShares Core S&P 500", "ETF", 8.5)).lastInsertRowid);

      const insInvVal = db.prepare(`
        INSERT INTO investment_values (investment_id, month, value)
        VALUES (?, ?, ?) ON CONFLICT (investment_id, month) DO UPDATE SET value = EXCLUDED.value
      `);
      await insInvVal.run(invBet, m3, 34500);
      await insInvVal.run(invBet, m2, 35800);
      await insInvVal.run(invBet, m1, 37200);
      await insInvVal.run(invBet, m0, 39100);

      await insInvVal.run(invSp500, m3, 23000);
      await insInvVal.run(invSp500, m2, 24100);
      await insInvVal.run(invSp500, m1, 25300);
      await insInvVal.run(invSp500, m0, 26800);
    }

    // 4. Credite
    await db.prepare("DELETE FROM loans").run();
    await db.prepare("DELETE FROM loan_prepayments").run();
    await db.prepare("DELETE FROM loan_schedules").run();

    const insLoan = db.prepare(`
      INSERT INTO loans (
        name, bank, principal, start_date, term_months, schedule_type,
        fixed_rate, fixed_months, margin, ircc, fee_fixed_pct,
        fee_variable_pct, insurance_monthly, strategy, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Credit Ipotecar acordat acum 18 luni
    const ipotecarStart = addMonths(now, -18) + "-15";
    const ipotecarId = (await insLoan.run(
      "Credit Ipotecar Apartament",
      "Banca Transilvania",
      320000,
      ipotecarStart,
      360,
      "annuity",
      5.85,
      36,
      2.30,
      5.86,
      0,
      0,
      115,
      "term",
      1
    )).lastInsertRowid;

    // Credit Nevoi Personale acordat acum 10 luni
    const nevoiStart = addMonths(now, -10) + "-10";
    await insLoan.run(
      "Credit Nevoi Personale",
      "ING Bank",
      35000,
      nevoiStart,
      60,
      "annuity",
      8.49,
      60,
      0,
      0,
      0,
      0,
      40,
      "term",
      1
    );

    // Plăți anticipate înregistrate pe creditul ipotecar
    const insPrepay = db.prepare(`
      INSERT INTO loan_prepayments (loan_id, month, amount, strategy, note)
      VALUES (?, ?, ?, ?, ?)
    `);
    await insPrepay.run(ipotecarId, addMonths(now, -6), 10000, "term", "Bonus anual - reducere perioadă");
    await insPrepay.run(ipotecarId, addMonths(now, -2), 15000, "term", "Economii acumulate - scurtare durată");

    // 5. Intrări lunare (venituri, cheltuieli fixe, cheltuieli variabile, economii)
    await db.prepare("DELETE FROM entries").run();

    const insEntry = db.prepare(`
      INSERT INTO entries (
        month, kind, category_id, goal_id, investment_id,
        description, amount, currency, recurring
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Tichete de masa variabile per luna
    const mealTicketAmounts: Record<string, number> = {
      [m3]: 770, // 22 zile * 35 lei
      [m2]: 840, // 21 zile * 40 lei
      [m1]: 800, // 20 zile * 40 lei
      [m0]: 880, // 22 zile * 40 lei
    };

    // Utilitati variabile per luna
    const utilityAmounts: Record<string, { intretinere: number; curent: number; gaze: number }> = {
      [m3]: { intretinere: 410, curent: 185, gaze: 280 },
      [m2]: { intretinere: 435, curent: 170, gaze: 240 },
      [m1]: { intretinere: 390, curent: 195, gaze: 160 },
      [m0]: { intretinere: 420, curent: 180, gaze: 110 },
    };

    for (const m of months) {
      // Venituri
      await insEntry.run(m, "income", getCat("Salariu"), null, null, "Salariu net lunar", 9200, "RON", 1);
      await insEntry.run(m, "income", getCat("Tichete de masă"), null, null, "Card tichete masă (alimentat)", mealTicketAmounts[m] ?? 800, "RON", 0);

      if (m === m1 || m === m3) {
        await insEntry.run(m, "income", getCat("Venituri extra"), null, null, "Proiect consultanță IT", 1800, "RON", 0);
      }

      // Cheltuieli Fixe (doar cele cu adevărat constante)
      await insEntry.run(m, "fixed", getCat("Internet și telefon"), null, null, "Abonament fibră optică & 2 telefoane", 85, "RON", 1);
      await insEntry.run(m, "fixed", getCat("Asigurări"), null, null, "Asigurare facultativă locuință", 120, "RON", 1);
      await insEntry.run(m, "fixed", getCat("Abonamente"), null, null, "Netflix, Spotify, YouTube", 95, "RON", 1);

      // Cheltuieli Variabile: utilitati (apa, curent, gaze, intretinere) sunt variabile
      const u = utilityAmounts[m] ?? { intretinere: 400, curent: 180, gaze: 180 };
      await insEntry.run(m, "variable", getCat("Întreținere și apă"), null, null, "Întreținere bloc și apă caldă/rece", u.intretinere, "RON", 0);
      await insEntry.run(m, "variable", getCat("Energie electrică (curent)"), null, null, "Factură energie electrică", u.curent, "RON", 0);
      await insEntry.run(m, "variable", getCat("Gaze naturale"), null, null, "Factură gaze naturale", u.gaze, "RON", 0);

      // Alte cheltuieli variabile
      await insEntry.run(m, "variable", getCat("Alimente"), null, null, "Cumpărături supermarket & mâncare", 2150, "RON", 0);
      await insEntry.run(m, "variable", getCat("Transport și mașină"), null, null, "Combustibil & transport", 620, "RON", 0);
      await insEntry.run(m, "variable", getCat("Restaurante și ieșiri"), null, null, "Ieșiri în oraș & comenzi", 780, "RON", 0);
      await insEntry.run(m, "variable", getCat("Sănătate"), null, null, "Farmacie și analize", 190, "RON", 0);
      await insEntry.run(m, "variable", getCat("Cumpărături"), null, null, "Haine și articole casă", 450, "RON", 0);

      // Economii & Investiții
      await insEntry.run(m, "saving", getCat("Economii"), Number(gEmergency), null, "Alocare lunară fond urgență", 1000, "RON", 1);
      await insEntry.run(m, "saving", getCat("Economii"), Number(gVacanta), null, "Economisire vacanță", 600, "RON", 1);

      if (enableInvestments && invBet && invSp500) {
        await insEntry.run(m, "saving", null, null, invBet, "Achiziție lunară ETF BET", 1000, "RON", 1);
        await insEntry.run(m, "saving", null, null, invSp500, "Achiziție lunară ETF S&P 500", 800, "RON", 1);
      }
    }
  });

  return { success: true, message: "Datele demonstrative au fost încărcate cu succes." };
}
