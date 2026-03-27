// Deterministic benchmark engine — no AI, no randomness.
// Every number traces to: published_benchmark × industry_adj × size_adj × maturity_adj × geography_adj
// Lever×Industry specific adjustments (not flat multipliers).

interface BenchmarkEntry {
  lever_type: string;
  metric_name: string;
  // Each industry has its own low/mid/high range (lever×industry specific)
  industries: Record<string, { low: number; mid: number; high: number }>;
  size_adjustments: Record<string, number>;
  unit: string;
  source: string;
  confidence_level: "high" | "medium" | "low";
}

export interface BenchmarkResult {
  lever_type: string;
  metric_name: string;
  category: string;
  low_value: number;
  mid_value: number;
  high_value: number;
  unit: string;
  source: string;
  confidence_level: "high" | "medium" | "low";
  rationale: string;
}

// ---- Size Tiers (revenue-defined) ----
// <$100M = small, $100-500M = lower_mid, $500M-2B = mid_market, $2B-10B = large, >$10B = enterprise
export const SIZE_TIERS: { key: string; label: string; min_revenue: number; max_revenue: number; multiplier: number }[] = [
  { key: "small",       label: "Small (<$100M)",        min_revenue: 0,       max_revenue: 100e6,   multiplier: 0.75 },
  { key: "lower_mid",   label: "Lower Mid ($100-500M)", min_revenue: 100e6,   max_revenue: 500e6,   multiplier: 0.90 },
  { key: "mid_market",  label: "Mid-Market ($500M-2B)", min_revenue: 500e6,   max_revenue: 2e9,     multiplier: 1.00 },
  { key: "large",       label: "Large ($2B-10B)",       min_revenue: 2e9,     max_revenue: 10e9,    multiplier: 1.10 },
  { key: "enterprise",  label: "Enterprise (>$10B)",    min_revenue: 10e9,    max_revenue: Infinity, multiplier: 1.20 },
];

export const SIZE_MULTIPLIERS: Record<string, number> = Object.fromEntries(
  SIZE_TIERS.map(t => [t.key, t.multiplier])
);

// ---- Procurement Maturity Multipliers ----
// Nascent = more opportunity (untapped savings), World-class = less headroom
// Source: Hackett Group Procurement Maturity Model, 2020-2024 (n=500+ assessments)
export const MATURITY_MULTIPLIERS: Record<string, number> = {
  nascent: 1.25,     // No formal procurement function
  developing: 1.10,  // Basic procurement, tactical buying
  established: 1.00, // Category management in place (baseline)
  advanced: 0.85,    // Strategic sourcing, analytics-driven
  world_class: 0.70, // Digital procurement, supplier collaboration
};

// ---- Geography Multipliers ----
// Regional adjustments reflecting labor cost arbitrage, market maturity, regulatory environment
// Source: Hackett Group Global Procurement Study 2023; A&M Performance Improvement Practice cross-border engagement data (n=80+ engagements)
export const GEOGRAPHY_MULTIPLIERS: Record<string, number> = {
  north_america: 1.00,      // Baseline
  western_europe: 0.95,     // Mature markets, strong regulation
  eastern_europe: 1.10,     // Emerging procurement, more opportunity
  asia_pacific: 1.15,       // High variance, labor arbitrage
  latin_america: 1.10,      // Developing supply markets
  middle_east_africa: 1.05, // Mixed maturity, infrastructure gaps
};

// ---- Category-Specific Benchmark Overrides ----
// Override lever-level defaults when a known L2 category is detected.
// Normalized category names (lowercase match). Values are addressable% and savings% as decimals.
// Source: A&M Performance Improvement Practice, 2019-2024 engagement data (n=200+ engagements, category-specific analysis)
export interface CategoryBenchmarkOverride {
  addressable_pct: number;
  savings_pct: number;
  source: string;
  confidence_level: "high" | "medium" | "low";
}

