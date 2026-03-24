import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ========================================================================
// 1. Engagements (EXTENDED for v2)
// ========================================================================
export const engagements = sqliteTable("engagements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  portfolio_company: text("portfolio_company").notNull(),
  pe_sponsor: text("pe_sponsor"),
  engagement_mode: text("engagement_mode").notNull().default("pe_100_day"), // 'pe_100_day' | 'operational_improvement'
  start_date: text("start_date"),
  end_date: text("end_date"),
  target_close_date: text("target_close_date"),       // For PE mode — deal close / 100-day start
  business_type: text("business_type"),
  company_size: text("company_size"),
  industry: text("industry"),
  location: text("location"),
  geography: text("geography"),                        // north_america | western_europe | eastern_europe | asia_pacific | latin_america | middle_east_africa
  annual_revenue: real("annual_revenue"),               // Used for size-tier override and WC calculations
  total_addressable_spend: real("total_addressable_spend"), // Populated after import
  ebitda_margin_pct: real("ebitda_margin_pct"),          // For EBITDA sensitivity calculations
  procurement_maturity: text("procurement_maturity"),    // nascent | developing | established | advanced | world_class
  discount_rate: real("discount_rate").notNull().default(0.10), // Configurable; used in all NPV calcs
  status: text("status").notNull().default("active"),
  // White-label client branding
  client_logo_url: text("client_logo_url"),
  report_header_text: text("report_header_text"),
  report_color_primary: text("report_color_primary"),   // hex color
  report_color_secondary: text("report_color_secondary"), // hex color
  created_at: text("created_at"),
  updated_at: text("updated_at"),
});

export const insertEngagementSchema = createInsertSchema(engagements).omit({ id: true });
export type InsertEngagement = z.infer<typeof insertEngagementSchema>;
export type Engagement = typeof engagements.$inferSelect;

// ========================================================================
// 2. Categories (unchanged)
// ========================================================================
export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  level: text("level").notNull(), // L1/L2/L3
  parent_id: integer("parent_id"),
  is_global: integer("is_global").default(1),
});

export const insertCategorySchema = createInsertSchema(categories).omit({ id: true });
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;

// ========================================================================
// 3. Spend Records (EXTENDED for v2)
// ========================================================================
export const spend_records = sqliteTable("spend_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engagement_id: integer("engagement_id").notNull(),
  data_import_id: integer("data_import_id"),
  supplier_name: text("supplier_name").notNull(),
  normalized_supplier_name: text("normalized_supplier_name"),
  vendor_id: text("vendor_id"),                         // Source system vendor ID
  amount: real("amount").notNull(),                     // Positive = invoice, Negative = credit memo
  invoice_number: text("invoice_number"),               // Source invoice #
  description: text("description"),
  gl_code: text("gl_code"),
  gl_description: text("gl_description"),               // GL account description
  date: text("date"),
  payment_date: text("payment_date"),                   // Actual payment date — for DPO calc
  due_date: text("due_date"),                           // Invoice due date — for payment terms analysis
  business_unit: text("business_unit"),
  cost_center: text("cost_center"),                     // More granular than BU
  project_code: text("project_code"),                   // Project / job code
  po_number: text("po_number"),                         // PO reference
  po_type: text("po_type"),                             // PO | P-Card | Non-PO | BlanketPO
  contract_id: text("contract_id"),                     // Links to contracts table
  payment_terms: text("payment_terms"),                 // Net-30, Net-60, etc. from source
  country_of_origin: text("country_of_origin"),         // For tariff analysis
  currency: text("currency").default("USD"),            // ISO-4217
  original_amount: real("original_amount"),             // Pre-conversion; amount = always USD equivalent
  category_id: integer("category_id"),
  is_duplicate_flag: integer("is_duplicate_flag").default(0),
  is_outlier_flag: integer("is_outlier_flag").default(0), // 0/1 set by cleansing engine
  spend_flag: text("spend_flag"),                       // 'tail' | 'maverick' | 'off-contract' | 'critical'
  l1_category: text("l1_category"),                     // Imported L1 category from file
  l2_category: text("l2_category"),                     // Imported L2 category from file
  l3_category: text("l3_category"),                     // Imported L3 category from file
  created_at: text("created_at"),
});

export const insertSpendRecordSchema = createInsertSchema(spend_records).omit({ id: true });
export type InsertSpendRecord = z.infer<typeof insertSpendRecordSchema>;
export type SpendRecord = typeof spend_records.$inferSelect;

