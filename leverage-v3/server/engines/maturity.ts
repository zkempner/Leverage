// Procurement Maturity Model Engine — 8 dimensions × 5 levels.
// Implements the Hackett Group maturity model. Produces gap analysis,
// prioritized recommendations, implementation sequencing, and spend
// impact estimates. Feeds back into operational scoring factors.
// 100% deterministic. No AI. No external calls.

// ========================================================================
// Interfaces
// ========================================================================

export interface MaturityDimension {
  dimension: string;
  label: string;
  description: string;
  current_level: number;   // 1–5
  target_level: number;    // 1–5
  gap: number;             // target - current
  strategic_importance: number;  // 1.0–2.0 weight
  priority_score: number;  // gap × strategic_importance
  recommended_actions: RecommendedAction[];
  implementation_horizon: string; // '0-90d' | '90-365d' | '365d+'
  spend_impact_per_level: number; // % incremental savings headroom per level gained
  estimated_savings_uplift_pct: number; // gap × spend_impact_per_level
}

export interface RecommendedAction {
  action: string;
  horizon: string;         // '0-90d' | '90-365d' | '365d+'
  effort: string;          // 'low' | 'medium' | 'high'
  impact: string;          // 'low' | 'medium' | 'high'
}

export interface GapAnalysis {
  engagement_id: number;
  industry: string;
  company_size: string;
  overall_current: number;   // Weighted average current level
  overall_target: number;    // Weighted average target level
  overall_gap: number;
  dimensions: MaturityDimension[];
  quick_wins: MaturityDimension[];       // 0-90d priorities
  medium_term: MaturityDimension[];      // 90-365d priorities
  long_term: MaturityDimension[];        // 365d+ priorities
  total_savings_uplift_pct: number;      // Sum of estimated savings uplift
}

// ========================================================================
// Constants — 5 Maturity Levels
// ========================================================================

export const MATURITY_LEVELS: Record<number, { label: string; description: string }> = {
  1: { label: "Initial",      description: "Ad hoc, reactive. No formal processes. Procurement is administrative/transactional." },
  2: { label: "Developing",   description: "Basic processes defined. Some category management. Limited analytics. Mostly tactical." },
  3: { label: "Established",  description: "Category management in place. Strategic sourcing for top categories. Basic analytics and KPIs." },
  4: { label: "Advanced",     description: "Analytics-driven decisions. Supplier collaboration programs. Risk management integrated. Total cost of ownership focus." },
  5: { label: "World-Class",  description: "Digital procurement. Predictive analytics. Supplier innovation programs. Procurement as strategic partner to business." },
};

// ========================================================================
// 8 Dimensions with strategic importance weights
// ========================================================================

interface DimensionDef {
  key: string;
  label: string;
  description: string;
  strategic_importance: number; // Weight for priority scoring
  spend_impact_per_level: number; // % incremental savings per level gain
}

const DIMENSIONS: DimensionDef[] = [
  {
    key: "strategy",
    label: "Procurement Strategy",
    description: "Alignment of procurement strategy with business objectives. Category strategy coverage and sophistication.",
    strategic_importance: 1.8,
    spend_impact_per_level: 0.025,
  },
  {
    key: "organization",
    label: "Organization & Talent",
    description: "Procurement team structure, skills, roles, and career development. Center-led vs. decentralized model.",
    strategic_importance: 1.5,
    spend_impact_per_level: 0.015,
  },
  {
    key: "process",
    label: "Source-to-Pay Process",
    description: "End-to-end process maturity from sourcing through payment. Process standardization and compliance.",
    strategic_importance: 1.6,
    spend_impact_per_level: 0.020,
  },
  {
    key: "technology",
    label: "Technology & Systems",
    description: "Procurement technology stack, automation, e-procurement adoption, and system integration.",
    strategic_importance: 1.4,
    spend_impact_per_level: 0.018,
  },
  {
    key: "supplier_mgmt",
    label: "Supplier Management",
    description: "Supplier segmentation, performance management, relationship depth, and development programs.",
    strategic_importance: 1.7,
    spend_impact_per_level: 0.022,
  },
  {
    key: "data_analytics",
    label: "Data & Analytics",
    description: "Spend visibility, data quality, analytics capability, reporting, and insight-driven decisions.",
    strategic_importance: 1.6,
    spend_impact_per_level: 0.020,
  },
  {
    key: "risk_mgmt",
    label: "Risk Management",
    description: "Supply chain risk identification, assessment, mitigation, and business continuity planning.",
    strategic_importance: 1.3,
    spend_impact_per_level: 0.012,
  },
  {
    key: "sustainability",
    label: "Sustainability & ESG",
    description: "ESG integration in procurement decisions, supplier sustainability programs, and reporting.",
    strategic_importance: 1.1,
    spend_impact_per_level: 0.008,
  },
];

