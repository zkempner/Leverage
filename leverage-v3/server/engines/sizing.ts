// Deterministic savings sizing engine — no AI, no randomness.
// target = category_spend × addressable_pct × savings_rate × lever_industry_adj × size_adj × maturity_adj × geo_adj
// Uses lever×industry specific adjustments from benchmarks engine.
// Uses category-specific overrides when available for higher accuracy.

import {
  getLeverIndustryAdjustment,
  SIZE_MULTIPLIERS,
  MATURITY_MULTIPLIERS,
  GEOGRAPHY_MULTIPLIERS,
  getCategoryOverride,
} from "./benchmarks";

export interface SizingResult {
  name: string;
  lever_type: string;
  category_id: number | null;
  category_name: string;
  addressable_spend: number;
  addressable_pct: number;
  benchmark_rate: number;
  adjustment_factor: number;
  target_amount: number;
  confidence: string;
  formula: string;
  potential_overlap?: boolean;
  secondary_lever?: string;
  secondary_target?: number;
}

interface SpendCategory {
  category_id: number | null;
  category_name: string;
  total_amount: number;
  record_count: number;
  supplier_count: number;
  top_supplier_concentration?: number; // % of spend from top supplier
}

interface BenchmarkRef {
  lever_type: string;
  addressable_pct: number;
  savings_rate: number;
  source: string;
}

// ---- Minimum initiative threshold ----
// Initiatives below this amount are rolled into tail spend
const MIN_INITIATIVE_THRESHOLD = 25_000;

// Category name → best lever type mapping (keyword-based)
export const CATEGORY_LEVER_MAP: [RegExp, string][] = [
  [/raw\s*material|metal|steel|aluminum|copper/i, "renegotiation"],
  [/chemical|resin|polymer|solvent/i, "renegotiation"],
  [/it\b|software|licen[cs]|saas|hardware|computer/i, "contract_term_optimization"],
  [/facilit|janitor|security|cleaning|building/i, "volume_consolidation"],
  [/staff|temp\s*labor|contingent|workforce/i, "demand_reduction"],
  [/freight|shipping|logistics|transport/i, "process_efficiency"],
  [/packag/i, "spec_change"],
  [/contract\s*manufact|toll|co-?pack/i, "make_vs_buy"],
  [/energy|electric|gas|fuel|utilit/i, "demand_reduction"],
  [/office|supplies|print/i, "volume_consolidation"],
  [/travel|hotel|lodg|air/i, "demand_reduction"],
  [/market|advertis|media/i, "demand_reduction"],
  [/consult|profession|legal|audit/i, "renegotiation"],
  [/mro|maintenance|repair/i, "volume_consolidation"],
  [/insur/i, "renegotiation"],
  [/telecom|phone|network/i, "contract_term_optimization"],
  [/cloud|hosting|data\s*center/i, "contract_term_optimization"],
  [/recruit|talent/i, "demand_reduction"],
  [/fleet|vehicle|auto/i, "volume_consolidation"],
  [/warehouse|storage/i, "process_efficiency"],
];

// Secondary lever opportunities: primary lever → secondary lever + % of primary target
// Some categories have a natural second savings lever beyond the primary
const SECONDARY_LEVER_MAP: [RegExp, { secondary: string; pct_of_primary: number }][] = [
  [/staff|temp\s*labor|contingent|workforce/i, { secondary: "renegotiation", pct_of_primary: 0.40 }],   // Rate card renegotiation on top of demand reduction
  [/it\b|software|licen[cs]|saas/i,           { secondary: "demand_reduction", pct_of_primary: 0.35 }], // License rationalization on top of contract optimization
  [/freight|shipping|logistics|transport/i,    { secondary: "volume_consolidation", pct_of_primary: 0.30 }], // Lane consolidation on top of process efficiency
  [/facilit|janitor|security|cleaning/i,       { secondary: "renegotiation", pct_of_primary: 0.35 }],   // Contract rebid on top of consolidation
  [/mro|maintenance|repair/i,                  { secondary: "spec_change", pct_of_primary: 0.30 }],     // Spec standardization on top of consolidation
  [/energy|electric|gas|fuel|utilit/i,         { secondary: "process_efficiency", pct_of_primary: 0.25 }], // Usage optimization on top of demand reduction
  [/travel|hotel|lodg|air/i,                   { secondary: "process_efficiency", pct_of_primary: 0.30 }], // Policy enforcement on top of demand reduction
  [/market|advertis|media/i,                   { secondary: "renegotiation", pct_of_primary: 0.35 }],   // Agency rate renegotiation on top of demand reduction
  [/cloud|hosting|data\s*center/i,             { secondary: "demand_reduction", pct_of_primary: 0.40 }], // Right-sizing instances on top of contract optimization
  [/packag/i,                                  { secondary: "volume_consolidation", pct_of_primary: 0.30 }], // Supplier consolidation on top of spec change
  [/consult|profession/i,                      { secondary: "demand_reduction", pct_of_primary: 0.30 }], // Scope reduction on top of rate renegotiation
  [/fleet|vehicle|auto/i,                      { secondary: "demand_reduction", pct_of_primary: 0.25 }], // Fleet right-sizing on top of consolidation
];