// ========================================================================
// 4. Savings Initiatives (EXTENDED for v2)
// ========================================================================
export const savings_initiatives = sqliteTable("savings_initiatives", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engagement_id: integer("engagement_id").notNull(),
  name: text("name").notNull(),
  category_id: integer("category_id"),
  lever_type: text("lever_type"),
  phase: text("phase"),                                 // 'quick_win' | 'medium_term' | 'long_term'
  confidence: text("confidence"),                       // High/Medium/Low
  status: text("status").notNull().default("identified"),
  target_amount: real("target_amount"),
  realized_amount: real("realized_amount").default(0),
  probability: real("probability"),                     // 0.0–1.0 probability weight (from scoring engine)
  risk_adjusted_target: real("risk_adjusted_target"),   // target_amount × probability
  expected_realization_date: text("expected_realization_date"),
  implementation_owner: text("implementation_owner"),   // Responsible owner/team
  is_at_risk: integer("is_at_risk").default(0),
  at_risk_reason: text("at_risk_reason"),               // Reason if at_risk=1
  cta_override: real("cta_override"),                   // Manual override for CTA if known
  notes: text("notes"),
  scoring_json: text("scoring_json"),                   // JSON blob of full scoring result (cached)
  created_at: text("created_at"),
  updated_at: text("updated_at"),
});

export const insertInitiativeSchema = createInsertSchema(savings_initiatives).omit({ id: true });
export type InsertInitiative = z.infer<typeof insertInitiativeSchema>;
export type Initiative = typeof savings_initiatives.$inferSelect;

// ========================================================================
// 5. Scenarios (unchanged)
// ========================================================================
export const scenarios = sqliteTable("scenarios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  initiative_id: integer("initiative_id").notNull(),
  name: text("name").notNull(),
  assumptions: text("assumptions"), // JSON text
  estimated_annual_savings: real("estimated_annual_savings"),
  is_selected: integer("is_selected").default(0),
  created_at: text("created_at"),
});

export const insertScenarioSchema = createInsertSchema(scenarios).omit({ id: true });
export type InsertScenario = z.infer<typeof insertScenarioSchema>;
export type Scenario = typeof scenarios.$inferSelect;

// ========================================================================
// 6. Data Imports (EXTENDED — staging_data for fix)
// ========================================================================
export const data_imports = sqliteTable("data_imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engagement_id: integer("engagement_id").notNull(),
  file_name: text("file_name").notNull(),
  record_count: integer("record_count"),
  status: text("status").default("pending"),
  column_mapping: text("column_mapping"), // JSON text
  staging_data: text("staging_data"),     // JSON text — stores staged CSV rows for crash-resilient imports
  created_at: text("created_at"),
});

export const insertDataImportSchema = createInsertSchema(data_imports).omit({ id: true });
export type InsertDataImport = z.infer<typeof insertDataImportSchema>;
export type DataImport = typeof data_imports.$inferSelect;

// ========================================================================
// 7. Realization Entries (unchanged)
// ========================================================================
export const realization_entries = sqliteTable("realization_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  initiative_id: integer("initiative_id").notNull(),
  date: text("date"),
  amount: real("amount").notNull(),
  notes: text("notes"),
  created_at: text("created_at"),
});

export const insertRealizationEntrySchema = createInsertSchema(realization_entries).omit({ id: true });
export type InsertRealizationEntry = z.infer<typeof insertRealizationEntrySchema>;
export type RealizationEntry = typeof realization_entries.$inferSelect;

// ========================================================================
// 8. Cash Flow Phasing (unchanged)
// ========================================================================
export const cash_flow_phasing = sqliteTable("cash_flow_phasing", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engagement_id: integer("engagement_id"),
  initiative_id: integer("initiative_id"),
  date: text("date"),
  amount: real("amount"),
  is_actual: integer("is_actual").default(0),
});

export const insertCashFlowPhasingSchema = createInsertSchema(cash_flow_phasing).omit({ id: true });
export type InsertCashFlowPhasing = z.infer<typeof insertCashFlowPhasingSchema>;
export type CashFlowPhasing = typeof cash_flow_phasing.$inferSelect;

// ========================================================================
// 9. Cleansing Audit Log (unchanged)
// ========================================================================
export const cleansing_audit_log = sqliteTable("cleansing_audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engagement_id: integer("engagement_id"),
  record_id: integer("record_id"),
  action: text("action"),
  field: text("field"),
  old_value: text("old_value"),
  new_value: text("new_value"),
  reason: text("reason"),
  created_at: text("created_at"),
});

