// Financial Modeling Engine — 100% deterministic.
// NPV/IRR, EBITDA bridge, working capital, portfolio S-curve, NPV sensitivity.
// All CTA percentages and ramp curves from static lookup tables.

import { runMonteCarlo } from "./monte-carlo";
import type { MonteCarloResult } from "./monte-carlo";

// ---- Interfaces ----

export interface MonthCashflow {
  month: number;
  date: string;
  savings: number;
  savings_low: number;
  savings_high: number;
  costs: number;
  net: number;
  cumulative: number;
  cumulative_low: number;
  cumulative_high: number;
}

export interface InitiativeFinancials {
  initiative_id: number;
  initiative_name: string;
  lever_type: string;
  category_name: string;
  status: string;

  target_annual_savings: number;
  realized_to_date: number;

  cta_consulting: number;
  cta_technology: number;
  cta_transition: number;
  cta_training: number;
  cta_total: number;
  cta_pct_of_savings: number;

  discount_rate: number;
  annual_inflation_rate: number;
  year1_savings: number;
  year2_savings: number;
  year3_savings: number;
  npv: number;
  irr: number;
  payback_months: number;
  payback_months_exact: number;

  monthly_cashflow: MonthCashflow[];
}

export interface NpvSensitivityPoint {
  discount_rate: number;
  npv: number;
}

export interface EbitdaBridge {
  total_addressable_spend: number;
  savings_identified: number;
  savings_committed: number;
  savings_realized: number;
  savings_run_rate: number;

  identified_to_committed_rate: number;
  committed_to_realized_rate: number;

  ebitda_impact_realized: number;
  ebitda_impact_projected_yr1: number;
  ebitda_impact_projected_yr2: number;
  ebitda_impact_projected_yr3: number;

  total_cta: number;
  net_ebitda_yr1: number;
  net_ebitda_yr2: number;
  net_ebitda_yr3: number;

  bridge_steps: { name: string; value: number; type: "positive" | "negative" | "total" }[];
}

export interface WorkingCapitalImpact {
  current_avg_dpo: number;
  target_avg_dpo: number;
  dpo_improvement_days: number;

  annual_spend: number;
  daily_spend: number;

  wc_release: number;

  inventory_reduction_pct: number;
  estimated_inventory_value: number;
  inventory_release: number;

  total_wc_release: number;

  // v2: per-initiative WC contribution
  per_initiative_wc: { initiative_id: number; initiative_name: string; lever_type: string; wc_impact: number; delta_days: number; annual_spend: number }[];

  // v2: WC as % of EBITDA and cash conversion context
  wc_as_pct_of_spend: number;

  bridge_steps: { name: string; value: number; type: "positive" | "negative" | "total" }[];
}

// v2: 3×3 Sensitivity Grid
export interface SensitivityGrid {
  initiative_id: number;
  initiative_name: string;
  lever_type: string;
  // Row labels: savings_rate low/mid/high
  savings_rates: { label: string; value: number }[];
  // Column labels: CTA multiplier low/mid/high
  cta_multipliers: { label: string; value: number }[];
  // 3×3 NPV matrix [savings_rate_idx][cta_idx]
  npv_matrix: number[][];
  // Additional context
  base_npv: number;
  discount_rate: number;
}

// v2: Portfolio Monte Carlo integration
export interface PortfolioMonteCarloResult {
  monte_carlo: MonteCarloResult;
  // Monthly cumulative savings with confidence bands for charting
  monthly_savings: {
    month: number;
    date: string;
    cumulative_p10: number;
    cumulative_p50: number;
    cumulative_p90: number;
  }[];
}

export interface PortfolioScurvePoint {
  month: number;
  date: string;
  gross_savings: number;
  costs: number;
  net: number;
  cumulative: number;
  by_status: Record<string, number>;
}

// ---- CTA Lookup Table ----
// Percentages are of Year 1 savings target

interface CtaProfile {
  consulting: number;
  technology: number;
  transition: number;
  training: number;
}

