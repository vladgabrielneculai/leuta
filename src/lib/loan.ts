import { addMonths, monthDiff, type ScheduleType, type Strategy } from "./util";

export type Loan = {
  id: number;
  name: string;
  bank: string;
  principal: number;
  start_date: string; // YYYY-MM-DD, data acordării
  term_months: number;
  schedule_type: ScheduleType;
  fixed_rate: number; // % anual în perioada fixă
  fixed_months: number; // durata perioadei fixe (0 = variabilă de la început)
  margin: number; // % marja băncii
  ircc: number; // % IRCC curent
  fee_fixed_pct: number; // comision rambursare anticipată în perioada fixă
  fee_variable_pct: number; // comision în perioada variabilă (de regulă 0)
  insurance_monthly: number;
  strategy: Strategy;
  active: number;
  already_paid_principal?: number;
  already_paid_interest?: number;

  // Graficul de la bancă (loan_schedules) ca sursă a calculelor — vezi migrarea 0003.
  use_schedule?: number;
  schedule_source?: string;
  schedule_generated_at?: string | null;
  contract_nr?: string;

  // Situația la zi din aplicația băncii
  status_date?: string | null;
  current_balance?: number;
  arrears_amount?: number; // suma restantă
  arrears_count?: number; // restanțe (număr de rate)
  next_payment_date?: string | null;
  next_payment_amount?: number;
  next_principal?: number;
  next_interest?: number;
  next_fees?: number; // taxe lunare (asigurarea de viață etc.)
  maturity_date?: string | null;
  current_rate?: number;

  // Asigurări anuale
  pad_amount?: number;
  pad_due_date?: string | null;
  opt_ins_amount?: number;
  opt_ins_due_date?: string | null;
};

/** O rată din graficul de rambursare al băncii (tabelul loan_schedules). */
export type ScheduleRow = {
  installment_nr: number;
  month: string; // YYYY-MM
  balance_start: number;
  principal: number;
  interest: number;
  fee: number; // costuri lunare ale băncii: asigurare + comisioane
  payment: number; // total de plată (principal + dobândă + costuri)
  balance_end: number;
  is_paid: number;
};

export type Prepayment = { id?: number; month: string; amount: number; strategy: Strategy; note?: string };

export type SimOptions = {
  prepayments?: Prepayment[]; // rambursări reale, înregistrate
  extraMonthly?: number; // scenariu: sumă lunară suplimentară
  extraFrom?: string; // luna de la care începe suma suplimentară
  oneTime?: { month: string; amount: number }[]; // scenariu: sume unice
  strategy?: Strategy; // strategia pentru sumele din scenariu
  irccOverride?: number; // scenariu: alt IRCC
  irccShock?: number; // scenariu: +/- puncte procentuale
  schedule?: ScheduleRow[]; // graficul băncii; folosit doar când loan.use_schedule = 1
};

export type Row = {
  index: number;
  month: string;
  rate: number;
  fixed: boolean;
  balanceStart: number;
  interest: number;
  principal: number;
  payment: number;
  prepayment: number;
  fee: number;
  insurance: number; // costuri lunare (asigurarea de viață, comisioane)
  annualInsurance: number; // PAD / asigurare facultativă scadente în luna asta
  balanceEnd: number;
  remaining: number;
  fromBank?: boolean; // rândul vine neschimbat din graficul băncii
};

export type SimResult = {
  rows: Row[];
  totalInterest: number;
  totalPrepaid: number;
  totalFees: number;
  totalInsurance: number;
  totalAnnualInsurance: number;
  totalPaid: number;
  payoffMonth: string;
  months: number;
  fromBank: boolean;
};

export function loanStartMonth(loan: Loan) {
  return loan.start_date.slice(0, 7);
}

/** Luna primei rate = luna următoare acordării. */
export function monthForIndex(loan: Loan, index: number) {
  return addMonths(loanStartMonth(loan), index + 1);
}