export const insertCleansingAuditLogSchema = createInsertSchema(cleansing_audit_log).omit({ id: true });
export type InsertCleansingAuditLog = z.infer<typeof insertCleansingAuditLogSchema>;
export type CleansingAuditLog = typeof cleansing_audit_log.$inferSelect;

// ========================================================================
// 10. Supplier Mappings (unchanged)
// ========================================================================
export const supplier_mappings = sqliteTable("supplier_mappings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engagement_id: integer("engagement_id"),
  original_name: text("original_name"),
  canonical_name: text("canonical_name"),
  created_at: text("created_at"),
});

export const insertSupplierMappingSchema = createInsertSchema(supplier_mappings).omit({ id: true });
export type InsertSupplierMapping = z.infer<typeof insertSupplierMappingSchema>;
export type SupplierMapping = typeof supplier_mappings.$inferSelect;

// ========================================================================
// 11. Category Rules (unchanged)
// ========================================================================
export const category_rules = sqliteTable("category_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engagement_id: integer("engagement_id"),
  match_field: text("match_field"),
  match_type: text("match_type"),
  match_value: text("match_value"),
  category_id: integer("category_id"),
  priority: integer("priority"),
});

export const insertCategoryRuleSchema = createInsertSchema(category_rules).omit({ id: true });
export type InsertCategoryRule = z.infer<typeof insertCategoryRuleSchema>;
export type CategoryRule = typeof category_rules.$inferSelect;

// ========================================================================
// 12. Assumption Benchmarks (unchanged)
// ========================================================================
export const assumption_benchmarks = sqliteTable("assumption_benchmarks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engagement_id: integer("engagement_id"),
  lever_type: text("lever_type"),
  category: text("category"),
  metric_name: text("metric_name"),
  low_value: real("low_value"),
  mid_value: real("mid_value"),
  high_value: real("high_value"),
  unit: text("unit"),
  source: text("source"),
  rationale: text("rationale"),
});

export const insertAssumptionBenchmarkSchema = createInsertSchema(assumption_benchmarks).omit({ id: true });
export type InsertAssumptionBenchmark = z.infer<typeof insertAssumptionBenchmarkSchema>;
export type AssumptionBenchmark = typeof assumption_benchmarks.$inferSelect;

// ========================================================================
// 13. Tariff Impacts (backward compat — kept from v1)
// ========================================================================
export const tariff_impacts = sqliteTable("tariff_impacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engagement_id: integer("engagement_id").notNull(),
  category_name: text("category_name"),
  supplier_name: text("supplier_name"),
  country_of_origin: text("country_of_origin"),
  tariff_layers: text("tariff_layers"),       // JSON array of {name, rate}
  effective_tariff_pct: real("effective_tariff_pct"),
  annual_spend: real("annual_spend"),
  estimated_impact: real("estimated_impact"),
  risk_level: text("risk_level"),
  mitigation_strategy: text("mitigation_strategy"),
  notes: text("notes"),
  created_at: text("created_at"),
});

export const insertTariffImpactSchema = createInsertSchema(tariff_impacts).omit({ id: true });
export type InsertTariffImpact = z.infer<typeof insertTariffImpactSchema>;
export type TariffImpact = typeof tariff_impacts.$inferSelect;

// ========================================================================
// 14. Contracts (NEW — v2)
// ========================================================================
export const contracts = sqliteTable("contracts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engagement_id: integer("engagement_id").notNull(),
  supplier_name: text("supplier_name").notNull(),       // Canonical name (post-normalization)
  category_id: integer("category_id"),
  contract_value_annual: real("contract_value_annual"),  // Annual contract value ($)
  start_date: text("start_date"),
  end_date: text("end_date"),                           // Most important field for renewal scoring
  auto_renew: integer("auto_renew").default(0),         // 1 = auto-renews unless cancelled
  payment_terms: text("payment_terms"),                 // Net-30, Net-60, 2/10 Net-30, etc.
  payment_terms_benchmark: text("payment_terms_benchmark"), // Industry benchmark payment terms for this category
  payment_terms_gap_days: integer("payment_terms_gap_days"), // Actual DPO minus benchmark DPO
  has_price_escalation: integer("has_price_escalation").default(0), // 1 = contains price escalation clause
  escalation_rate: real("escalation_rate"),              // % per year if escalation present
  escalation_index: text("escalation_index"),           // CPI | PPI | Fixed | Custom
  compliance_rate_pct: real("compliance_rate_pct"),     // % of spend covered under contract terms (0–100)
  is_sole_source: integer("is_sole_source").default(0), // 1 = no competitive alternatives at award
  notes: text("notes"),
  created_at: text("created_at"),
});

