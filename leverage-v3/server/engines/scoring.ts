// Multi-Factor Initiative Scoring Engine v2 — 100% deterministic.
// 23 factors across 4 dimensions: Contract (25%), Market (30%), Operational (25%), Financial (20%).
// Contract dimension uses tiered fallback: Tier 1=contracts table, Tier 2=spend record fields,
// Tier 3=statistical inference from spend patterns, Tier 4=category/industry prior.
// When contracts table is empty, contract dimension weight is reduced by avg confidence,
// deficit redistributes to market and operational dimensions.

// ========================================================================
// Interfaces
// ========================================================================

export interface ScoreDriver {
  factor_name: string;
  score: number;
  rationale: string;
}

interface FactorResult {
  score: number;
  rationale: string;
  tier: number;          // 1=direct contract, 2=spend field, 3=statistical, 4=prior
  confidence: number;    // 0.0–1.0
}

export interface InitiativeScore {
  initiative_id: number;
  initiative_name: string;
  category_name: string;
  lever_type: string;

  // Dimension scores (0-100)
  contract_score: number;
  market_score: number;
  operational_score: number;
  financial_score: number;

  // Dimension confidence (for contract fallback transparency)
  contract_confidence: number;

  // Effective dimension weights after confidence redistribution
  effective_weights: { contract: number; market: number; operational: number; financial: number };

  // Individual factor scores for drill-down
  factor_scores: Record<string, FactorResult>;

  // Weighted total (0-100, percentile-normalized across initiative set)
  total_score: number;

  // Score drivers — top 3 highest and bottom 3 lowest factors
  score_drivers: { top: ScoreDriver[]; bottom: ScoreDriver[] };

  // Risk-adjusted target
  base_target: number;
  probability: number;
  risk_adjusted_target: number;

  // Phase and classification
  phase: "quick_win" | "medium_term" | "long_term";
  priority: "Quick Win" | "Strategic" | "Long-term" | "Deprioritize";
  time_horizon: "0-90 days" | "90-180 days" | "180-365 days";

  // Full scoring JSON (for caching in scoring_json column)
  scoring_json: string;
}

// ========================================================================
// Constants
// ========================================================================

const BASE_WEIGHTS = { contract: 0.25, market: 0.30, operational: 0.25, financial: 0.20 };

// Tier confidence weights
const TIER_CONFIDENCE = { 1: 1.0, 2: 0.85, 3: 0.70, 4: 0.55 };

// Cost-to-achieve estimates by lever type (sum of consulting+technology+transition+training)
const CTA_PCT: Record<string, number> = {
  renegotiation: 0.11,
  volume_consolidation: 0.16,
  make_vs_buy: 0.45,
  demand_reduction: 0.23,
  specification_change: 0.26,
  spec_change: 0.26,
  process_improvement: 0.31,
  process_efficiency: 0.31,
  payment_terms: 0.06,
  payment_term_optimization: 0.06,
  global_sourcing: 0.26,
  contract_term_optimization: 0.11,
  competitive_bidding: 0.11,
  insource_outsource: 0.32,
  spend_under_management: 0.15,
};

// Lever complexity classification
const LEVER_COMPLEXITY: Record<string, "quick" | "medium" | "complex"> = {
  payment_terms: "quick",
  spend_under_management: "quick",
  competitive_bidding: "quick",
  renegotiation: "medium",
  volume_consolidation: "medium",
  demand_reduction: "medium",
  contract_term_optimization: "medium",
  process_efficiency: "medium",
  process_improvement: "medium",
  global_sourcing: "complex",
  specification_change: "complex",
  spec_change: "complex",
  make_vs_buy: "complex",
  insource_outsource: "complex",
};

// Phase assignment by lever type
const PHASE_MAP: Record<string, "quick_win" | "medium_term" | "long_term"> = {
  payment_terms: "quick_win",
  spend_under_management: "quick_win",
  competitive_bidding: "quick_win",
  renegotiation: "medium_term",
  demand_reduction: "medium_term",
  contract_term_optimization: "medium_term",
  volume_consolidation: "medium_term",
  process_efficiency: "medium_term",
  process_improvement: "medium_term",
  spec_change: "medium_term",
  specification_change: "long_term",
  make_vs_buy: "long_term",
  insource_outsource: "long_term",
  global_sourcing: "long_term",
};

// Run-rate vs one-time classification
const RUN_RATE_LEVERS = new Set(["renegotiation", "contract_term_optimization", "volume_consolidation", "competitive_bidding", "payment_terms", "global_sourcing"]);
const ONE_TIME_LEVERS = new Set(["demand_reduction", "spec_change", "specification_change"]);

// Category keyword sets
const COMMODITY_KEYWORDS = ["metal", "chemical", "plastic", "paper", "fuel", "electricity", "gas", "steel", "lumber", "resin", "raw material", "packaging"];
const SERVICE_KEYWORDS = ["consulting", "legal", "it service", "staffing", "professional", "advisory", "audit", "marketing agency"];
const LOW_SWITCH_KEYWORDS = ["office supply", "office supplies", "temp labor", "staffing", "janitorial", "cleaning", "courier", "parcel"];
const HIGH_SWITCH_KEYWORDS = ["erp", "software licensing", "custom", "specialized", "contract manufacturing"];
const ELASTIC_KEYWORDS = ["travel", "marketing", "advertising", "events", "conference", "t&e", "lodging", "training"];
const INELASTIC_KEYWORDS = ["raw material", "metal", "chemical", "energy", "fuel", "production", "contract manufacturing"];
const DIRECT_MATERIAL_KEYWORDS = ["raw material", "metal", "chemical", "plastic", "packaging", "components", "assemblies", "contract manufacturing"];
const OVER_SPEC_KEYWORDS = ["engineering", "custom", "branded", "proprietary", "specialty"];
const GLOBAL_SUPPLY_KEYWORDS = ["metal", "chemical", "plastic", "electronics", "semiconductor", "packaging", "raw material"];