export function indexForMonth(loan: Loan, month: string) {
  return monthDiff(loanStartMonth(loan), month) - 1;
}

export function variableRate(loan: Loan, opts: SimOptions = {}) {
  const ircc = opts.irccOverride ?? loan.ircc;
  return loan.margin + ircc + (opts.irccShock ?? 0);
}

function pmt(r: number, n: number, pv: number) {
  if (n <= 0) return pv;
  if (r === 0) return pv / n;
  return (pv * r) / (1 - Math.pow(1 + r, -n));
}

function nper(r: number, p: number, pv: number) {
  if (r === 0) return pv / p;
  const x = 1 - (pv * r) / p;
  if (x <= 0) return Infinity;
  return -Math.log(x) / Math.log(1 + r);
}

export function simulate(loan: Loan, opts: SimOptions = {}): SimResult {
  const schedule = Number(loan.use_schedule) === 1 && opts.schedule?.length ? opts.schedule : null;
  const res = schedule ? simulateFromSchedule(loan, schedule, opts) : simulateContract(loan, opts);
  return withAnnualInsurance(loan, res);
}

/** Graficul calculat din parametrii contractului (dobândă fixă, marjă + IRCC, perioadă). */
function simulateContract(loan: Loan, opts: SimOptions = {}): SimResult {
  const rows: Row[] = [];
  let balance = loan.principal;
  let remaining = loan.term_months;
  let payment = 0;
  let principalPart = 0;
  let lastRate: number | null = null;
  let recalc = true;

  const extraByIndex = new Map<number, { amount: number; strategy: Strategy }>();
  const addExtra = (idx: number, amount: number, strategy: Strategy) => {
    if (idx < 0 || amount <= 0) return;
    const cur = extraByIndex.get(idx);
    extraByIndex.set(idx, { amount: (cur?.amount ?? 0) + amount, strategy });
  };
  for (const p of opts.prepayments ?? []) addExtra(indexForMonth(loan, p.month), p.amount, p.strategy);
  for (const p of opts.oneTime ?? []) addExtra(indexForMonth(loan, p.month), p.amount, opts.strategy ?? loan.strategy);

  // Dacă utilizatorul a introdus bani deja plătiți din principal neacoperiți de plăți anticipate individuale
  if (loan.already_paid_principal && loan.already_paid_principal > 0) {
    const totalPrepaidInOpts = (opts.prepayments ?? []).reduce((s, p) => s + p.amount, 0);
    if (totalPrepaidInOpts < loan.already_paid_principal) {
      const extraDiff = loan.already_paid_principal - totalPrepaidInOpts;
      addExtra(0, extraDiff, loan.strategy);
    }
  }

  const extraFromIdx = opts.extraFrom ? Math.max(0, indexForMonth(loan, opts.extraFrom)) : 0;


  let totalInterest = 0, totalPrepaid = 0, totalFees = 0, totalInsurance = 0;
  const safety = loan.term_months + 12;

  for (let i = 0; i < safety && balance > 0.005; i++) {
    const inFixed = i < loan.fixed_months;
    const annual = inFixed ? loan.fixed_rate : variableRate(loan, opts);
    const r = annual / 100 / 12;
    if (remaining < 1) remaining = 1;

    if (recalc || lastRate !== annual) {
      if (loan.schedule_type === "annuity") payment = pmt(r, remaining, balance);
      else principalPart = balance / remaining;
      recalc = false;
    }
    lastRate = annual;

    const balanceStart = balance;
    const interest = balance * r;
    let principal =
      loan.schedule_type === "annuity" ? Math.min(payment - interest, balance) : Math.min(principalPart, balance);
    if (principal < 0) principal = 0;
    balance -= principal;
    remaining -= 1;

    let extra = extraByIndex.get(i)?.amount ?? 0;
    let strategy = extraByIndex.get(i)?.strategy ?? opts.strategy ?? loan.strategy;
    if (opts.extraMonthly && i >= extraFromIdx) {
      extra += opts.extraMonthly;
      strategy = opts.strategy ?? loan.strategy;
    }
    const prepayment = Math.min(extra, balance);
    const fee = (prepayment * (inFixed ? loan.fee_fixed_pct : loan.fee_variable_pct)) / 100;

    if (prepayment > 0) {
      balance -= prepayment;
      if (balance > 0.005) {
        if (strategy === "term") {
          if (loan.schedule_type === "annuity") remaining = Math.ceil(nper(r, payment, balance) - 1e-9);
          else remaining = Math.ceil(balance / principalPart - 1e-9);
        } else {
          recalc = true; // aceeași perioadă, rată nouă mai mică
        }
      }
    }
    if (balance < 0.005) balance = 0;

    const insurance = loan.insurance_monthly;
    totalInterest += interest;
    totalPrepaid += prepayment;
    totalFees += fee;
    totalInsurance += insurance;

    rows.push({
      index: i,
      month: monthForIndex(loan, i),
      rate: annual,
      fixed: inFixed,
      balanceStart,
      interest,
      principal,
      payment: principal + interest,
      prepayment,
      fee,
      insurance,
      annualInsurance: 0,
      balanceEnd: balance,
      remaining: balance > 0 ? remaining : 0,
    });
  }

  const totalPaid = loan.principal + totalInterest + totalFees + totalInsurance;
  return {
    rows,
    totalInterest,
    totalPrepaid,
    totalFees,
    totalInsurance,
    totalAnnualInsurance: 0,
    totalPaid,
    payoffMonth: rows.length ? rows[rows.length - 1].month : loanStartMonth(loan),
    months: rows.length,
    fromBank: false,
  };
}