export const insertContractSchema = createInsertSchema(contracts).omit({ id: true });
export type InsertContract = z.infer<typeof insertContractSchema>;
export type Contract = typeof contracts.$inferSelect;

// ========================================================================
// 15. Procurement Maturity Assessments (NEW — v2)
// ========================================================================
export const procurement_maturity_assessments = sqliteTable("procurement_maturity_assessments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engagement_id: integer("engagement_id").notNull(),
  dimension: text("dimension").notNull(),               // strategy | organization | process | technology | supplier_mgmt | data_analytics | risk_mgmt | sustainability
  score: integer("score").notNull(),                    // 1–5: 1=Nascent, 2=Developing, 3=Established, 4=Advanced, 5=World-class
  evidence: text("evidence"),                           // Supporting evidence / observation notes
  gap_to_next_level: text("gap_to_next_level"),         // What is required to advance one level
  priority: text("priority"),                           // high | medium | low
  assessed_by: text("assessed_by"),                     // Assessor name
  assessed_at: text("assessed_at"),                     // ISO-8601 timestamp
});

export const insertProcurementMaturityAssessmentSchema = createInsertSchema(procurement_maturity_assessments).omit({ id: true });
export type InsertProcurementMaturityAssessment = z.infer<typeof insertProcurementMaturityAssessmentSchema>;
export type ProcurementMaturityAssessment = typeof procurement_maturity_assessments.$inferSelect;

// ========================================================================
// 16. Tariff Sourcing Scenarios (NEW — v2)
// ========================================================================
export const tariff_sourcing_scenarios = sqliteTable("tariff_sourcing_scenarios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engagement_id: integer("engagement_id").notNull(),
  initiative_id: integer("initiative_id"),              // FK → savings_initiatives (optional)
  category_name: text("category_name").notNull(),
  supplier_name: text("supplier_name"),
  annual_spend: real("annual_spend").notNull(),
  current_country: text("current_country").notNull(),
  current_tariff_pct: real("current_tariff_pct").notNull(),
  current_tariff_cost: real("current_tariff_cost").notNull(),
  proposed_country: text("proposed_country"),
  proposed_tariff_pct: real("proposed_tariff_pct"),
  proposed_tariff_cost: real("proposed_tariff_cost"),
  gross_savings_from_shift: real("gross_savings_from_shift"),
  tariff_delta_cost: real("tariff_delta_cost"),         // proposed_tariff_cost − current_tariff_cost
  net_savings_after_tariff: real("net_savings_after_tariff"),
  logistics_delta: real("logistics_delta"),              // Incremental logistics cost of sourcing shift
  quality_risk_cost: real("quality_risk_cost"),          // Estimated quality/transition risk cost
  total_net_benefit: real("total_net_benefit"),          // net_savings_after_tariff − logistics_delta − quality_risk_cost
  scenario_type: text("scenario_type").notNull(),       // baseline | shift | domestic | nearshore
  risk_level: text("risk_level"),
  mitigation_strategy: text("mitigation_strategy"),
  tariff_layers_json: text("tariff_layers_json"),       // JSON: [{name, rate, effective_date}]
  notes: text("notes"),
  created_at: text("created_at"),
});

export const insertTariffSourcingScenarioSchema = createInsertSchema(tariff_sourcing_scenarios).omit({ id: true });
export type InsertTariffSourcingScenario = z.infer<typeof insertTariffSourcingScenarioSchema>;
export type TariffSourcingScenario = typeof tariff_sourcing_scenarios.$inferSelect;

// ========================================================================
// 17. Monte Carlo Runs (NEW — v2)
// ========================================================================
export const monte_carlo_runs = sqliteTable("monte_carlo_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engagement_id: integer("engagement_id").notNull(),
  iterations: integer("iterations").notNull().default(10000),
  p10_savings: real("p10_savings"),
  p50_savings: real("p50_savings"),
  p90_savings: real("p90_savings"),
  p10_npv: real("p10_npv"),
  p50_npv: real("p50_npv"),
  p90_npv: real("p90_npv"),
  by_initiative_json: text("by_initiative_json"),       // JSON: {initiative_id: {p10, p50, p90}}
  by_phase_json: text("by_phase_json"),                 // JSON: {quick_win, medium_term, long_term}: {p10, p50, p90}
  run_at: text("run_at"),                               // ISO-8601 timestamp
  params_json: text("params_json"),                     // Input parameters
});