// ========================================================================
// Helpers
// ========================================================================

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function isCommodity(name: string): boolean {
  const lower = name.toLowerCase();
  return COMMODITY_KEYWORDS.some(k => lower.includes(k));
}

function isService(name: string): boolean {
  const lower = name.toLowerCase();
  return SERVICE_KEYWORDS.some(k => lower.includes(k));
}

function matchesKeywords(name: string, keywords: string[]): boolean {
  const lower = name.toLowerCase();
  return keywords.some(k => lower.includes(k));
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// ========================================================================
// Category stats builder
// ========================================================================

interface CategoryStats {
  category_id: number;
  category_name: string;
  total_spend: number;
  record_count: number;
  supplier_counts: Record<string, number>;
  supplier_record_counts: Record<string, number>;
  unique_suppliers: number;
  business_units: Set<string>;
  amount_values: number[];
  date_values: string[];
  supplier_date_ranges: Record<string, { min: string; max: string }>;
  // v2 fields
  po_type_counts: Record<string, number>; // PO | P-Card | Non-PO | BlanketPO → count
  payment_terms_values: string[];
  monthly_spend: Map<string, number>;     // YYYY-MM → total
  normalized_supplier_clusters: number;   // Count of distinct normalized names
}

function buildCategoryStats(spendRecords: any[], categories: any[]): Map<number, CategoryStats> {
  const catMap = new Map<number, string>();
  for (const c of categories) catMap.set(c.id, c.name);

  const stats = new Map<number, CategoryStats>();
  const normClusters = new Map<number, Set<string>>(); // category_id → set of normalized names

  for (const r of spendRecords) {
    const cid = r.category_id;
    if (!cid) continue;

    if (!stats.has(cid)) {
      stats.set(cid, {
        category_id: cid,
        category_name: catMap.get(cid) || `Category ${cid}`,
        total_spend: 0, record_count: 0,
        supplier_counts: {}, supplier_record_counts: {},
        unique_suppliers: 0, business_units: new Set(),
        amount_values: [], date_values: [],
        supplier_date_ranges: {},
        po_type_counts: {}, payment_terms_values: [],
        monthly_spend: new Map(), normalized_supplier_clusters: 0,
      });
      normClusters.set(cid, new Set());
    }

    const s = stats.get(cid)!;
    const amt = Number(r.amount) || 0;
    s.total_spend += amt;
    s.record_count++;
    s.amount_values.push(amt);

    const supplier = (r.normalized_supplier_name || r.supplier_name || "").trim();
    if (supplier) {
      s.supplier_counts[supplier] = (s.supplier_counts[supplier] || 0) + amt;
      s.supplier_record_counts[supplier] = (s.supplier_record_counts[supplier] || 0) + 1;
    }

    if (r.business_unit) s.business_units.add(r.business_unit);

    if (r.date) {
      const dateStr = String(r.date);
      s.date_values.push(dateStr);
      if (supplier) {
        if (!s.supplier_date_ranges[supplier]) {
          s.supplier_date_ranges[supplier] = { min: dateStr, max: dateStr };
        } else {
          if (dateStr < s.supplier_date_ranges[supplier].min) s.supplier_date_ranges[supplier].min = dateStr;
          if (dateStr > s.supplier_date_ranges[supplier].max) s.supplier_date_ranges[supplier].max = dateStr;
        }
      }
      // Monthly spend
      const ym = dateStr.substring(0, 7); // YYYY-MM
      if (ym.length === 7) {
        s.monthly_spend.set(ym, (s.monthly_spend.get(ym) || 0) + amt);
      }
    }

    // PO type tracking
    if (r.po_type) {
      const pt = String(r.po_type).trim();
      s.po_type_counts[pt] = (s.po_type_counts[pt] || 0) + 1;
    }

    // Payment terms
    if (r.payment_terms) s.payment_terms_values.push(String(r.payment_terms));

    // Normalized supplier cluster tracking
    if (r.normalized_supplier_name) {
      normClusters.get(cid)!.add(r.normalized_supplier_name);
    }
  }

  for (const [cid, s] of stats) {
    s.unique_suppliers = Object.keys(s.supplier_counts).length;
    s.normalized_supplier_clusters = normClusters.get(cid)?.size || 0;
  }

  return stats;
}

function computeHHI(supplierSpend: Record<string, number>, totalSpend: number): number {
  if (totalSpend <= 0) return 0;
  let hhi = 0;
  for (const spend of Object.values(supplierSpend)) {
    const share = spend / totalSpend;
    hhi += share * share;
  }
  return hhi;
}

function getMaxSupplierDateSpanMonths(ranges: Record<string, { min: string; max: string }>): number {
  let maxSpan = 0;
  for (const range of Object.values(ranges)) {
    const a = new Date(range.min);
    const b = new Date(range.max);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) continue;
    const span = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (span > maxSpan) maxSpan = span;
  }
  return maxSpan;
}

