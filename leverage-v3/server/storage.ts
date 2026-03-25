import {
  engagements, categories, spend_records, savings_initiatives,
  scenarios, data_imports, realization_entries, cash_flow_phasing,
  cleansing_audit_log, supplier_mappings, category_rules, assumption_benchmarks,
  tariff_impacts, contracts, procurement_maturity_assessments,
  tariff_sourcing_scenarios, monte_carlo_runs, category_strategy,
  spend_summaries, fx_rates,
  // v3 tables
  agent_jobs, supplier_risk_profiles, market_data_cache, contract_extractions,
  deliverable_outputs, watchlist_alerts, copilot_sessions, portfolio_snapshots,
  // v4 tables (Command Center)
  cc_engagements, cc_team_members, cc_drl_items, cc_rif_entries,
  cc_work_plan_phases, cc_work_plan_tasks, cc_meetings, cc_action_items,
  cc_emails, cc_interview_guides, cc_stakeholders, cc_risks_issues,
  cc_decisions, cc_milestones, cc_documents, cc_status_reports,
  cc_key_metrics, cc_metric_snapshots,
  type Engagement, type InsertEngagement,
  type Category, type InsertCategory,
  type SpendRecord, type InsertSpendRecord,
  type Initiative, type InsertInitiative,
  type Scenario, type InsertScenario,
  type DataImport, type InsertDataImport,
  type RealizationEntry, type InsertRealizationEntry,
  type CashFlowPhasing, type InsertCashFlowPhasing,
  type CleansingAuditLog, type InsertCleansingAuditLog,
  type SupplierMapping, type InsertSupplierMapping,
  type CategoryRule, type InsertCategoryRule,
  type AssumptionBenchmark, type InsertAssumptionBenchmark,
  type TariffImpact, type InsertTariffImpact,
  type Contract, type InsertContract,
  type ProcurementMaturityAssessment, type InsertProcurementMaturityAssessment,
  type TariffSourcingScenario, type InsertTariffSourcingScenario,
  type MonteCarloRun, type InsertMonteCarloRun,
  type CategoryStrategy, type InsertCategoryStrategy,
  type SpendSummary, type InsertSpendSummary,
  type FxRate, type InsertFxRate,
  // v3 types
  type AgentJob, type InsertAgentJob,
  type SupplierRiskProfile, type InsertSupplierRiskProfile,
  type MarketDataCache, type InsertMarketDataCache,
  type ContractExtraction, type InsertContractExtraction,
  type DeliverableOutput, type InsertDeliverableOutput,
  type WatchlistAlert, type InsertWatchlistAlert,
  type CopilotSession, type InsertCopilotSession,
  type PortfolioSnapshot, type InsertPortfolioSnapshot,
  // v4 types (Command Center)
  type CcEngagement, type InsertCcEngagement,
  type CcTeamMember, type InsertCcTeamMember,
  type CcDrlItem, type InsertCcDrlItem,
  type CcRifEntry, type InsertCcRifEntry,
  type CcWorkPlanPhase, type InsertCcWorkPlanPhase,
  type CcWorkPlanTask, type InsertCcWorkPlanTask,
  type CcMeeting, type InsertCcMeeting,
  type CcActionItem, type InsertCcActionItem,
  type CcEmail, type InsertCcEmail,
  type CcInterviewGuide, type InsertCcInterviewGuide,
  type CcStakeholder, type InsertCcStakeholder,
  type CcRiskIssue, type InsertCcRiskIssue,
  type CcDecision, type InsertCcDecision,
  type CcMilestone, type InsertCcMilestone,
  type CcDocument, type InsertCcDocument,
  type CcStatusReport, type InsertCcStatusReport,
  type CcKeyMetric, type InsertCcKeyMetric,
  type CcMetricSnapshot, type InsertCcMetricSnapshot,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and, sql, desc, asc, like, isNull } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

// Try better-sqlite3 (native, fast), fall back to sql.js (pure WASM, no compilation)
let db: ReturnType<typeof drizzle>;
let sqlite: any;
let _saveToDisk: (() => void) | null = null;

try {
  const BetterSqlite3 = (await import("better-sqlite3")).default;
  sqlite = new BetterSqlite3("data.db");
  sqlite.pragma("journal_mode = WAL");
  db = drizzle(sqlite);
  console.log("[db] Using better-sqlite3 (native)");
} catch {
  // Fallback: sql.js (pure JavaScript SQLite via WebAssembly)
  const initSqlJs = (await import("sql.js")).default;
  const { drizzle: drizzleSqlJs } = await import("drizzle-orm/sql-js");
  const SQL = await initSqlJs();
  const dbPath = path.resolve("data.db");

  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    sqlite = new SQL.Database(buf);
  } else {
    sqlite = new SQL.Database();
  }

  db = drizzleSqlJs(sqlite) as any;

  // sql.js is in-memory — persist to disk periodically
  _saveToDisk = () => {
    try {
      const data = sqlite.export();
      fs.writeFileSync(dbPath, Buffer.from(data));
    } catch {}
  };
  setInterval(_saveToDisk, 5000);
  process.on("exit", _saveToDisk);
  process.on("SIGINT", () => { _saveToDisk?.(); process.exit(); });
  console.log("[db] Using sql.js (WASM — no native compilation needed)");
}