export const insertMonteCarloRunSchema = createInsertSchema(monte_carlo_runs).omit({ id: true });
export type InsertMonteCarloRun = z.infer<typeof insertMonteCarloRunSchema>;
export type MonteCarloRun = typeof monte_carlo_runs.$inferSelect;

// ========================================================================
// 18. Category Strategy (NEW — v2)
// ========================================================================
export const category_strategy = sqliteTable("category_strategy", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engagement_id: integer("engagement_id").notNull(),
  category_id: integer("category_id").notNull(),
  kraljic_quadrant: text("kraljic_quadrant"),           // Leverage | Strategic | Bottleneck | Non-critical
  supply_risk_score: real("supply_risk_score"),         // 0–100
  profit_impact_score: real("profit_impact_score"),     // 0–100
  recommended_levers_json: text("recommended_levers_json"), // JSON array of lever types
  sourcing_strategy: text("sourcing_strategy"),         // Single-source | Dual-source | Multi-source | Outsource | Insource
  contract_strategy: text("contract_strategy"),         // Spot | Annual | Multi-year | Alliance | Consortium
  target_quadrant: text("target_quadrant"),             // Where to move over 12–24 months
  transition_actions_json: text("transition_actions_json"), // JSON array of recommended actions
  transition_timeline: text("transition_timeline"),     // e.g. '12–18 months'
  owner: text("owner"),                                 // Recommended owner
  priority_rank: integer("priority_rank"),              // 1 = highest priority
  notes: text("notes"),
  created_at: text("created_at"),
});

export const insertCategoryStrategySchema = createInsertSchema(category_strategy).omit({ id: true });
export type InsertCategoryStrategy = z.infer<typeof insertCategoryStrategySchema>;
export type CategoryStrategy = typeof category_strategy.$inferSelect;

// ========================================================================
// 19. Spend Summaries (NEW — v2, pre-aggregated for performance)
// ========================================================================
export const spend_summaries = sqliteTable("spend_summaries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engagement_id: integer("engagement_id").notNull(),
  category_id: integer("category_id"),
  supplier_name: text("supplier_name"),
  total_spend: real("total_spend"),
  record_count: integer("record_count"),
  unique_suppliers: integer("unique_suppliers"),
  avg_invoice: real("avg_invoice"),
  min_date: text("min_date"),
  max_date: text("max_date"),
  non_po_rate: real("non_po_rate"),
  credit_memo_rate: real("credit_memo_rate"),
  price_cv: real("price_cv"),
  price_trend_annual_pct: real("price_trend_annual_pct"),
  gl_code_count: integer("gl_code_count"),
  computed_at: text("computed_at"),
});

export const insertSpendSummarySchema = createInsertSchema(spend_summaries).omit({ id: true });
export type InsertSpendSummary = z.infer<typeof insertSpendSummarySchema>;
export type SpendSummary = typeof spend_summaries.$inferSelect;

// ========================================================================
// 20. FX Rates (NEW — v2, multi-currency normalization)
// ========================================================================
export const fx_rates = sqliteTable("fx_rates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engagement_id: integer("engagement_id").notNull(),
  currency: text("currency").notNull(),                 // ISO-4217
  rate_to_usd: real("rate_to_usd").notNull(),
  rate_date: text("rate_date"),
  source: text("source"),                               // 'manual' | 'static_reference' | 'api'
});

export const insertFxRateSchema = createInsertSchema(fx_rates).omit({ id: true });
export type InsertFxRate = z.infer<typeof insertFxRateSchema>;
export type FxRate = typeof fx_rates.$inferSelect;

// ========================================================================
// ---- v3 NEW TABLES (21–28) ----
// ========================================================================

