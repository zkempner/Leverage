// Kraljic Matrix Engine — 100% deterministic.
// For each spend category, computes Supply Risk (x-axis) and Profit Impact (y-axis),
// assigns a quadrant using dynamic median boundaries, and generates strategy recommendations
// with transition paths and recommended contract types.

export interface KraljicPosition {
  category_id: number;
  category_name: string;
  category_level: string;

  // Axis scores (0-100)
  supply_risk: number;
  profit_impact: number;

  // Sub-scores for drill-down
  risk_factors: Record<string, { score: number; rationale: string }>;
  impact_factors: Record<string, { score: number; rationale: string }>;

  // Quadrant
  quadrant: "Leverage" | "Strategic" | "Bottleneck" | "Non-critical";

  // Strategy
  recommended_strategy: string;
  recommended_levers: string[];
  recommended_contract_type: string;

  // Transition path
  target_quadrant: "Leverage" | "Strategic" | "Bottleneck" | "Non-critical";
  transition_actions: string[];
  transition_timeline: string;

  // Composite risk score (0-100)
  category_risk_score: number;

  // Spend data
  total_spend: number;
  supplier_count: number;
  record_count: number;
  top_supplier: string;
  top_supplier_pct: number;
}

// ---- Quadrant strategies ----
const QUADRANT_STRATEGIES: Record<string, string> = {
  "Leverage": "Competitive bidding, volume consolidation, aggressive negotiation. Maximize savings through market leverage.",
  "Strategic": "Supplier development, risk mitigation, long-term contracts. Build partnerships with critical suppliers.",
  "Bottleneck": "Secure supply, qualify alternatives, reduce dependency. Safety stock and contingency planning.",
  "Non-critical": "Simplify and automate. P-card, catalogs, consolidate into GPO. Reduce transaction costs.",
};

const QUADRANT_LEVERS: Record<string, string[]> = {
  "Leverage": ["volume_consolidation", "renegotiation", "competitive_bidding", "reverse_auction"],
  "Strategic": ["contract_term_optimization", "supplier_development", "joint_value_engineering", "risk_sharing"],
  "Bottleneck": ["supply_assurance", "inventory_buffer", "alternative_qualification", "spec_change"],
  "Non-critical": ["process_efficiency", "catalog_buying", "p_card", "demand_reduction", "spend_under_management"],
};

// ---- Recommended contract types per quadrant ----
const QUADRANT_CONTRACT_TYPES: Record<string, string> = {
  "Leverage": "Competitive short-term (1-2 yr), market-indexed pricing",
  "Strategic": "Long-term partnership (3-5 yr), gain-sharing, joint KPIs",
  "Bottleneck": "Secure supply agreement, buffer stock, penalty clauses",
  "Non-critical": "Blanket PO, P-card, catalog buying, auto-renewal",
};

// ---- Transition path recommendations ----
interface TransitionPath {
  target: "Leverage" | "Strategic" | "Bottleneck" | "Non-critical";
  actions: string[];
  timeline: string;
}

const QUADRANT_TRANSITIONS: Record<string, TransitionPath> = {
  "Bottleneck": {
    target: "Strategic",
    actions: [
      "Develop supplier partnerships and invest in joint innovation",
      "Negotiate multi-year agreements with volume commitments",
      "Establish dual-source strategy to reduce single-point-of-failure risk",
      "Invest in supplier capability development programs",
    ],
    timeline: "12-24 months",
  },
  "Non-critical": {
    target: "Leverage",
    actions: [
      "Aggregate demand across business units to increase volume",
      "Run competitive bids with standardized specifications",
      "Consolidate vendors to reduce fragmentation",
      "Establish framework agreements with preferred suppliers",
    ],
    timeline: "6-12 months",
  },
  "Strategic": {
    target: "Leverage",
    actions: [
      "Qualify alternative suppliers to reduce dependency",
      "Standardize specifications to broaden supply base",
      "Reduce switching costs through modular design",
      "Develop internal capabilities to reduce reliance",
    ],
    timeline: "18-36 months",
  },
  "Leverage": {
    target: "Leverage",
    actions: [
      "Continue optimizing through competitive pressure",
      "Increase bid frequency to capture market improvements",
      "Explore reverse auctions for commoditized items",
      "Benchmark regularly against market indices",
    ],
    timeline: "Ongoing (quarterly review)",
  },
};