export { db };

// Helper: sqlite.pragma() works in better-sqlite3 but not sql.js
// Wrap to handle both drivers
function sqlitePragma(pragma: string): any[] {
  try {
    if (typeof sqlite.pragma === "function") {
      return sqlite.pragma(pragma);
    }
    // sql.js: use exec
    const result = sqliteExec(`PRAGMA ${pragma}`);
    if (result.length > 0 && result[0].values.length > 0) {
      const cols = result[0].columns;
      return result[0].values.map((row: any[]) => {
        const obj: any = {};
        cols.forEach((c: string, i: number) => { obj[c] = row[i]; });
        return obj;
      });
    }
    return [];
  } catch { return []; }
}

function sqliteExec(sqlStr: string) {
  if (typeof sqlite.exec === "function") {
    sqlite.exec(sqlStr);
  }
}

// ========================================================================
// Schema v2 — DDL with all tables, new columns, and indexes
// ========================================================================

// Check current schema version
const currentVersion = (sqlitePragma("user_version") as { user_version: number }[])[0]?.user_version ?? 0;

if (currentVersion < 2) {
  // Drop and recreate all tables for v2 (fresh deploy strategy per spec 7D.1)
  sqliteExec(`
    -- Drop all existing tables (v2 is a clean-slate schema migration)
    DROP TABLE IF EXISTS tariff_impacts;
    DROP TABLE IF EXISTS assumption_benchmarks;
    DROP TABLE IF EXISTS category_rules;
    DROP TABLE IF EXISTS supplier_mappings;
    DROP TABLE IF EXISTS cleansing_audit_log;
    DROP TABLE IF EXISTS cash_flow_phasing;
    DROP TABLE IF EXISTS realization_entries;
    DROP TABLE IF EXISTS data_imports;
    DROP TABLE IF EXISTS scenarios;
    DROP TABLE IF EXISTS savings_initiatives;
    DROP TABLE IF EXISTS spend_records;
    DROP TABLE IF EXISTS categories;
    DROP TABLE IF EXISTS engagements;
    DROP TABLE IF EXISTS contracts;
    DROP TABLE IF EXISTS procurement_maturity_assessments;
    DROP TABLE IF EXISTS tariff_sourcing_scenarios;
    DROP TABLE IF EXISTS monte_carlo_runs;
    DROP TABLE IF EXISTS category_strategy;
    DROP TABLE IF EXISTS spend_summaries;
    DROP TABLE IF EXISTS fx_rates;

    -- ================================================================
    -- 1. Engagements (extended for v2)
    -- ================================================================
    CREATE TABLE engagements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      portfolio_company TEXT NOT NULL,
      pe_sponsor TEXT,
      engagement_mode TEXT NOT NULL DEFAULT 'pe_100_day',
      start_date TEXT,
      end_date TEXT,
      target_close_date TEXT,
      business_type TEXT,
      company_size TEXT,
      industry TEXT,
      location TEXT,
      geography TEXT,
      annual_revenue REAL,
      total_addressable_spend REAL,
      ebitda_margin_pct REAL,
      procurement_maturity TEXT,
      discount_rate REAL NOT NULL DEFAULT 0.10,
      status TEXT NOT NULL DEFAULT 'active',
      client_logo_url TEXT,
      report_header_text TEXT,
      report_color_primary TEXT,
      report_color_secondary TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    -- ================================================================
    -- 2. Categories
    -- ================================================================
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      level TEXT NOT NULL,
      parent_id INTEGER,
      is_global INTEGER DEFAULT 1
    );

    -- ================================================================
    -- 3. Spend Records (extended for v2)
    -- ================================================================
    CREATE TABLE spend_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      data_import_id INTEGER,
      supplier_name TEXT NOT NULL,
      normalized_supplier_name TEXT,
      vendor_id TEXT,
      amount REAL NOT NULL,
      invoice_number TEXT,
      description TEXT,
      gl_code TEXT,
      gl_description TEXT,
      date TEXT,
      payment_date TEXT,
      due_date TEXT,
      business_unit TEXT,
      cost_center TEXT,
      project_code TEXT,
      po_number TEXT,
      po_type TEXT,
      contract_id TEXT,
      payment_terms TEXT,
      country_of_origin TEXT,
      currency TEXT DEFAULT 'USD',
      original_amount REAL,
      category_id INTEGER,
      is_duplicate_flag INTEGER DEFAULT 0,
      is_outlier_flag INTEGER DEFAULT 0,
      spend_flag TEXT,
      l1_category TEXT,
      l2_category TEXT,
      l3_category TEXT,
      created_at TEXT
    );

    -- ================================================================
    -- 4. Savings Initiatives (extended for v2)
    -- ================================================================
    CREATE TABLE savings_initiatives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      category_id INTEGER,
      lever_type TEXT,
      phase TEXT,
      confidence TEXT,
      status TEXT NOT NULL DEFAULT 'identified',
      target_amount REAL,
      realized_amount REAL DEFAULT 0,
      probability REAL,
      risk_adjusted_target REAL,
      expected_realization_date TEXT,
      implementation_owner TEXT,
      is_at_risk INTEGER DEFAULT 0,
      at_risk_reason TEXT,
      cta_override REAL,
      notes TEXT,
      scoring_json TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    -- ================================================================
    -- 5. Scenarios
    -- ================================================================
    CREATE TABLE scenarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      initiative_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      assumptions TEXT,
      estimated_annual_savings REAL,
      is_selected INTEGER DEFAULT 0,
      created_at TEXT
    );

    -- ================================================================
    -- 6. Data Imports (extended — staging_data for crash-resilient imports)
    -- ================================================================
    CREATE TABLE data_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      record_count INTEGER,
      status TEXT DEFAULT 'pending',
      column_mapping TEXT,
      staging_data TEXT,
      created_at TEXT
    );

    -- ================================================================
    -- 7. Realization Entries
    -- ================================================================
    CREATE TABLE realization_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      initiative_id INTEGER NOT NULL,
      date TEXT,
      amount REAL NOT NULL,
      notes TEXT,
      created_at TEXT
    );

    -- ================================================================
    -- 8. Cash Flow Phasing
    -- ================================================================
    CREATE TABLE cash_flow_phasing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER,
      initiative_id INTEGER,
      date TEXT,
      amount REAL,
      is_actual INTEGER DEFAULT 0
    );

    -- ================================================================
    -- 9. Cleansing Audit Log
    -- ================================================================
    CREATE TABLE cleansing_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER,
      record_id INTEGER,
      action TEXT,
      field TEXT,
      old_value TEXT,
      new_value TEXT,
      reason TEXT,
      created_at TEXT
    );

    -- ================================================================
    -- 10. Supplier Mappings
    -- ================================================================
    CREATE TABLE supplier_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER,
      original_name TEXT,
      canonical_name TEXT,
      created_at TEXT
    );

    -- ================================================================
    -- 11. Category Rules
    -- ================================================================
    CREATE TABLE category_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER,
      match_field TEXT,
      match_type TEXT,
      match_value TEXT,
      category_id INTEGER,
      priority INTEGER
    );

    -- ================================================================
    -- 12. Assumption Benchmarks
    -- ================================================================
    CREATE TABLE assumption_benchmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER,
      lever_type TEXT,
      category TEXT,
      metric_name TEXT,
      low_value REAL,
      mid_value REAL,
      high_value REAL,
      unit TEXT,
      source TEXT,
      rationale TEXT
    );

    -- ================================================================
    -- 13. Tariff Impacts (backward compat from v1)
    -- ================================================================
    CREATE TABLE tariff_impacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      category_name TEXT,
      supplier_name TEXT,
      country_of_origin TEXT,
      tariff_layers TEXT,
      effective_tariff_pct REAL,
      annual_spend REAL,
      estimated_impact REAL,
      risk_level TEXT,
      mitigation_strategy TEXT,
      notes TEXT,
      created_at TEXT
    );

    -- ================================================================
    -- 14. Contracts (NEW — v2)
    -- ================================================================
    CREATE TABLE contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      supplier_name TEXT NOT NULL,
      category_id INTEGER,
      contract_value_annual REAL,
      start_date TEXT,
      end_date TEXT,
      auto_renew INTEGER DEFAULT 0,
      payment_terms TEXT,
      payment_terms_benchmark TEXT,
      payment_terms_gap_days INTEGER,
      has_price_escalation INTEGER DEFAULT 0,
      escalation_rate REAL,
      escalation_index TEXT,
      compliance_rate_pct REAL,
      is_sole_source INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT
    );

    -- ================================================================
    -- 15. Procurement Maturity Assessments (NEW — v2)
    -- ================================================================
    CREATE TABLE procurement_maturity_assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      dimension TEXT NOT NULL,
      score INTEGER NOT NULL,
      evidence TEXT,
      gap_to_next_level TEXT,
      priority TEXT,
      assessed_by TEXT,
      assessed_at TEXT
    );

    -- ================================================================
    -- 16. Tariff Sourcing Scenarios (NEW — v2)
    -- ================================================================
    CREATE TABLE tariff_sourcing_scenarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      initiative_id INTEGER,
      category_name TEXT NOT NULL,
      supplier_name TEXT,
      annual_spend REAL NOT NULL,
      current_country TEXT NOT NULL,
      current_tariff_pct REAL NOT NULL,
      current_tariff_cost REAL NOT NULL,
      proposed_country TEXT,
      proposed_tariff_pct REAL,
      proposed_tariff_cost REAL,
      gross_savings_from_shift REAL,
      tariff_delta_cost REAL,
      net_savings_after_tariff REAL,
      logistics_delta REAL,
      quality_risk_cost REAL,
      total_net_benefit REAL,
      scenario_type TEXT NOT NULL,
      risk_level TEXT,
      mitigation_strategy TEXT,
      tariff_layers_json TEXT,
      notes TEXT,
      created_at TEXT
    );

    -- ================================================================
    -- 17. Monte Carlo Runs (NEW — v2)
    -- ================================================================
    CREATE TABLE monte_carlo_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      iterations INTEGER NOT NULL DEFAULT 10000,
      p10_savings REAL,
      p50_savings REAL,
      p90_savings REAL,
      p10_npv REAL,
      p50_npv REAL,
      p90_npv REAL,
      by_initiative_json TEXT,
      by_phase_json TEXT,
      run_at TEXT,
      params_json TEXT
    );

    -- ================================================================
    -- 18. Category Strategy (NEW — v2)
    -- ================================================================
    CREATE TABLE category_strategy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      kraljic_quadrant TEXT,
      supply_risk_score REAL,
      profit_impact_score REAL,
      recommended_levers_json TEXT,
      sourcing_strategy TEXT,
      contract_strategy TEXT,
      target_quadrant TEXT,
      transition_actions_json TEXT,
      transition_timeline TEXT,
      owner TEXT,
      priority_rank INTEGER,
      notes TEXT,
      created_at TEXT
    );

    -- ================================================================
    -- 19. Spend Summaries (NEW — v2, pre-aggregated for performance)
    -- ================================================================
    CREATE TABLE spend_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      category_id INTEGER,
      supplier_name TEXT,
      total_spend REAL,
      record_count INTEGER,
      unique_suppliers INTEGER,
      avg_invoice REAL,
      min_date TEXT,
      max_date TEXT,
      non_po_rate REAL,
      credit_memo_rate REAL,
      price_cv REAL,
      price_trend_annual_pct REAL,
      gl_code_count INTEGER,
      computed_at TEXT
    );

    -- ================================================================
    -- 20. FX Rates (NEW — v2, multi-currency normalization)
    -- ================================================================
    CREATE TABLE fx_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      currency TEXT NOT NULL,
      rate_to_usd REAL NOT NULL,
      rate_date TEXT,
      source TEXT
    );

    -- ================================================================
    -- Indexes for performance (7C.2)
    -- ================================================================
    CREATE INDEX idx_spend_engagement ON spend_records(engagement_id);
    CREATE INDEX idx_spend_category ON spend_records(engagement_id, category_id);
    CREATE INDEX idx_spend_supplier ON spend_records(engagement_id, normalized_supplier_name);
    CREATE INDEX idx_spend_date ON spend_records(engagement_id, date);
    CREATE INDEX idx_initiatives_engagement ON savings_initiatives(engagement_id);
    CREATE INDEX idx_contracts_engagement ON contracts(engagement_id);
    CREATE INDEX idx_summaries_engagement ON spend_summaries(engagement_id);

    -- Set schema version
    PRAGMA user_version = 2;
  `);

  console.log("Schema v2 initialized (fresh tables + indexes).");
}