// Default benchmarks per lever type (mid values as decimals)
export const LEVER_BENCHMARKS: Record<string, BenchmarkRef> = {
  volume_consolidation: { lever_type: "volume_consolidation", addressable_pct: 0.60, savings_rate: 0.12, source: "Hackett Group CPO Agenda 2024 (n=400+)" },
  renegotiation: { lever_type: "renegotiation", addressable_pct: 0.70, savings_rate: 0.07, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+)" },
  contract_term_optimization: { lever_type: "contract_term_optimization", addressable_pct: 0.50, savings_rate: 0.05, source: "Hackett Group CPO Agenda 2024; WorldCC 2023" },
  demand_reduction: { lever_type: "demand_reduction", addressable_pct: 0.40, savings_rate: 0.15, source: "McKinsey Procurement Practice 2022 (practitioner consensus)" },
  process_efficiency: { lever_type: "process_efficiency", addressable_pct: 0.50, savings_rate: 0.08, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+)" },
  spec_change: { lever_type: "spec_change", addressable_pct: 0.30, savings_rate: 0.12, source: "SAVE International value analysis 2023 (practitioner consensus)" },
  make_vs_buy: { lever_type: "make_vs_buy", addressable_pct: 0.40, savings_rate: 0.15, source: "ISM manufacturing sourcing benchmarks 2023" },
};

// Backward-compat exports (now delegated to benchmarks engine)
export const INDUSTRY_ADJ: Record<string, number> = {
  chemicals: 1.10, manufacturing: 1.00, technology: 0.90,
  healthcare: 0.85, retail: 1.05, financial_services: 0.80,
  energy_utilities: 1.05, construction: 1.00, food_agriculture: 1.05,
  government: 0.80, transportation: 1.00,
};

export const SIZE_ADJ: Record<string, number> = SIZE_MULTIPLIERS;

function matchLever(categoryName: string, supplierCount: number, topSupplierConcentration: number): string {
  const name = categoryName || "";

  // Try keyword match first
  for (const [pattern, lever] of CATEGORY_LEVER_MAP) {
    if (pattern.test(name)) return lever;
  }

  // Heuristic: high single-supplier concentration → renegotiation
  if (topSupplierConcentration > 0.6) return "renegotiation";

  // Many suppliers → consolidation opportunity
  if (supplierCount >= 10) return "volume_consolidation";

  // Default
  return "renegotiation";
}

function matchSecondaryLever(categoryName: string): { secondary: string; pct_of_primary: number } | null {
  const name = categoryName || "";
  for (const [pattern, result] of SECONDARY_LEVER_MAP) {
    if (pattern.test(name)) return result;
  }
  return null;
}