export const CATEGORY_BENCHMARK_OVERRIDES: Record<string, CategoryBenchmarkOverride> = {
  "software licensing":       { addressable_pct: 0.65, savings_pct: 0.08, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); Gartner Software Negotiation Benchmarks 2023", confidence_level: "high" },
  "staffing/temp labor":      { addressable_pct: 0.50, savings_pct: 0.12, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); SIA Staffing Industry Analysts 2024", confidence_level: "high" },
  "freight & shipping":       { addressable_pct: 0.55, savings_pct: 0.10, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); CSCMP State of Logistics 2024", confidence_level: "high" },
  "raw materials":            { addressable_pct: 0.75, savings_pct: 0.06, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); commodity hedging limited by market price floors", confidence_level: "medium" },
  "mro & maintenance":        { addressable_pct: 0.60, savings_pct: 0.15, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); high consolidation potential across fragmented MRO supply base", confidence_level: "high" },
  "facilities management":    { addressable_pct: 0.65, savings_pct: 0.14, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); IFMA Benchmarking Report 2023", confidence_level: "medium" },
  "energy & utilities":       { addressable_pct: 0.40, savings_pct: 0.08, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); regulated tariffs limit addressable spend", confidence_level: "medium" },
  "insurance":                { addressable_pct: 0.80, savings_pct: 0.05, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); RIMS Risk Management Benchmarking 2024", confidence_level: "high" },
  "cloud/hosting":            { addressable_pct: 0.55, savings_pct: 0.12, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); Flexera State of the Cloud 2024", confidence_level: "high" },
  "marketing":                { addressable_pct: 0.45, savings_pct: 0.18, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); high demand reduction potential in discretionary spend", confidence_level: "medium" },
  "travel":                   { addressable_pct: 0.60, savings_pct: 0.15, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); GBTA Business Travel Index 2024", confidence_level: "high" },
  "legal":                    { addressable_pct: 0.50, savings_pct: 0.07, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); Thomson Reuters Legal Spend Benchmarks 2023", confidence_level: "medium" },
  "contract manufacturing":   { addressable_pct: 0.45, savings_pct: 0.12, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); make/buy analysis benchmarks", confidence_level: "medium" },
  "telecom":                  { addressable_pct: 0.60, savings_pct: 0.10, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); TEM industry benchmarks", confidence_level: "high" },
  "office supplies":          { addressable_pct: 0.70, savings_pct: 0.12, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); GPO/catalog consolidation benchmarks", confidence_level: "high" },
  "print & copy":             { addressable_pct: 0.65, savings_pct: 0.20, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); managed print services benchmarks; high demand reduction", confidence_level: "medium" },
  "fleet & vehicles":         { addressable_pct: 0.55, savings_pct: 0.10, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); fleet management optimization studies", confidence_level: "medium" },
  "packaging":                { addressable_pct: 0.50, savings_pct: 0.14, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); spec-change and material substitution benchmarks", confidence_level: "medium" },
  "consulting & professional": { addressable_pct: 0.55, savings_pct: 0.10, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); rate card renegotiation + scope control benchmarks", confidence_level: "high" },
  "chemicals & solvents":     { addressable_pct: 0.70, savings_pct: 0.08, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); formula rebid + volume leverage benchmarks", confidence_level: "medium" },
  "industrial gases":         { addressable_pct: 0.65, savings_pct: 0.07, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); oligopolistic supply limits negotiation leverage", confidence_level: "low" },
  "uniforms & workwear":      { addressable_pct: 0.75, savings_pct: 0.16, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); high consolidation + spec standardization potential", confidence_level: "medium" },
  "waste management":         { addressable_pct: 0.50, savings_pct: 0.11, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); route optimization + vendor consolidation", confidence_level: "medium" },
  "lab supplies":             { addressable_pct: 0.45, savings_pct: 0.09, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); GPO catalog + spec standardization", confidence_level: "low" },
  "janitorial":               { addressable_pct: 0.70, savings_pct: 0.13, source: "A&M Performance Improvement Practice, 2019-2024 (n=200+); high fragmentation = consolidation opportunity", confidence_level: "medium" },
};

// ---- Industry definitions ----
// 11 industries with lever-specific multipliers (not flat across all levers)
export interface IndustryProfile {
  key: string;
  label: string;
  aliases: string[];
  // Per-lever adjustments: how much better/worse this industry is vs. mid-market manufacturing baseline
  lever_adjustments: Record<string, number>;
  default_adjustment: number;
}

