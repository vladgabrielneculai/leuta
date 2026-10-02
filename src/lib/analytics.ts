import { getDb, getSettings, num } from "./db";
import { loadRates, rateForMonthFrom, type RateInfo } from "./fx";
import { monthCashflow, simulate, statusAt, variableRate, type Loan, type LoanStatus, type Prepayment } from "./loan";
import { addMonths, lastMonths, lei, monthDiff, monthLabel, pct, type Bucket, type Kind } from "./util";

type EntryRow = {
  id: number;
  month: string;
  kind: Kind;
  category_id: number | null;
  goal_id: number | null;
  investment_id: number | null;
  amount: number;
  currency: string;
  bucket: Bucket | null;
};

export type MonthTotals = {
  month: string;
  income: number;
  fixed: number;
  variable: number;
  loanPayments: number;
  loanInterest: number;
  loanInsurance: number;
  prepayments: number;
  prepayFees: number;
  savings: number;
  investments: number;
  needs: number;
  wants: number;
  savedTotal: number;
  spent: number;
  unallocated: number;
  savingsRate: number;
  dti: number;
  hasData: boolean;
};

export type CategoryView = {
  id: number;
  name: string;
  kind: Kind;
  bucket: Bucket;
  color: string;
  amount: number;
  avg3: number;
};

export type LoanView = {
  loan: Loan;
  status: LoanStatus;
  totalInterest: number;
  interestSaved: number;
  monthsSaved: number;
  prepaidTotal: number;
  variableRate: number;
};

export type GoalView = {
  id: number;
  name: string;
  type: "emergency" | "goal";
  color: string;
  target: number;
  saved: number;
  pct: number;
  deadline: string | null;
  monthlyNeeded: number;
  avgMonthly: number;
  eta: string | null;
};

export type InvestmentView = {
  id: number;
  name: string;
  type: string;
  expected_return: number;
  contributed: number;
  value: number;
  gain: number;
  valueMonth: string | null;
};

export type MethodView = {
  key: string;
  name: string;
  description: string;
  targets: Record<Bucket, number>;
  targetPct: Record<Bucket, number>;
  actual: Record<Bucket, number>;
  score: number;
  notes: string[];
};

export type Suggestion = {
  level: "critic" | "atentie" | "bine" | "idee";
  title: string;
  text: string;
};

export type Summary = {
  month: string;
  fx: RateInfo;
  totals: MonthTotals;
  prev: MonthTotals | null;
  trend: MonthTotals[];
  categories: CategoryView[];
  loans: LoanView[];
  goals: GoalView[];
  emergency: { target: number; saved: number; months: number; monthsCovered: number; avgEssential: number; hasGoal: boolean };
  investments: InvestmentView[];
  netWorth: { month: string; assets: number; debt: number; net: number }[];
  methods: MethodView[];
  suggestions: Suggestion[];
  prepay: {
    loanName: string;
    rateNow: number;
    rateVariable: number;
    inFixed: boolean;
    monthsToVariable: number;
    feePct: number;
    netReturn: number;
    inflation: number;
    verdict: "prepay" | "invest" | "balanced";
  } | null;
  settings: Record<string, string>;
};

async function loadLoans() {
  const db = await getDb();
  const [loans, pre] = await Promise.all([
    db.prepare("SELECT * FROM loans ORDER BY id").all<Loan>(),
    db.prepare("SELECT * FROM loan_prepayments ORDER BY month").all<Prepayment & { loan_id: number }>(),
  ]);
  return loans.map((loan) => {
    const prepayments = pre.filter((p) => p.loan_id === loan.id);
    const sim = simulate(loan, { prepayments });
    const base = prepayments.length ? simulate(loan) : sim;
    return { loan, prepayments, sim, base };
  });
}