const CTA_TABLE: Record<string, CtaProfile> = {
  volume_consolidation:       { consulting: 0.05, technology: 0.02, transition: 0.08, training: 0.01 },
  renegotiation:              { consulting: 0.08, technology: 0.00, transition: 0.03, training: 0.00 },
  contract_term_optimization: { consulting: 0.03, technology: 0.05, transition: 0.02, training: 0.01 },
  demand_reduction:           { consulting: 0.05, technology: 0.10, transition: 0.03, training: 0.05 },
  process_efficiency:         { consulting: 0.08, technology: 0.15, transition: 0.05, training: 0.03 },
  process_improvement:        { consulting: 0.08, technology: 0.15, transition: 0.05, training: 0.03 },
  spec_change:                { consulting: 0.10, technology: 0.05, transition: 0.08, training: 0.03 },
  specification_change:       { consulting: 0.10, technology: 0.05, transition: 0.08, training: 0.03 },
  make_vs_buy:                { consulting: 0.05, technology: 0.20, transition: 0.15, training: 0.05 },
  insource_outsource:         { consulting: 0.05, technology: 0.10, transition: 0.12, training: 0.05 },
  spend_under_management:     { consulting: 0.03, technology: 0.08, transition: 0.02, training: 0.02 },
  payment_term_optimization:  { consulting: 0.02, technology: 0.03, transition: 0.01, training: 0.00 },
  payment_terms:              { consulting: 0.02, technology: 0.03, transition: 0.01, training: 0.00 },
  global_sourcing:            { consulting: 0.08, technology: 0.05, transition: 0.10, training: 0.03 },
  competitive_bidding:        { consulting: 0.06, technology: 0.02, transition: 0.03, training: 0.00 },
};

const DEFAULT_CTA: CtaProfile = { consulting: 0.05, technology: 0.05, transition: 0.05, training: 0.02 };

// ---- Savings Ramp Table ----
// Phase milestones as % of annual target at end of period
// [month3, month6, month12, year2(month24), year3(month36)]

const RAMP_TABLE: Record<string, number[]> = {
  renegotiation:              [0.10, 0.30, 0.70, 0.90, 1.00],
  volume_consolidation:       [0.05, 0.15, 0.50, 0.80, 1.00],
  contract_term_optimization: [0.15, 0.40, 0.75, 0.95, 1.00],
  demand_reduction:           [0.10, 0.25, 0.55, 0.80, 1.00],
  process_efficiency:         [0.05, 0.10, 0.40, 0.70, 0.95],
  process_improvement:        [0.05, 0.10, 0.40, 0.70, 0.95],
  spec_change:                [0.00, 0.05, 0.25, 0.60, 0.90],
  specification_change:       [0.00, 0.05, 0.25, 0.60, 0.90],
  make_vs_buy:                [0.00, 0.00, 0.15, 0.50, 0.85],
  insource_outsource:         [0.00, 0.00, 0.15, 0.50, 0.85],
  payment_term_optimization:  [0.20, 0.60, 0.90, 1.00, 1.00],
  payment_terms:              [0.20, 0.60, 0.90, 1.00, 1.00],
  spend_under_management:     [0.10, 0.30, 0.65, 0.85, 1.00],
  global_sourcing:            [0.00, 0.05, 0.30, 0.65, 0.90],
  competitive_bidding:        [0.10, 0.35, 0.70, 0.90, 1.00],
};

const DEFAULT_RAMP = [0.05, 0.20, 0.50, 0.80, 1.00];

// ---- Direct-material keywords for working capital ----
const DIRECT_MATERIAL_KEYWORDS = ["raw material", "metal", "chemical", "plastic", "resin", "packaging",
  "steel", "lumber", "paper", "fuel", "component", "assembly"];

// ---- Confidence band multipliers ----
// Represents implementation uncertainty: -20% / +20% around base savings
const CONFIDENCE_LOW_MULT = 0.80;
const CONFIDENCE_HIGH_MULT = 1.20;

// ---- Helpers ----

function getRampForMonth(leverType: string, month: number): number {
  // month: 1-36
  const phases = RAMP_TABLE[leverType] || DEFAULT_RAMP;
  // Milestones at months: 3, 6, 12, 24, 36
  const milestones = [
    { m: 0, v: 0 },
    { m: 3, v: phases[0] },
    { m: 6, v: phases[1] },
    { m: 12, v: phases[2] },
    { m: 24, v: phases[3] },
    { m: 36, v: phases[4] },
  ];

  // Find surrounding milestones and interpolate
  for (let i = 1; i < milestones.length; i++) {
    if (month <= milestones[i].m) {
      const prev = milestones[i - 1];
      const curr = milestones[i];
      const t = (month - prev.m) / (curr.m - prev.m);
      return prev.v + t * (curr.v - prev.v);
    }
  }
  return phases[4]; // beyond 36 months
}

