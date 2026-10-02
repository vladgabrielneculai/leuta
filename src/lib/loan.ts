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
  insurance: number;
  balanceEnd: number;
  remaining: number;
};

export type SimResult = {
  rows: Row[];
  totalInterest: number;
  totalPrepaid: number;
  totalFees: number;
  totalInsurance: number;
  totalPaid: number;
  payoffMonth: string;
  months: number;
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
    totalPaid,
    payoffMonth: rows.length ? rows[rows.length - 1].month : loanStartMonth(loan),
    months: rows.length,
  };
}

export type LoanStatus = {
  balance: number;
  nextPayment: number;
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


/** Rata (inclusiv asigurare) și rambursările dintr-o lună, pentru buget. */
export function monthCashflow(loan: Loan, sim: SimResult, month: string) {
  const idx = indexForMonth(loan, month);
  const row = idx >= 0 ? sim.rows[idx] : undefined;
  if (!row) return { payment: 0, interest: 0, principal: 0, insurance: 0, prepayment: 0, fee: 0 };
  return {
    payment: row.payment,
    interest: row.interest,
    principal: row.principal,
    insurance: row.insurance,
    prepayment: row.prepayment,
    fee: row.fee,
  };
}