// ---- Keyword classification ----
const COMMODITY_KEYWORDS = ["metal", "chemical", "plastic", "paper", "fuel", "electricity", "gas", "steel", "lumber", "resin", "raw material", "packaging"];
const STANDARD_SERVICE_KEYWORDS = ["staffing", "facilities", "janitorial", "security", "temp"];
const SPECIALIZED_KEYWORDS = ["consulting", "legal", "it custom", "engineering", "advisory", "audit"];
const CRITICAL_KEYWORDS = ["energy", "raw material", "mro", "contract manufacturing", "custom part", "production"];
const IMPORTANT_KEYWORDS = ["it", "staffing", "logistics", "transport", "freight"];
const NONCRITICAL_KEYWORDS = ["office", "travel", "marketing", "supplies", "print", "subscription"];
const DIRECT_KEYWORDS = ["raw material", "packaging", "manufacturing", "mro", "energy", "production", "metal", "chemical", "resin"];
const SEMI_DIRECT_KEYWORDS = ["logistics", "staffing", "freight", "transport", "warehousing"];

function matchesAny(name: string, keywords: string[]): boolean {
  const lower = name.toLowerCase();
  return keywords.some(k => lower.includes(k));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
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

function median(values: number[]): number {
  if (values.length === 0) return 50; // default
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ---- Supply Risk (X-axis) ----
function computeSupplyRisk(
  categoryName: string,
  supplierSpend: Record<string, number>,
  totalCatSpend: number,
  supplierCount: number,
): { score: number; factors: Record<string, { score: number; rationale: string }> } {
  const factors: Record<string, { score: number; rationale: string }> = {};

  // 1. supplier_concentration (30%)
  const hhi = computeHHI(supplierSpend, totalCatSpend);
  const concScore = clamp(Math.round(hhi * 100), 0, 100);
  factors.supplier_concentration = {
    score: concScore,
    rationale: `HHI=${hhi.toFixed(3)}; ${hhi > 0.25 ? "highly concentrated" : hhi > 0.15 ? "moderately concentrated" : "competitive market"}`,
  };

  // 2. switching_cost_proxy (25%)
  let switchScore: number;
  if (matchesAny(categoryName, COMMODITY_KEYWORDS)) {
    switchScore = 20;
    factors.switching_cost_proxy = { score: switchScore, rationale: "Commodity — easy to switch suppliers" };
  } else if (matchesAny(categoryName, STANDARD_SERVICE_KEYWORDS)) {
    switchScore = 40;
    factors.switching_cost_proxy = { score: switchScore, rationale: "Standard service — moderate switching cost" };
  } else if (matchesAny(categoryName, SPECIALIZED_KEYWORDS)) {
    switchScore = 70;
    factors.switching_cost_proxy = { score: switchScore, rationale: "Specialized service — high switching cost" };
  } else if (supplierCount <= 2 && totalCatSpend > 0) {
    switchScore = 90;
    factors.switching_cost_proxy = { score: switchScore, rationale: "Critical/sole-source — very high switching cost" };
  } else {
    switchScore = 45;
    factors.switching_cost_proxy = { score: switchScore, rationale: "Standard category — moderate switching cost" };
  }

  // 3. supply_market_complexity (25%)
  const cmplxScore = supplierCount <= 2 ? 90 : supplierCount <= 5 ? 65 : supplierCount <= 10 ? 40 : 20;
  factors.supply_market_complexity = {
    score: cmplxScore,
    rationale: `${supplierCount} supplier(s); ${supplierCount <= 2 ? "very limited supply market" : supplierCount <= 5 ? "narrow market" : "broad supply market"}`,
  };

  // 4. demand_criticality (20%)
  let critScore: number;
  if (matchesAny(categoryName, CRITICAL_KEYWORDS)) {
    critScore = 80;
    factors.demand_criticality = { score: critScore, rationale: "Operationally critical category" };
  } else if (matchesAny(categoryName, IMPORTANT_KEYWORDS)) {
    critScore = 55;
    factors.demand_criticality = { score: critScore, rationale: "Important but not mission-critical" };
  } else if (matchesAny(categoryName, NONCRITICAL_KEYWORDS)) {
    critScore = 25;
    factors.demand_criticality = { score: critScore, rationale: "Non-critical category" };
  } else {
    critScore = 45;
    factors.demand_criticality = { score: critScore, rationale: "Standard criticality assumed" };
  }

  const score = Math.round(
    concScore * 0.30 +
    switchScore * 0.25 +
    cmplxScore * 0.25 +
    critScore * 0.20
  );

  return { score: clamp(score, 0, 100), factors };
}

// ---- Profit Impact (Y-axis) ----
function computeProfitImpact(
  categoryName: string,
  totalCatSpend: number,
  totalEngagementSpend: number,
): { score: number; factors: Record<string, { score: number; rationale: string }> } {
  const factors: Record<string, { score: number; rationale: string }> = {};

  // 1. spend_share (40%)
  const sharePct = totalEngagementSpend > 0 ? (totalCatSpend / totalEngagementSpend) * 100 : 0;
  const shareScore = clamp(Math.round(sharePct * 10), 0, 100); // 10% of spend = 100 score
  factors.spend_share = {
    score: shareScore,
    rationale: `${sharePct.toFixed(1)}% of total spend ($${(totalCatSpend / 1000).toFixed(0)}K)`,
  };

  // 2. ebitda_sensitivity (30%)
  let ebitdaScore: number;
  if (matchesAny(categoryName, DIRECT_KEYWORDS)) {
    ebitdaScore = 85;
    factors.ebitda_sensitivity = { score: ebitdaScore, rationale: "Direct cost category — high EBITDA sensitivity" };
  } else if (matchesAny(categoryName, SEMI_DIRECT_KEYWORDS)) {
    ebitdaScore = 60;
    factors.ebitda_sensitivity = { score: ebitdaScore, rationale: "Semi-direct cost — moderate EBITDA sensitivity" };
  } else {
    ebitdaScore = 35;
    factors.ebitda_sensitivity = { score: ebitdaScore, rationale: "Indirect cost — lower EBITDA sensitivity" };
  }

  // 3. volume_leverage (30%)
  const volScore = totalCatSpend > 5e6 ? 90 : totalCatSpend > 1e6 ? 70 : totalCatSpend > 5e5 ? 50 : 25;
  factors.volume_leverage = {
    score: volScore,
    rationale: `$${(totalCatSpend / 1e6).toFixed(2)}M spend; ${totalCatSpend > 1e6 ? "strong negotiation leverage" : "limited volume leverage"}`,
  };

  const score = Math.round(
    shareScore * 0.40 +
    ebitdaScore * 0.30 +
    volScore * 0.30
  );

  return { score: clamp(score, 0, 100), factors };
}

// ---- Quadrant assignment with dynamic boundaries ----
function assignQuadrant(
  supplyRisk: number,
  profitImpact: number,
  riskBoundary: number,
  impactBoundary: number,
): KraljicPosition["quadrant"] {
  if (profitImpact >= impactBoundary && supplyRisk < riskBoundary) return "Leverage";
  if (profitImpact >= impactBoundary && supplyRisk >= riskBoundary) return "Strategic";
  if (profitImpact < impactBoundary && supplyRisk >= riskBoundary) return "Bottleneck";
  return "Non-critical";
}

// ---- Composite category risk score ----
// Combines supply risk, financial exposure, and switching difficulty
function computeCategoryRiskScore(
  supplyRisk: number,
  totalCatSpend: number,
  totalEngagementSpend: number,
  supplierCount: number,
  categoryName: string,
): number {
  // Supply risk component (40%)
  const riskComponent = supplyRisk;

  // Financial exposure component (35%): spend as % of total, scaled
  const spendPct = totalEngagementSpend > 0 ? (totalCatSpend / totalEngagementSpend) * 100 : 0;
  const financialExposure = clamp(Math.round(spendPct * 10), 0, 100);

  // Switching difficulty component (25%): based on category type and supplier count
  let switchDifficulty: number;
  if (matchesAny(categoryName, SPECIALIZED_KEYWORDS) && supplierCount <= 3) {
    switchDifficulty = 90;
  } else if (supplierCount <= 2) {
    switchDifficulty = 80;
  } else if (matchesAny(categoryName, SPECIALIZED_KEYWORDS)) {
    switchDifficulty = 65;
  } else if (supplierCount <= 5) {
    switchDifficulty = 50;
  } else if (matchesAny(categoryName, COMMODITY_KEYWORDS)) {
    switchDifficulty = 20;
  } else {
    switchDifficulty = 35;
  }

  return Math.round(
    riskComponent * 0.40 +
    financialExposure * 0.35 +
    switchDifficulty * 0.25
  );
}

// ---- Main function ----
export function computeKraljicMatrix(
  spendRecords: any[],
  categories: any[],
  totalSpend: number,
): KraljicPosition[] {
  // Build per-category stats from spend records
  const catStats = new Map<number, {
    total_spend: number;
    record_count: number;
    supplier_spend: Record<string, number>;
  }>();

  for (const r of spendRecords) {
    const cid = r.category_id;
    if (!cid) continue;

    if (!catStats.has(cid)) {
      catStats.set(cid, { total_spend: 0, record_count: 0, supplier_spend: {} });
    }
    const s = catStats.get(cid)!;
    const amt = Number(r.amount) || 0;
    s.total_spend += amt;
    s.record_count++;

    const supplier = (r.normalized_supplier_name || r.supplier_name || "").trim();
    if (supplier) {
      s.supplier_spend[supplier] = (s.supplier_spend[supplier] || 0) + amt;
    }
  }

  // First pass: compute raw supply risk and profit impact for all categories
  const rawScores: { catId: number; risk: number; impact: number }[] = [];

  for (const cat of categories) {
    const stats = catStats.get(cat.id);
    if (!stats || stats.total_spend <= 0) continue;
    const supplierSpend = stats.supplier_spend;
    const supplierCount = Object.keys(supplierSpend).length;

    const risk = computeSupplyRisk(cat.name, supplierSpend, stats.total_spend, supplierCount);
    const impact = computeProfitImpact(cat.name, stats.total_spend, totalSpend);

    rawScores.push({ catId: cat.id, risk: risk.score, impact: impact.score });
  }

  // Compute dynamic median boundaries
  const riskBoundary = rawScores.length > 0 ? median(rawScores.map(s => s.risk)) : 50;
  const impactBoundary = rawScores.length > 0 ? median(rawScores.map(s => s.impact)) : 50;

  // Second pass: assign quadrants, strategies, transitions
  const results: KraljicPosition[] = [];

  for (const cat of categories) {
    const stats = catStats.get(cat.id);
    if (!stats || stats.total_spend <= 0) continue;

    const supplierSpend = stats.supplier_spend;
    const supplierCount = Object.keys(supplierSpend).length;

    // Find top supplier
    let topSupplier = "";
    let topSupplierSpend = 0;
    for (const [name, spend] of Object.entries(supplierSpend)) {
      if (spend > topSupplierSpend) {
        topSupplier = name;
        topSupplierSpend = spend;
      }
    }
    const topSupplierPct = stats.total_spend > 0 ? Math.round((topSupplierSpend / stats.total_spend) * 100) : 0;

    const risk = computeSupplyRisk(cat.name, supplierSpend, stats.total_spend, supplierCount);
    const impact = computeProfitImpact(cat.name, stats.total_spend, totalSpend);
    const quadrant = assignQuadrant(risk.score, impact.score, riskBoundary, impactBoundary);

    const transition = QUADRANT_TRANSITIONS[quadrant];
    const categoryRiskScore = computeCategoryRiskScore(
      risk.score, stats.total_spend, totalSpend, supplierCount, cat.name
    );

    results.push({
      category_id: cat.id,
      category_name: cat.name,
      category_level: cat.level || "L2",
      supply_risk: risk.score,
      profit_impact: impact.score,
      risk_factors: risk.factors,
      impact_factors: impact.factors,
      quadrant,
      recommended_strategy: QUADRANT_STRATEGIES[quadrant],
      recommended_levers: QUADRANT_LEVERS[quadrant],
      recommended_contract_type: QUADRANT_CONTRACT_TYPES[quadrant],
      target_quadrant: transition.target,
      transition_actions: transition.actions,
      transition_timeline: transition.timeline,
      category_risk_score: categoryRiskScore,
      total_spend: stats.total_spend,
      supplier_count: supplierCount,
      record_count: stats.record_count,
      top_supplier: topSupplier,
      top_supplier_pct: topSupplierPct,
    });
  }

  // Sort by total spend descending
  results.sort((a, b) => b.total_spend - a.total_spend);

  return results;
}

// ========================================================================
// Category Strategy Generation (v2)
// ========================================================================

export interface CategoryStrategyResult {
  category_id: number;
  category_name: string;
  quadrant: "Leverage" | "Strategic" | "Bottleneck" | "Non-critical";
  quadrant_color: string;

  // Sourcing strategy
  sourcing_strategy: string;
  sourcing_strategy_description: string;

  // Contract strategy
  contract_strategy: string;

  // Top levers
  top_levers: string[];

  // Transition path
  target_quadrant: "Leverage" | "Strategic" | "Bottleneck" | "Non-critical";
  transition_actions: string[];
  transition_timeline: string;

  // Priority
  priority_rank: number;
  profit_impact: number;
  supply_risk: number;
  total_spend: number;
}

const QUADRANT_COLORS: Record<string, string> = {
  "Leverage":     "#22c55e", // green
  "Strategic":    "#3b82f6", // blue
  "Bottleneck":   "#f59e0b", // amber
  "Non-critical": "#9ca3af", // gray
};

const SOURCING_STRATEGIES: Record<string, { strategy: string; description: string }> = {
  "Leverage": {
    strategy: "Multi-source",
    description: "Leverage competitive market dynamics. Run regular competitive bids across 3-5 qualified suppliers. Use reverse auctions for commoditized items. Aggregate demand across business units for maximum volume leverage.",
  },
  "Strategic": {
    strategy: "Dual-source",
    description: "Maintain two strategic suppliers to balance supply security with competitive tension. Invest in supplier development and joint innovation. Negotiate long-term partnerships with gain-sharing mechanisms.",
  },
  "Bottleneck": {
    strategy: "Secure supply",
    description: "Prioritize supply continuity over cost. Qualify alternative suppliers to reduce dependency. Build safety stock for critical items. Negotiate longer-term commitments with existing suppliers in exchange for supply guarantees.",
  },
  "Non-critical": {
    strategy: "Catalog/GPO",
    description: "Minimize procurement effort and transaction costs. Route through group purchasing organizations (GPOs), catalogs, or procurement cards. Automate ordering and approval. Consolidate vendors to reduce administrative burden.",
  },
};

const CONTRACT_STRATEGIES: Record<string, string> = {
  "Leverage": "Short-term competitive contracts (1-2 years). Market-indexed or formula-based pricing. Include rebate/volume discount tiers. Retain right to re-bid at each renewal.",
  "Strategic": "Long-term partnership agreements (3-5 years). Joint KPIs and gain-sharing clauses. Innovation commitments. Include performance-based pricing with shared risk/reward.",
  "Bottleneck": "Supply assurance agreements. Buffer stock provisions. Penalty clauses for non-delivery. Multi-year commitments in exchange for capacity reservation and priority allocation.",
  "Non-critical": "Blanket purchase orders or framework agreements. Auto-renewal with annual price review. P-card for low-value transactions. Minimize contract management overhead.",
};

export function generateCategoryStrategies(
  kraljicResults: KraljicPosition[],
): CategoryStrategyResult[] {
  // Sort by profit_impact descending for priority ranking
  const sorted = [...kraljicResults].sort((a, b) => b.profit_impact - a.profit_impact);

  return sorted.map((kr, idx) => {
    const quadrant = kr.quadrant;
    const sourcing = SOURCING_STRATEGIES[quadrant];
    const contract = CONTRACT_STRATEGIES[quadrant];
    const transition = QUADRANT_TRANSITIONS[quadrant];

    return {
      category_id: kr.category_id,
      category_name: kr.category_name,
      quadrant,
      quadrant_color: QUADRANT_COLORS[quadrant] || "#9ca3af",
      sourcing_strategy: sourcing.strategy,
      sourcing_strategy_description: sourcing.description,
      contract_strategy: contract,
      top_levers: kr.recommended_levers.slice(0, 3),
      target_quadrant: transition.target,
      transition_actions: transition.actions,
      transition_timeline: transition.timeline,
      priority_rank: idx + 1,
      profit_impact: kr.profit_impact,
      supply_risk: kr.supply_risk,
      total_spend: kr.total_spend,
    };
  });
}