export async function buildSummary(month: string): Promise<Summary> {
  const db = await getDb();
  const trendMonths = lastMonths(month, 12);

  // Toate citirile pornesc în paralel: pe un server online fiecare round-trip costă, așa că nu le înlănțuim.
  const [settings, entries, rates, loans, catsRaw, goalsRawQ, invRawQ, invValuesQ] = await Promise.all([
    getSettings(),
    db
      .prepare(
        `SELECT e.id, e.month, e.kind, e.category_id, e.goal_id, e.investment_id, e.amount, e.currency, c.bucket
         FROM entries e LEFT JOIN categories c ON c.id = e.category_id`,
      )
      .all<EntryRow>(),
    loadRates(),
    loadLoans(),
    db.prepare("SELECT * FROM categories WHERE kind IN ('fixed','variable') ORDER BY kind, name").all(),
    db.prepare("SELECT * FROM goals ORDER BY type DESC, id").all(),
    db.prepare("SELECT * FROM investments ORDER BY id").all(),
    db.prepare("SELECT * FROM investment_values ORDER BY month").all(),
  ]);

  const fxCache = new Map<string, number>();
  const fx = (m: string) => {
    if (!fxCache.has(m)) fxCache.set(m, rateForMonthFrom(rates, m).rate);
    return fxCache.get(m)!;
  };
  const inRon = (e: EntryRow) => (e.currency === "EUR" ? e.amount * fx(e.month) : e.amount);


  const byMonth = new Map<string, EntryRow[]>();
  for (const e of entries) {
    if (!byMonth.has(e.month)) byMonth.set(e.month, []);
    byMonth.get(e.month)!.push(e);
  }

  const totalsFor = (m: string): MonthTotals => {
    const list = byMonth.get(m) ?? [];
    const t: MonthTotals = {
      month: m, income: 0, fixed: 0, variable: 0, loanPayments: 0, loanInterest: 0, loanInsurance: 0,
      prepayments: 0, prepayFees: 0, savings: 0, investments: 0, needs: 0, wants: 0,
      savedTotal: 0, spent: 0, unallocated: 0, savingsRate: 0, dti: 0, hasData: list.length > 0,
    };
    for (const e of list) {
      const v = inRon(e);
      if (e.kind === "income") t.income += v;
      else if (e.kind === "saving") {
        if (e.investment_id) t.investments += v;
        else t.savings += v;
      } else {
        if (e.kind === "fixed") t.fixed += v;
        else t.variable += v;
        if (e.bucket === "wants") t.wants += v;
        else t.needs += v;
      }
    }
    for (const { loan, sim } of loans) {
      const cf = monthCashflow(loan, sim, m);
      t.loanPayments += cf.payment;
      t.loanInterest += cf.interest;
      t.loanInsurance += cf.insurance;
      t.prepayments += cf.prepayment;
      t.prepayFees += cf.fee;
    }
    t.needs += t.loanPayments + t.loanInsurance + t.prepayFees;
    t.savedTotal = t.savings + t.investments + t.prepayments;
    t.spent = t.fixed + t.variable + t.loanPayments + t.loanInsurance + t.prepayFees;
    t.unallocated = t.income - t.spent - t.savedTotal;
    t.savingsRate = t.income > 0 ? (t.savedTotal / t.income) * 100 : 0;
    t.dti = t.income > 0 ? ((t.loanPayments + t.loanInsurance) / t.income) * 100 : 0;
    return t;
  };

  const trend = trendMonths.map(totalsFor);
  const totals = trend[trend.length - 1];
  const prevTotals = trend[trend.length - 2];
  const prev = prevTotals?.hasData ? prevTotals : null;

  // Media pe ultimele 3 luni cu date (fără luna curentă)
  const prior = trend.slice(0, -1).filter((t) => t.hasData).slice(-3);

  // ---------- Categorii ----------
  const cats = catsRaw as unknown as {
    id: number; name: string; kind: Kind; bucket: Bucket; color: string;
  }[];
  const priorMonths = new Set(prior.map((p) => p.month));
  const categories: CategoryView[] = cats
    .map((c) => {
      const amount = (byMonth.get(month) ?? []).filter((e) => e.category_id === c.id).reduce((s, e) => s + inRon(e), 0);
      const priorSum = entries
        .filter((e) => e.category_id === c.id && priorMonths.has(e.month))
        .reduce((s, e) => s + inRon(e), 0);
      return { ...c, amount, avg3: prior.length ? priorSum / prior.length : 0 };
    })
    .filter((c) => c.amount > 0 || c.avg3 > 0)
    .sort((a, b) => b.amount - a.amount);

  // ---------- Credite ----------
  const loanViews: LoanView[] = loans.map(({ loan, prepayments, sim, base }) => ({
    loan,
    status: statusAt(loan, sim, month),
    totalInterest: sim.totalInterest,
    interestSaved: base.totalInterest - sim.totalInterest,
    monthsSaved: base.months - sim.months,
    prepaidTotal: prepayments.reduce((s, p) => s + p.amount, 0),
    variableRate: variableRate(loan),
  }));

  // ---------- Obiective ----------
  const goalsRaw = goalsRawQ as unknown as {
    id: number; name: string; type: "emergency" | "goal"; target: number; initial: number; deadline: string | null; color: string;
  }[];
  const emergencyMonths = num(settings.emergency_months, 6);
  const essentialSample = [...prior, ...(totals.hasData ? [totals] : [])].slice(-3);
  const avgEssential = essentialSample.length
    ? essentialSample.reduce((s, t) => s + t.needs, 0) / essentialSample.length
    : 0;

  const goals: GoalView[] = goalsRaw.map((g) => {
    const contribs = entries.filter((e) => e.goal_id === g.id && e.month <= month);
    const saved = g.initial + contribs.reduce((s, e) => s + inRon(e), 0);
    const target = g.type === "emergency" && g.target <= 0 ? emergencyMonths * avgEssential : g.target;
    const recent = lastMonths(month, 3);
    const avgMonthly = contribs.filter((e) => recent.includes(e.month)).reduce((s, e) => s + inRon(e), 0) / 3;
    const left = Math.max(0, target - saved);
    const monthsLeft = g.deadline ? Math.max(1, monthDiff(month, g.deadline.slice(0, 7))) : 0;
    return {
      id: g.id,
      name: g.name,
      type: g.type,
      color: g.color,
      target,
      saved,
      pct: target > 0 ? Math.min(100, (saved / target) * 100) : 0,
      deadline: g.deadline,
      monthlyNeeded: g.deadline ? left / monthsLeft : 0,
      avgMonthly,
      eta: left <= 0 ? month : avgMonthly > 0 ? addMonths(month, Math.ceil(left / avgMonthly)) : null,
    };
  });
  const eg = goals.find((g) => g.type === "emergency");
  const emergency = {
    target: eg?.target ?? emergencyMonths * avgEssential,
    saved: eg?.saved ?? 0,
    months: emergencyMonths,
    monthsCovered: avgEssential > 0 ? (eg?.saved ?? 0) / avgEssential : 0,
    avgEssential,
    hasGoal: !!eg,
  };

  // ---------- Investiții ----------
  const invRaw = invRawQ as unknown as {
    id: number; name: string; type: string; expected_return: number;
  }[];
  const invValues = invValuesQ as unknown as {
    investment_id: number; month: string; value: number;
  }[];
  const investmentValueAt = (id: number, m: string) => {
    const contributed = entries.filter((e) => e.investment_id === id && e.month <= m).reduce((s, e) => s + inRon(e), 0);
    const snaps = invValues.filter((v) => v.investment_id === id && v.month <= m);
    const snap = snaps[snaps.length - 1];
    if (!snap) return { contributed, value: contributed, valueMonth: null as string | null };
    // contribuțiile de după ultima evaluare se adaugă la valoare
    const after = entries
      .filter((e) => e.investment_id === id && e.month > snap.month && e.month <= m)
      .reduce((s, e) => s + inRon(e), 0);
    return { contributed, value: snap.value + after, valueMonth: snap.month };
  };
  const investments: InvestmentView[] = invRaw.map((i) => {
    const v = investmentValueAt(i.id, month);
    return { ...i, ...v, gain: v.value - v.contributed };
  });

  // ---------- Avere netă ----------
  const goalInitial = goalsRaw.reduce((s, g) => s + g.initial, 0);
  const netWorth = trendMonths.map((m) => {
    const cash = goalInitial + entries.filter((e) => e.kind === "saving" && !e.investment_id && e.month <= m).reduce((s, e) => s + inRon(e), 0);
    const inv = invRaw.reduce((s, i) => s + investmentValueAt(i.id, m).value, 0);
    const debt = loans.reduce((s, l) => s + statusAt(l.loan, l.sim, m).balance, 0);
    return { month: m, assets: cash + inv, debt, net: cash + inv - debt };
  });

  // ---------- Metode de buget ----------
  const methods = buildMethods(totals, emergency, loanViews, settings);

  // ---------- Rambursare vs investiție ----------
  const expected = num(settings.expected_invest_return, 7);
  const tax = num(settings.invest_tax_pct, 10);
  const inflation = num(settings.inflation_pct, 5);
  const netReturn = expected * (1 - tax / 100);
  const activeLoans = loanViews.filter((l) => l.status.balance > 0);
  const topLoan = [...activeLoans].sort((a, b) => b.status.currentRate - a.status.currentRate)[0];
  let prepay: Summary["prepay"] = null;
  if (topLoan) {
    const effective = Math.max(topLoan.status.currentRate, topLoan.status.inFixed ? topLoan.variableRate : 0);
    const diff = effective - netReturn;
    prepay = {
      loanName: topLoan.loan.name,
      rateNow: topLoan.status.currentRate,
      rateVariable: topLoan.variableRate,
      inFixed: topLoan.status.inFixed,
      monthsToVariable: topLoan.status.monthsToVariable,
      feePct: topLoan.status.inFixed ? topLoan.loan.fee_fixed_pct : topLoan.loan.fee_variable_pct,
      netReturn,
      inflation,
      verdict: diff > 1 ? "prepay" : diff < -1 ? "invest" : "balanced",
    };
  }

  const suggestions = buildSuggestions({
    month, totals, prev, categories, emergency, goals, loanViews, investments, prepay, prior, settings,
  });

  return {
    month,
    fx: rateForMonthFrom(rates, month),
    totals,
    prev,
    trend,
    categories,
    loans: loanViews,
    goals,
    emergency,
    investments,
    netWorth,
    methods,
    suggestions,
    prepay,
    settings,
  };
}