// Compute CoV of monthly spend for a category
function monthlySpendCoV(monthly: Map<string, number>): number {
  if (monthly.size < 3) return 0;
  const vals = [...monthly.values()];
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (mean <= 0) return 0;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  return Math.sqrt(variance) / mean;
}

// ========================================================================
// CONTRACT FACTORS (6 factors, 25% weight) — with tiered fallback
// ========================================================================

function scoreContractFactors(
  cs: CategoryStats | undefined,
  contractsForCategory: any[],  // filtered contracts for this category
  today: string,
): { score: number; confidence: number; factors: Record<string, FactorResult> } {
  const factors: Record<string, FactorResult> = {};
  const hasContracts = contractsForCategory.length > 0;

  // 1. contract_age
  if (hasContracts) {
    const contract = contractsForCategory[0]; // primary contract
    if (contract.start_date) {
      const ageDays = daysBetween(contract.start_date, today);
      const ageYears = ageDays / 365;
      let score: number;
      if (ageYears > 3) score = 90;
      else if (ageYears > 2) score = 75;
      else if (ageYears > 1) score = 55;
      else score = 30;
      factors.contract_age = { score, rationale: `Contract started ${contract.start_date} (${ageYears.toFixed(1)}yr ago); ${ageYears > 3 ? "stale — renegotiation opportunity" : ageYears > 2 ? "aging contract" : "relatively recent"}`, tier: 1, confidence: 1.0 };
    } else {
      factors.contract_age = { score: 80, rationale: "Contract exists but no start date — treating as uncontracted spend (high opportunity)", tier: 2, confidence: 0.85 };
    }
  } else if (cs && cs.date_values.length > 2) {
    // Tier 3: infer from spend date spans
    const maxSpan = getMaxSupplierDateSpanMonths(cs.supplier_date_ranges);
    let score: number;
    if (maxSpan > 36) score = 85;
    else if (maxSpan > 24) score = 70;
    else if (maxSpan > 12) score = 55;
    else score = 40;
    factors.contract_age = { score, rationale: `[Inferred T3] No contract data; ${maxSpan}mo supplier date span suggests ${maxSpan > 24 ? "long-standing relationship, likely stale terms" : "newer engagement"}`, tier: 3, confidence: 0.70 };
  } else {
    factors.contract_age = { score: 80, rationale: "[Inferred T4] No contract or date data — uncontracted spend assumed (high opportunity)", tier: 4, confidence: 0.55 };
  }

  // 2. renewal_proximity
  if (hasContracts && contractsForCategory[0].end_date) {
    const daysToExpiry = daysBetween(today, contractsForCategory[0].end_date);
    let score: number;
    if (daysToExpiry < 90) score = 95;
    else if (daysToExpiry < 180) score = 80;
    else if (daysToExpiry < 365) score = 65;
    else score = 30;
    factors.renewal_proximity = { score, rationale: `Contract expires ${contractsForCategory[0].end_date} (${daysToExpiry}d); ${daysToExpiry < 90 ? "CRITICAL — immediate renewal window" : daysToExpiry < 180 ? "approaching renewal" : daysToExpiry < 365 ? "renewal within year" : "not expiring soon"}`, tier: 1, confidence: 1.0 };
  } else {
    factors.renewal_proximity = { score: 70, rationale: hasContracts ? "[Inferred T2] Contract exists but no end date — unclear renewal window" : "[Inferred T4] No contract — no renewal constraint, can negotiate anytime", tier: hasContracts ? 2 : 4, confidence: hasContracts ? 0.85 : 0.55 };
  }

  // 3. sole_source
  if (hasContracts && contractsForCategory[0].is_sole_source !== undefined && contractsForCategory[0].is_sole_source !== null) {
    const isSole = contractsForCategory[0].is_sole_source === 1;
    if (isSole) {
      factors.sole_source = { score: 85, rationale: "Sole source contract — no competitive alternatives at award", tier: 1, confidence: 1.0 };
    } else {
      const nSup = cs?.unique_suppliers || 1;
      const score = nSup === 1 ? 80 : nSup <= 3 ? 60 : 35;
      factors.sole_source = { score, rationale: `Not sole source; ${nSup} active supplier(s)`, tier: 1, confidence: 1.0 };
    }
  } else {
    const nSup = cs?.unique_suppliers || 1;
    const score = nSup === 1 ? 80 : nSup <= 3 ? 60 : 35;
    factors.sole_source = { score, rationale: `[Inferred T3] No contract data; ${nSup} supplier(s) in spend — ${nSup === 1 ? "likely sole source" : "multiple sources detected"}`, tier: 3, confidence: 0.70 };
  }

  // 4. payment_terms_gap
  if (hasContracts && contractsForCategory[0].payment_terms_gap_days !== undefined && contractsForCategory[0].payment_terms_gap_days !== null) {
    const gap = contractsForCategory[0].payment_terms_gap_days;
    let score: number;
    if (gap < -15) score = 85;
    else if (gap <= 0) score = 60;
    else if (gap <= 15) score = 40;
    else score = 20;
    factors.payment_terms_gap = { score, rationale: `Payment terms gap: ${gap}d vs benchmark; ${gap < -15 ? "significantly worse than benchmark — terms optimization opportunity" : gap <= 0 ? "slightly below benchmark" : "at or above benchmark"}`, tier: 1, confidence: 1.0 };
  } else if (cs && cs.payment_terms_values.length > 0) {
    // Tier 2: infer from spend record payment_terms field
    factors.payment_terms_gap = { score: 60, rationale: `[Inferred T2] Payment terms present in spend data but no benchmark gap computed`, tier: 2, confidence: 0.85 };
  } else {
    factors.payment_terms_gap = { score: 65, rationale: "[Inferred T4] No payment terms data — assumed gap to benchmark exists for most categories", tier: 4, confidence: 0.55 };
  }

  // 5. escalation_clause
  if (hasContracts) {
    const c = contractsForCategory[0];
    if (c.has_price_escalation === 1) {
      const rate = c.escalation_rate || 0;
      let score: number;
      if (rate > 3) score = 85;
      else if (rate >= 1) score = 65;
      else score = 45;
      factors.escalation_clause = { score, rationale: `Price escalation clause: ${rate}%/yr (${c.escalation_index || "unknown index"}); ${rate > 3 ? "aggressive escalation — renegotiation priority" : "moderate escalation"}`, tier: 1, confidence: 1.0 };
    } else {
      factors.escalation_clause = { score: 40, rationale: "No price escalation clause in contract", tier: 1, confidence: 1.0 };
    }
  } else {
    // Tier 3: infer from price trend in spend data
    if (cs && cs.monthly_spend.size >= 6) {
      const months = [...cs.monthly_spend.keys()].sort();
      const vals = months.map(m => cs.monthly_spend.get(m) || 0);
      const firstHalf = vals.slice(0, Math.floor(vals.length / 2));
      const secondHalf = vals.slice(Math.floor(vals.length / 2));
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      const change = firstAvg > 0 ? (secondAvg - firstAvg) / firstAvg : 0;
      if (change > 0.15) {
        factors.escalation_clause = { score: 75, rationale: `[Inferred T3] Spend increased ${(change * 100).toFixed(0)}% over time — possible hidden escalation`, tier: 3, confidence: 0.70 };
      } else {
        factors.escalation_clause = { score: 45, rationale: `[Inferred T3] Spend trend flat/declining (${(change * 100).toFixed(0)}%) — no escalation signal`, tier: 3, confidence: 0.70 };
      }
    } else {
      factors.escalation_clause = { score: 50, rationale: "[Inferred T4] No contract or trend data — assumed moderate risk", tier: 4, confidence: 0.55 };
    }
  }

  // 6. compliance_rate
  if (hasContracts && contractsForCategory[0].compliance_rate_pct !== undefined && contractsForCategory[0].compliance_rate_pct !== null) {
    const rate = contractsForCategory[0].compliance_rate_pct;
    let score: number;
    if (rate < 60) score = 90;
    else if (rate < 80) score = 65;
    else if (rate < 95) score = 40;
    else score = 20;
    factors.compliance_rate = { score, rationale: `Contract compliance: ${rate.toFixed(0)}%; ${rate < 60 ? "poor compliance — significant leakage" : rate < 80 ? "moderate compliance" : "well-controlled"}`, tier: 1, confidence: 1.0 };
  } else if (cs && cs.amount_values.length > 5) {
    // Tier 3: use outlier rate as proxy
    const sorted = [...cs.amount_values].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : sorted[Math.floor(sorted.length / 2)];
    const outlierRate = cs.amount_values.filter(v => v > median * 2).length / cs.amount_values.length;
    const score = outlierRate > 0.15 ? 80 : outlierRate > 0.05 ? 60 : 35;
    factors.compliance_rate = { score, rationale: `[Inferred T3] ${(outlierRate * 100).toFixed(0)}% of records exceed 2× median — ${outlierRate > 0.15 ? "billing anomalies suggest low compliance" : "reasonable consistency"}`, tier: 3, confidence: 0.70 };
  } else {
    factors.compliance_rate = { score: 55, rationale: "[Inferred T4] Insufficient data — assumed moderate compliance gap", tier: 4, confidence: 0.55 };
  }

  // Compute dimension score and confidence
  const factorList = Object.values(factors);
  const avgScore = factorList.reduce((s, f) => s + f.score, 0) / factorList.length;
  const avgConfidence = factorList.reduce((s, f) => s + f.confidence, 0) / factorList.length;

  return { score: Math.round(avgScore), confidence: Math.round(avgConfidence * 100) / 100, factors };
}