// ========================================================================
// Peer Benchmarks — Target scores by industry × size
// ========================================================================
// Target = what a well-performing peer at this industry/size typically achieves.
// Source: Hackett Group Procurement Maturity Model, 2020-2024 (n=500+ assessments)

type IndustryKey = string;
type SizeKey = string;

// Default targets (mid_market, manufacturing baseline)
const DEFAULT_TARGETS: Record<string, number> = {
  strategy: 3.5, organization: 3.0, process: 3.5, technology: 3.0,
  supplier_mgmt: 3.5, data_analytics: 3.0, risk_mgmt: 2.5, sustainability: 2.5,
};

// Industry adjustments (delta from default targets)
const INDUSTRY_TARGET_ADJ: Record<IndustryKey, Record<string, number>> = {
  technology: {
    technology: 0.8, data_analytics: 0.7, process: 0.3, strategy: 0.3,
    organization: 0.2, supplier_mgmt: 0.0, risk_mgmt: 0.2, sustainability: 0.3,
  },
  healthcare: {
    risk_mgmt: 0.5, supplier_mgmt: 0.3, process: 0.2, strategy: 0.2,
    technology: 0.0, data_analytics: 0.2, organization: 0.1, sustainability: 0.3,
  },
  financial_services: {
    risk_mgmt: 0.8, technology: 0.5, data_analytics: 0.5, process: 0.3,
    strategy: 0.2, organization: 0.2, supplier_mgmt: 0.1, sustainability: 0.2,
  },
  retail: {
    supplier_mgmt: 0.5, process: 0.3, technology: 0.2, data_analytics: 0.3,
    strategy: 0.2, organization: 0.1, risk_mgmt: 0.2, sustainability: 0.4,
  },
  chemicals: {
    supplier_mgmt: 0.3, risk_mgmt: 0.3, sustainability: 0.5, process: 0.2,
    strategy: 0.1, organization: 0.0, technology: 0.0, data_analytics: 0.1,
  },
  manufacturing: {
    strategy: 0.0, organization: 0.0, process: 0.0, technology: 0.0,
    supplier_mgmt: 0.0, data_analytics: 0.0, risk_mgmt: 0.0, sustainability: 0.0,
  },
  energy_utilities: {
    risk_mgmt: 0.5, sustainability: 0.6, supplier_mgmt: 0.2, process: 0.1,
    strategy: 0.1, organization: 0.0, technology: -0.1, data_analytics: 0.0,
  },
  construction: {
    supplier_mgmt: 0.2, risk_mgmt: 0.3, process: 0.0, strategy: -0.1,
    organization: -0.1, technology: -0.2, data_analytics: -0.1, sustainability: 0.2,
  },
  food_agriculture: {
    supplier_mgmt: 0.3, sustainability: 0.5, risk_mgmt: 0.3, process: 0.1,
    strategy: 0.0, organization: 0.0, technology: -0.1, data_analytics: 0.0,
  },
  government: {
    process: 0.3, risk_mgmt: 0.2, strategy: -0.2, organization: -0.1,
    technology: -0.3, data_analytics: -0.2, supplier_mgmt: 0.0, sustainability: 0.3,
  },
  transportation: {
    risk_mgmt: 0.3, supplier_mgmt: 0.2, process: 0.1, strategy: 0.0,
    organization: 0.0, technology: 0.0, data_analytics: 0.0, sustainability: 0.2,
  },
};