// ========================================================================
// 21. Agent Jobs — async job queue tracking
// ========================================================================
export const agent_jobs = sqliteTable("agent_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engagement_id: integer("engagement_id"),              // nullable for cross-engagement jobs
  agent_id: text("agent_id").notNull(),                 // 'agent_0' | 'agent_1a' | 'agent_3a' | etc.
  job_type: text("job_type").notNull(),                 // 'data_ingest' | 'market_refresh' | 'deliverable_gen' | 'supplier_risk_scan' | 'contract_extract' | 'news_scan' | 'commodity_refresh'
  status: text("status").notNull().default("queued"),   // 'queued' | 'running' | 'complete' | 'failed' | 'cancelled'
  progress_pct: integer("progress_pct").default(0),     // 0–100
  progress_message: text("progress_message"),           // Current step shown in UI
  input_json: text("input_json"),                       // JSON: job input parameters
  output_json: text("output_json"),                     // JSON: job result payload
  error_message: text("error_message"),
  retry_count: integer("retry_count").default(0),       // Max 3 with exponential backoff
  started_at: text("started_at"),
  completed_at: text("completed_at"),
  created_at: text("created_at"),
});

export const insertAgentJobSchema = createInsertSchema(agent_jobs).omit({ id: true });
export type InsertAgentJob = z.infer<typeof insertAgentJobSchema>;
export type AgentJob = typeof agent_jobs.$inferSelect;

// ========================================================================
// 22. Supplier Risk Profiles — financial + news risk per supplier
// ========================================================================
export const supplier_risk_profiles = sqliteTable("supplier_risk_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engagement_id: integer("engagement_id").notNull(),
  supplier_name: text("supplier_name").notNull(),       // Canonical normalized supplier name
  sec_cik: text("sec_cik"),                             // SEC Central Index Key (public companies only)
  altman_z_score: real("altman_z_score"),               // <1.81=distress, 1.81–2.99=grey, >2.99=safe
  revenue_trend: text("revenue_trend"),                 // 'growing' | 'declining' | 'stable'
  leverage_ratio: real("leverage_ratio"),               // Total debt / EBITDA
  financial_risk_level: text("financial_risk_level"),   // 'low' | 'medium' | 'high' | 'critical'
  news_sentiment_score: real("news_sentiment_score"),   // -1.0 to +1.0
  news_risk_flags: text("news_risk_flags"),             // JSON array: ['labor_dispute','bankruptcy_risk',...]
  latest_news_headline: text("latest_news_headline"),
  latest_news_url: text("latest_news_url"),
  article_confidence: text("article_confidence"),       // 'high' | 'medium' | 'low'
  ofac_match: integer("ofac_match").default(0),         // 0/1: found on OFAC SDN list
  sam_exclusion: integer("sam_exclusion").default(0),   // 0/1: found on SAM.gov
  overall_risk_score: real("overall_risk_score"),       // 0–100 composite
  risk_narrative: text("risk_narrative"),               // Claude-generated 2–3 sentence summary
  last_refreshed_at: text("last_refreshed_at"),
});

export const insertSupplierRiskProfileSchema = createInsertSchema(supplier_risk_profiles).omit({ id: true });
export type InsertSupplierRiskProfile = z.infer<typeof insertSupplierRiskProfileSchema>;
export type SupplierRiskProfile = typeof supplier_risk_profiles.$inferSelect;

// ========================================================================
// 23. Market Data Cache — commodity/macro/fx data with TTL
// ========================================================================
export const market_data_cache = sqliteTable("market_data_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  data_source: text("data_source").notNull(),           // 'fred' | 'bls' | 'eia' | 'yfinance' | 'world_bank_pink' | 'drewry' | 'ecb_fx'
  series_id: text("series_id").notNull(),               // yfinance: 'GC=F'. FRED: 'CPIAUCSL'. EIA: 'PET.RWTC.W'
  series_name: text("series_name"),                     // Human-readable: 'Gold Futures (COMEX)'
  category_tag: text("category_tag"),                   // 'labor' | 'commodity_metal' | 'commodity_energy' | 'commodity_ag' | 'freight' | 'macro' | 'fx' | 'ppi'
  value: real("value"),                                 // Latest data point
  unit: text("unit"),                                   // '$/oz' | '$/barrel' | 'index' | '% YoY'
  period: text("period"),                               // '2026-03-21' for yfinance, '2026-02' for FRED monthly
  yoy_change_pct: real("yoy_change_pct"),
  mom_change_pct: real("mom_change_pct"),
  raw_json: text("raw_json"),                           // Full API response serialized as JSON
  fetched_at: text("fetched_at"),
  ttl_hours: integer("ttl_hours"),                      // yfinance=1, FRED=24, BLS=24, EIA=12, World Bank=168, FX=4
});