function getMonthlyRampSavings(leverType: string, annualTarget: number, month: number): number {
  // Savings for this specific month = cumulative at month - cumulative at month-1
  const cumCurr = getRampForMonth(leverType, month) * annualTarget;
  const cumPrev = month > 1 ? getRampForMonth(leverType, month - 1) * annualTarget : 0;
  return cumCurr - cumPrev;
}

// Inflation erosion factor for a given month
// Year 1 (months 1-12): no erosion (baseline)
// Year 2 (months 13-24): savings × (1 - inflation)
// Year 3 (months 25-36): savings × (1 - inflation)^2
function getInflationFactor(month: number, annualInflationRate: number): number {
  if (month <= 12) return 1.0;
  if (month <= 24) return 1.0 - annualInflationRate;
  return Math.pow(1.0 - annualInflationRate, 2);
}

function makeDate(monthOffset: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ---- NPV ----
function computeNpv(cashflows: number[], annualRate: number): number {
  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
  let npv = 0;
  for (let t = 0; t < cashflows.length; t++) {
    npv += cashflows[t] / Math.pow(1 + monthlyRate, t + 1);
  }
  return Math.round(npv);
}

// ---- IRR via bisection ----
function computeIrr(cashflows: number[]): number {
  // cashflows[0] is usually negative (CTA cost upfront)
  let lo = -0.5;
  let hi = 2.0;

  for (let iter = 0; iter < 60; iter++) {
    const mid = (lo + hi) / 2;
    const monthlyRate = Math.pow(1 + mid, 1 / 12) - 1;
    let npv = 0;
    for (let t = 0; t < cashflows.length; t++) {
      npv += cashflows[t] / Math.pow(1 + monthlyRate, t + 1);
    }
    if (npv > 0) lo = mid;
    else hi = mid;
    if (Math.abs(hi - lo) < 0.0001) break;
  }
  return Math.round(((lo + hi) / 2) * 1000) / 10; // return as percentage, 1 decimal
}

// ---- 1. Initiative Financials ----

export function computeInitiativeFinancials(
  initiative: any,
  categoryName: string,
  discountRate: number = 0.10,
  annualInflationRate: number = 0.03,
): InitiativeFinancials {
  const leverType = (initiative.lever_type || "renegotiation").toLowerCase();
  const target = Number(initiative.target_amount) || 0;
  const realized = Number(initiative.realized_amount) || 0;

  // CTA
  const ctaProfile = CTA_TABLE[leverType] || DEFAULT_CTA;
  const ctaConsulting = Math.round(target * ctaProfile.consulting);
  const ctaTech = Math.round(target * ctaProfile.technology);
  const ctaTransition = Math.round(target * ctaProfile.transition);
  const ctaTraining = Math.round(target * ctaProfile.training);
  const ctaTotal = ctaConsulting + ctaTech + ctaTransition + ctaTraining;
  const threeYearSavings = target * (getRampForMonth(leverType, 12) + getRampForMonth(leverType, 24) + getRampForMonth(leverType, 36));
  const ctaPct = threeYearSavings > 0 ? Math.round((ctaTotal / threeYearSavings) * 1000) / 10 : 0;

  // Monthly cashflow (36 months)
  // CTA is distributed: 60% month 1, 20% month 2, 10% month 3, 5% month 4, 5% month 5
  const ctaDistribution = [0.60, 0.20, 0.10, 0.05, 0.05];
  const monthlyCashflow: MonthCashflow[] = [];
  let cumulative = 0;
  let cumulativeLow = 0;
  let cumulativeHigh = 0;

  const netFlows: number[] = [];

  for (let m = 1; m <= 36; m++) {
    const baseSavings = getMonthlyRampSavings(leverType, target, m);
    // Apply inflation erosion
    const inflationFactor = getInflationFactor(m, annualInflationRate);
    const savings = baseSavings * inflationFactor;
    const savingsLow = savings * CONFIDENCE_LOW_MULT;
    const savingsHigh = savings * CONFIDENCE_HIGH_MULT;

    const costs = m <= ctaDistribution.length ? ctaTotal * ctaDistribution[m - 1] : 0;
    const net = savings - costs;
    cumulative += net;
    cumulativeLow += savingsLow - costs;
    cumulativeHigh += savingsHigh - costs;
    netFlows.push(net);

    monthlyCashflow.push({
      month: m,
      date: makeDate(m - 1),
      savings: Math.round(savings),
      savings_low: Math.round(savingsLow),
      savings_high: Math.round(savingsHigh),
      costs: Math.round(costs),
      net: Math.round(net),
      cumulative: Math.round(cumulative),
      cumulative_low: Math.round(cumulativeLow),
      cumulative_high: Math.round(cumulativeHigh),
    });
  }

  // Year savings totals
  const yr1 = monthlyCashflow.slice(0, 12).reduce((s, c) => s + c.savings, 0);
  const yr2 = monthlyCashflow.slice(12, 24).reduce((s, c) => s + c.savings, 0);
  const yr3 = monthlyCashflow.slice(24, 36).reduce((s, c) => s + c.savings, 0);

  // NPV
  const npv = computeNpv(netFlows, discountRate);

  // IRR: prepend negative CTA as month-0 flow
  const irrFlows = [-ctaTotal, ...netFlows];
  const irr = ctaTotal > 0 && target > 0 ? computeIrr(irrFlows) : 0;

  // Payback (integer months)
  let paybackMonths = 36;
  for (let i = 0; i < monthlyCashflow.length; i++) {
    if (monthlyCashflow[i].cumulative > 0) {
      paybackMonths = i + 1;
      break;
    }
  }

  // Exact payback: interpolate between the last negative and first positive cumulative
  let paybackMonthsExact = paybackMonths;
  if (paybackMonths > 1 && paybackMonths <= 36) {
    const prevCum = monthlyCashflow[paybackMonths - 2].cumulative; // last negative (or less positive)
    const currCum = monthlyCashflow[paybackMonths - 1].cumulative; // first positive
    if (currCum !== prevCum) {
      // Linear interpolation: at what fraction of the month does cumulative cross zero?
      const fraction = Math.abs(prevCum) / (Math.abs(prevCum) + currCum);
      paybackMonthsExact = Math.round(((paybackMonths - 1) + fraction) * 10) / 10;
    }
  } else if (paybackMonths === 1 && monthlyCashflow[0].cumulative > 0) {
    // Immediate payback
    paybackMonthsExact = 0.5;
  }

  return {
    initiative_id: initiative.id,
    initiative_name: initiative.name,
    lever_type: leverType,
    category_name: categoryName,
    status: initiative.status || "identified",
    target_annual_savings: target,
    realized_to_date: realized,
    cta_consulting: ctaConsulting,
    cta_technology: ctaTech,
    cta_transition: ctaTransition,
    cta_training: ctaTraining,
    cta_total: ctaTotal,
    cta_pct_of_savings: ctaPct,
    discount_rate: discountRate,
    annual_inflation_rate: annualInflationRate,
    year1_savings: Math.round(yr1),
    year2_savings: Math.round(yr2),
    year3_savings: Math.round(yr3),
    npv,
    irr,
    payback_months: paybackMonths,
    payback_months_exact: paybackMonthsExact,
    monthly_cashflow: monthlyCashflow,
  };
}

// ---- 1b. NPV Sensitivity ----

export function computeNpvSensitivity(
  initiative: any,
  categoryName: string,
  rates: number[] = [0.05, 0.08, 0.10, 0.12, 0.15],
  annualInflationRate: number = 0.03,
): NpvSensitivityPoint[] {
  return rates.map(rate => {
    const financials = computeInitiativeFinancials(initiative, categoryName, rate, annualInflationRate);
    return { discount_rate: rate, npv: financials.npv };
  });
}

// ---- 2. EBITDA Bridge ----

export function computeEbitdaBridge(
  initiatives: any[],
  totalSpend: number,
): EbitdaBridge {
  const identified = initiatives.reduce((s, i) => s + (Number(i.target_amount) || 0), 0);
  const committedInits = initiatives.filter(i => ["committed", "realized"].includes((i.status || "").toLowerCase()));
  const committed = committedInits.reduce((s, i) => s + (Number(i.target_amount) || 0), 0);
  const realized = initiatives.reduce((s, i) => s + (Number(i.realized_amount) || 0), 0);

  // Run rate: annualize realized
  const monthsWithRealization = initiatives.filter(i => (Number(i.realized_amount) || 0) > 0).length;
  const runRate = monthsWithRealization > 0 ? (realized / Math.max(monthsWithRealization, 3)) * 12 : 0;

  const idToCommRate = identified > 0 ? committed / identified : 0;
  const commToRealRate = committed > 0 ? realized / committed : 0;

  // Project savings using ramp
  let projYr1 = 0;
  let projYr2 = 0;
  let projYr3 = 0;
  let totalCta = 0;

  for (const init of initiatives) {
    const leverType = (init.lever_type || "renegotiation").toLowerCase();
    const target = Number(init.target_amount) || 0;
    const ctaProfile = CTA_TABLE[leverType] || DEFAULT_CTA;
    const cta = target * (ctaProfile.consulting + ctaProfile.technology + ctaProfile.transition + ctaProfile.training);
    totalCta += cta;

    // Year projections using ramp
    projYr1 += target * getRampForMonth(leverType, 12);
    projYr2 += target * (getRampForMonth(leverType, 24) - getRampForMonth(leverType, 12));
    projYr3 += target * (getRampForMonth(leverType, 36) - getRampForMonth(leverType, 24));
  }

  // CTA allocation: 70% yr1, 20% yr2, 10% yr3
  const ctaYr1 = totalCta * 0.70;
  const ctaYr2 = totalCta * 0.20;
  const ctaYr3 = totalCta * 0.10;

  const netYr1 = projYr1 - ctaYr1;
  const netYr2 = projYr2 - ctaYr2;
  const netYr3 = projYr3 - ctaYr3;

  const bridge_steps: EbitdaBridge["bridge_steps"] = [
    { name: "Addressable Spend", value: Math.round(totalSpend), type: "total" },
    { name: "Identified Savings", value: Math.round(identified), type: "positive" },
    { name: "Committed", value: Math.round(committed), type: "positive" },
    { name: "Realized to Date", value: Math.round(realized), type: "positive" },
    { name: "Projected Savings Yr1", value: Math.round(projYr1), type: "positive" },
    { name: "Cost to Achieve (Total)", value: -Math.round(totalCta), type: "negative" },
    { name: "CTA Yr1 (70%)", value: -Math.round(ctaYr1), type: "negative" },
    { name: "CTA Yr2 (20%)", value: -Math.round(ctaYr2), type: "negative" },
    { name: "CTA Yr3 (10%)", value: -Math.round(ctaYr3), type: "negative" },
    { name: "Net EBITDA Yr1", value: Math.round(netYr1), type: "total" },
    { name: "Net EBITDA Yr2", value: Math.round(netYr2), type: "total" },
    { name: "Net EBITDA Yr3", value: Math.round(netYr3), type: "total" },
  ];

  return {
    total_addressable_spend: Math.round(totalSpend),
    savings_identified: Math.round(identified),
    savings_committed: Math.round(committed),
    savings_realized: Math.round(realized),
    savings_run_rate: Math.round(runRate),
    identified_to_committed_rate: Math.round(idToCommRate * 100) / 100,
    committed_to_realized_rate: Math.round(commToRealRate * 100) / 100,
    ebitda_impact_realized: Math.round(realized),
    ebitda_impact_projected_yr1: Math.round(projYr1),
    ebitda_impact_projected_yr2: Math.round(projYr2),
    ebitda_impact_projected_yr3: Math.round(projYr3),
    total_cta: Math.round(totalCta),
    net_ebitda_yr1: Math.round(netYr1),
    net_ebitda_yr2: Math.round(netYr2),
    net_ebitda_yr3: Math.round(netYr3),
    bridge_steps,
  };
}

// ---- 3. Working Capital ----

// Industry-specific DPO and inventory benchmarks
// Sources: REL/Hackett Working Capital Survey, industry financial databases
const INDUSTRY_WC_PROFILES: Record<string, { current_dpo: number; target_dpo: number; inventory_pct_of_direct: number }> = {
  manufacturing:      { current_dpo: 38, target_dpo: 52, inventory_pct_of_direct: 0.18 },
  chemicals:          { current_dpo: 42, target_dpo: 55, inventory_pct_of_direct: 0.15 },
  technology:         { current_dpo: 30, target_dpo: 45, inventory_pct_of_direct: 0.05 },
  healthcare:         { current_dpo: 50, target_dpo: 65, inventory_pct_of_direct: 0.12 },
  retail:             { current_dpo: 28, target_dpo: 42, inventory_pct_of_direct: 0.25 },
  financial_services: { current_dpo: 25, target_dpo: 35, inventory_pct_of_direct: 0.02 },
  energy_utilities:   { current_dpo: 35, target_dpo: 50, inventory_pct_of_direct: 0.10 },
  construction:       { current_dpo: 45, target_dpo: 60, inventory_pct_of_direct: 0.08 },
  food_agriculture:   { current_dpo: 30, target_dpo: 45, inventory_pct_of_direct: 0.22 },
  government:         { current_dpo: 60, target_dpo: 75, inventory_pct_of_direct: 0.05 },
  transportation:     { current_dpo: 35, target_dpo: 48, inventory_pct_of_direct: 0.08 },
  default:            { current_dpo: 35, target_dpo: 50, inventory_pct_of_direct: 0.10 },
};

export function computeWorkingCapital(
  initiatives: any[],
  spendRecords: any[],
  totalSpend: number,
  industry?: string,
): WorkingCapitalImpact {
  // Industry-specific DPO benchmarks
  const normIndustry = (industry || "").toLowerCase();
  let wcProfile = INDUSTRY_WC_PROFILES["default"];
  for (const [key, profile] of Object.entries(INDUSTRY_WC_PROFILES)) {
    if (normIndustry.includes(key) || key.includes(normIndustry)) {
      wcProfile = profile;
      break;
    }
  }

  const currentDpo = wcProfile.current_dpo;
  const targetDpo = wcProfile.target_dpo;
  const dpoImprovement = targetDpo - currentDpo;

  const dailySpend = totalSpend / 365;
  const wcRelease = Math.round(dailySpend * dpoImprovement);

  // Inventory: estimate from direct material spend using industry-specific ratio
  let directMaterialSpend = 0;
  for (const r of spendRecords) {
    const desc = ((r.description || "") + " " + (r.supplier_name || "")).toLowerCase();
    if (DIRECT_MATERIAL_KEYWORDS.some(k => desc.includes(k))) {
      directMaterialSpend += Math.abs(Number(r.amount) || 0);
    }
  }

  const estInventory = Math.round(directMaterialSpend * wcProfile.inventory_pct_of_direct);

  // Demand reduction initiatives contribute to inventory reduction
  const demandReductionInits = initiatives.filter(i =>
    ["demand_reduction", "spec_change", "specification_change"].includes((i.lever_type || "").toLowerCase())
  );
  const invReductionPct = demandReductionInits.length > 0 ? 0.10 : 0.03;
  const inventoryRelease = Math.round(estInventory * invReductionPct);

  const totalWcRelease = wcRelease + inventoryRelease;

  // v2: Per-initiative WC contribution for payment_terms initiatives
  const PAYMENT_TERM_LEVERS = ["payment_terms", "payment_term_optimization"];
  const perInitiativeWc: WorkingCapitalImpact["per_initiative_wc"] = [];
  for (const init of initiatives) {
    const lt = (init.lever_type || "").toLowerCase();
    if (!PAYMENT_TERM_LEVERS.includes(lt)) continue;
    // Payment terms initiatives: ΔDays × annual_spend / 365
    // Estimate ΔDays as dpoImprovement weighted by initiative size relative to total
    const initTarget = Number(init.target_amount) || 0;
    const initSpend = Number(init.addressable_spend || init.target_amount) || 0;
    // Use a proportional share of the DPO improvement
    const deltaDays = initTarget > 0 && totalSpend > 0
      ? Math.round(dpoImprovement * (initSpend / totalSpend) * 10) / 10
      : dpoImprovement;
    const wcImpact = Math.round(initSpend * deltaDays / 365);
    perInitiativeWc.push({
      initiative_id: init.id,
      initiative_name: init.name || "Payment Terms Initiative",
      lever_type: lt,
      wc_impact: wcImpact,
      delta_days: deltaDays,
      annual_spend: Math.round(initSpend),
    });
  }

  // v2: WC as % of spend
  const wcAsPctOfSpend = totalSpend > 0 ? Math.round((totalWcRelease / totalSpend) * 10000) / 100 : 0;

  const bridgeSteps: WorkingCapitalImpact["bridge_steps"] = [
    { name: "DPO Improvement", value: wcRelease, type: "positive" as const },
    { name: "Inventory Reduction", value: inventoryRelease, type: "positive" as const },
  ];

  // Add per-initiative WC contributions to bridge
  for (const piw of perInitiativeWc) {
    bridgeSteps.push({
      name: `WC: ${piw.initiative_name}`,
      value: piw.wc_impact,
      type: "positive" as const,
    });
  }

  bridgeSteps.push({ name: "Total WC Release", value: totalWcRelease, type: "total" as const });

  return {
    current_avg_dpo: currentDpo,
    target_avg_dpo: targetDpo,
    dpo_improvement_days: dpoImprovement,
    annual_spend: Math.round(totalSpend),
    daily_spend: Math.round(dailySpend),
    wc_release: wcRelease,
    inventory_reduction_pct: Math.round(invReductionPct * 100),
    estimated_inventory_value: estInventory,
    inventory_release: inventoryRelease,
    total_wc_release: totalWcRelease,
    per_initiative_wc: perInitiativeWc,
    wc_as_pct_of_spend: wcAsPctOfSpend,
    bridge_steps: bridgeSteps,
  };
}

// ---- 4. Portfolio S-Curve ----

export function computePortfolioScurve(
  initiatives: any[],
  categories: any[],
  discountRate: number = 0.10,
): PortfolioScurvePoint[] {
  const catMap = new Map<number, string>();
  for (const c of categories) catMap.set(c.id, c.name);

  // Compute financials for each initiative
  const allFinancials = initiatives.map(init =>
    computeInitiativeFinancials(init, catMap.get(init.category_id) || "Uncategorized", discountRate)
  );

  const points: PortfolioScurvePoint[] = [];
  let cumulative = 0;

  for (let m = 1; m <= 36; m++) {
    let grossSavings = 0;
    let costs = 0;
    const byStatus: Record<string, number> = {};

    for (const fin of allFinancials) {
      const cf = fin.monthly_cashflow[m - 1];
      if (!cf) continue;
      grossSavings += cf.savings;
      costs += cf.costs;

      const status = fin.status || "identified";
      byStatus[status] = (byStatus[status] || 0) + cf.savings;
    }

    const net = grossSavings - costs;
    cumulative += net;

    points.push({
      month: m,
      date: makeDate(m - 1),
      gross_savings: Math.round(grossSavings),
      costs: Math.round(costs),
      net: Math.round(net),
      cumulative: Math.round(cumulative),
      by_status: byStatus,
    });
  }

  return points;
}

// ========================================================================
// 5. Sensitivity Grid (v2) — 3×3 NPV matrix
// ========================================================================

// Savings rate ranges per lever type (low/mid/high)
const LEVER_SAVINGS_RANGES: Record<string, { low: number; mid: number; high: number }> = {
  renegotiation:              { low: 0.04, mid: 0.07, high: 0.12 },
  volume_consolidation:       { low: 0.07, mid: 0.12, high: 0.18 },
  contract_term_optimization: { low: 0.03, mid: 0.05, high: 0.08 },
  demand_reduction:           { low: 0.08, mid: 0.15, high: 0.22 },
  process_efficiency:         { low: 0.05, mid: 0.08, high: 0.13 },
  spec_change:                { low: 0.07, mid: 0.12, high: 0.18 },
  make_vs_buy:                { low: 0.08, mid: 0.15, high: 0.25 },
  spend_under_management:     { low: 0.04, mid: 0.08, high: 0.12 },
  payment_terms:              { low: 0.01, mid: 0.03, high: 0.05 },
  payment_term_optimization:  { low: 0.01, mid: 0.03, high: 0.05 },
  global_sourcing:            { low: 0.10, mid: 0.15, high: 0.22 },
  competitive_bidding:        { low: 0.05, mid: 0.10, high: 0.15 },
};

const DEFAULT_SAVINGS_RANGE = { low: 0.04, mid: 0.08, high: 0.14 };

export function computeSensitivityGrid(
  initiative: any,
  categoryName: string,
  discountRate: number = 0.10,
): SensitivityGrid {
  const leverType = (initiative.lever_type || "renegotiation").toLowerCase();
  const baseTarget = Number(initiative.target_amount) || 0;

  const savingsRange = LEVER_SAVINGS_RANGES[leverType] || DEFAULT_SAVINGS_RANGE;
  const ctaProfile = CTA_TABLE[leverType] || DEFAULT_CTA;
  const baseCta = ctaProfile.consulting + ctaProfile.technology + ctaProfile.transition + ctaProfile.training;

  const savingsRates = [
    { label: "Low", value: savingsRange.low },
    { label: "Mid", value: savingsRange.mid },
    { label: "High", value: savingsRange.high },
  ];

  const ctaMultipliers = [
    { label: "Low CTA (0.75×)", value: 0.75 },
    { label: "Base CTA (1.0×)", value: 1.00 },
    { label: "High CTA (1.25×)", value: 1.25 },
  ];

  // For each cell: scale initiative target by savings_rate ratio, scale CTA, compute NPV
  const midRate = savingsRange.mid;
  const npvMatrix: number[][] = [];

  for (const sr of savingsRates) {
    const row: number[] = [];
    const scaleFactor = midRate > 0 ? sr.value / midRate : 1;
    const scaledTarget = Math.round(baseTarget * scaleFactor);

    for (const ctaMult of ctaMultipliers) {
      // Create a modified initiative with scaled target
      const modInit = { ...initiative, target_amount: scaledTarget };

      // Compute financials with base CTA, then adjust CTA proportionally
      const fin = computeInitiativeFinancials(modInit, categoryName, discountRate);

      // Adjust NPV for CTA difference: base NPV + (1 - ctaMult) × ctaTotal
      // (Higher CTA = lower NPV)
      const ctaDelta = fin.cta_total * (1 - ctaMult.value);
      const adjustedNpv = fin.npv + Math.round(ctaDelta);
      row.push(adjustedNpv);
    }
    npvMatrix.push(row);
  }

  // Base NPV (mid savings, base CTA)
  const baseFin = computeInitiativeFinancials(initiative, categoryName, discountRate);

  return {
    initiative_id: initiative.id,
    initiative_name: initiative.name || "",
    lever_type: leverType,
    savings_rates: savingsRates,
    cta_multipliers: ctaMultipliers,
    npv_matrix: npvMatrix,
    base_npv: baseFin.npv,
    discount_rate: discountRate,
  };
}

// ========================================================================
// 6. Portfolio Monte Carlo Integration (v2)
// ========================================================================

export function computePortfolioMonteCarlo(
  initiatives: any[],
  categories: any[],
  discountRate: number = 0.10,
  nIterations?: number,
): PortfolioMonteCarloResult {
  const catMap = new Map<number, string>();
  for (const c of categories) catMap.set(c.id, c.name);

  // Build initiative inputs for the MC engine
  const mcInitiatives = initiatives.map(init => ({
    id: init.id,
    name: init.name || "",
    lever_type: init.lever_type || "renegotiation",
    category_name: catMap.get(init.category_id) || "Uncategorized",
    target_amount: Number(init.target_amount) || 0,
    addressable_spend: Number(init.addressable_spend || init.target_amount) || 0,
    phase: init.phase || "medium_term",
  }));

  const engagement = { id: 0, discount_rate: discountRate };
  const mcResult = runMonteCarlo(mcInitiatives, engagement);

  // Build monthly cumulative savings with p10/p50/p90 for charting.
  // Use the ramp curves to distribute annual p10/p50/p90 across months.
  // Approximate: each initiative's ramp determines monthly shape, scale by percentile ratio.
  const monthlySavings: PortfolioMonteCarloResult["monthly_savings"] = [];

  // For each initiative, compute deterministic monthly savings (base case)
  const baseMonthly: number[][] = initiatives.map(init => {
    const lt = (init.lever_type || "renegotiation").toLowerCase();
    const target = Number(init.target_amount) || 0;
    const months: number[] = [];
    let cumulative = 0;
    for (let m = 1; m <= 36; m++) {
      const mSavings = getMonthlyRampSavings(lt, target, m);
      cumulative += mSavings;
      months.push(cumulative);
    }
    return months;
  });

  // Total base cumulative per month
  const baseCumulative: number[] = [];
  for (let m = 0; m < 36; m++) {
    let total = 0;
    for (const initMonths of baseMonthly) {
      total += initMonths[m];
    }
    baseCumulative.push(total);
  }

  // Total base at month 36 = deterministic total
  const baseTotal = baseCumulative[35] || 1;

  // Scale each month's cumulative by the p10/p50/p90 ratios
  for (let m = 0; m < 36; m++) {
    const ratio = baseTotal > 0 ? baseCumulative[m] / baseTotal : 0;
    monthlySavings.push({
      month: m + 1,
      date: makeDate(m),
      cumulative_p10: Math.round(mcResult.total_savings_p10 * ratio),
      cumulative_p50: Math.round(mcResult.total_savings_p50 * ratio),
      cumulative_p90: Math.round(mcResult.total_savings_p90 * ratio),
    });
  }

  return {
    monte_carlo: mcResult,
    monthly_savings: monthlySavings,
  };
}