// Size adjustments (delta from default)
const SIZE_TARGET_ADJ: Record<SizeKey, number> = {
  small: -0.5,
  lower_mid: -0.2,
  mid_market: 0.0,
  large: 0.3,
  enterprise: 0.5,
};

// ========================================================================
// Recommended Actions per Dimension per Level-Up
// ========================================================================
// Actions to advance from current level to current+1.
// Each level-up has 3-5 specific, actionable recommendations.

type ActionsByLevel = Record<number, RecommendedAction[]>;

const DIMENSION_ACTIONS: Record<string, ActionsByLevel> = {
  strategy: {
    1: [
      { action: "Define procurement vision and 3-year roadmap aligned to business strategy", horizon: "0-90d", effort: "medium", impact: "high" },
      { action: "Identify top 10 spend categories and assign category owners", horizon: "0-90d", effort: "low", impact: "high" },
      { action: "Establish procurement KPIs: savings rate, contract coverage, cycle time", horizon: "0-90d", effort: "low", impact: "medium" },
    ],
    2: [
      { action: "Develop formal category strategies for top 5 spend categories", horizon: "90-365d", effort: "high", impact: "high" },
      { action: "Implement make-vs-buy framework for key categories", horizon: "90-365d", effort: "medium", impact: "medium" },
      { action: "Create category council with business stakeholder representation", horizon: "0-90d", effort: "medium", impact: "high" },
      { action: "Benchmark procurement metrics against industry peers", horizon: "0-90d", effort: "low", impact: "medium" },
    ],
    3: [
      { action: "Extend category strategies to cover 80%+ of addressable spend", horizon: "90-365d", effort: "high", impact: "high" },
      { action: "Integrate procurement strategy into business unit planning cycles", horizon: "90-365d", effort: "medium", impact: "high" },
      { action: "Implement total cost of ownership (TCO) models for strategic categories", horizon: "90-365d", effort: "high", impact: "high" },
      { action: "Develop innovation sourcing strategy for emerging categories", horizon: "365d+", effort: "medium", impact: "medium" },
    ],
    4: [
      { action: "Deploy predictive category analytics for proactive strategy adjustment", horizon: "365d+", effort: "high", impact: "high" },
      { action: "Implement supplier innovation programs aligned to category roadmaps", horizon: "365d+", effort: "high", impact: "high" },
      { action: "Integrate procurement strategy with corporate M&A and growth planning", horizon: "365d+", effort: "medium", impact: "medium" },
    ],
  },
  organization: {
    1: [
      { action: "Appoint dedicated procurement lead with direct report to CFO/COO", horizon: "0-90d", effort: "medium", impact: "high" },
      { action: "Define core procurement roles: strategic sourcing, category management, operations", horizon: "0-90d", effort: "low", impact: "high" },
      { action: "Assess current team skill gaps vs. target capabilities", horizon: "0-90d", effort: "low", impact: "medium" },
    ],
    2: [
      { action: "Implement center-led procurement model with embedded category specialists", horizon: "90-365d", effort: "high", impact: "high" },
      { action: "Create procurement career paths and competency framework", horizon: "90-365d", effort: "medium", impact: "medium" },
      { action: "Launch procurement training program covering negotiation, analytics, contract mgmt", horizon: "0-90d", effort: "medium", impact: "high" },
      { action: "Establish cross-functional category teams with business stakeholders", horizon: "0-90d", effort: "medium", impact: "high" },
    ],
    3: [
      { action: "Develop advanced analytics and digital skills within procurement team", horizon: "90-365d", effort: "high", impact: "high" },
      { action: "Implement rotational programs between procurement and business units", horizon: "90-365d", effort: "medium", impact: "medium" },
      { action: "Create procurement center of excellence for methodology and best practices", horizon: "90-365d", effort: "high", impact: "high" },
    ],
    4: [
      { action: "Establish procurement as strategic business partner with P&L influence", horizon: "365d+", effort: "high", impact: "high" },
      { action: "Develop specialized teams for supplier innovation, risk, and sustainability", horizon: "365d+", effort: "high", impact: "medium" },
      { action: "Implement AI-augmented decision support for procurement professionals", horizon: "365d+", effort: "high", impact: "high" },
    ],
  },
  process: {
    1: [
      { action: "Map current source-to-pay process and identify top 5 pain points", horizon: "0-90d", effort: "low", impact: "high" },
      { action: "Implement basic purchase requisition and approval workflow", horizon: "0-90d", effort: "medium", impact: "high" },
      { action: "Establish preferred supplier list for top spend categories", horizon: "0-90d", effort: "low", impact: "medium" },
    ],
    2: [
      { action: "Standardize RFx process with templates, scoring criteria, and timelines", horizon: "0-90d", effort: "medium", impact: "high" },
      { action: "Implement contract lifecycle management with expiry alerts", horizon: "90-365d", effort: "medium", impact: "high" },
      { action: "Define and enforce procurement policy: thresholds, approvals, exceptions", horizon: "0-90d", effort: "low", impact: "high" },
      { action: "Automate PO creation and invoice matching (2-way or 3-way)", horizon: "90-365d", effort: "high", impact: "high" },
    ],
    3: [
      { action: "Implement e-sourcing platform for competitive bidding events", horizon: "90-365d", effort: "high", impact: "high" },
      { action: "Deploy supplier portal for self-service PO/invoice management", horizon: "90-365d", effort: "high", impact: "medium" },
      { action: "Achieve 90%+ PO compliance through guided buying and catalogs", horizon: "90-365d", effort: "medium", impact: "high" },
      { action: "Implement automated savings tracking and realization reporting", horizon: "90-365d", effort: "medium", impact: "medium" },
    ],
    4: [
      { action: "Deploy AI-assisted sourcing recommendations and autonomous PO creation", horizon: "365d+", effort: "high", impact: "high" },
      { action: "Implement touchless processing for 80%+ of transactional spend", horizon: "365d+", effort: "high", impact: "high" },
      { action: "Integrate process analytics for continuous improvement and bottleneck detection", horizon: "365d+", effort: "high", impact: "medium" },
    ],
  },
  technology: {
    1: [
      { action: "Implement basic e-procurement or P2P system for top spend categories", horizon: "90-365d", effort: "high", impact: "high" },
      { action: "Consolidate spend data into single source of truth (spend cube)", horizon: "0-90d", effort: "medium", impact: "high" },
      { action: "Deploy contract repository with search and expiry tracking", horizon: "0-90d", effort: "medium", impact: "medium" },
    ],
    2: [
      { action: "Implement full source-to-pay suite with integrated sourcing, contracts, and P2P", horizon: "90-365d", effort: "high", impact: "high" },
      { action: "Deploy spend analytics dashboard with category drill-down capability", horizon: "0-90d", effort: "medium", impact: "high" },
      { action: "Integrate procurement system with ERP for real-time data synchronization", horizon: "90-365d", effort: "high", impact: "high" },
      { action: "Implement supplier information management (SIM) platform", horizon: "90-365d", effort: "medium", impact: "medium" },
    ],
    3: [
      { action: "Deploy advanced analytics: predictive spend, price forecasting, risk scoring", horizon: "90-365d", effort: "high", impact: "high" },
      { action: "Implement API integrations with market data, supplier risk, and commodity indices", horizon: "90-365d", effort: "high", impact: "medium" },
      { action: "Deploy robotic process automation (RPA) for repetitive procurement tasks", horizon: "90-365d", effort: "medium", impact: "high" },
    ],
    4: [
      { action: "Implement AI/ML-driven procurement: autonomous sourcing, predictive risk, demand sensing", horizon: "365d+", effort: "high", impact: "high" },
      { action: "Deploy digital twin for supply chain modeling and scenario planning", horizon: "365d+", effort: "high", impact: "medium" },
      { action: "Integrate blockchain for supplier traceability and smart contracts", horizon: "365d+", effort: "high", impact: "medium" },
    ],
  },
  supplier_mgmt: {
    1: [
      { action: "Create approved supplier list with basic qualification criteria", horizon: "0-90d", effort: "low", impact: "high" },
      { action: "Identify and segment top 20 suppliers by spend, risk, and strategic value", horizon: "0-90d", effort: "low", impact: "high" },
      { action: "Establish quarterly business review (QBR) cadence for top 10 suppliers", horizon: "0-90d", effort: "medium", impact: "high" },
    ],
    2: [
      { action: "Implement supplier scorecards with quality, delivery, cost, and service KPIs", horizon: "0-90d", effort: "medium", impact: "high" },
      { action: "Develop Kraljic matrix segmentation for all strategic categories", horizon: "0-90d", effort: "medium", impact: "high" },
      { action: "Create supplier development program for underperforming critical suppliers", horizon: "90-365d", effort: "medium", impact: "medium" },
      { action: "Establish supplier onboarding and offboarding process with compliance checks", horizon: "90-365d", effort: "medium", impact: "medium" },
    ],
    3: [
      { action: "Implement strategic supplier relationship management (SRM) program", horizon: "90-365d", effort: "high", impact: "high" },
      { action: "Deploy supplier collaboration platform for joint planning and innovation", horizon: "90-365d", effort: "high", impact: "high" },
      { action: "Conduct annual supplier satisfaction survey and act on feedback", horizon: "90-365d", effort: "low", impact: "medium" },
      { action: "Implement multi-tier supply chain visibility for critical categories", horizon: "365d+", effort: "high", impact: "high" },
    ],
    4: [
      { action: "Co-develop innovation roadmaps with strategic suppliers", horizon: "365d+", effort: "high", impact: "high" },
      { action: "Implement real-time supplier performance monitoring with automated alerts", horizon: "365d+", effort: "high", impact: "medium" },
      { action: "Develop supplier ecosystem strategy including startups and disruptors", horizon: "365d+", effort: "medium", impact: "high" },
    ],
  },
  data_analytics: {
    1: [
      { action: "Clean and classify 100% of spend data into standardized taxonomy", horizon: "0-90d", effort: "medium", impact: "high" },
      { action: "Build basic spend dashboard: by category, supplier, business unit, trend", horizon: "0-90d", effort: "medium", impact: "high" },
      { action: "Establish data governance: ownership, update cadence, quality checks", horizon: "0-90d", effort: "low", impact: "medium" },
    ],
    2: [
      { action: "Implement automated spend classification with 95%+ accuracy", horizon: "90-365d", effort: "high", impact: "high" },
      { action: "Deploy savings tracking: identified → contracted → realized, with variance analysis", horizon: "0-90d", effort: "medium", impact: "high" },
      { action: "Create executive procurement dashboard with KPI scorecards", horizon: "0-90d", effort: "medium", impact: "high" },
      { action: "Implement contract analytics: coverage rate, expiry pipeline, compliance rate", horizon: "90-365d", effort: "medium", impact: "medium" },
    ],
    3: [
      { action: "Deploy predictive analytics: demand forecasting, price trend modeling, risk scoring", horizon: "90-365d", effort: "high", impact: "high" },
      { action: "Implement anomaly detection for invoice, pricing, and compliance outliers", horizon: "90-365d", effort: "high", impact: "high" },
      { action: "Create self-service analytics capability for category managers", horizon: "90-365d", effort: "medium", impact: "medium" },
    ],
    4: [
      { action: "Deploy AI-driven insights: opportunity identification, negotiation guidance, risk prediction", horizon: "365d+", effort: "high", impact: "high" },
      { action: "Implement real-time market intelligence integration (commodity prices, supplier news)", horizon: "365d+", effort: "high", impact: "medium" },
      { action: "Create data monetization strategy: benchmark data, supplier insights", horizon: "365d+", effort: "medium", impact: "medium" },
    ],
  },
  risk_mgmt: {
    1: [
      { action: "Identify single-source dependencies and create contingency plans", horizon: "0-90d", effort: "low", impact: "high" },
      { action: "Map critical supplier financial health using public data (D&B, credit agencies)", horizon: "0-90d", effort: "medium", impact: "high" },
      { action: "Establish basic supply disruption escalation and response process", horizon: "0-90d", effort: "low", impact: "medium" },
    ],
    2: [
      { action: "Implement supplier risk scoring framework: financial, operational, geopolitical, compliance", horizon: "0-90d", effort: "medium", impact: "high" },
      { action: "Create risk heat map by category and supplier with mitigation actions", horizon: "0-90d", effort: "medium", impact: "high" },
      { action: "Establish dual-sourcing policy for critical components and services", horizon: "90-365d", effort: "high", impact: "high" },
      { action: "Implement basic supply chain mapping for Tier 1 and critical Tier 2 suppliers", horizon: "90-365d", effort: "medium", impact: "medium" },
    ],
    3: [
      { action: "Deploy continuous risk monitoring with automated alerts and dashboards", horizon: "90-365d", effort: "high", impact: "high" },
      { action: "Implement scenario planning and stress testing for supply chain disruptions", horizon: "90-365d", effort: "high", impact: "high" },
      { action: "Integrate geopolitical and climate risk intelligence into sourcing decisions", horizon: "90-365d", effort: "medium", impact: "medium" },
    ],
    4: [
      { action: "Deploy predictive risk analytics with early warning indicators", horizon: "365d+", effort: "high", impact: "high" },
      { action: "Implement autonomous risk response: pre-approved backup suppliers, dynamic routing", horizon: "365d+", effort: "high", impact: "high" },
      { action: "Create cross-functional supply chain resilience program with quarterly simulations", horizon: "365d+", effort: "high", impact: "medium" },
    ],
  },
  sustainability: {
    1: [
      { action: "Establish supplier code of conduct covering ESG basics", horizon: "0-90d", effort: "low", impact: "medium" },
      { action: "Identify top 20 suppliers by carbon footprint and request Scope 3 data", horizon: "0-90d", effort: "medium", impact: "medium" },
      { action: "Include basic sustainability criteria in new supplier qualification process", horizon: "0-90d", effort: "low", impact: "low" },
    ],
    2: [
      { action: "Implement sustainability scoring in supplier evaluations (10-20% weight)", horizon: "0-90d", effort: "medium", impact: "medium" },
      { action: "Set Scope 3 reduction targets aligned to company sustainability goals", horizon: "90-365d", effort: "medium", impact: "medium" },
      { action: "Launch supplier sustainability assessment for top 50 suppliers", horizon: "90-365d", effort: "high", impact: "medium" },
      { action: "Integrate circular economy principles in packaging and material specifications", horizon: "90-365d", effort: "medium", impact: "medium" },
    ],
    3: [
      { action: "Deploy supplier sustainability development program with improvement targets", horizon: "90-365d", effort: "high", impact: "high" },
      { action: "Implement carbon-adjusted total cost of ownership in sourcing decisions", horizon: "90-365d", effort: "high", impact: "high" },
      { action: "Achieve third-party sustainability reporting (CDP, EcoVadis, SBTi)", horizon: "365d+", effort: "high", impact: "medium" },
    ],
    4: [
      { action: "Implement real-time Scope 3 tracking with automated supplier data collection", horizon: "365d+", effort: "high", impact: "high" },
      { action: "Co-develop sustainable innovation programs with strategic suppliers", horizon: "365d+", effort: "high", impact: "high" },
      { action: "Achieve net-zero procurement roadmap with verified science-based targets", horizon: "365d+", effort: "high", impact: "medium" },
    ],
  },
};