function roundTo5(n: number) {
  return Math.round(n / 5) * 5;
}

function buildMethods(
  t: MonthTotals,
  emergency: Summary["emergency"],
  loans: LoanView[],
  settings: Record<string, string>,
): MethodView[] {
  const income = t.income;
  const actual: Record<Bucket, number> = { needs: t.needs, wants: t.wants, savings: t.savedTotal };
  const make = (
    key: string, name: string, description: string, p: Record<Bucket, number>, notes: string[] = [],
  ): MethodView => {
    const targets = { needs: (income * p.needs) / 100, wants: (income * p.wants) / 100, savings: (income * p.savings) / 100 };
    let score = 0;
    if (income > 0) {
      // Penalizăm depășirile la nevoi/dorințe și lipsurile la economii
      const over = Math.max(0, actual.needs - targets.needs) + Math.max(0, actual.wants - targets.wants);
      const under = Math.max(0, targets.savings - actual.savings);
      score = Math.round(Math.max(0, 100 - ((over + under) / income) * 200));
    }
    return { key, name, description, targets, targetPct: p, actual, score, notes };
  };

  const list: MethodView[] = [];
  list.push(make("503020", "50/30/20", "Jumătate pentru nevoi, 30% pentru dorințe, 20% economisești.", { needs: 50, wants: 30, savings: 20 }));

  const custom = {
    needs: num(settings.custom_needs, 50),
    wants: num(settings.custom_wants, 25),
    savings: num(settings.custom_savings, 25),
  };
  list.push(make("custom", "Procentele tale", "Împărțirea pe care ai setat-o în Setări.", custom));

  if (income > 0) {
    const n = (actual.needs / income) * 100;
    const w = (actual.wants / income) * 100;
    const s = Math.max(0, 100 - n - w);
    const notes = [
      t.unallocated > 0
        ? `Mai ai ${lei(t.unallocated)} nealocați. Dă-le un rost: fond de urgență, obiectiv sau rambursare.`
        : t.unallocated < 0
          ? `Ai alocat cu ${lei(-t.unallocated)} mai mult decât ai câștigat.`
          : "Fiecare leu are o destinație.",
    ];
    const m = make("zero", "Zero-based", "Fiecare leu primește o destinație; ce nu cheltui ajunge la economii.", {
      needs: n, wants: w, savings: s,
    }, notes);
    // Aici scorul reflectă cât din venit e nealocat
    m.score = Math.round(Math.max(0, 100 - (Math.abs(t.unallocated) / income) * 200));
    list.push(m);
  }

  // Recomandarea adaptată situației
  const notes: string[] = [];
  let savings = 20;
  const fundOk = emergency.target > 0 && emergency.saved >= emergency.target;
  if (!fundOk) {
    savings = 25;
    notes.push("Fondul de urgență nu e complet, așa că economiile au prioritate.");
  }
  const maxLoanRate = Math.max(0, ...loans.filter((l) => l.status.balance > 0).map((l) => Math.max(l.status.currentRate, l.variableRate)));
  if (fundOk && maxLoanRate >= 6) {
    savings = 25;
    notes.push(`Dobânda de ${pct(maxLoanRate)} face rambursarea anticipată atractivă; include-o în economii.`);
  }
  let needs = income > 0 ? roundTo5(Math.max(50, Math.min(65, (t.needs / income) * 100 + 2.5))) : 50;
  if (needs > 55) notes.push("Nevoile tale sunt peste 55% din venit; ținta de dorințe e redusă ca să rămână loc de economii.");
  let wants = 100 - needs - savings;
  if (wants < 10) {
    wants = 10;
    savings = 100 - needs - wants;
  }
  if (t.dti > 40) notes.push(`Ratele reprezintă ${pct(t.dti)} din venit, peste pragul de 40% folosit de BNR.`);
  list.push(make("smart", "Recomandat pentru tine", "Calculat din situația ta: fond de urgență, credite și nivelul cheltuielilor.", {
    needs, wants, savings,
  }, notes));

  return list;
}