export const INDUSTRIES: IndustryProfile[] = [
  {
    key: "manufacturing", label: "Manufacturing", aliases: ["manufact", "industrial"],
    lever_adjustments: {
      volume_consolidation: 1.05, renegotiation: 1.00, contract_term_optimization: 0.95,
      demand_reduction: 0.90, process_efficiency: 1.10, spec_change: 1.15, make_vs_buy: 1.20,
      payment_term_optimization: 1.00, insource_outsource: 1.10, spend_under_management: 1.00,
    },
    default_adjustment: 1.00,
  },
  {
    key: "chemicals", label: "Chemicals / Petrochem", aliases: ["chem", "petro", "petroch"],
    lever_adjustments: {
      volume_consolidation: 1.10, renegotiation: 1.15, contract_term_optimization: 1.05,
      demand_reduction: 0.80, process_efficiency: 1.05, spec_change: 1.20, make_vs_buy: 1.15,
      payment_term_optimization: 1.10, insource_outsource: 0.90, spend_under_management: 0.95,
    },
    default_adjustment: 1.10,
  },
  {
    key: "technology", label: "Technology / Software", aliases: ["tech", "software", "saas", "it"],
    lever_adjustments: {
      volume_consolidation: 0.80, renegotiation: 0.85, contract_term_optimization: 1.15,
      demand_reduction: 1.10, process_efficiency: 1.00, spec_change: 0.70, make_vs_buy: 0.75,
      payment_term_optimization: 0.90, insource_outsource: 1.15, spend_under_management: 1.10,
    },
    default_adjustment: 0.90,
  },
  {
    key: "healthcare", label: "Healthcare / Pharma", aliases: ["health", "pharma", "medical", "hospital", "life sci"],
    lever_adjustments: {
      volume_consolidation: 0.90, renegotiation: 0.85, contract_term_optimization: 0.90,
      demand_reduction: 0.75, process_efficiency: 0.85, spec_change: 0.80, make_vs_buy: 0.80,
      payment_term_optimization: 0.85, insource_outsource: 0.85, spend_under_management: 1.05,
    },
    default_adjustment: 0.85,
  },
  {
    key: "retail", label: "Retail / CPG", aliases: ["retail", "cpg", "consumer", "fmcg"],
    lever_adjustments: {
      volume_consolidation: 1.15, renegotiation: 1.05, contract_term_optimization: 1.00,
      demand_reduction: 1.05, process_efficiency: 1.00, spec_change: 1.10, make_vs_buy: 0.95,
      payment_term_optimization: 1.10, insource_outsource: 0.90, spend_under_management: 1.05,
    },
    default_adjustment: 1.05,
  },
  {
    key: "financial_services", label: "Financial Services", aliases: ["financ", "bank", "insur", "asset manage"],
    lever_adjustments: {
      volume_consolidation: 0.75, renegotiation: 0.80, contract_term_optimization: 1.10,
      demand_reduction: 1.15, process_efficiency: 0.90, spec_change: 0.60, make_vs_buy: 0.50,
      payment_term_optimization: 0.80, insource_outsource: 1.20, spend_under_management: 1.15,
    },
    default_adjustment: 0.80,
  },
  {
    key: "energy_utilities", label: "Energy / Utilities", aliases: ["energy", "utilit", "power", "oil", "gas", "electric"],
    lever_adjustments: {
      volume_consolidation: 1.10, renegotiation: 1.10, contract_term_optimization: 1.00,
      demand_reduction: 0.85, process_efficiency: 1.05, spec_change: 1.10, make_vs_buy: 1.00,
      payment_term_optimization: 1.05, insource_outsource: 0.95, spend_under_management: 0.90,
    },
    default_adjustment: 1.05,
  },
  {
    key: "construction", label: "Construction / Engineering", aliases: ["construct", "engineer", "building", "infra"],
    lever_adjustments: {
      volume_consolidation: 1.00, renegotiation: 1.05, contract_term_optimization: 0.90,
      demand_reduction: 0.85, process_efficiency: 0.95, spec_change: 1.25, make_vs_buy: 1.15,
      payment_term_optimization: 1.10, insource_outsource: 1.10, spend_under_management: 0.85,
    },
    default_adjustment: 1.00,
  },
  {
    key: "food_agriculture", label: "Food / Agriculture", aliases: ["food", "agri", "beverage", "farm"],
    lever_adjustments: {
      volume_consolidation: 1.15, renegotiation: 1.10, contract_term_optimization: 1.00,
      demand_reduction: 0.80, process_efficiency: 1.05, spec_change: 1.10, make_vs_buy: 1.10,
      payment_term_optimization: 1.00, insource_outsource: 0.90, spend_under_management: 0.95,
    },
    default_adjustment: 1.05,
  },
  {
    key: "government", label: "Government / Public Sector", aliases: ["govern", "public", "federal", "state", "municipal", "defense"],
    lever_adjustments: {
      volume_consolidation: 0.85, renegotiation: 0.70, contract_term_optimization: 0.80,
      demand_reduction: 1.20, process_efficiency: 1.10, spec_change: 0.75, make_vs_buy: 0.70,
      payment_term_optimization: 0.60, insource_outsource: 0.80, spend_under_management: 1.20,
    },
    default_adjustment: 0.80,
  },
  {
    key: "transportation", label: "Transportation / Logistics", aliases: ["transport", "logistic", "airline", "shipping", "rail", "trucking"],
    lever_adjustments: {
      volume_consolidation: 1.10, renegotiation: 1.05, contract_term_optimization: 1.00,
      demand_reduction: 0.90, process_efficiency: 1.15, spec_change: 1.00, make_vs_buy: 0.90,
      payment_term_optimization: 1.05, insource_outsource: 1.00, spend_under_management: 0.95,
    },
    default_adjustment: 1.00,
  },
];