export const insertMarketDataCacheSchema = createInsertSchema(market_data_cache).omit({ id: true });
export type InsertMarketDataCache = z.infer<typeof insertMarketDataCacheSchema>;
export type MarketDataCache = typeof market_data_cache.$inferSelect;

// ========================================================================
// 24. Contract Extractions — Claude-extracted contract fields
// ========================================================================
export const contract_extractions = sqliteTable("contract_extractions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engagement_id: integer("engagement_id").notNull(),
  contract_id: integer("contract_id"),                  // FK → contracts.id (populated if confidence > 0.7)
  file_name: text("file_name").notNull(),
  file_path: text("file_path"),
  extraction_status: text("extraction_status").default("pending"), // 'pending' | 'processing' | 'complete' | 'failed'
  supplier_name_extracted: text("supplier_name_extracted"),
  contract_value_extracted: real("contract_value_extracted"),
  start_date_extracted: text("start_date_extracted"),
  end_date_extracted: text("end_date_extracted"),
  payment_terms_extracted: text("payment_terms_extracted"),
  auto_renewal_extracted: integer("auto_renewal_extracted").default(0),
  escalation_clause_extracted: text("escalation_clause_extracted"),
  key_clauses_json: text("key_clauses_json"),           // JSON: {termination_rights, SLA, liability_cap, exclusivity, notice_period}
  risk_flags_json: text("risk_flags_json"),             // JSON array of risk clauses
  confidence_score: real("confidence_score"),           // 0.0–1.0. >0.7 auto-creates contracts row
  raw_text: text("raw_text"),                           // Full extracted plain text
  claude_summary: text("claude_summary"),               // 3-sentence contract brief
  extracted_at: text("extracted_at"),
});

export const insertContractExtractionSchema = createInsertSchema(contract_extractions).omit({ id: true });
export type InsertContractExtraction = z.infer<typeof insertContractExtractionSchema>;
export type ContractExtraction = typeof contract_extractions.$inferSelect;

// ========================================================================
// 25. Deliverable Outputs — generated file tracking
// ========================================================================
export const deliverable_outputs = sqliteTable("deliverable_outputs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engagement_id: integer("engagement_id").notNull(),
  deliverable_type: text("deliverable_type").notNull(), // 'steerco_pptx' | 'odd_memo_docx' | 'excel_model' | 'pdf_snapshot'
  file_name: text("file_name").notNull(),
  file_path: text("file_path").notNull(),
  file_size_bytes: integer("file_size_bytes"),
  claude_model_version: text("claude_model_version"),
  token_count: integer("token_count"),
  generated_at: text("generated_at"),
});

export const insertDeliverableOutputSchema = createInsertSchema(deliverable_outputs).omit({ id: true });
export type InsertDeliverableOutput = z.infer<typeof insertDeliverableOutputSchema>;
export type DeliverableOutput = typeof deliverable_outputs.$inferSelect;

// ========================================================================
// 26. Watchlist Alerts — contract expiry, supplier distress, commodity spikes
// ========================================================================
export const watchlist_alerts = sqliteTable("watchlist_alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engagement_id: integer("engagement_id").notNull(),
  alert_type: text("alert_type").notNull(),             // 'contract_expiry' | 'supplier_distress' | 'commodity_spike' | 'savings_at_risk' | 'ofac_match'
  severity: text("severity").notNull(),                 // 'low' | 'medium' | 'high' | 'critical'
  title: text("title").notNull(),
  message: text("message"),
  related_entity_type: text("related_entity_type"),     // 'contract' | 'supplier' | 'commodity' | 'initiative'
  related_entity_id: integer("related_entity_id"),
  is_acknowledged: integer("is_acknowledged").default(0),
  is_resolved: integer("is_resolved").default(0),
  acknowledged_at: text("acknowledged_at"),
  resolved_at: text("resolved_at"),
  created_at: text("created_at"),
});

export const insertWatchlistAlertSchema = createInsertSchema(watchlist_alerts).omit({ id: true });
export type InsertWatchlistAlert = z.infer<typeof insertWatchlistAlertSchema>;
export type WatchlistAlert = typeof watchlist_alerts.$inferSelect;

// ========================================================================
// 27. Copilot Sessions — NL co-pilot conversation history
// ========================================================================
export const copilot_sessions = sqliteTable("copilot_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engagement_id: integer("engagement_id").notNull(),
  session_name: text("session_name"),                   // User-assigned name
  message_history_json: text("message_history_json"),   // Full [{role, content}] array as JSON
  tool_calls_json: text("tool_calls_json"),             // JSON array of tool calls made
  data_sources_json: text("data_sources_json"),         // JSON array of data sources referenced
  created_at: text("created_at"),
  updated_at: text("updated_at"),
});