/** Rata anuală a dobânzii (%) pentru rata cu indexul dat, conform parametrilor creditului. */
function contractRate(loan: Loan, index: number, opts: SimOptions = {}) {
  return index < loan.fixed_months ? loan.fixed_rate : variableRate(loan, opts);
}

/**
 * Graficul băncii ca sursă: fiecare lună ia exact principalul, dobânda, costurile și soldul din grafic.
 * Lunile dinaintea primei rate din grafic se estimează din contract și se aliniază la soldul băncii.
 * Din momentul în care ceva schimbă creditul (o plată anticipată sau un scenariu de IRCC), restul se
 * recalculează ca la bancă: aceeași rată cu perioadă mai scurtă sau aceeași perioadă cu rată mai mică,
 * anuitatea se reface la schimbarea dobânzii, iar asigurarea rămâne același procent din sold.
 */
function simulateFromSchedule(loan: Loan, schedule: ScheduleRow[], opts: SimOptions): SimResult {
  const bank = [...schedule].sort((a, b) => a.month.localeCompare(b.month) || a.installment_nr - b.installment_nr);
  const byIdx = new Map<number, ScheduleRow>();
  for (const r of bank) byIdx.set(indexForMonth(loan, r.month), r);
  const firstMonth = bank[0].month;
  const firstIdx = indexForMonth(loan, firstMonth);
  const lastIdx = indexForMonth(loan, bank[bank.length - 1].month);
  const i0 = Math.max(0, firstIdx);
  const startBalance = byIdx.get(i0)?.balance_start ?? bank[0].balance_start;

  // 1. Lunile de dinainte de grafic (rate deja plătite): estimate din contract, aliniate la soldul băncii.
  // Diferența (rambursări neînregistrate, dobânzi diferite) se împarte uniform pe solduri, fără să apară
  // ca plată în bugetul acelor luni. `already_paid_principal` e deja inclus în soldul băncii.
  const rows: Row[] = [];
  if (i0 > 0) {
    const before = (opts.prepayments ?? []).filter((p) => p.month < firstMonth);
    const past = simulateContract({ ...loan, already_paid_principal: 0 }, { prepayments: before }).rows.slice(0, i0);
    for (let i = past.length; i < i0; i++) {
      // contractul s-ar fi încheiat mai devreme: luni fără rată, ca indexul să rămână aliniat cu luna
      const prevEnd = past.length ? past[past.length - 1].balanceEnd : loan.principal;
      past.push({
        index: i, month: monthForIndex(loan, i), rate: contractRate(loan, i), fixed: i < loan.fixed_months,
        balanceStart: prevEnd, interest: 0, principal: 0, payment: 0, prepayment: 0, fee: 0,
        insurance: 0, annualInsurance: 0, balanceEnd: prevEnd, remaining: lastIdx - i,
      });
    }
    const diff = past[past.length - 1].balanceEnd - startBalance;
    past.forEach((r, k) => {
      r.balanceStart -= (diff * k) / past.length;
      r.balanceEnd -= (diff * (k + 1)) / past.length;
      r.remaining = lastIdx - r.index;
    });
    rows.push(...past);
  }

  // 2. Graficul băncii, apoi recalculare după primul eveniment care îl schimbă.
  const extraByIndex = new Map<number, { amount: number; strategy: Strategy }>();
  const addExtra = (idx: number, amount: number, strategy: Strategy) => {
    if (idx < i0 || amount <= 0) return;
    const cur = extraByIndex.get(idx);
    extraByIndex.set(idx, { amount: (cur?.amount ?? 0) + amount, strategy });
  };
  for (const p of opts.prepayments ?? []) if (p.month >= firstMonth) addExtra(indexForMonth(loan, p.month), p.amount, p.strategy);
  for (const p of opts.oneTime ?? []) addExtra(indexForMonth(loan, p.month), p.amount, opts.strategy ?? loan.strategy);
  const extraFromIdx = opts.extraFrom ? Math.max(0, indexForMonth(loan, opts.extraFrom)) : 0;

  let balance = startBalance;
  let diverged = false;
  let remaining = Math.max(1, lastIdx - i0 + 1);
  let payment = 0;
  let principalPart = 0;
  let recalc = true;
  let lastRate: number | null = null;
  let insRatio = 0; // asigurarea de viață ca procent din sold
  let impliedRate = 0; // dobânda reieșită din grafic, dacă creditul nu are dobânzile completate
  const annuity = loan.schedule_type === "annuity";
  const safety = Math.max(loan.term_months, lastIdx + 1) + 24;

  for (let i = i0; i < safety && balance > 0.005; i++) {
    const inFixed = i < loan.fixed_months;
    const configured = contractRate(loan, i);
    const scenario = contractRate(loan, i, opts);
    const b = byIdx.get(i);
    if (!diverged && (!b || Math.abs(scenario - configured) > 1e-9)) {
      diverged = true;
      recalc = true;
      remaining = Math.max(1, lastIdx - i + 1);
    }
    const usedBank = !diverged && !!b;

    const balanceStart = balance;
    let interest: number;
    let principal: number;
    let insurance: number;
    let rate: number;

    if (usedBank && b) {
      if (b.balance_start > 0) {
        insRatio = b.fee / b.balance_start;
        impliedRate = (b.interest / b.balance_start) * 1200;
      }
      rate = scenario > 0 ? scenario : impliedRate;
      interest = b.interest;
      principal = Math.min(b.principal, balance);
      insurance = b.fee;
      remaining = Math.max(0, lastIdx - i);
    } else {
      rate = scenario > 0 ? scenario : impliedRate;
      const r = rate / 100 / 12;
      if (remaining < 1) remaining = 1;
      if (recalc || lastRate !== rate) {
        if (annuity) payment = pmt(r, remaining, balance);
        else principalPart = balance / remaining;
        recalc = false;
      }
      interest = balance * r;
      principal = annuity ? Math.min(payment - interest, balance) : Math.min(principalPart, balance);
      if (principal < 0) principal = 0;
      insurance = insRatio * balanceStart;
      remaining -= 1;
    }
    lastRate = rate;
    balance -= principal;

    let extra = extraByIndex.get(i)?.amount ?? 0;
    let strategy = extraByIndex.get(i)?.strategy ?? opts.strategy ?? loan.strategy;
    if (opts.extraMonthly && i >= extraFromIdx) {
      extra += opts.extraMonthly;
      strategy = opts.strategy ?? loan.strategy;
    }
    const prepayment = Math.min(extra, balance);
    const fee = (prepayment * (inFixed ? loan.fee_fixed_pct : loan.fee_variable_pct)) / 100;

    if (prepayment > 0) {
      balance -= prepayment;
      if (balance > 0.005) {
        if (!diverged) {
          // De aici graficul băncii nu mai e valabil; referința e rata obișnuită din luna următoare.
          diverged = true;
          remaining = Math.max(1, lastIdx - i);
          const nb = byIdx.get(i + 1);
          if (annuity) payment = nb ? nb.principal + nb.interest : principal + interest;
          else principalPart = nb?.principal || balance / remaining;
        }
        if (strategy === "term") {
          if (annuity) remaining = Math.ceil(nper(rate / 100 / 12, payment, balance) - 1e-9);
          else remaining = Math.ceil(balance / principalPart - 1e-9);
        } else {
          recalc = true;
        }
      }
    }
    if (balance < 0.005) balance = 0;

    rows.push({
      index: i,
      month: monthForIndex(loan, i),
      rate,
      fixed: inFixed,
      balanceStart,
      interest,
      principal,
      payment: principal + interest,
      prepayment,
      fee,
      insurance,
      annualInsurance: 0,
      balanceEnd: balance,
      remaining: balance > 0 ? remaining : 0,
      fromBank: usedBank,
    });
  }

  const sum = (f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0);
  const totalInterest = sum((r) => r.interest);
  const totalPrepaid = sum((r) => r.prepayment);
  const totalFees = sum((r) => r.fee);
  const totalInsurance = sum((r) => r.insurance);
  return {
    rows,
    totalInterest,
    totalPrepaid,
    totalFees,
    totalInsurance,
    totalAnnualInsurance: 0,
    totalPaid: sum((r) => r.principal + r.prepayment) + totalInterest + totalFees + totalInsurance,
    payoffMonth: rows.length ? rows[rows.length - 1].month : loanStartMonth(loan),
    months: rows.length,
    fromBank: true,
  };
}