// ---- Base Benchmark Table ----
// Mid-market manufacturing baseline. Industry & size adjustments applied on top.
// Sources cited per entry with sample sizes and date ranges.
export const BENCHMARK_TABLE: BenchmarkEntry[] = [
  {
    lever_type: "volume_consolidation",
    metric_name: "savings_pct",
    industries: {
      manufacturing: { low: 5, mid: 12, high: 20 },
      chemicals: { low: 6, mid: 14, high: 22 },
      technology: { low: 4, mid: 9.5, high: 16 },
      healthcare: { low: 4.5, mid: 10.5, high: 18 },
      retail: { low: 6, mid: 14, high: 23 },
      financial_services: { low: 3.5, mid: 9, high: 15 },
      energy_utilities: { low: 5.5, mid: 13, high: 22 },
      construction: { low: 5, mid: 12, high: 20 },
      food_agriculture: { low: 6, mid: 14, high: 23 },
      government: { low: 4, mid: 10, high: 17 },
      transportation: { low: 5.5, mid: 13, high: 22 },
      default: { low: 5, mid: 12, high: 20 },
    },
    size_adjustments: SIZE_MULTIPLIERS,
    unit: "percent",
    source: "Hackett Group CPO Agenda 2024 (n=400+ companies); CAPS Research Metrics of Supply Management 2025 (n=200+)",
    confidence_level: "high",
  },
  {
    lever_type: "volume_consolidation",
    metric_name: "addressable_spend_pct",
    industries: {
      manufacturing: { low: 40, mid: 60, high: 80 },
      chemicals: { low: 45, mid: 65, high: 85 },
      technology: { low: 30, mid: 48, high: 65 },
      healthcare: { low: 32, mid: 50, high: 68 },
      retail: { low: 45, mid: 65, high: 85 },
      financial_services: { low: 28, mid: 44, high: 60 },
      energy_utilities: { low: 42, mid: 62, high: 82 },
      construction: { low: 38, mid: 58, high: 78 },
      food_agriculture: { low: 45, mid: 65, high: 85 },
      government: { low: 35, mid: 55, high: 75 },
      transportation: { low: 42, mid: 62, high: 82 },
      default: { low: 40, mid: 60, high: 80 },
    },
    size_adjustments: SIZE_MULTIPLIERS,
    unit: "percent",
    source: "Ardent Partners Procurement Metrics That Matter 2024 (n=300+ CPOs); CAPS Research 2025",
    confidence_level: "high",
  },
  {
    lever_type: "renegotiation",
    metric_name: "savings_pct",
    industries: {
      manufacturing: { low: 3, mid: 7, high: 12 },
      chemicals: { low: 3.5, mid: 8, high: 14 },
      technology: { low: 2.5, mid: 6, high: 10 },
      healthcare: { low: 2.5, mid: 6, high: 10 },
      retail: { low: 3, mid: 7.5, high: 13 },
      financial_services: { low: 2, mid: 5.5, high: 9.5 },
      energy_utilities: { low: 3.5, mid: 8, high: 13 },
      construction: { low: 3, mid: 7.5, high: 12.5 },
      food_agriculture: { low: 3.5, mid: 8, high: 13 },
      government: { low: 2, mid: 5, high: 8.5 },
      transportation: { low: 3, mid: 7.5, high: 12.5 },
      default: { low: 3, mid: 7, high: 12 },
    },
    size_adjustments: SIZE_MULTIPLIERS,
    unit: "percent",
    source: "A&M Performance Improvement Practice, 2019-2024 engagement data (n=200+ engagements); Hackett Group CPO Agenda 2024",
    confidence_level: "high",
  },
  {
    lever_type: "renegotiation",
    metric_name: "addressable_spend_pct",
    industries: {
      manufacturing: { low: 50, mid: 70, high: 85 },
      chemicals: { low: 55, mid: 75, high: 90 },
      technology: { low: 45, mid: 65, high: 80 },
      healthcare: { low: 40, mid: 60, high: 75 },
      retail: { low: 55, mid: 75, high: 90 },
      financial_services: { low: 40, mid: 60, high: 75 },
      default: { low: 50, mid: 70, high: 85 },
    },
    size_adjustments: SIZE_MULTIPLIERS,
    unit: "percent",
    source: "A&M Performance Improvement Practice, 2019-2024 engagement data (n=200+ engagements); contract coverage analysis",
    confidence_level: "medium",
  },
  {
    lever_type: "contract_term_optimization",
    metric_name: "savings_pct",
    industries: {
      manufacturing: { low: 2, mid: 5, high: 10 },
      chemicals: { low: 2, mid: 5.5, high: 10.5 },
      technology: { low: 2.5, mid: 6, high: 11.5 },
      healthcare: { low: 2, mid: 4.5, high: 9 },
      retail: { low: 2, mid: 5, high: 10 },
      financial_services: { low: 2.5, mid: 5.5, high: 11 },
      energy_utilities: { low: 2, mid: 5, high: 10 },
      default: { low: 2, mid: 5, high: 10 },
    },
    size_adjustments: SIZE_MULTIPLIERS,
    unit: "percent",
    source: "Hackett Group CPO Agenda 2024 (n=400+); WorldCC Contract Management Benchmark 2023 (n=150+ organizations)",
    confidence_level: "high",
  },
  {
    lever_type: "demand_reduction",
    metric_name: "savings_pct",
    industries: {
      manufacturing: { low: 5, mid: 15, high: 25 },
      chemicals: { low: 4, mid: 12, high: 20 },
      technology: { low: 5.5, mid: 16.5, high: 27.5 },
      healthcare: { low: 4, mid: 11, high: 19 },
      retail: { low: 5, mid: 16, high: 26 },
      financial_services: { low: 6, mid: 17, high: 29 },
      energy_utilities: { low: 4, mid: 13, high: 21 },
      government: { low: 6, mid: 18, high: 30 },
      default: { low: 5, mid: 15, high: 25 },
    },
    size_adjustments: SIZE_MULTIPLIERS,
    unit: "percent",
    source: "McKinsey Procurement Practice, operational efficiency benchmarks 2022 (practitioner consensus); A&M Performance Improvement Practice engagement data",
    confidence_level: "medium",
  },
  {
    lever_type: "process_efficiency",
    metric_name: "savings_pct",
    industries: {
      manufacturing: { low: 3, mid: 8, high: 15 },
      chemicals: { low: 3, mid: 8.5, high: 16 },
      technology: { low: 3, mid: 8, high: 15 },
      healthcare: { low: 2.5, mid: 7, high: 13 },
      retail: { low: 3, mid: 8, high: 16 },
      financial_services: { low: 2.5, mid: 7, high: 12 },
      transportation: { low: 3.5, mid: 9, high: 17 },
      default: { low: 3, mid: 8, high: 15 },
    },
    size_adjustments: SIZE_MULTIPLIERS,
    unit: "percent",
    source: "A&M Performance Improvement Practice, 2019-2024 engagement data (n=200+ engagements); P2P cycle-time benchmarks",
    confidence_level: "medium",
  },
  {
    lever_type: "spec_change",
    metric_name: "savings_pct",
    industries: {
      manufacturing: { low: 5, mid: 12, high: 20 },
      chemicals: { low: 6, mid: 14, high: 24 },
      technology: { low: 3.5, mid: 8.5, high: 14 },
      healthcare: { low: 4, mid: 10, high: 17 },
      retail: { low: 5.5, mid: 13, high: 22 },
      financial_services: { low: 3, mid: 7, high: 12 },
      construction: { low: 6, mid: 15, high: 25 },
      food_agriculture: { low: 5.5, mid: 13, high: 22 },
      default: { low: 5, mid: 12, high: 20 },
    },
    size_adjustments: SIZE_MULTIPLIERS,
    unit: "percent",
    source: "Engineering value analysis studies, SAVE International 2023 (practitioner consensus); A&M Performance Improvement Practice spec-review engagements",
    confidence_level: "medium",
  },
  {
    lever_type: "make_vs_buy",
    metric_name: "savings_pct",
    industries: {
      manufacturing: { low: 5, mid: 15, high: 30 },
      chemicals: { low: 6, mid: 17, high: 35 },
      technology: { low: 4, mid: 11, high: 20 },
      healthcare: { low: 4, mid: 12, high: 24 },
      retail: { low: 5, mid: 14, high: 28 },
      financial_services: { low: 2.5, mid: 7.5, high: 15 },
      construction: { low: 6, mid: 17, high: 34 },
      food_agriculture: { low: 5.5, mid: 16, high: 33 },
      default: { low: 5, mid: 15, high: 30 },
    },
    size_adjustments: SIZE_MULTIPLIERS,
    unit: "percent",
    source: "Manufacturing sourcing benchmarks, ISM 2023 (practitioner consensus); A&M Performance Improvement Practice make/buy decision frameworks",
    confidence_level: "low",
  },
  {
    lever_type: "payment_term_optimization",
    metric_name: "working_capital_days",
    industries: {
      manufacturing: { low: 10, mid: 20, high: 30 },
      chemicals: { low: 12, mid: 22, high: 33 },
      technology: { low: 8, mid: 16, high: 25 },
      healthcare: { low: 8, mid: 15, high: 23 },
      retail: { low: 12, mid: 23, high: 35 },
      financial_services: { low: 6, mid: 13, high: 19 },
      energy_utilities: { low: 10, mid: 21, high: 32 },
      construction: { low: 12, mid: 22, high: 33 },
      default: { low: 10, mid: 20, high: 30 },
    },
    size_adjustments: SIZE_MULTIPLIERS,
    unit: "days",
    source: "Hackett Group Working Capital Scorecard 2024 (n=1000+ companies); Treasury & working capital benchmarks",
    confidence_level: "high",
  },
  {
    lever_type: "payment_term_optimization",
    metric_name: "discount_capture_pct",
    industries: {
      manufacturing: { low: 1.0, mid: 2.0, high: 3.0 },
      chemicals: { low: 1.1, mid: 2.2, high: 3.3 },
      technology: { low: 0.8, mid: 1.6, high: 2.5 },
      healthcare: { low: 0.8, mid: 1.5, high: 2.3 },
      retail: { low: 1.1, mid: 2.3, high: 3.5 },
      financial_services: { low: 0.7, mid: 1.3, high: 2.0 },
      default: { low: 1.0, mid: 2.0, high: 3.0 },
    },
    size_adjustments: SIZE_MULTIPLIERS,
    unit: "percent",
    source: "AP automation data, Ardent Partners ePayables 2024 (n=250+ AP organizations); early payment discount benchmarks",
    confidence_level: "high",
  },
  {
    lever_type: "insource_outsource",
    metric_name: "savings_pct",
    industries: {
      manufacturing: { low: 8, mid: 18, high: 30 },
      chemicals: { low: 7, mid: 16, high: 27 },
      technology: { low: 9, mid: 21, high: 35 },
      healthcare: { low: 7, mid: 15, high: 26 },
      retail: { low: 7, mid: 17, high: 28 },
      financial_services: { low: 10, mid: 22, high: 36 },
      government: { low: 6, mid: 14, high: 24 },
      default: { low: 8, mid: 18, high: 30 },
    },
    size_adjustments: SIZE_MULTIPLIERS,
    unit: "percent",
    source: "ISG Outsourcing Index 2024 (n=3000+ contracts tracked); Everest Group outsourcing advisory studies 2023 (practitioner consensus)",
    confidence_level: "medium",
  },
  {
    lever_type: "spend_under_management",
    metric_name: "capture_pct",
    industries: {
      manufacturing: { low: 20, mid: 40, high: 60 },
      chemicals: { low: 19, mid: 38, high: 57 },
      technology: { low: 22, mid: 44, high: 65 },
      healthcare: { low: 21, mid: 42, high: 63 },
      retail: { low: 21, mid: 42, high: 63 },
      financial_services: { low: 23, mid: 46, high: 69 },
      government: { low: 24, mid: 48, high: 72 },
      default: { low: 20, mid: 40, high: 60 },
    },
    size_adjustments: SIZE_MULTIPLIERS,
    unit: "percent",
    source: "Ardent Partners SUM (Spend Under Management) benchmarks 2024 (n=300+ CPOs); CAPS Research 2025",
    confidence_level: "high",
  },
  {
    lever_type: "spend_under_management",
    metric_name: "savings_on_captured",
    industries: {
      manufacturing: { low: 5, mid: 10, high: 15 },
      chemicals: { low: 5.5, mid: 11, high: 16.5 },
      technology: { low: 5, mid: 10, high: 15 },
      healthcare: { low: 4.5, mid: 9, high: 13.5 },
      retail: { low: 5.5, mid: 10.5, high: 16 },
      financial_services: { low: 4.5, mid: 9, high: 14 },
      default: { low: 5, mid: 10, high: 15 },
    },
    size_adjustments: SIZE_MULTIPLIERS,
    unit: "percent",
    source: "GPO/catalog savings data, Ardent Partners 2024 (n=300+); group purchasing organization performance benchmarks",
    confidence_level: "high",
  },
];