// ========================================================================
// MARKET FACTORS (6 factors, 30% weight)
// ========================================================================

function scoreMarketFactors(
  cs: CategoryStats | undefined,
  categoryName: string,
  geography: string | null,
): { score: number; factors: Record<string, FactorResult> } {
  const factors: Record<string, FactorResult> = {};
  const totalSpend = cs?.total_spend || 0;
  const supplierSpend = cs?.supplier_counts || {};
  const nSuppliers = cs?.unique_suppliers || 0;

  // 1. hhi_concentration
  const hhi = computeHHI(supplierSpend, totalSpend);
  const hhiScore = hhi > 0.25 ? 85 : hhi > 0.15 ? 65 : 40;
  factors.hhi_concentration = { score: hhiScore, rationale: `HHI=${hhi.toFixed(3)}; ${hhi > 0.25 ? "highly concentrated — competitive bidding opportunity" : hhi > 0.15 ? "moderately concentrated" : "competitive market"}`, tier: 2, confidence: 0.95 };

  // 2. viable_alternatives
  let vaScore: number;
  let vaRationale: string;
  if (isCommodity(categoryName)) {
    if (nSuppliers > 5) { vaScore = 80; vaRationale = `Commodity with ${nSuppliers} suppliers — highly competitive`; }
    else if (nSuppliers >= 3) { vaScore = 60; vaRationale = `Commodity with ${nSuppliers} suppliers — moderate alternatives`; }
    else { vaScore = 35; vaRationale = `Commodity but only ${nSuppliers} supplier(s) — limited alternatives`; }
  } else if (isService(categoryName)) {
    if (nSuppliers > 5) { vaScore = 70; vaRationale = `Service with ${nSuppliers} suppliers — alternatives available`; }
    else if (nSuppliers >= 3) { vaScore = 50; vaRationale = `Service with ${nSuppliers} suppliers`; }
    else { vaScore = 25; vaRationale = `Service with ${nSuppliers} supplier(s) — specialized, limited alternatives`; }
  } else {
    if (nSuppliers > 5) { vaScore = 70; vaRationale = `${nSuppliers} suppliers available`; }
    else if (nSuppliers >= 3) { vaScore = 55; vaRationale = `${nSuppliers} suppliers — some alternatives`; }
    else { vaScore = 35; vaRationale = `Only ${nSuppliers} supplier(s) — limited market`; }
  }
  factors.viable_alternatives = { score: vaScore, rationale: vaRationale, tier: 2, confidence: 0.90 };

  // 3. commodity_vs_differentiated
  const comScore = isCommodity(categoryName) ? 80 : isService(categoryName) ? 30 : 55;
  factors.commodity_vs_differentiated = { score: comScore, rationale: `${isCommodity(categoryName) ? "Commodity — benchmarkable, standard specs" : isService(categoryName) ? "Differentiated service — harder to benchmark" : "Semi-commodity — partially benchmarkable"}`, tier: 2, confidence: 0.95 };

  // 4. switching_cost
  let swScore: number;
  if (matchesKeywords(categoryName, LOW_SWITCH_KEYWORDS)) { swScore = 85; }
  else if (matchesKeywords(categoryName, HIGH_SWITCH_KEYWORDS)) { swScore = 25; }
  else if (isService(categoryName)) { swScore = 55; }
  else { swScore = 60; }
  factors.switching_cost = { score: swScore, rationale: `${swScore >= 80 ? "Low switching cost — easy to change suppliers" : swScore <= 30 ? "High switching cost — specialized or embedded" : "Moderate switching cost"}`, tier: 2, confidence: 0.85 };

  // 5. regional_pricing
  const geo = (geography || "").toLowerCase();
  const isGlobalSupply = matchesKeywords(categoryName, GLOBAL_SUPPLY_KEYWORDS);
  let rpScore: number;
  if ((geo.includes("north_america") || geo.includes("western_europe")) && isGlobalSupply) {
    rpScore = 70;
  } else if (isGlobalSupply) {
    rpScore = 60;
  } else if (isService(categoryName)) {
    rpScore = 30; // Captive domestic
  } else {
    rpScore = 45;
  }
  factors.regional_pricing = { score: rpScore, rationale: `Geography: ${geography || "unknown"}; ${isGlobalSupply ? "global supply market — regional arbitrage possible" : "limited regional pricing variation"}`, tier: 2, confidence: 0.80 };

  // 6. demand_elasticity
  let deScore: number;
  if (matchesKeywords(categoryName, ELASTIC_KEYWORDS)) { deScore = 85; }
  else if (matchesKeywords(categoryName, INELASTIC_KEYWORDS)) { deScore = 30; }
  else { deScore = 60; }
  factors.demand_elasticity = { score: deScore, rationale: `${deScore >= 80 ? "Highly elastic — demand reduction feasible" : deScore <= 35 ? "Inelastic — production-critical, demand is fixed" : "Moderate elasticity"}`, tier: 2, confidence: 0.85 };

  // Equal weights across 6 market factors
  const avg = Math.round((hhiScore + vaScore + comScore + swScore + rpScore + deScore) / 6);
  return { score: avg, factors };
}

