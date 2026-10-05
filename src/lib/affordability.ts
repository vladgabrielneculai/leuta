import { lei } from "./util";
export type FinancingType = "cash" | "loan";

export type PurchasePlan = {
  id?: number;
  name: string;
  category: string;
  total_price: number;
  financing_type: FinancingType;
  down_payment: number;
  loan_term_months: number;
  loan_interest_rate: number;
  target_date?: string | null;
  priority: "ridicata" | "medie" | "scazuta";
  notes?: string;
  created_at?: string;
};

export type FinancialProfile = {
  income: number;
  needs: number;
  wants: number;
  currentLoanPayments: number;
  unallocated: number;
  totalSavings: number;
  emergencySaved: number;
  monthlySavings: number;
};

export type AffordabilityVerdict = "safe" | "caution" | "danger";

export type CashAnalysis = {
  totalPrice: number;
  savingsBefore: number;
  savingsAfter: number;
  savingsPctConsumed: number;
  emergencyMonthsBefore: number;
  emergencyMonthsAfter: number;
  monthsToRecover: number;
  verdict: AffordabilityVerdict;
  score: number; // 0 - 100
  title: string;
  reasons: string[];
  advice: string;
};

export type LoanAnalysis = {
  totalPrice: number;
  downPayment: number;
  borrowedAmount: number;
  termMonths: number;
  annualRate: number;
  monthlyPayment: number;
  totalInterest: number;
  totalCost: number;
  extraCostVsCash: number;
  dtiBefore: number;
  dtiAfter: number;
  dtiIncrease: number;
  freeCashflowBefore: number;
  freeCashflowAfter: number;
  needsPctBefore: number;
  needsPctAfter: number;
  savingsCapacityAfter: number;
  verdict: AffordabilityVerdict;
  score: number; // 0 - 100
  title: string;
  reasons: string[];
  advice: string;
};

export type AffordabilityResult = {
  financingType: FinancingType;
  overallVerdict: AffordabilityVerdict;
  overallScore: number;
  cash: CashAnalysis;
  loan: LoanAnalysis;
};

/** Formula PMT standard pentru rate anuități lunare */
export function calculatePmt(annualRate: number, termMonths: number, principal: number): number {
  if (termMonths <= 0 || principal <= 0) return 0;
  if (annualRate <= 0) return principal / termMonths;
  const r = annualRate / 100 / 12;
  const payment = (principal * r) / (1 - Math.pow(1 + r, -termMonths));
  return isNaN(payment) || !isFinite(payment) ? principal / termMonths : payment;
}