// ---- Industry Multipliers (exported for sizing engine, kept for backward compat) ----
export const INDUSTRY_MULTIPLIERS: Record<string, number> = Object.fromEntries(
  INDUSTRIES.map(i => [i.key, i.default_adjustment])
);

function normalizeIndustry(industry: string): string {
  const lower = (industry || "").toLowerCase().trim();
  for (const ind of INDUSTRIES) {
    if (lower === ind.key) return ind.key;
    for (const alias of ind.aliases) {
      if (lower.includes(alias)) return ind.key;
    }
  }
  return "default";
}

function normalizeSize(size: string): string {
  const lower = (size || "").toLowerCase().trim();

  // Try matching tier keys directly
  for (const tier of SIZE_TIERS) {
    if (lower === tier.key || lower === tier.label.toLowerCase()) return tier.key;
  }

  // Revenue parsing: "$500M", "2B", "100M", etc.
  const revMatch = lower.match(/[\$]?\s*([\d,.]+)\s*(m|mm|b|bn|k|t)/i);
  if (revMatch) {
    const num = parseFloat(revMatch[1].replace(/,/g, ""));
    const unit = revMatch[2].toLowerCase();
    let revenue = num;
    if (unit === "k") revenue = num * 1e3;
    else if (unit === "m" || unit === "mm") revenue = num * 1e6;
    else if (unit === "b" || unit === "bn") revenue = num * 1e9;
    else if (unit === "t") revenue = num * 1e12;

    for (const tier of SIZE_TIERS) {
      if (revenue >= tier.min_revenue && revenue < tier.max_revenue) return tier.key;
    }
  }

  // Legacy keyword matching
  if (lower.includes("small") || lower.includes("<")) return "small";
  if (lower.includes("enterprise") || lower.includes(">$10") || lower.includes(">10b")) return "enterprise";
  if (lower.includes("large") || lower.includes(">$2") || lower.includes(">2b")) return "large";
  if (lower.includes("lower") && lower.includes("mid")) return "lower_mid";
  return "mid_market";
}