function buildSuggestions(ctx: {
  month: string;
  totals: MonthTotals;
  prev: MonthTotals | null;
  categories: CategoryView[];
  emergency: Summary["emergency"];
  goals: GoalView[];
  loanViews: LoanView[];
  investments: InvestmentView[];
  prepay: Summary["prepay"];
  prior: MonthTotals[];
  settings?: Record<string, string>;
}): Suggestion[] {
  const { totals: t, prev, categories, emergency, goals, loanViews, investments, prepay, settings } = ctx;
  const enableInvestments = settings?.enable_investments === "1";
  const out: Suggestion[] = [];

  if (t.income <= 0) {
    out.push({
      level: "idee",
      title: `Adaugă veniturile din ${monthLabel(ctx.month)}`,
      text: "Fără venituri, analiza nu poate calcula procentele. Începe cu salariul, apoi cheltuielile.",
    });
    return out;
  }

  if (t.unallocated < -1) {
    out.push({
      level: "critic",
      title: "Ai cheltuit mai mult decât ai câștigat",
      text: `Diferența este de ${lei(-t.unallocated)}. Verifică dorințele (${lei(t.wants)}) și categoriile care au crescut față de media ta.`,
    });
  } else if (t.unallocated > 50) {
    const fundGap = Math.max(0, emergency.target - emergency.saved);
    const where =
      fundGap > 0
        ? `în fondul de urgență (mai lipsesc ${lei(fundGap)})`
        : prepay?.verdict === "prepay"
          ? `ca rambursare anticipată la ${prepay.loanName}`
          : enableInvestments
            ? "într-un obiectiv sau în investiții"
            : "într-un obiectiv de economii";
    out.push({
      level: "idee",
      title: `${lei(t.unallocated)} fără destinație`,
      text: `Dacă îi lași în cont, se pierd de obicei în cheltuieli mărunte. Îi poți muta ${where}.`,
    });
  }

  if (t.savingsRate < 10) {
    out.push({
      level: "critic",
      title: `Rata de economisire este ${pct(t.savingsRate)}`,
      text: "Sub 10% rămâi vulnerabil la neprevăzute. Un prim pas: un transfer automat în ziua salariului, chiar și 5% din venit.",
    });
  } else if (t.savingsRate < 20) {
    out.push({
      level: "atentie",
      title: `Rata de economisire este ${pct(t.savingsRate)}`,
      text: "E un început bun. 20% sau mai mult îți permite să construiești fondul de urgență și să plătești anticipat în același timp.",
    });
  } else {
    out.push({
      level: "bine",
      title: `Economisești ${pct(t.savingsRate)} din venit`,
      text: "Peste pragul de 20%. Păstrează ritmul și verifică dacă banii economisiți lucrează pentru tine.",
    });
  }

  if (t.dti > 40) {
    out.push({
      level: "critic",
      title: `Ratele consumă ${pct(t.dti)} din venit`,
      text: "Peste 40%, orice creștere a IRCC-ului sau a cheltuielilor te pune sub presiune. Evită credite noi și prioritizează reducerea ratei.",
    });
  } else if (t.dti > 30) {
    out.push({
      level: "atentie",
      title: `Ratele reprezintă ${pct(t.dti)} din venit`,
      text: "E încă sub pragul BNR de 40%, dar lasă puțin spațiu. Un fond de urgență complet devine mai important.",
    });
  }

  if (!emergency.hasGoal) {
    out.push({
      level: "idee",
      title: "Creează fondul de urgență",
      text: `Pentru cheltuielile tale esențiale, ${emergency.months} luni înseamnă aproximativ ${lei(emergency.target)}. Îl poți adăuga din pagina Economii.`,
    });
  } else if (emergency.monthsCovered < 3) {
    out.push({
      level: "critic",
      title: `Fondul de urgență acoperă ${emergency.monthsCovered.toLocaleString("ro-RO", { maximumFractionDigits: 1 })} luni`,
      text: "Până la 3 luni, fondul de urgență ar trebui să primească prioritate înaintea plăților anticipate și investițiilor.",
    });
  } else if (emergency.saved < emergency.target) {
    out.push({
      level: "atentie",
      title: `Fondul de urgență acoperă ${emergency.monthsCovered.toLocaleString("ro-RO", { maximumFractionDigits: 1 })} luni din ${emergency.months}`,
      text: `Mai ai ${lei(emergency.target - emergency.saved)} până la țintă. Poți împărți surplusul între fond și rambursare.`,
    });
  }

  for (const l of loanViews.filter((x) => x.status.balance > 0)) {
    const s = l.status;
    if (s.inFixed && s.monthsToVariable <= 18) {
      const up = l.variableRate > s.currentRate;
      out.push({
        level: up ? "atentie" : "idee",
        title: `${l.loan.name}: dobânda devine variabilă peste ${s.monthsToVariable} luni`,
        text: up
          ? `De la ${pct(s.currentRate)} la aproximativ ${pct(l.variableRate)} (marjă + IRCC actual). Plățile anticipate făcute acum reduc impactul creșterii.`
          : `Cu IRCC-ul actual, dobânda ar scădea la ${pct(l.variableRate)}. Dacă ai comision în perioada fixă (${pct(l.loan.fee_fixed_pct)}), poți amâna sumele mari.`,
      });
    }
    if (s.inFixed && l.loan.fee_fixed_pct > 0) {
      out.push({
        level: "idee",
        title: `Comision de ${pct(l.loan.fee_fixed_pct)} la ${l.loan.name}`,
        text: `Se aplică pentru plățile anticipate din perioada fixă. La 10.000 lei înseamnă ${lei(l.loan.fee_fixed_pct * 100)}. Compară-l cu dobânda economisită în pagina creditului.`,
      });
    }
    if (l.interestSaved > 0) {
      out.push({
        level: "bine",
        title: `Ai economisit ${lei(l.interestSaved)} din dobânda la ${l.loan.name}`,
        text: `Plățile anticipate de ${lei(l.prepaidTotal)} au scurtat creditul cu ${l.monthsSaved} luni.`,
      });
    }
  }

  if (prepay && enableInvestments) {
    const texts = {
      prepay: `Dobânda de ${pct(Math.max(prepay.rateNow, prepay.inFixed ? prepay.rateVariable : 0))} depășește randamentul net estimat al investițiilor (${pct(prepay.netReturn)}). Rambursarea este un câștig garantat.`,
      invest: `Randamentul net estimat (${pct(prepay.netReturn)}) depășește dobânda creditului. Investițiile pe termen lung pot aduce mai mult, dar cu risc.`,
      balanced: `Dobânda și randamentul net estimat (${pct(prepay.netReturn)}) sunt apropiate. O împărțire 50/50 între rambursare și investiții echilibrează riscul.`,
    };
    out.push({
      level: "idee",
      title:
        prepay.verdict === "prepay" ? "Rambursarea anticipată câștigă acum" : prepay.verdict === "invest" ? "Investițiile pot câștiga pe termen lung" : "Rambursare și investiții, în echilibru",
      text: texts[prepay.verdict],
    });
  }

  for (const c of categories.filter((c) => c.kind === "variable")) {
    if (c.avg3 > 0 && c.amount > c.avg3 * 1.3 && c.amount - c.avg3 > 150) {
      out.push({
        level: "atentie",
        title: `${c.name}: ${lei(c.amount)} luna aceasta`,
        text: `Cu ${pct(((c.amount - c.avg3) / c.avg3) * 100, 0)} peste media ultimelor luni (${lei(c.avg3)}).`,
      });
    }
  }

  const wantsPct = (t.wants / t.income) * 100;
  if (wantsPct > 30) {
    out.push({
      level: "atentie",
      title: `Dorințele ocupă ${pct(wantsPct)} din venit`,
      text: `Peste 30%. Reducerea la 30% ar elibera ${lei(t.wants - t.income * 0.3)} pe lună.`,
    });
  }

  if (prev && prev.spent > 0) {
    const change = ((t.spent - prev.spent) / prev.spent) * 100;
    if (change < -5) {
      out.push({ level: "bine", title: `Cheltuieli cu ${pct(-change, 0)} mai mici decât luna trecută`, text: `Ai cheltuit ${lei(prev.spent - t.spent)} mai puțin.` });
    }
  }

  for (const g of goals.filter((g) => g.type === "goal" && g.deadline && g.saved < g.target)) {
    if (g.monthlyNeeded > g.avgMonthly * 1.1) {
      out.push({
        level: "atentie",
        title: `${g.name}: ai nevoie de ${lei(g.monthlyNeeded)} pe lună`,
        text: `Media ta recentă este ${lei(g.avgMonthly)}. Crește contribuția sau mută termenul.`,
      });
    }
  }

  const fundDone = emergency.hasGoal && emergency.saved >= emergency.target;
  if (fundDone && enableInvestments && investments.length === 0 && prepay?.verdict !== "prepay") {
    out.push({
      level: "idee",
      title: "Fondul e complet: poți începe să investești",
      text: "Adaugă o investiție în pagina Economii ca să urmărești contribuțiile și valoarea în timp.",
    });
  }

  const order = { critic: 0, atentie: 1, idee: 2, bine: 3 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