export function evaluateAffordability(
  plan: {
    total_price: number;
    financing_type: FinancingType;
    down_payment?: number;
    loan_term_months?: number;
    loan_interest_rate?: number;
  },
  profile: FinancialProfile
): AffordabilityResult {
  const price = Math.max(0, plan.total_price || 0);
  const income = Math.max(0, profile.income || 0);
  const needs = Math.max(0, profile.needs || 0);
  const currentLoans = Math.max(0, profile.currentLoanPayments || 0);
  const totalSavings = Math.max(0, profile.totalSavings || 0);
  const emergencySaved = Math.max(0, profile.emergencySaved || 0);
  const monthlySavings = Math.max(0, profile.monthlySavings || profile.unallocated || 0);

  // Cheltuieli lunare esențiale (nevoi de trai + rate deja existente)
  const essentialMonthlyExpenses = Math.max(500, needs + currentLoans);

  // ==========================================
  // 1. ANALIZĂ PLATĂ INTEGRALĂ (CASH)
  // ==========================================
  const savingsAfter = Math.max(0, totalSavings - price);
  const savingsPctConsumed = totalSavings > 0 ? Math.min(100, (price / totalSavings) * 100) : 100;
  const emergencyMonthsBefore = totalSavings / essentialMonthlyExpenses;
  const emergencyMonthsAfter = savingsAfter / essentialMonthlyExpenses;
  const monthsToRecover = monthlySavings > 0 ? Math.ceil(price / monthlySavings) : 999;

  let cashVerdict: AffordabilityVerdict = "safe";
  let cashScore = 95;
  const cashReasons: string[] = [];

  if (price > totalSavings) {
    cashVerdict = "danger";
    cashScore = 20;
    cashReasons.push(
      `Suma necesară (${lei(price)}) depășește economiile tale totale disponibile (${lei(totalSavings)}).`
    );
  } else if (emergencyMonthsAfter < 1.5) {
    cashVerdict = "danger";
    cashScore = 35;
    cashReasons.push(
      `Achiziția ți-ar reduce rezervele la doar ${emergencyMonthsAfter.toFixed(1)} luni de cheltuieli esențiale, expunându-te grav în caz de urgență.`
    );
  } else if (emergencyMonthsAfter < 3) {
    cashVerdict = "caution";
    cashScore = 65;
    cashReasons.push(
      `Îți permiți plata, dar rezerva rămasă (${emergencyMonthsAfter.toFixed(1)} luni) este sub pragul de siguranță recomandat de 3-6 luni.`
    );
  } else {
    cashVerdict = "safe";
    cashScore = 95;
    cashReasons.push(
      `Ai suficiente economii! După achiziție îți rămân ${lei(savingsAfter)}, acoperind confortabil ${emergencyMonthsAfter.toFixed(1)} luni de cheltuieli.`
    );
  }

  if (monthsToRecover <= 6 && cashVerdict === "safe") {
    cashReasons.push(`Refaci suma cheltuită rapid, în aproximativ ${monthsToRecover} luni de economisire.`);
  } else if (monthsToRecover > 24 && price <= totalSavings) {
    cashReasons.push(`La ritmul actual de economisire, vei reface suma cheltuită în aproximativ ${Math.round(monthsToRecover / 12)} ani.`);
  }

  let cashAdvice = "";
  if (cashVerdict === "safe") {
    cashAdvice = "Achiziția cu plata integrală este recomandată! Nu acumulezi datorii și îți păstrezi plasa de siguranță financiară neatinsă.";
  } else if (cashVerdict === "caution") {
    cashAdvice = "Dacă achiziția nu este urgentă, mai economisește 2-4 luni pentru a nu coborî fondul de urgență sub pragul de siguranță de 3 luni.";
  } else {
    cashAdvice = "Nu este recomandată plata integrală în acest moment. Riști să rămâi fără lichidități în fața oricărui eveniment neprevăzut.";
  }

  const cashTitle =
    cashVerdict === "safe"
      ? "✅ Îți permiți plata integrală fără riscuri"
      : cashVerdict === "caution"
      ? "⚠️ La limită: atenție la fondul de rezervă"
      : "❌ Nu îți permiți plata integrală acum";

  const cashAnalysis: CashAnalysis = {
    totalPrice: price,
    savingsBefore: totalSavings,
    savingsAfter,
    savingsPctConsumed,
    emergencyMonthsBefore,
    emergencyMonthsAfter,
    monthsToRecover,
    verdict: cashVerdict,
    score: cashScore,
    title: cashTitle,
    reasons: cashReasons,
    advice: cashAdvice,
  };

  // ==========================================
  // 2. ANALIZĂ ACHIZIȚIE PRIN CREDIT
  // ==========================================
  const downPayment = Math.min(price, Math.max(0, plan.down_payment || 0));
  const borrowedAmount = Math.max(0, price - downPayment);
  const termMonths = Math.max(1, plan.loan_term_months || 36);
  const annualRate = Math.max(0, plan.loan_interest_rate || 7.5);

  const monthlyPayment = calculatePmt(annualRate, termMonths, borrowedAmount);
  const totalCost = downPayment + monthlyPayment * termMonths;
  const totalInterest = Math.max(0, totalCost - price);
  const extraCostVsCash = totalInterest;

  const dtiBefore = income > 0 ? (currentLoans / income) * 100 : 0;
  const newTotalLoans = currentLoans + monthlyPayment;
  const dtiAfter = income > 0 ? (newTotalLoans / income) * 100 : 100;
  const dtiIncrease = dtiAfter - dtiBefore;

  const freeCashflowBefore = income - (needs + currentLoans + profile.wants);
  const freeCashflowAfter = freeCashflowBefore - monthlyPayment;

  const needsPctBefore = income > 0 ? ((needs + currentLoans) / income) * 100 : 0;
  const needsPctAfter = income > 0 ? ((needs + newTotalLoans) / income) * 100 : 0;
  const savingsCapacityAfter = Math.max(0, monthlySavings - monthlyPayment);

  let loanVerdict: AffordabilityVerdict = "safe";
  let loanScore = 90;
  const loanReasons: string[] = [];

  if (downPayment > totalSavings) {
    loanVerdict = "danger";
    loanScore = 15;
    loanReasons.push(`Avansul solicitat (${lei(downPayment)}) depășește economiile tale totale.`);
  } else if (dtiAfter > 40) {
    loanVerdict = "danger";
    loanScore = 25;
    loanReasons.push(
      `Gradul de îndatorare ajunge la ${dtiAfter.toFixed(1)}%, depășind plafonul maxim legal impus de BNR (40% pentru credite în lei).`
    );
  } else if (freeCashflowAfter < 0) {
    loanVerdict = "danger";
    loanScore = 30;
    loanReasons.push(
      `Rata lunară de ${lei(monthlyPayment)} îți depășește banii liberi lunari, împingând bugetul în deficit cu ${lei(Math.abs(freeCashflowAfter))}/lună.`
    );
  } else if (dtiAfter > 25) {
    loanVerdict = "caution";
    loanScore = 60;
    loanReasons.push(
      `Gradul de îndatorare de ${dtiAfter.toFixed(1)}% este în limitele băncii, dar peste nivelul recomandat de sănătate financiară (20-25%).`
    );
    if (freeCashflowAfter < 300) {
      loanReasons.push(`Banii liberi rămași lunar scad la doar ${lei(freeCashflowAfter)}.`);
    }
  } else {
    loanVerdict = "safe";
    loanScore = 90;
    loanReasons.push(
      `Rata lunară estimată este de ${lei(monthlyPayment)}/lună, menținând gradul de îndatorare la un nivel excelent (${dtiAfter.toFixed(1)}%).`
    );
    loanReasons.push(`Îți mai rămân aproximativ ${lei(freeCashflowAfter)} liberi în fiecare lună.`);
  }

  if (totalInterest > 0) {
    loanReasons.push(
      `Creditul te va costa în total cu ${lei(totalInterest)} mai mult decât plata pe loc (dobânzi bancare).`
    );
  }

  let loanAdvice = "";
  if (loanVerdict === "safe") {
    loanAdvice = `Creditul este confortabil și sustenabil pentru venitul tău. Dacă nu vrei să-ți imobilizezi economiile, poți opta pentru această variantă.`;
  } else if (loanVerdict === "caution") {
    loanAdvice = `Îți permiți creditul, dar îți va limita considerabil flexibilitatea lunară. Ia în calcul mărirea avansului sau extinderea duratei pentru o rată mai mică.`;
  } else {
    loanAdvice = `Acest credit este periculos pentru bugetul tău. Îți recomandăm să reduci suma împrumutată sau să amâni achiziția până crește venitul ori economiile.`;
  }

  const loanTitle =
    loanVerdict === "safe"
      ? "✅ Credit sustenabil și aprobat fără riscuri"
      : loanVerdict === "caution"
      ? "⚠️ Credit la limită: reduce flexibilitatea lunară"
      : "❌ Risc ridicat: credit nesustenabil";

  const loanAnalysis: LoanAnalysis = {
    totalPrice: price,
    downPayment,
    borrowedAmount,
    termMonths,
    annualRate,
    monthlyPayment,
    totalInterest,
    totalCost,
    extraCostVsCash,
    dtiBefore,
    dtiAfter,
    dtiIncrease,
    freeCashflowBefore,
    freeCashflowAfter,
    needsPctBefore,
    needsPctAfter,
    savingsCapacityAfter,
    verdict: loanVerdict,
    score: loanScore,
    title: loanTitle,
    reasons: loanReasons,
    advice: loanAdvice,
  };

  const isLoanSelected = plan.financing_type === "loan";
  const overallVerdict = isLoanSelected ? loanVerdict : cashVerdict;
  const overallScore = isLoanSelected ? loanScore : cashScore;

  return {
    financingType: plan.financing_type,
    overallVerdict,
    overallScore,
    cash: cashAnalysis,
    loan: loanAnalysis,
  };
}