export const insertCopilotSessionSchema = createInsertSchema(copilot_sessions).omit({ id: true });
export type InsertCopilotSession = z.infer<typeof insertCopilotSessionSchema>;
export type CopilotSession = typeof copilot_sessions.$inferSelect;

// ========================================================================
// 28. Portfolio Snapshots — nightly cross-engagement KPI aggregates
// ========================================================================
export const portfolio_snapshots = sqliteTable("portfolio_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  snapshot_date: text("snapshot_date").notNull(),       // ISO-8601 date
  total_pipeline_usd: real("total_pipeline_usd"),
  total_realized_usd: real("total_realized_usd"),
  avg_savings_rate_pct: real("avg_savings_rate_pct"),
  at_risk_initiative_count: integer("at_risk_initiative_count"),
  active_engagement_count: integer("active_engagement_count"),
  peer_benchmark_json: text("peer_benchmark_json"),     // JSON: anonymized benchmarks by industry/size
  computed_at: text("computed_at"),
});

export const insertPortfolioSnapshotSchema = createInsertSchema(portfolio_snapshots).omit({ id: true });
export type InsertPortfolioSnapshot = z.infer<typeof insertPortfolioSnapshotSchema>;
export type PortfolioSnapshot = typeof portfolio_snapshots.$inferSelect;

// ========================================================================
// ---- v4 NEW TABLES (29–30): Pipeline Orchestration ----
// ========================================================================

// ========================================================================
// 29. Pipeline Runs — orchestrated engagement pipelines
// ========================================================================
export const pipeline_runs = sqliteTable("pipeline_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engagement_id: integer("engagement_id").notNull(),
  pipeline_type: text("pipeline_type").notNull(),           // 'diagnostic' | 'odd' | 'transformation'
  status: text("status").notNull().default("pending"),      // 'pending' | 'running' | 'paused' | 'complete' | 'failed' | 'cancelled'
  config_json: text("config_json"),                         // Pipeline configuration overrides
  total_steps: integer("total_steps"),
  completed_steps: integer("completed_steps").default(0),
  current_step: text("current_step"),                       // Human-readable current step description
  error_message: text("error_message"),
  started_at: text("started_at"),
  completed_at: text("completed_at"),
  created_at: text("created_at"),
});

export const insertPipelineRunSchema = createInsertSchema(pipeline_runs).omit({ id: true });
export type InsertPipelineRun = z.infer<typeof insertPipelineRunSchema>;
export type PipelineRun = typeof pipeline_runs.$inferSelect;

// ========================================================================
// 30. Pipeline Steps — individual steps within a pipeline run
// ========================================================================
export const pipeline_steps = sqliteTable("pipeline_steps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pipeline_run_id: integer("pipeline_run_id").notNull(),
  step_id: text("step_id").notNull(),                       // 'data_intake' | 'cleansing' | 'categorization' | etc.
  step_label: text("step_label").notNull(),                 // Human-readable: 'Data Intake', 'Cleansing', etc.
  step_order: integer("step_order").notNull(),
  status: text("status").notNull().default("pending"),      // 'pending' | 'ready' | 'running' | 'complete' | 'failed' | 'skipped' | 'awaiting_review' | 'rejected'
  depends_on_json: text("depends_on_json"),                 // JSON array of step_ids this step depends on
  parallel_group: text("parallel_group"),                   // Steps in same group can run concurrently
  requires_review: integer("requires_review").default(0),   // 1 = pauses for human approval after completion
  agent_job_id: integer("agent_job_id"),                    // FK to agent_jobs when dispatched
  input_json: text("input_json"),                           // Step-specific config/params
  output_json: text("output_json"),                         // Summary artifacts/metrics from this step
  review_notes: text("review_notes"),                       // Human reviewer notes
  reviewed_by: text("reviewed_by"),
  error_message: text("error_message"),
  started_at: text("started_at"),
  completed_at: text("completed_at"),
  created_at: text("created_at"),
});

export const insertPipelineStepSchema = createInsertSchema(pipeline_steps).omit({ id: true });
export type InsertPipelineStep = z.infer<typeof insertPipelineStepSchema>;
export type PipelineStep = typeof pipeline_steps.$inferSelect;