if (currentVersion < 3) {
  sqliteExec(`
    -- ================================================================
    -- v3 Migration: Add 8 new tables. Non-destructive (CREATE IF NOT EXISTS).
    -- ================================================================

    -- 21. Agent Jobs
    CREATE TABLE IF NOT EXISTS agent_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER,
      agent_id TEXT NOT NULL,
      job_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      progress_pct INTEGER DEFAULT 0,
      progress_message TEXT,
      input_json TEXT,
      output_json TEXT,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT
    );

    -- 22. Supplier Risk Profiles
    CREATE TABLE IF NOT EXISTS supplier_risk_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      supplier_name TEXT NOT NULL,
      sec_cik TEXT,
      altman_z_score REAL,
      revenue_trend TEXT,
      leverage_ratio REAL,
      financial_risk_level TEXT,
      news_sentiment_score REAL,
      news_risk_flags TEXT,
      latest_news_headline TEXT,
      latest_news_url TEXT,
      article_confidence TEXT,
      ofac_match INTEGER DEFAULT 0,
      sam_exclusion INTEGER DEFAULT 0,
      overall_risk_score REAL,
      risk_narrative TEXT,
      last_refreshed_at TEXT
    );

    -- 23. Market Data Cache
    CREATE TABLE IF NOT EXISTS market_data_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data_source TEXT NOT NULL,
      series_id TEXT NOT NULL,
      series_name TEXT,
      category_tag TEXT,
      value REAL,
      unit TEXT,
      period TEXT,
      yoy_change_pct REAL,
      mom_change_pct REAL,
      raw_json TEXT,
      fetched_at TEXT,
      ttl_hours INTEGER
    );

    -- 24. Contract Extractions
    CREATE TABLE IF NOT EXISTS contract_extractions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      contract_id INTEGER,
      file_name TEXT NOT NULL,
      file_path TEXT,
      extraction_status TEXT DEFAULT 'pending',
      supplier_name_extracted TEXT,
      contract_value_extracted REAL,
      start_date_extracted TEXT,
      end_date_extracted TEXT,
      payment_terms_extracted TEXT,
      auto_renewal_extracted INTEGER DEFAULT 0,
      escalation_clause_extracted TEXT,
      key_clauses_json TEXT,
      risk_flags_json TEXT,
      confidence_score REAL,
      raw_text TEXT,
      claude_summary TEXT,
      extracted_at TEXT
    );

    -- 25. Deliverable Outputs
    CREATE TABLE IF NOT EXISTS deliverable_outputs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      deliverable_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size_bytes INTEGER,
      claude_model_version TEXT,
      token_count INTEGER,
      generated_at TEXT
    );

    -- 26. Watchlist Alerts
    CREATE TABLE IF NOT EXISTS watchlist_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      related_entity_type TEXT,
      related_entity_id INTEGER,
      is_acknowledged INTEGER DEFAULT 0,
      is_resolved INTEGER DEFAULT 0,
      acknowledged_at TEXT,
      resolved_at TEXT,
      created_at TEXT
    );

    -- 27. Copilot Sessions
    CREATE TABLE IF NOT EXISTS copilot_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      session_name TEXT,
      message_history_json TEXT,
      tool_calls_json TEXT,
      data_sources_json TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    -- 28. Portfolio Snapshots
    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_date TEXT NOT NULL,
      total_pipeline_usd REAL,
      total_realized_usd REAL,
      avg_savings_rate_pct REAL,
      at_risk_initiative_count INTEGER,
      active_engagement_count INTEGER,
      peer_benchmark_json TEXT,
      computed_at TEXT
    );

    -- Indexes for v3 tables
    CREATE INDEX IF NOT EXISTS idx_agent_jobs_engagement ON agent_jobs(engagement_id);
    CREATE INDEX IF NOT EXISTS idx_agent_jobs_status ON agent_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_supplier_risk_engagement ON supplier_risk_profiles(engagement_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_risk_name ON supplier_risk_profiles(engagement_id, supplier_name);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_market_cache_series ON market_data_cache(data_source, series_id);
    CREATE INDEX IF NOT EXISTS idx_contract_extractions_engagement ON contract_extractions(engagement_id);
    CREATE INDEX IF NOT EXISTS idx_deliverables_engagement ON deliverable_outputs(engagement_id);
    CREATE INDEX IF NOT EXISTS idx_watchlist_engagement ON watchlist_alerts(engagement_id, is_resolved);
    CREATE INDEX IF NOT EXISTS idx_copilot_engagement ON copilot_sessions(engagement_id);

    PRAGMA user_version = 3;
  `);

  console.log("Schema v3 applied: 8 new tables (agent_jobs, supplier_risk_profiles, market_data_cache, contract_extractions, deliverable_outputs, watchlist_alerts, copilot_sessions, portfolio_snapshots).");
}