// ========================================================================
// OPERATIONAL FACTORS (6 factors, 25% weight)
// ========================================================================

function scoreOperationalFactors(
  cs: CategoryStats | undefined,
  categoryName: string,
  totalSpend: number,
  avgMaturityScore: number | null, // avg across all dimensions, 1-5
): { score: number; factors: Record<string, FactorResult> } {
  const factors: Record<string, FactorResult> = {};

  // 1. procurement_maturity — from maturity assessments
  if (avgMaturityScore !== null) {
    let pmScore: number;
    if (avgMaturityScore <= 1.5) pmScore = 90;
    else if (avgMaturityScore <= 2.5) pmScore = 75;
    else if (avgMaturityScore <= 3.5) pmScore = 55;
    else if (avgMaturityScore <= 4.5) pmScore = 35;
    else pmScore = 15;
    factors.procurement_maturity = { score: pmScore, rationale: `Maturity score: ${avgMaturityScore.toFixed(1)}/5; ${pmScore >= 75 ? "nascent/developing — high improvement opportunity" : pmScore <= 35 ? "advanced/world-class — limited further gains" : "established — moderate improvement headroom"}`, tier: 1, confidence: 1.0 };
  } else {
    factors.procurement_maturity = { score: 65, rationale: "[Inferred T4] No maturity assessment — assumed developing-level organization", tier: 4, confidence: 0.55 };
  }

  // 2. automation_potential — from PO type distribution
  if (cs && cs.record_count > 0) {
    const totalRecords = cs.record_count;
    const nonPoCount = cs.po_type_counts["Non-PO"] || 0;
    const nonPoPct = nonPoCount / totalRecords;
    // Also count records with no po_type at all as potentially non-PO
    const totalPoTyped = Object.values(cs.po_type_counts).reduce((a, b) => a + b, 0);
    const effectiveNonPoPct = totalPoTyped > 0 ? nonPoPct : 0.5; // If no PO type data, assume 50% non-PO

    let apScore: number;
    if (effectiveNonPoPct > 0.40) apScore = 85;
    else if (effectiveNonPoPct > 0.20) apScore = 65;
    else if (effectiveNonPoPct > 0.10) apScore = 45;
    else apScore = 20;
    factors.automation_potential = { score: apScore, rationale: `Non-PO rate: ${(effectiveNonPoPct * 100).toFixed(0)}% of ${totalRecords} records; ${apScore >= 80 ? "high non-PO rate — automation/compliance opportunity" : apScore <= 25 ? "well-automated procurement" : "moderate automation opportunity"}`, tier: totalPoTyped > 0 ? 2 : 4, confidence: totalPoTyped > 0 ? 0.90 : 0.55 };
  } else {
    factors.automation_potential = { score: 55, rationale: "[Inferred T4] No PO type data — assumed moderate automation gap", tier: 4, confidence: 0.55 };
  }

  // 3. spec_tolerance
  let stScore: number;
  if (matchesKeywords(categoryName, OVER_SPEC_KEYWORDS)) {
    stScore = 70;
  } else if (isCommodity(categoryName)) {
    stScore = 55;
  } else {
    stScore = 35;
  }
  factors.spec_tolerance = { score: stScore, rationale: `${stScore >= 65 ? "Category with high spec variability — spec standardization opportunity" : stScore <= 40 ? "Standard category — limited spec optimization" : "Commodity — some spec tolerance"}`, tier: 2, confidence: 0.80 };

  // 4. demand_variability — CoV of monthly spend
  if (cs && cs.monthly_spend.size >= 3) {
    const cov = monthlySpendCoV(cs.monthly_spend);
    let dvScore: number;
    if (cov > 0.8) dvScore = 80;
    else if (cov > 0.4) dvScore = 55;
    else dvScore = 30;
    factors.demand_variability = { score: dvScore, rationale: `Monthly spend CoV=${cov.toFixed(2)}; ${cov > 0.8 ? "high variability — demand management opportunity" : cov > 0.4 ? "moderate variability" : "stable demand"}`, tier: 2, confidence: 0.90 };
  } else {
    factors.demand_variability = { score: 45, rationale: "[Inferred T4] Insufficient monthly data for variability analysis", tier: 4, confidence: 0.55 };
  }

  // 5. inventory_exposure — direct material keywords
  const catSpend = cs?.total_spend || 0;
  const directPct = totalSpend > 0 ? (catSpend / totalSpend) : 0;
  const isDirect = matchesKeywords(categoryName, DIRECT_MATERIAL_KEYWORDS);
  let ieScore: number;
  if (isDirect && directPct > 0.30) ieScore = 75;
  else if (isDirect && directPct > 0.10) ieScore = 55;
  else ieScore = 30;
  factors.inventory_exposure = { score: ieScore, rationale: `${isDirect ? `Direct material category (${(directPct * 100).toFixed(1)}% of total spend)` : "Indirect category"} — ${ieScore >= 70 ? "significant inventory exposure" : ieScore >= 50 ? "moderate inventory impact" : "limited inventory implication"}`, tier: 2, confidence: 0.85 };

  // 6. tco_gap — supplier clusters + duplicates
  const clusters = cs?.normalized_supplier_clusters || 0;
  let tcoScore: number;
  if (clusters > 3) tcoScore = 80;
  else if (clusters === 2 || clusters === 3) tcoScore = 55;
  else tcoScore = 25;
  factors.tco_gap = { score: tcoScore, rationale: `${clusters} normalized supplier cluster(s); ${clusters > 3 ? "multiple similar suppliers — TCO optimization and consolidation opportunity" : clusters <= 1 ? "single supplier entity" : "some supplier overlap detected"}`, tier: 2, confidence: 0.80 };

  const avg = Math.round(Object.values(factors).reduce((s, f) => s + f.score, 0) / 6);
  return { score: avg, factors };
}