// ========================================================================
// Implementation Horizon Assignment
// ========================================================================

function assignHorizon(gap: number, priorityScore: number, dimension: string): string {
  // High priority + large gap → address sooner
  // Quick wins: foundational dimensions with high gap that can be started immediately
  if (priorityScore >= 3.0) return "0-90d";
  if (priorityScore >= 2.0) return "90-365d";
  if (gap >= 2 && priorityScore >= 1.5) return "90-365d";
  return "365d+";
}

// ========================================================================
// Industry Normalization (matches sizing.ts)
// ========================================================================

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

// ========================================================================
// Target Score Computation
// ========================================================================

export function getTargetScores(
  industry: string,
  companySize: string,
): Record<string, number> {
  const normIndustry = normalizeIndustry(industry);
  const normSize = normalizeSize(companySize);

  const sizeAdj = SIZE_TARGET_ADJ[normSize] ?? 0;
  const industryAdj = INDUSTRY_TARGET_ADJ[normIndustry] || INDUSTRY_TARGET_ADJ["manufacturing"]!;

  const targets: Record<string, number> = {};
  for (const dim of DIMENSIONS) {
    const base = DEFAULT_TARGETS[dim.key] ?? 3.0;
    const indAdj = industryAdj[dim.key] ?? 0;
    // Clamp target between 2.0 and 5.0
    targets[dim.key] = Math.min(5.0, Math.max(2.0, Math.round((base + indAdj + sizeAdj) * 10) / 10));
  }
  return targets;
}