// ========================================================================
// Schema v4 — Command Center tables (29–46)
// ========================================================================
if (currentVersion < 4) {
  sqliteExec(`
    -- 29. CC Engagements
    CREATE TABLE IF NOT EXISTS cc_engagements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      portfolio_company TEXT NOT NULL,
      pe_sponsor TEXT,
      industry TEXT,
      engagement_type TEXT NOT NULL,
      deal_stage TEXT,
      scope_description TEXT,
      workstreams_in_scope TEXT,
      key_contacts TEXT,
      budget REAL,
      fee_structure TEXT,
      start_date TEXT,
      end_date TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT,
      updated_at TEXT
    );

    -- 30. CC Team Members
    CREATE TABLE IF NOT EXISTS cc_team_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      member_type TEXT NOT NULL,
      role TEXT,
      title TEXT,
      company TEXT,
      department TEXT,
      workstream TEXT,
      availability TEXT,
      start_date TEXT,
      end_date TEXT,
      notes TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT
    );

    -- 31. CC DRL Items
    CREATE TABLE IF NOT EXISTS cc_drl_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      item_number INTEGER,
      document_name TEXT NOT NULL,
      category TEXT,
      workstream TEXT,
      status TEXT DEFAULT 'requested',
      priority TEXT DEFAULT 'medium',
      owner_id INTEGER,
      source_contact TEXT,
      source_email TEXT,
      due_date TEXT,
      date_requested TEXT,
      date_received TEXT,
      follow_up_count INTEGER DEFAULT 0,
      last_follow_up_date TEXT,
      file_link TEXT,
      materiality_flag INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    -- 32. CC RIF Entries
    CREATE TABLE IF NOT EXISTS cc_rif_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      employee_id TEXT,
      employee_name TEXT NOT NULL,
      title TEXT,
      department TEXT,
      business_unit TEXT,
      country TEXT,
      location TEXT,
      compensation REAL,
      severance_estimate REAL,
      benefits_cost REAL,
      status TEXT DEFAULT 'identified',
      notification_date TEXT,
      last_day TEXT,
      replacement_plan TEXT,
      legal_review_flag INTEGER DEFAULT 0,
      union_flag INTEGER DEFAULT 0,
      ai_legal_notes TEXT,
      rehire_eligibility INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    -- 33. CC Work Plan Phases
    CREATE TABLE IF NOT EXISTS cc_work_plan_phases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      start_date TEXT,
      end_date TEXT,
      status TEXT DEFAULT 'not_started'
    );

    -- 34. CC Work Plan Tasks
    CREATE TABLE IF NOT EXISTS cc_work_plan_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      phase_id INTEGER,
      workstream TEXT,
      task_name TEXT NOT NULL,
      description TEXT,
      owner_id INTEGER,
      status TEXT DEFAULT 'not_started',
      priority TEXT DEFAULT 'medium',
      due_date TEXT,
      completed_date TEXT,
      deliverable TEXT,
      dependencies TEXT,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    -- 35. CC Meetings
    CREATE TABLE IF NOT EXISTS cc_meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      meeting_date TEXT,
      meeting_type TEXT,
      attendees TEXT,
      location TEXT,
      raw_input TEXT,
      input_type TEXT,
      file_name TEXT,
      ai_summary TEXT,
      key_takeaways TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    -- 36. CC Action Items
    CREATE TABLE IF NOT EXISTS cc_action_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      meeting_id INTEGER,
      description TEXT NOT NULL,
      owner_id INTEGER,
      owner_name TEXT,
      due_date TEXT,
      status TEXT DEFAULT 'open',
      priority TEXT DEFAULT 'medium',
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    -- 37. CC Emails
    CREATE TABLE IF NOT EXISTS cc_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      email_type TEXT NOT NULL,
      tone TEXT DEFAULT 'professional',
      subject TEXT,
      body TEXT,
      recipients TEXT,
      context_json TEXT,
      status TEXT DEFAULT 'draft',
      created_at TEXT
    );

    -- 38. CC Interview Guides
    CREATE TABLE IF NOT EXISTS cc_interview_guides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      interviewee_name TEXT,
      interviewee_role TEXT,
      workstream TEXT,
      scope_context TEXT,
      guide_content TEXT,
      status TEXT DEFAULT 'draft',
      created_at TEXT,
      updated_at TEXT
    );

    -- 39. CC Stakeholders
    CREATE TABLE IF NOT EXISTS cc_stakeholders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      title TEXT,
      company TEXT,
      role_type TEXT,
      influence_level TEXT,
      support_level TEXT,
      contact_info TEXT,
      relationship_owner_id INTEGER,
      notes TEXT,
      created_at TEXT
    );

    -- 40. CC Risks & Issues
    CREATE TABLE IF NOT EXISTS cc_risks_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT,
      severity TEXT DEFAULT 'medium',
      likelihood TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'open',
      owner_id INTEGER,
      mitigation_plan TEXT,
      due_date TEXT,
      resolved_date TEXT,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    -- 41. CC Decisions
    CREATE TABLE IF NOT EXISTS cc_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      decision_date TEXT,
      decided_by TEXT,
      rationale TEXT,
      impact TEXT,
      alternatives_considered TEXT,
      status TEXT DEFAULT 'proposed',
      meeting_id INTEGER,
      created_at TEXT
    );

    -- 42. CC Milestones
    CREATE TABLE IF NOT EXISTS cc_milestones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      target_date TEXT,
      completed_date TEXT,
      status TEXT DEFAULT 'upcoming',
      phase_id INTEGER,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT
    );

    -- 43. CC Documents
    CREATE TABLE IF NOT EXISTS cc_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      file_link TEXT,
      file_type TEXT,
      uploaded_by_id INTEGER,
      tags TEXT,
      created_at TEXT
    );

    -- 44. CC Status Reports
    CREATE TABLE IF NOT EXISTS cc_status_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      report_date TEXT,
      period_start TEXT,
      period_end TEXT,
      report_format TEXT DEFAULT 'structured',
      ai_generated_content TEXT,
      accomplishments TEXT,
      next_steps TEXT,
      risks_escalations TEXT,
      status TEXT DEFAULT 'draft',
      created_at TEXT
    );

    -- 45. CC Key Metrics
    CREATE TABLE IF NOT EXISTS cc_key_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      metric_category TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      period_type TEXT,
      period_label TEXT,
      value REAL,
      unit TEXT,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    -- 46. CC Metric Snapshots
    CREATE TABLE IF NOT EXISTS cc_metric_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      snapshot_date TEXT NOT NULL,
      snapshot_label TEXT,
      metrics_json TEXT,
      created_at TEXT
    );

    -- Indexes for v4 Command Center tables
    CREATE INDEX IF NOT EXISTS idx_cc_team_engagement ON cc_team_members(engagement_id);
    CREATE INDEX IF NOT EXISTS idx_cc_drl_engagement ON cc_drl_items(engagement_id);
    CREATE INDEX IF NOT EXISTS idx_cc_drl_status ON cc_drl_items(engagement_id, status);
    CREATE INDEX IF NOT EXISTS idx_cc_rif_engagement ON cc_rif_entries(engagement_id);
    CREATE INDEX IF NOT EXISTS idx_cc_tasks_engagement ON cc_work_plan_tasks(engagement_id);
    CREATE INDEX IF NOT EXISTS idx_cc_tasks_phase ON cc_work_plan_tasks(phase_id);
    CREATE INDEX IF NOT EXISTS idx_cc_meetings_engagement ON cc_meetings(engagement_id);
    CREATE INDEX IF NOT EXISTS idx_cc_actions_engagement ON cc_action_items(engagement_id);
    CREATE INDEX IF NOT EXISTS idx_cc_actions_status ON cc_action_items(engagement_id, status);
    CREATE INDEX IF NOT EXISTS idx_cc_metrics_engagement ON cc_key_metrics(engagement_id);
    CREATE INDEX IF NOT EXISTS idx_cc_stakeholders_engagement ON cc_stakeholders(engagement_id);
    CREATE INDEX IF NOT EXISTS idx_cc_risks_engagement ON cc_risks_issues(engagement_id);

    PRAGMA user_version = 4;
  `);

  console.log("Schema v4 applied: 18 new Command Center tables (cc_engagements, cc_team_members, cc_drl_items, cc_rif_entries, cc_work_plan_phases, cc_work_plan_tasks, cc_meetings, cc_action_items, cc_emails, cc_interview_guides, cc_stakeholders, cc_risks_issues, cc_decisions, cc_milestones, cc_documents, cc_status_reports, cc_key_metrics, cc_metric_snapshots).");
}