/** PAD și asigurarea facultativă: suma întreagă în luna scadenței, în fiecare an de la prima scadență. */
export function annualInsuranceFor(loan: Loan, month: string) {
  let total = 0;
  const items: [number | undefined, string | null | undefined][] = [
    [loan.pad_amount, loan.pad_due_date],
    [loan.opt_ins_amount, loan.opt_ins_due_date],
  ];
  for (const [amount, due] of items) {
    if (!amount || !due || due.length < 7) continue;
    const dueMonth = due.slice(0, 7);
    if (month >= dueMonth && month.slice(5, 7) === dueMonth.slice(5, 7)) total += amount;
  }
  return total;
}

/** Suma lunară de pus deoparte pentru asigurările anuale (1/12). */
export function annualInsuranceMonthly(loan: Loan) {
  return ((loan.pad_amount || 0) + (loan.opt_ins_amount || 0)) / 12;
}

function withAnnualInsurance(loan: Loan, res: SimResult): SimResult {
  let total = 0;
  for (const r of res.rows) {
    r.annualInsurance = annualInsuranceFor(loan, r.month);
    total += r.annualInsurance;
  }
  return { ...res, totalAnnualInsurance: total, totalPaid: res.totalPaid + total };
}

export type LoanStatus = {
  balance: number;
  nextPayment: number;
  nextInsurance: number; // costurile lunare ale ratei următoare (asigurare, comisioane)
  nextMonth: string | null;
  currentRate: number;
  inFixed: boolean;
  monthsToVariable: number;
  paidPct: number;
  remainingMonths: number;
  interestLeft: number;
  payoffMonth: string;
  row?: Row;
  principalPaid: number;
  interestPaid: number;
  totalPaidSoFar: number;
  installmentsPaidCount: number;
};