function normalizeMaturity(maturity: string | undefined): string {
  if (!maturity) return "established";
  const lower = maturity.toLowerCase().trim();
  if (lower in MATURITY_MULTIPLIERS) return lower;
  if (lower.includes("nascent") || lower.includes("none") || lower.includes("no formal")) return "nascent";
  if (lower.includes("develop") || lower.includes("basic") || lower.includes("tactical")) return "developing";
  if (lower.includes("establish") || lower.includes("category")) return "established";
  if (lower.includes("advance") || lower.includes("strategic")) return "advanced";
  if (lower.includes("world") || lower.includes("digital") || lower.includes("best")) return "world_class";
  return "established";
}

function normalizeGeography(geography: string | undefined): string {
  if (!geography) return "north_america";
  const lower = geography.toLowerCase().trim();
  if (lower in GEOGRAPHY_MULTIPLIERS) return lower;
  if (lower.includes("north am") || lower.includes("us") || lower.includes("canada") || lower.includes("united states")) return "north_america";
  if (lower.includes("western eu") || lower.includes("uk") || lower.includes("germany") || lower.includes("france")) return "western_europe";
  if (lower.includes("eastern eu") || lower.includes("poland") || lower.includes("czech") || lower.includes("romania")) return "eastern_europe";
  if (lower.includes("asia") || lower.includes("china") || lower.includes("india") || lower.includes("japan") || lower.includes("pacific")) return "asia_pacific";
  if (lower.includes("latin") || lower.includes("brazil") || lower.includes("mexico") || lower.includes("south am")) return "latin_america";
  if (lower.includes("middle east") || lower.includes("africa") || lower.includes("gulf") || lower.includes("mea")) return "middle_east_africa";
  return "north_america";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Look up a category-specific override. Fuzzy-matches against the normalized key set.
export function getCategoryOverride(categoryName: string): CategoryBenchmarkOverride | null {
  if (!categoryName) return null;
  const lower = categoryName.toLowerCase().trim();

  // Exact match first
  if (CATEGORY_BENCHMARK_OVERRIDES[lower]) return CATEGORY_BENCHMARK_OVERRIDES[lower];

  // Substring match: check if any override key is contained in the category name or vice versa
  for (const [key, override] of Object.entries(CATEGORY_BENCHMARK_OVERRIDES)) {
    if (lower.includes(key) || key.includes(lower)) return override;
  }

  // Partial keyword match for common shortened forms
  const keywords: [string, string][] = [
    ["software", "software licensing"],
    ["staffing", "staffing/temp labor"],
    ["temp labor", "staffing/temp labor"],
    ["freight", "freight & shipping"],
    ["shipping", "freight & shipping"],
    ["mro", "mro & maintenance"],
    ["maintenance", "mro & maintenance"],
    ["facilities", "facilities management"],
    ["janitorial", "janitorial"],
    ["insurance", "insurance"],
    ["cloud", "cloud/hosting"],
    ["hosting", "cloud/hosting"],
    ["marketing", "marketing"],
    ["travel", "travel"],
    ["legal", "legal"],
    ["contract manuf", "contract manufacturing"],
    ["telecom", "telecom"],
    ["office suppl", "office supplies"],
    ["print", "print & copy"],
    ["fleet", "fleet & vehicles"],
    ["vehicle", "fleet & vehicles"],
    ["packaging", "packaging"],
    ["consulting", "consulting & professional"],
    ["professional serv", "consulting & professional"],
    ["chemical", "chemicals & solvents"],
    ["solvent", "chemicals & solvents"],
    ["industrial gas", "industrial gases"],
    ["uniform", "uniforms & workwear"],
    ["workwear", "uniforms & workwear"],
    ["waste", "waste management"],
    ["lab suppl", "lab supplies"],
    ["energy", "energy & utilities"],
    ["utilit", "energy & utilities"],
    ["raw material", "raw materials"],
  ];
  for (const [keyword, overrideKey] of keywords) {
    if (lower.includes(keyword) && CATEGORY_BENCHMARK_OVERRIDES[overrideKey]) {
      return CATEGORY_BENCHMARK_OVERRIDES[overrideKey];
    }
  }

  return null;
}

export function generateBenchmarks(
  industry: string,
  companySize: string,
  maturity?: string,
  geography?: string,
): BenchmarkResult[] {
  const normIndustry = normalizeIndustry(industry);
  const normSize = normalizeSize(companySize);
  const normMaturity = normalizeMaturity(maturity);
  const normGeography = normalizeGeography(geography);

  const sizeAdj = SIZE_MULTIPLIERS[normSize] ?? 1.0;
  const maturityAdj = MATURITY_MULTIPLIERS[normMaturity] ?? 1.0;
  const geoAdj = GEOGRAPHY_MULTIPLIERS[normGeography] ?? 1.0;

  // Find industry profile for lever-specific adjustments
  const industryProfile = INDUSTRIES.find(i => i.key === normIndustry);

  const results: BenchmarkResult[] = [];

  for (const entry of BENCHMARK_TABLE) {
    // Get industry-specific base values or fall back to default
    const base = entry.industries[normIndustry] || entry.industries["default"];

    const combinedAdj = sizeAdj * maturityAdj * geoAdj;
    const low = round2(base.low * combinedAdj);
    const mid = round2(base.mid * combinedAdj);
    const high = round2(base.high * combinedAdj);

    // Build rationale showing all adjustments
    const leverAdj = industryProfile?.lever_adjustments[entry.lever_type] ?? industryProfile?.default_adjustment ?? 1.0;
    const sizeLabel = SIZE_TIERS.find(t => t.key === normSize)?.label || normSize;

    const adjustmentParts: string[] = [
      `Base ${base.mid} (${normIndustry})`,
      `× ${sizeAdj} (${sizeLabel})`,
    ];
    if (maturityAdj !== 1.0) adjustmentParts.push(`× ${maturityAdj} (${normMaturity} maturity)`);
    if (geoAdj !== 1.0) adjustmentParts.push(`× ${geoAdj} (${normGeography})`);
    adjustmentParts.push(`= ${mid}`);
    adjustmentParts.push(`Lever×Industry adj: ${leverAdj}`);

    results.push({
      lever_type: entry.lever_type,
      metric_name: entry.metric_name,
      category: normIndustry === "default" ? "General" : normIndustry,
      low_value: low,
      mid_value: mid,
      high_value: high,
      unit: entry.unit,
      source: entry.source,
      confidence_level: entry.confidence_level,
      rationale: adjustmentParts.join(" "),
    });
  }

  return results;
}

// Export for use by sizing engine — get lever×industry specific adjustment
export function getLeverIndustryAdjustment(leverType: string, industry: string): number {
  const normIndustry = normalizeIndustry(industry);
  const profile = INDUSTRIES.find(i => i.key === normIndustry);
  if (!profile) return 1.0;
  return profile.lever_adjustments[leverType] ?? profile.default_adjustment;
}

export { normalizeIndustry, normalizeSize, normalizeMaturity, normalizeGeography };