// ========================================================================
// FINANCIAL FACTORS (5 factors, 20% weight)
// ========================================================================

function scoreFinancialFactors(
  initiative: any,
): { score: number; factors: Record<string, FactorResult> } {
  const factors: Record<string, FactorResult> = {};
  const target = Number(initiative.target_amount) || 0;
  const leverType = (initiative.lever_type || "renegotiation").toLowerCase();
  const complexity = LEVER_COMPLEXITY[leverType] || "medium";

  // 1. npv_3yr — approximation from target amount (real NPV fed back when available)
  // Assume 3yr NPV ≈ 2.5× annual target (discounted with ramp)
  const estNpv = target * 2.5;
  let npvScore: number;
  if (estNpv > 1e6) npvScore = 90;
  else if (estNpv > 5e5) npvScore = 75;
  else if (estNpv > 1e5) npvScore = 60;
  else if (estNpv > 5e4) npvScore = 40;
  else npvScore = 20;
  factors.npv_3yr = { score: npvScore, rationale: `Est. 3yr NPV: $${(estNpv / 1000).toFixed(0)}K (from target $${(target / 1000).toFixed(0)}K × 2.5)`, tier: 2, confidence: 0.80 };

  // 2. cta_pct_of_savings
  const ctaPct = (CTA_PCT[leverType] || 0.08) * 100;
  let ctaScore: number;
  if (ctaPct < 8) ctaScore = 90;
  else if (ctaPct < 15) ctaScore = 70;
  else if (ctaPct < 25) ctaScore = 50;
  else ctaScore = 30;
  factors.cta_pct_of_savings = { score: ctaScore, rationale: `CTA: ${ctaPct.toFixed(0)}% of savings for ${leverType}; ${ctaPct < 8 ? "low implementation cost" : ctaPct >= 25 ? "high CTA — ensure ROI justification" : "moderate CTA"}`, tier: 2, confidence: 0.90 };

  // 3. working_capital_impact
  let wcScore: number;
  if (leverType === "payment_terms" || leverType === "payment_term_optimization") wcScore = 85;
  else if (RUN_RATE_LEVERS.has(leverType)) wcScore = 60;
  else wcScore = 35;
  factors.working_capital_impact = { score: wcScore, rationale: `${leverType === "payment_terms" ? "Payment terms lever — direct WC impact" : RUN_RATE_LEVERS.has(leverType) ? "Run-rate lever with indirect WC implication" : "No direct WC impact"}`, tier: 2, confidence: 0.90 };

  // 4. ebitda_run_rate_vs_onetime
  let rrScore: number;
  if (RUN_RATE_LEVERS.has(leverType)) rrScore = 80;
  else if (ONE_TIME_LEVERS.has(leverType)) rrScore = 35;
  else rrScore = 55;
  factors.ebitda_run_rate_vs_onetime = { score: rrScore, rationale: `${RUN_RATE_LEVERS.has(leverType) ? "Run-rate recurring savings — EBITDA accretive" : ONE_TIME_LEVERS.has(leverType) ? "One-time savings — limited EBITDA run-rate impact" : "Mixed savings profile"}`, tier: 2, confidence: 0.90 };

  // 5. implementation_risk
  const irScore = complexity === "quick" ? 85 : complexity === "medium" ? 60 : 35;
  factors.implementation_risk = { score: irScore, rationale: `${leverType} is ${complexity} complexity; ${complexity === "quick" ? "low risk, fast implementation" : complexity === "complex" ? "complex, requires planning and resources" : "moderate implementation effort"}`, tier: 2, confidence: 0.90 };

  const avg = Math.round(Object.values(factors).reduce((s, f) => s + f.score, 0) / 5);
  return { score: avg, factors };
}