/** Situația creditului într-o lună dată, pe baza rambursărilor reale și a istoricului achitat. */
export function statusAt(loan: Loan, sim: SimResult, month: string): LoanStatus {
  const idx = indexForMonth(loan, month);
  const row = idx >= 0 ? sim.rows[Math.min(idx, sim.rows.length - 1)] : undefined;
  const next = sim.rows[Math.max(0, idx + 1)];
  const balance = idx < 0 ? loan.principal : row && idx < sim.rows.length ? row.balanceEnd : 0;
  const interestLeft = sim.rows.slice(Math.max(0, idx + 1)).reduce((s, r) => s + r.interest, 0);

  // Calcule detaliate pentru banii deja plătiți până în luna curentă
  const pastRows = idx >= 0 ? sim.rows.slice(0, Math.min(idx + 1, sim.rows.length)) : [];
  const schedulePrincipalPaid = pastRows.reduce((s, r) => s + r.principal + r.prepayment, 0);
  const initialPaidPrincipal = loan.already_paid_principal ?? 0;
  const principalPaid = Math.max(schedulePrincipalPaid, initialPaidPrincipal, loan.principal - balance);

  const scheduleInterestPaid = pastRows.reduce((s, r) => s + r.interest, 0);
  const initialPaidInterest = loan.already_paid_interest ?? 0;
  const interestPaid = scheduleInterestPaid + initialPaidInterest;

  const feesPaid = pastRows.reduce((s, r) => s + r.fee, 0);
  const insurancePaid = pastRows.reduce((s, r) => s + r.insurance, 0);
  const totalPaidSoFar = principalPaid + interestPaid + feesPaid + insurancePaid;
  const installmentsPaidCount = pastRows.length;

  return {
    balance,
    nextPayment: next && balance > 0 ? next.payment : 0,
    nextInsurance: next && balance > 0 ? next.insurance : 0,
    nextMonth: next && balance > 0 ? next.month : null,
    currentRate: (row ?? sim.rows[0])?.rate ?? loan.fixed_rate,
    inFixed: idx < loan.fixed_months,
    monthsToVariable: Math.max(0, loan.fixed_months - idx - 1),
    paidPct: loan.principal > 0 ? (principalPaid / loan.principal) * 100 : 0,
    remainingMonths: Math.max(0, sim.rows.length - Math.max(0, idx + 1)),
    interestLeft,
    payoffMonth: sim.payoffMonth,
    row,
    principalPaid,
    interestPaid,
    totalPaidSoFar,
    installmentsPaidCount,
  };
}