function seedDatabase() {
  const existing = db.select().from(engagements).all();
  if (existing.length > 0) return;

  // Find seed data file
  let seedPath = path.resolve("../leverage-ref/seed-data.json");
  if (!fs.existsSync(seedPath)) {
    seedPath = path.resolve("leverage-ref/seed-data.json");
  }
  if (!fs.existsSync(seedPath)) {
    console.log("Seed data file not found, creating demo engagement with v2 fields");

    // Create a minimal demo engagement with v2 fields
    const now = new Date().toISOString();
    db.insert(engagements).values({
      name: "Demo: Acme Manufacturing — Procurement Assessment",
      portfolio_company: "Acme Manufacturing Corp",
      pe_sponsor: "Summit Partners",
      engagement_mode: "pe_100_day",
      start_date: "2026-01-15",
      end_date: "2026-07-15",
      target_close_date: "2026-04-15",
      business_type: "manufacturer",
      company_size: "mid_market",
      industry: "Manufacturing",
      location: "Chicago, IL",
      geography: "north_america",
      annual_revenue: 450000000,
      ebitda_margin_pct: 12.5,
      procurement_maturity: "developing",
      discount_rate: 0.10,
      status: "active",
      created_at: now,
      updated_at: now,
    }).run();

    console.log("Demo engagement created with v2 fields.");
    return;
  }

  const seedData = JSON.parse(fs.readFileSync(seedPath, "utf-8"));
  console.log("Seeding database...");

  // Engagements
  for (const e of seedData.engagements || []) {
    db.insert(engagements).values({
      name: e.name,
      portfolio_company: e.portfolio_company,
      pe_sponsor: e.pe_sponsor,
      engagement_mode: e.engagement_mode || "pe_100_day",
      start_date: e.start_date,
      end_date: e.end_date,
      target_close_date: e.target_close_date,
      business_type: e.business_type,
      company_size: e.company_size,
      industry: e.industry,
      location: e.location,
      geography: e.geography || "north_america",
      annual_revenue: e.annual_revenue,
      ebitda_margin_pct: e.ebitda_margin_pct,
      procurement_maturity: e.procurement_maturity,
      discount_rate: e.discount_rate ?? 0.10,
      status: e.status,
      created_at: e.created_at,
      updated_at: e.updated_at,
    }).run();
  }

  // Categories
  for (const c of seedData.categories || []) {
    db.insert(categories).values({
      name: c.name,
      level: c.level,
      parent_id: c.parent_id,
      is_global: c.is_global,
    }).run();
  }

  // Data imports
  for (const d of seedData.data_imports || []) {
    db.insert(data_imports).values({
      engagement_id: d.engagement_id,
      file_name: d.file_name,
      record_count: d.row_count || d.record_count,
      status: "completed",
      column_mapping: d.column_mapping ? JSON.stringify(d.column_mapping) : null,
      created_at: d.created_at,
    }).run();
  }

  // Spend records
  for (const s of seedData.spend_records || []) {
    db.insert(spend_records).values({
      engagement_id: s.engagement_id,
      data_import_id: s.data_import_id,
      supplier_name: s.supplier_name,
      normalized_supplier_name: s.normalized_supplier_name,
      vendor_id: s.vendor_id,
      amount: s.amount,
      invoice_number: s.invoice_number,
      description: s.description,
      gl_code: s.gl_code,
      gl_description: s.gl_description,
      date: s.date,
      payment_date: s.payment_date,
      due_date: s.due_date,
      business_unit: s.business_unit,
      cost_center: s.cost_center,
      project_code: s.project_code,
      po_number: s.po_number,
      po_type: s.po_type,
      contract_id: s.contract_id,
      payment_terms: s.payment_terms,
      country_of_origin: s.country_of_origin,
      currency: s.currency || "USD",
      original_amount: s.original_amount,
      category_id: s.category_id,
      is_duplicate_flag: s.is_duplicate_flag,
      is_outlier_flag: s.is_outlier_flag,
      spend_flag: s.spend_flag,
      l1_category: s.l1_category,
      l2_category: s.l2_category,
      l3_category: s.l3_category,
      created_at: s.created_at,
    }).run();
  }

  // Savings initiatives
  for (const i of seedData.savings_initiatives || []) {
    db.insert(savings_initiatives).values({
      engagement_id: i.engagement_id,
      name: i.name,
      category_id: i.category_id,
      lever_type: i.lever_type,
      phase: i.phase,
      confidence: i.confidence,
      status: (i.status || 'identified').toLowerCase(),
      target_amount: i.target_amount,
      realized_amount: i.realized_amount,
      probability: i.probability,
      risk_adjusted_target: i.risk_adjusted_target,
      expected_realization_date: i.expected_realization_date,
      implementation_owner: i.implementation_owner,
      is_at_risk: i.is_at_risk,
      at_risk_reason: i.at_risk_reason,
      cta_override: i.cta_override,
      notes: i.notes,
      scoring_json: i.scoring_json,
      created_at: i.created_at,
      updated_at: i.updated_at,
    }).run();
  }

  // Scenarios
  for (const s of seedData.scenarios || []) {
    db.insert(scenarios).values({
      initiative_id: s.initiative_id,
      name: s.name,
      assumptions: s.assumptions,
      estimated_annual_savings: s.estimated_annual_savings,
      is_selected: s.is_selected,
      created_at: s.created_at,
    }).run();
  }

  // Realization entries
  for (const r of seedData.realization_entries || []) {
    db.insert(realization_entries).values({
      initiative_id: r.initiative_id,
      date: r.month || r.date,
      amount: r.actual_amount || r.amount,
      notes: r.notes,
      created_at: r.created_at,
    }).run();
  }

  // Cash flow phasing
  for (const c of seedData.cash_flow_phasing || []) {
    db.insert(cash_flow_phasing).values({
      engagement_id: null,
      initiative_id: c.initiative_id,
      date: c.month || c.date,
      amount: c.planned_amount || c.amount,
      is_actual: c.is_manual_override || c.is_actual || 0,
    }).run();
  }

  // Cleansing audit log
  for (const c of seedData.cleansing_audit_log || []) {
    db.insert(cleansing_audit_log).values({
      engagement_id: c.engagement_id,
      record_id: c.record_id,
      action: c.action_type || c.action,
      field: c.field_name || c.field,
      old_value: c.before_value || c.old_value,
      new_value: c.after_value || c.new_value,
      reason: c.ai_reasoning || c.reason,
      created_at: c.created_at,
    }).run();
  }

  // Supplier mappings
  for (const s of seedData.supplier_mappings || []) {
    db.insert(supplier_mappings).values({
      engagement_id: s.engagement_id,
      original_name: s.variant_name || s.original_name,
      canonical_name: s.canonical_name,
      created_at: s.created_at,
    }).run();
  }

  // Category rules
  for (const r of seedData.category_rules || []) {
    db.insert(category_rules).values({
      engagement_id: r.engagement_id,
      match_field: r.field || r.match_field,
      match_type: r.operator || r.match_type,
      match_value: r.value || r.match_value,
      category_id: r.target_category_id || r.category_id,
      priority: r.priority,
    }).run();
  }

  // Assumption benchmarks
  for (const a of seedData.assumption_benchmarks || []) {
    db.insert(assumption_benchmarks).values({
      lever_type: a.lever_type,
      category: a.industry_context || a.category,
      metric_name: a.assumption_name || a.metric_name,
      low_value: a.low_value,
      mid_value: a.mid_value,
      high_value: a.high_value,
      unit: a.company_size_context || a.unit,
      source: a.source,
    }).run();
  }

  // Contracts (if seed data has them)
  for (const c of seedData.contracts || []) {
    db.insert(contracts).values({
      engagement_id: c.engagement_id,
      supplier_name: c.supplier_name,
      category_id: c.category_id,
      contract_value_annual: c.contract_value_annual,
      start_date: c.start_date,
      end_date: c.end_date,
      auto_renew: c.auto_renew,
      payment_terms: c.payment_terms,
      payment_terms_benchmark: c.payment_terms_benchmark,
      payment_terms_gap_days: c.payment_terms_gap_days,
      has_price_escalation: c.has_price_escalation,
      escalation_rate: c.escalation_rate,
      escalation_index: c.escalation_index,
      compliance_rate_pct: c.compliance_rate_pct,
      is_sole_source: c.is_sole_source,
      notes: c.notes,
      created_at: c.created_at,
    }).run();
  }

  console.log("Database seeded successfully!");
}

seedDatabase();

export const storage = {
  db,
};