// ========================================================================
// Gap Analysis — Main Engine
// ========================================================================

export function computeGapAnalysis(
  currentScores: Record<string, number>,  // dimension key → 1-5 score
  industry: string,
  companySize: string,
  engagementId: number = 0,
): GapAnalysis {
  const targets = getTargetScores(industry, companySize);
  const normIndustry = normalizeIndustry(industry);
  const normSize = normalizeSize(companySize);

  const dimensions: MaturityDimension[] = DIMENSIONS.map(dim => {
    const current = Math.max(1, Math.min(5, currentScores[dim.key] ?? 1));
    const target = targets[dim.key] ?? 3.0;
    const gap = Math.max(0, target - current);
    const priorityScore = Math.round(gap * dim.strategic_importance * 100) / 100;
    const horizon = assignHorizon(gap, priorityScore, dim.key);
    const estimatedUplift = Math.round(gap * dim.spend_impact_per_level * 1000) / 1000;

    // Get recommended actions for current level (actions to reach current+1)
    const levelActions = DIMENSION_ACTIONS[dim.key];
    const actionsForLevel = levelActions?.[current] || [];

    return {
      dimension: dim.key,
      label: dim.label,
      description: dim.description,
      current_level: current,
      target_level: Math.round(target * 10) / 10,
      gap: Math.round(gap * 10) / 10,
      strategic_importance: dim.strategic_importance,
      priority_score: priorityScore,
      recommended_actions: actionsForLevel,
      implementation_horizon: horizon,
      spend_impact_per_level: dim.spend_impact_per_level,
      estimated_savings_uplift_pct: estimatedUplift,
    };
  });

  // Sort by priority score descending
  dimensions.sort((a, b) => b.priority_score - a.priority_score);

  // Compute weighted averages
  const totalWeight = DIMENSIONS.reduce((s, d) => s + d.strategic_importance, 0);
  const overallCurrent = Math.round(
    dimensions.reduce((s, d) => s + d.current_level * d.strategic_importance, 0) / totalWeight * 10,
  ) / 10;
  const overallTarget = Math.round(
    dimensions.reduce((s, d) => s + d.target_level * d.strategic_importance, 0) / totalWeight * 10,
  ) / 10;

  const totalUplift = Math.round(
    dimensions.reduce((s, d) => s + d.estimated_savings_uplift_pct, 0) * 1000,
  ) / 1000;

  // Group by horizon
  const quickWins = dimensions.filter(d => d.implementation_horizon === "0-90d");
  const mediumTerm = dimensions.filter(d => d.implementation_horizon === "90-365d");
  const longTerm = dimensions.filter(d => d.implementation_horizon === "365d+");

  return {
    engagement_id: engagementId,
    industry: normIndustry,
    company_size: normSize,
    overall_current: overallCurrent,
    overall_target: overallTarget,
    overall_gap: Math.round((overallTarget - overallCurrent) * 10) / 10,
    dimensions,
    quick_wins: quickWins,
    medium_term: mediumTerm,
    long_term: longTerm,
    total_savings_uplift_pct: totalUplift,
  };
}