/** Suma restantă din situația la zi: se plătește în luna în care a fost raportată. */
export function arrearsFor(loan: Loan, month: string) {
  return loan.arrears_amount && loan.status_date && loan.status_date.slice(0, 7) === month ? loan.arrears_amount : 0;
}

/** Rata (inclusiv asigurări) și rambursările dintr-o lună, pentru buget. */
export function monthCashflow(loan: Loan, sim: SimResult, month: string) {
  const idx = indexForMonth(loan, month);
  const row = idx >= 0 ? sim.rows[idx] : undefined;
  const arrears = arrearsFor(loan, month);
  if (!row) return { payment: arrears, interest: 0, principal: 0, insurance: 0, annualInsurance: 0, arrears, prepayment: 0, fee: 0 };
  return {
    payment: row.payment + arrears,
    interest: row.interest,
    principal: row.principal,
    insurance: row.insurance + row.annualInsurance,
    annualInsurance: row.annualInsurance,
    arrears,
    prepayment: row.prepayment,
    fee: row.fee,
  };
}

/** Datele din aplicația băncii („situația la zi”) din care se reconstruiește graficul. */
export type LoanStatusInput = {
  current_balance: number; // 0 = îl estimez din rată, dobândă și maturitate
  next_payment_date: string; // YYYY-MM-DD
  next_payment_amount: number;
  next_principal: number;
  next_interest: number;
  next_fees: number;
  maturity_date: string; // YYYY-MM-DD
  current_rate: number; // % pe an
};