// ========================================================================
// Score drivers extraction
// ========================================================================

function extractScoreDrivers(factorScores: Record<string, FactorResult>): { top: ScoreDriver[]; bottom: ScoreDriver[] } {
  const entries = Object.entries(factorScores).map(([name, f]) => ({ factor_name: name, score: f.score, rationale: f.rationale }));
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  return {
    top: sorted.slice(0, 3),
    bottom: sorted.slice(-3).reverse(),
  };
}

// ========================================================================
// Percentile normalization
// ========================================================================

function normalizeScores(rawScores: number[]): number[] {
  if (rawScores.length <= 1) return rawScores.map(() => 50);
  const min = Math.min(...rawScores);
  const max = Math.max(...rawScores);
  if (max === min) return rawScores.map(() => 50);
  return rawScores.map(raw => Math.round(10 + ((raw - min) / (max - min)) * 85));
}

// ========================================================================
// Main scoring function
// ========================================================================

export function scoreInitiatives(
  initiatives: any[],
  spendRecords: any[],
  categories: any[],
  totalSpend: number,
  contracts?: any[],         // Optional: contracts table rows for this engagement
  maturityScores?: any[],    // Optional: procurement_maturity_assessments rows
  engagementData?: { geography?: string | null; procurement_maturity?: string | null },
): InitiativeScore[] {
  if (initiatives.length === 0) return [];

  const catStats = buildCategoryStats(spendRecords, categories);
  const catMap = new Map<number, string>();
  for (const c of categories) catMap.set(c.id, c.name);

  // Index contracts by category_id
  const contractsByCategory = new Map<number, any[]>();
  for (const c of (contracts || [])) {
    const cid = c.category_id;
    if (cid) {
      if (!contractsByCategory.has(cid)) contractsByCategory.set(cid, []);
      contractsByCategory.get(cid)!.push(c);
    }
  }

  // Compute average maturity score across all dimensions
  let avgMaturityScore: number | null = null;
  if (maturityScores && maturityScores.length > 0) {
    avgMaturityScore = maturityScores.reduce((s: number, a: any) => s + (Number(a.score) || 0), 0) / maturityScores.length;
  }

  const today = new Date().toISOString().split("T")[0];
  const geography = engagementData?.geography || null;

  // First pass: compute raw scores
  const rawResults = initiatives.map(init => {
    const categoryId = init.category_id;
    const categoryName = categoryId ? (catMap.get(categoryId) || `Category ${categoryId}`) : "Uncategorized";
    const cs = categoryId ? catStats.get(categoryId) : undefined;
    const leverType = (init.lever_type || "renegotiation").toLowerCase();
    const complexity = LEVER_COMPLEXITY[leverType] || "medium";
    const contractsForCat = categoryId ? (contractsByCategory.get(categoryId) || []) : [];

    // Score all 4 dimensions
    const contract = scoreContractFactors(cs, contractsForCat, today);
    const market = scoreMarketFactors(cs, categoryName, geography);
    const operational = scoreOperationalFactors(cs, categoryName, totalSpend, avgMaturityScore);
    const financial = scoreFinancialFactors(init);

    // Confidence-weighted dimension weights
    // Contract dimension weight is reduced by its confidence, deficit redistributes
    const contractEffWeight = BASE_WEIGHTS.contract * contract.confidence;
    const deficit = BASE_WEIGHTS.contract - contractEffWeight;
    // Redistribute deficit proportionally to market and operational
    const marketBoost = deficit * (BASE_WEIGHTS.market / (BASE_WEIGHTS.market + BASE_WEIGHTS.operational));
    const opsBoost = deficit * (BASE_WEIGHTS.operational / (BASE_WEIGHTS.market + BASE_WEIGHTS.operational));
    const effWeights = {
      contract: contractEffWeight,
      market: BASE_WEIGHTS.market + marketBoost,
      operational: BASE_WEIGHTS.operational + opsBoost,
      financial: BASE_WEIGHTS.financial,
    };

    // Merge all factors
    const factor_scores: Record<string, FactorResult> = {
      ...contract.factors,
      ...market.factors,
      ...operational.factors,
      ...financial.factors,
    };

    // Weighted total (raw)
    const raw_total = Math.round(
      contract.score * effWeights.contract +
      market.score * effWeights.market +
      operational.score * effWeights.operational +
      financial.score * effWeights.financial
    );

    return {
      init, categoryName, leverType, complexity,
      contract_score: contract.score, contract_confidence: contract.confidence,
      market_score: market.score, operational_score: operational.score, financial_score: financial.score,
      factor_scores, raw_total, effWeights,
    };
  });

  // Second pass: percentile normalization
  const rawTotals = rawResults.map(r => r.raw_total);
  const normalizedTotals = normalizeScores(rawTotals);

  return rawResults.map((r, i) => {
    const total_score = normalizedTotals[i];
    const score_drivers = extractScoreDrivers(r.factor_scores);

    // Probability
    const probability = clamp(Math.round((total_score / 100 * 0.8 + 0.1) * 100) / 100, 0.1, 0.9);
    const base_target = Number(r.init.target_amount) || 0;
    const risk_adjusted_target = Math.round(base_target * probability);

    // Phase assignment
    let phase = PHASE_MAP[r.leverType] || "medium_term";

    // Override: if contract expires <90d and currently medium_term, promote to quick_win
    const categoryId = r.init.category_id;
    const contractsForCat = categoryId ? (contractsByCategory.get(categoryId) || []) : [];
    if (phase === "medium_term" && contractsForCat.length > 0) {
      const endDate = contractsForCat[0].end_date;
      if (endDate) {
        const daysToExpiry = daysBetween(today, endDate);
        if (daysToExpiry < 90 && daysToExpiry >= 0) {
          phase = "quick_win";
        }
      }
    }

    // Priority classification
    let priority: InitiativeScore["priority"];
    if (total_score >= 70 && phase === "quick_win") priority = "Quick Win";
    else if (total_score >= 55) priority = "Strategic";
    else if (total_score >= 35) priority = "Long-term";
    else priority = "Deprioritize";

    const time_horizon: InitiativeScore["time_horizon"] =
      phase === "quick_win" ? "0-90 days" : phase === "medium_term" ? "90-180 days" : "180-365 days";

    // Build scoring_json for caching
    const scoring_json = JSON.stringify({
      dimensions: {
        contract: { score: r.contract_score, confidence: r.contract_confidence, weight: r.effWeights.contract },
        market: { score: r.market_score, weight: r.effWeights.market },
        operational: { score: r.operational_score, weight: r.effWeights.operational },
        financial: { score: r.financial_score, weight: r.effWeights.financial },
      },
      factors: r.factor_scores,
      total_raw: r.raw_total,
      total_normalized: total_score,
      probability,
      phase,
    });

    return {
      initiative_id: r.init.id,
      initiative_name: r.init.name,
      category_name: r.categoryName,
      lever_type: r.leverType,
      contract_score: r.contract_score,
      market_score: r.market_score,
      operational_score: r.operational_score,
      financial_score: r.financial_score,
      contract_confidence: r.contract_confidence,
      effective_weights: r.effWeights,
      factor_scores: r.factor_scores,
      total_score,
      score_drivers,
      base_target,
      probability,
      risk_adjusted_target,
      phase,
      priority,
      time_horizon,
      scoring_json,
    };
  });
}