function formatCurrency(v: number): string {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function normalizeIndustry(industry: string): string {
  const lower = (industry || "").toLowerCase();
  if (lower.includes("chem") || lower.includes("petro")) return "chemicals";
  if (lower.includes("tech") || lower.includes("software") || lower.includes("saas")) return "technology";
  if (lower.includes("health") || lower.includes("pharma") || lower.includes("medical")) return "healthcare";
  if (lower.includes("retail") || lower.includes("cpg") || lower.includes("consumer")) return "retail";
  if (lower.includes("financ") || lower.includes("bank") || lower.includes("insur")) return "financial_services";
  if (lower.includes("energy") || lower.includes("utilit") || lower.includes("power")) return "energy_utilities";
  if (lower.includes("construct") || lower.includes("engineer")) return "construction";
  if (lower.includes("food") || lower.includes("agri") || lower.includes("beverage")) return "food_agriculture";
  if (lower.includes("govern") || lower.includes("public") || lower.includes("federal")) return "government";
  if (lower.includes("transport") || lower.includes("logistic") || lower.includes("airline")) return "transportation";
  if (lower.includes("manufact") || lower.includes("industrial")) return "manufacturing";
  return "manufacturing";
}

function normalizeSize(size: string): string {
  const lower = (size || "").toLowerCase();
  if (lower.includes("small") || lower.includes("<")) return "small";
  if (lower.includes("enterprise") || lower.includes(">$10") || lower.includes(">10b")) return "enterprise";
  if (lower.includes("large") || lower.includes(">$2") || lower.includes(">2b")) return "large";
  if (lower.includes("lower") && lower.includes("mid")) return "lower_mid";
  return "mid_market";
}

export function sizeInitiatives(
  categories: SpendCategory[],
  industry: string,
  companySize: string,
  maturity?: string,
  geography?: string,
): SizingResult[] {
  const normIndustry = normalizeIndustry(industry);
  const normSize = normalizeSize(companySize);
  const szAdj = SIZE_ADJ[normSize] ?? 1.0;
  const matAdj = maturity ? (MATURITY_MULTIPLIERS[maturity.toLowerCase().trim()] ?? 1.0) : 1.0;
  const geoAdj = geography ? (GEOGRAPHY_MULTIPLIERS[geography.toLowerCase().trim()] ?? 1.0) : 1.0;

  const results: SizingResult[] = [];

  // Sort by spend descending
  const sorted = [...categories].sort((a, b) => b.total_amount - a.total_amount);

  // Threshold-based filtering: include categories above $50K or top 0.5% of spend
  const totalSpend = sorted.reduce((s, c) => s + c.total_amount, 0);
  const minThreshold = Math.max(50000, totalSpend * 0.005);

  // Track tail spend for GPO/catalog initiative
  let tailSpendTotal = 0;
  let tailSpendCatCount = 0;

  // Track lever+supplier combos for overlap detection
  // key = lever_type, value = set of supplier-related info (category names as proxy)
  const leverSupplierMap: Map<string, Set<string>> = new Map();

  // Helper: extract supplier keywords from category name for overlap proxy
  function getCategoryKeywords(catName: string): string[] {
    return (catName || "").toLowerCase().split(/[\s\/&,\-]+/).filter(w => w.length > 2);
  }

  for (const cat of sorted) {
    if (cat.total_amount <= 0) continue;

    // Categories below threshold → accumulate as tail spend
    if (cat.total_amount < minThreshold) {
      tailSpendTotal += cat.total_amount;
      tailSpendCatCount++;
      continue;
    }

    const topConc = cat.top_supplier_concentration ?? 0;
    const lever = matchLever(cat.category_name, cat.supplier_count, topConc);

    // Check category-specific benchmark overrides BEFORE falling back to lever defaults
    const catOverride = getCategoryOverride(cat.category_name);
    const benchmark = catOverride
      ? { lever_type: lever, addressable_pct: catOverride.addressable_pct, savings_rate: catOverride.savings_pct, source: catOverride.source }
      : (LEVER_BENCHMARKS[lever] || LEVER_BENCHMARKS["renegotiation"]);

    // Lever×industry specific adjustment (not flat multiplier)
    const leverIndAdj = getLeverIndustryAdjustment(lever, normIndustry);
    const combinedAdj = Math.round(leverIndAdj * szAdj * matAdj * geoAdj * 100) / 100;

    const addressableSpend = cat.total_amount * benchmark.addressable_pct;
    let target = Math.round(addressableSpend * benchmark.savings_rate * combinedAdj);

    if (target <= 0) continue;

    // Overlapping lever detection: if same lever has overlapping supplier keywords, flag + reduce
    let potentialOverlap = false;
    const catKeywords = getCategoryKeywords(cat.category_name);
    if (!leverSupplierMap.has(lever)) {
      leverSupplierMap.set(lever, new Set());
    }
    const existingKeywords = leverSupplierMap.get(lever)!;
    const overlappingWords = catKeywords.filter(kw => existingKeywords.has(kw));
    if (overlappingWords.length >= 2) {
      // Significant overlap detected — reduce target by 30%
      potentialOverlap = true;
      target = Math.round(target * 0.70);
    }
    // Register this category's keywords
    for (const kw of catKeywords) existingKeywords.add(kw);

    // Apply minimum initiative threshold — if below $25K, roll into tail
    if (target < MIN_INITIATIVE_THRESHOLD) {
      tailSpendTotal += cat.total_amount;
      tailSpendCatCount++;
      continue;
    }

    // Confidence based on data quality
    let confidence: string;
    if (catOverride && catOverride.confidence_level === "high" && cat.record_count > 5) confidence = "High";
    else if (cat.record_count > 10 && cat.supplier_count >= 3 && cat.supplier_count <= 8) confidence = "High";
    else if (cat.record_count > 5 && cat.supplier_count < 5) confidence = "High";
    else if (cat.record_count < 3) confidence = "Low";
    else confidence = "Medium";

    const leverVerb: Record<string, string> = {
      volume_consolidation: "Consolidate",
      renegotiation: "Renegotiate",
      contract_term_optimization: "Optimize terms",
      demand_reduction: "Reduce demand",
      process_efficiency: "Streamline",
      spec_change: "Re-specify",
      make_vs_buy: "Evaluate make/buy",
    };

    const name = `${leverVerb[lever] || "Optimize"} ${cat.category_name} — ${cat.supplier_count} supplier${cat.supplier_count !== 1 ? "s" : ""}`;

    // Build formula showing all adjustment factors
    const formulaParts: string[] = [
      `${formatCurrency(cat.total_amount)} × ${(benchmark.addressable_pct * 100).toFixed(0)}% addressable × ${(benchmark.savings_rate * 100).toFixed(0)}% savings`,
    ];
    const adjParts: string[] = [`${normIndustry}×${lever}=${leverIndAdj}`, `size=${szAdj}`];
    if (matAdj !== 1.0) adjParts.push(`maturity=${matAdj}`);
    if (geoAdj !== 1.0) adjParts.push(`geo=${geoAdj}`);
    formulaParts.push(`× ${combinedAdj} adj (${adjParts.join(", ")})`);
    if (potentialOverlap) formulaParts.push(`× 0.70 overlap discount`);
    formulaParts.push(`= ${formatCurrency(target)}`);
    if (catOverride) formulaParts.push(`[category override: ${cat.category_name}]`);

    const result: SizingResult = {
      name,
      lever_type: lever,
      category_id: cat.category_id,
      category_name: cat.category_name,
      addressable_spend: Math.round(addressableSpend),
      addressable_pct: benchmark.addressable_pct,
      benchmark_rate: benchmark.savings_rate,
      adjustment_factor: combinedAdj,
      target_amount: target,
      confidence,
      formula: formulaParts.join(" "),
    };

    if (potentialOverlap) result.potential_overlap = true;

    // Secondary lever detection
    const secondaryInfo = matchSecondaryLever(cat.category_name);
    if (secondaryInfo) {
      const secondaryTarget = Math.round(target * secondaryInfo.pct_of_primary);
      if (secondaryTarget >= MIN_INITIATIVE_THRESHOLD) {
        result.secondary_lever = secondaryInfo.secondary;
        result.secondary_target = secondaryTarget;
      }
    }

    results.push(result);
  }

  // Add tail spend initiative if significant
  // Per Ardent Partners: 6-12% savings on tail spend via GPO/catalog consolidation
  if (tailSpendTotal > 10000 && tailSpendCatCount >= 2) {
    const tailAddressable = tailSpendTotal * 0.50;
    const tailRate = 0.08;
    const tailAdj = szAdj * matAdj * geoAdj;
    const tailTarget = Math.round(tailAddressable * tailRate * tailAdj);

    if (tailTarget > 0) {
      results.push({
        name: `Tail Spend Consolidation — ${tailSpendCatCount} small categories via GPO/catalog`,
        lever_type: "spend_under_management",
        category_id: null,
        category_name: "Tail Spend (Aggregated)",
        addressable_spend: Math.round(tailAddressable),
        addressable_pct: 0.50,
        benchmark_rate: tailRate,
        adjustment_factor: Math.round(tailAdj * 100) / 100,
        target_amount: tailTarget,
        confidence: "Medium",
        formula: `${formatCurrency(tailSpendTotal)} tail spend × 50% addressable × 8% GPO savings × ${Math.round(tailAdj * 100) / 100} adj = ${formatCurrency(tailTarget)} (source: Ardent Partners SUM 2024, n=300+)`,
      });
    }
  }

  return results;
}