/**
 * Reconstruiește graficul de rambursare din situația la zi: prima rată exact cum o arată banca,
 * apoi rate egale (sau descrescătoare) până la maturitate, pe soldul rămas. Dobânda variabilă de
 * după perioada fixă (marjă + IRCC) se aplică dacă e completată în credit, cu recalcularea ratei.
 * Taxele lunare (asigurarea de viață) rămân același procent din sold, ca în graficele BCR.
 */
export function scheduleFromStatus(loan: Loan, s: LoanStatusInput): ScheduleRow[] {
  const first = s.next_payment_date.slice(0, 7);
  const last = s.maturity_date.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(first)) throw new Error("Completează data următoarei rate.");
  if (!/^\d{4}-\d{2}$/.test(last)) throw new Error("Completează data maturității (ultima rată).");
  const n = monthDiff(first, last) + 1;
  if (n < 1) throw new Error("Maturitatea trebuie să fie după data următoarei rate.");
  if (!(s.current_rate > 0)) throw new Error("Completează rata dobânzii.");

  const firstIdx = indexForMonth(loan, first);
  const rateAt = (k: number) => {
    const idx = firstIdx + k;
    const variable = loan.margin + loan.ircc;
    return loan.fixed_months > 0 && idx >= loan.fixed_months && variable > 0 ? variable : s.current_rate;
  };

  const r0 = s.current_rate / 100 / 12;
  const pi = s.next_principal + s.next_interest || Math.max(0, s.next_payment_amount - s.next_fees);
  let balance =
    s.current_balance > 0 ? s.current_balance : r0 > 0 ? (pi * (1 - Math.pow(1 + r0, -n))) / r0 : pi * n;
  if (!(balance > 0)) throw new Error("Completează soldul curent sau valoarea ratei următoare.");
  const insRatio = s.next_fees > 0 ? s.next_fees / balance : 0;
  const annuity = loan.schedule_type === "annuity";

  const rows: ScheduleRow[] = [];
  let payment = 0;
  let principalPart = 0;
  let lastRate: number | null = null;
  for (let k = 0; k < n && balance > 0.005; k++) {
    const month = addMonths(first, k);
    const rate = rateAt(k);
    const r = rate / 100 / 12;
    const remaining = n - k;
    const balanceStart = balance;
    let interest: number;
    let principal: number;
    let fee: number;
    if (k === 0) {
      interest = s.next_interest || balance * r;
      principal = Math.min(balance, s.next_principal || Math.max(0, pi - interest));
      fee = s.next_fees;
    } else {
      if (k === 1 || lastRate !== rate) {
        if (annuity) payment = pmt(r, remaining, balance);
        else principalPart = balance / remaining;
      }
      interest = balance * r;
      principal = k === n - 1 ? balance : Math.min(balance, Math.max(0, annuity ? payment - interest : principalPart));
      fee = insRatio * balanceStart;
    }
    lastRate = rate;
    balance -= principal;
    if (balance < 0.005) balance = 0;
    const round = (v: number) => Math.round(v * 100) / 100;
    rows.push({
      installment_nr: firstIdx >= 0 ? firstIdx + k + 1 : k + 1,
      month,
      balance_start: round(balanceStart),
      principal: round(principal),
      interest: round(interest),
      fee: round(fee),
      payment: k === 0 && s.next_payment_amount > 0 ? s.next_payment_amount : round(principal + interest + fee),
      balance_end: round(balance),
      is_paid: 0,
    });
  }
  return rows;
}
