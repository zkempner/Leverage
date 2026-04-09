import type { Express } from "express";
import { createServer, type Server } from "http";
import * as fsSync from "fs";
import * as pathMod from "path";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "./storage";
import { generateBenchmarks, BENCHMARK_TABLE, INDUSTRY_MULTIPLIERS, SIZE_MULTIPLIERS, INDUSTRIES, SIZE_TIERS, MATURITY_MULTIPLIERS, GEOGRAPHY_MULTIPLIERS, CATEGORY_BENCHMARK_OVERRIDES } from "./engines/benchmarks";
import { sizeInitiatives, CATEGORY_LEVER_MAP, LEVER_BENCHMARKS, INDUSTRY_ADJ, SIZE_ADJ } from "./engines/sizing";
import { categorizeRecords, DEFAULT_SUPPLIER_RULES, DEFAULT_DESCRIPTION_RULES, STANDARD_TAXONOMY, mapToTaxonomy } from "./engines/categorization";
import { analyzeTariffImpact, analyzeSourceShift, RECIPROCAL_TARIFF_RATES, SECTION_301_RATES, CATEGORY_TARIFF_PROFILES } from "./engines/tariffs";
import { normalizeSuppliers } from "./engines/normalization";
import { scoreInitiatives } from "./engines/scoring";
import { computeKraljicMatrix } from "./engines/kraljic";
import { generateCategoryStrategies } from "./engines/kraljic";
import { analyzeVendors, buildOpportunitySummary, computeSpendFlags } from "./engines/vendor-analysis";
import { computeInitiativeFinancials, computeEbitdaBridge, computeWorkingCapital, computePortfolioScurve, computeNpvSensitivity, computeSensitivityGrid, computePortfolioMonteCarlo } from "./engines/financial-model";
import { runMonteCarlo } from "./engines/monte-carlo";
import { computeGapAnalysis, getTargetScores } from "./engines/maturity";
// v3 services
import { fetchCommodities, fetchFredSeries, fetchEiaSeries, getCachedMarketData, checkSidecarHealth } from "./services/MarketDataService";
import { enqueue, getJobStatus, getJobsForEngagement, cancelJob, registerSseClient, isRedisAvailable } from "./services/JobQueueService";
import { streamCopilotResponse, getSessions, getSession, renameSession } from "./services/CopilotService";
import { runExtraction, getExtractions, getExtraction } from "./services/ContractExtractionService";
import { search, searchNews, lookupSupplier, findSimilarSuppliers, getSearchHealth } from "./services/WebSearchService";
import { runDeliverableGen, getDeliverables } from "./services/DeliverableService";
import { runSanctionsScan, computeHHI, screenSupplier } from "./services/SanctionsService";
import { runAlertScan, getAlerts, getAlertCounts, acknowledgeAlert, resolveAlert, bulkResolveAlerts } from "./services/AlertService";
import { getPortfolioSummary, savePortfolioSnapshot, getSnapshotHistory } from "./services/PortfolioService";
import { refreshFxRates, analyzeExposure } from "./services/FxService";
import { runTariffLookup, lookupHtsRate } from "./services/TariffLookupService";
import { runCategoryBrief } from "./services/CategoryBriefService";
import { scanSupplier, runNewsScan, getRiskProfiles, getRssItems } from "./services/NewsService";
import {
  engagements, categories, spend_records, savings_initiatives,
  scenarios, data_imports, realization_entries, cash_flow_phasing,
  cleansing_audit_log, supplier_mappings, category_rules, assumption_benchmarks,
  tariff_impacts,
  contracts, procurement_maturity_assessments, tariff_sourcing_scenarios,
  monte_carlo_runs, category_strategy, spend_summaries, fx_rates,
  // v3 tables
  market_data_cache, agent_jobs, watchlist_alerts, contract_extractions, deliverable_outputs, portfolio_snapshots,
} from "@shared/schema";
import { eq, and, sql, desc, asc, like, isNull, inArray } from "drizzle-orm";
import multer from "multer";
import { parse } from "csv-parse/sync";

const upload = multer({ storage: multer.memoryStorage() });

// Temp staging for uploaded CSV data
const stagingStore: Record<number, { columns: string[]; rows: any[]; importId: number }> = {};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ========== ENGAGEMENTS ==========
  app.get("/api/engagements", (_req, res) => {
    const rows = db.select().from(engagements).all();
    res.json(rows);
  });

  app.post("/api/engagements", (req, res) => {
    const now = new Date().toISOString();
    const result = db.insert(engagements).values({
      ...req.body,
      created_at: now,
      updated_at: now,
    }).returning().get();
    res.json(result);
  });

  app.get("/api/engagements/:id", (req, res) => {
    const row = db.select().from(engagements).where(eq(engagements.id, Number(req.params.id))).get();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  });

  app.delete("/api/engagements/:id", (req, res) => {
    const eid = Number(req.params.id);
    const row = db.select().from(engagements).where(eq(engagements.id, eid)).get();
    if (!row) return res.status(404).json({ error: "Not found" });
    // Delete related data first (use raw SQL for tables that may not have engagement_id in Drizzle schema)
    db.run(sql`DELETE FROM spend_records WHERE engagement_id = ${eid}`);
    db.run(sql`DELETE FROM savings_initiatives WHERE engagement_id = ${eid}`);
    db.run(sql`DELETE FROM data_imports WHERE engagement_id = ${eid}`);
    db.run(sql`DELETE FROM category_rules WHERE engagement_id = ${eid}`);
    db.run(sql`DELETE FROM cleansing_audit_log WHERE engagement_id = ${eid}`);
    db.run(sql`DELETE FROM supplier_mappings WHERE engagement_id = ${eid}`);
    db.run(sql`DELETE FROM assumption_benchmarks WHERE engagement_id = ${eid}`);
    db.run(sql`DELETE FROM tariff_impacts WHERE engagement_id = ${eid}`);
    db.delete(engagements).where(eq(engagements.id, eid)).run();
    res.json({ deleted: true, id: eid });
  });

  // ========== DASHBOARD ==========
  app.get("/api/engagements/:id/dashboard", (req, res) => {
    const eid = Number(req.params.id);

    // Total spend
    const spendResult = db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(spend_records).where(eq(spend_records.engagement_id, eid)).get();
    const totalSpend = spendResult?.total || 0;

    // Initiatives
    const inits = db.select().from(savings_initiatives).where(eq(savings_initiatives.engagement_id, eid)).all();

    const identified = inits.reduce((s, i) => s + (i.target_amount || 0), 0);
    const committed = inits.filter(i => ["committed", "realized"].includes(i.status.toLowerCase()))
      .reduce((s, i) => s + (i.target_amount || 0), 0);
    const realized = inits.reduce((s, i) => s + (i.realized_amount || 0), 0);

    // Waterfall data - savings funnel only (excludes total spend for better chart scaling)
    const inProgress = inits.filter(i => i.status.toLowerCase() === "in_progress").reduce((s, i) => s + (i.target_amount || 0), 0);
    const waterfall = [
      { name: "Identified", value: identified },
      { name: "In Progress", value: inProgress },
      { name: "Committed", value: committed },
      { name: "Realized", value: realized },
    ];

    // Status matrix (lever_type x status)
    const levers = [...new Set(inits.map(i => i.lever_type).filter(Boolean))];
    const statuses = ["identified", "in_progress", "committed", "realized", "abandoned"];
    const matrix = levers.map(lever => {
      const row: any = { lever };
      statuses.forEach(s => {
        row[s] = inits.filter(i => i.lever_type === lever && i.status.toLowerCase() === s).length;
      });
      row.total_amount = inits.filter(i => i.lever_type === lever).reduce((sum, i) => sum + (i.target_amount || 0), 0);
      return row;
    });

    // Timeline items
    const timeline = inits.map(i => ({
      id: i.id,
      name: i.name,
      status: i.status,
      target_amount: i.target_amount,
      expected_realization_date: i.expected_realization_date,
      confidence: i.confidence,
    }));

    // Data quality
    const totalRecords = db.select({ count: sql<number>`COUNT(*)` })
      .from(spend_records).where(eq(spend_records.engagement_id, eid)).get();
    const categorized = db.select({ count: sql<number>`COUNT(*)` })
      .from(spend_records).where(and(eq(spend_records.engagement_id, eid), sql`category_id IS NOT NULL`)).get();
    const normalized = db.select({ count: sql<number>`COUNT(*)` })
      .from(spend_records).where(and(eq(spend_records.engagement_id, eid), sql`normalized_supplier_name IS NOT NULL`)).get();
    const duplicates = db.select({ count: sql<number>`COUNT(*)` })
      .from(spend_records).where(and(eq(spend_records.engagement_id, eid), eq(spend_records.is_duplicate_flag, 1))).get();

    const total = totalRecords?.count || 0;
    const dataQuality = {
      total_records: total,
      categorized: categorized?.count || 0,
      categorized_pct: total > 0 ? Math.round(((categorized?.count || 0) / total) * 100) : 0,
      normalized: normalized?.count || 0,
      normalized_pct: total > 0 ? Math.round(((normalized?.count || 0) / total) * 100) : 0,
      duplicates: duplicates?.count || 0,
    };

    res.json({
      metrics: {
        total_spend: totalSpend,
        identified,
        identified_pct: totalSpend > 0 ? ((identified / totalSpend) * 100).toFixed(1) : "0",
        committed,
        committed_pct: totalSpend > 0 ? ((committed / totalSpend) * 100).toFixed(1) : "0",
        realized,
        realized_pct: totalSpend > 0 ? ((realized / totalSpend) * 100).toFixed(1) : "0",
        conversion_rate: identified > 0 ? ((committed / identified) * 100).toFixed(1) : "0",
      },
      waterfall,
      status_matrix: matrix,
      timeline,
      data_quality: dataQuality,
    });
  });

  // ========== FILE IMPORT ==========
  app.post("/api/engagements/:id/imports/upload", upload.single("file"), (req, res) => {
    const eid = Number(req.params.id);
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const fileName = req.file.originalname;
    let rows: any[] = [];
    let columns: string[] = [];

    try {
      if (fileName.endsWith(".csv")) {
        const content = req.file.buffer.toString("utf-8");
        rows = parse(content, { columns: true, skip_empty_lines: true, trim: true });
        if (rows.length > 0) columns = Object.keys(rows[0]);
      } else {
        // For xlsx - try to read
        const XLSX = require("xlsx");
        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        if (rows.length > 0) columns = Object.keys(rows[0]);
      }
    } catch (err: any) {
      return res.status(400).json({ error: "Failed to parse file: " + err.message });
    }

    const importRecord = db.insert(data_imports).values({
      engagement_id: eid,
      file_name: fileName,
      record_count: rows.length,
      status: "staged",
      created_at: new Date().toISOString(),
    }).returning().get();

    stagingStore[importRecord.id] = { columns, rows, importId: importRecord.id };

    res.json({
      import_id: importRecord.id,
      file_name: fileName,
      row_count: rows.length,
      columns,
      sample_rows: rows.slice(0, 5),
    });
  });

  app.post("/api/engagements/:id/imports/confirm", (req, res) => {
    const eid = Number(req.params.id);
    const { import_id, column_mapping } = req.body;

    const staging = stagingStore[import_id];
    if (!staging) return res.status(400).json({ error: "No staged data found" });

    const now = new Date().toISOString();
    let inserted = 0;
    let flaggedZeroAmount = 0;
    let creditMemos = 0;
    let blankSuppliers = 0;
    let duplicatesFound = 0;

    // Track seen records for duplicate detection: supplier+amount+date+gl
    const seenKeys = new Set<string>();

    for (const row of staging.rows) {
      const mapped: any = {
        engagement_id: eid,
        data_import_id: import_id,
        created_at: now,
      };

      if (column_mapping) {
        for (const [target, source] of Object.entries(column_mapping)) {
          mapped[target] = row[source as string];
        }
      } else {
        mapped.supplier_name = row.supplier_name || row.Supplier || row.vendor_name || "Unknown";
        mapped.amount = parseFloat(row.amount || row.Amount || row.total || "0");
        mapped.description = row.description || row.Description || "";
        mapped.gl_code = row.gl_code || row.GL_Code || "";
        mapped.date = row.date || row.Date || "";
        mapped.business_unit = row.business_unit || row.Business_Unit || "";
      }

      // Validation: blank supplier
      if (!mapped.supplier_name || mapped.supplier_name.trim() === "") {
        mapped.supplier_name = "UNKNOWN SUPPLIER";
        blankSuppliers++;
      }

      // Validation: amount parsing
      if (mapped.amount === undefined || mapped.amount === null || isNaN(Number(mapped.amount))) {
        mapped.amount = 0;
      } else {
        mapped.amount = Number(mapped.amount);
      }

      // Validation: zero amount — flag as suspicious
      if (mapped.amount === 0) {
        flaggedZeroAmount++;
        // Log to audit
        db.insert(cleansing_audit_log).values({
          engagement_id: eid,
          record_id: null,
          action: "import_flag",
          field: "amount",
          old_value: "0",
          new_value: "0",
          reason: "Zero amount record flagged as suspicious during import",
          created_at: now,
        }).run();
      }

      // Validation: negative amount → auto-tag as credit memo
      if (mapped.amount < 0) {
        creditMemos++;
        mapped.description = (mapped.description || "") + " [CREDIT MEMO]";
      }

      // Duplicate detection: same supplier+amount+date+GL
      const dupeKey = `${(mapped.supplier_name || "").toLowerCase()}|${mapped.amount}|${mapped.date || ""}|${mapped.gl_code || ""}`;
      if (seenKeys.has(dupeKey)) {
        mapped.is_duplicate_flag = 1;
        duplicatesFound++;
      } else {
        seenKeys.add(dupeKey);
        mapped.is_duplicate_flag = 0;
      }

      db.insert(spend_records).values(mapped).run();
      inserted++;
    }

    db.update(data_imports)
      .set({ status: "completed", column_mapping: JSON.stringify(column_mapping), record_count: inserted })
      .where(eq(data_imports.id, import_id)).run();

    // Compute total_addressable_spend on engagement
    const totalSpend = db.get(sql`SELECT SUM(amount) as total FROM spend_records WHERE engagement_id = ${eid} AND amount > 0 AND is_duplicate_flag = 0`) as any;
    db.update(engagements)
      .set({ total_addressable_spend: totalSpend?.total || 0, updated_at: now })
      .where(eq(engagements.id, eid)).run();

    delete stagingStore[import_id];

    res.json({
      success: true,
      records_inserted: inserted,
      validation: {
        zero_amount_flagged: flaggedZeroAmount,
        credit_memos: creditMemos,
        blank_suppliers_fixed: blankSuppliers,
        duplicates_detected: duplicatesFound,
      },
    });
  });

  app.get("/api/engagements/:id/imports", (req, res) => {
    const eid = Number(req.params.id);
    const rows = db.select().from(data_imports).where(eq(data_imports.engagement_id, eid)).all();
    res.json(rows);
  });

  // ========== SPEND ==========
  app.get("/api/engagements/:id/spend", (req, res) => {
    const eid = Number(req.params.id);
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;
    const search = req.query.search as string;
    const categoryFilter = req.query.category_id as string;

    let query = sql`SELECT * FROM spend_records WHERE engagement_id = ${eid}`;
    let countQuery = sql`SELECT COUNT(*) as count FROM spend_records WHERE engagement_id = ${eid}`;

    if (search) {
      const searchClause = sql` AND (supplier_name LIKE ${'%' + search + '%'} OR description LIKE ${'%' + search + '%'})`;
      query = sql`${query}${searchClause}`;
      countQuery = sql`${countQuery}${searchClause}`;
    }
    if (categoryFilter) {
      const catClause = sql` AND category_id = ${Number(categoryFilter)}`;
      query = sql`${query}${catClause}`;
      countQuery = sql`${countQuery}${catClause}`;
    }

    query = sql`${query} ORDER BY amount DESC LIMIT ${limit} OFFSET ${offset}`;

    const rows = db.all(query);
    const countResult = db.get(countQuery) as any;

    res.json({
      records: rows,
      total: countResult?.count || 0,
      page,
      limit,
    });
  });

  // ========== CLEANSING ==========
  app.get("/api/engagements/:id/cleansing/summary", (req, res) => {
    const eid = Number(req.params.id);
    const total = db.select({ count: sql<number>`COUNT(*)` })
      .from(spend_records).where(eq(spend_records.engagement_id, eid)).get();
    const normalized = db.select({ count: sql<number>`COUNT(*)` })
      .from(spend_records).where(and(eq(spend_records.engagement_id, eid), sql`normalized_supplier_name IS NOT NULL`)).get();
    const categorized = db.select({ count: sql<number>`COUNT(*)` })
      .from(spend_records).where(and(eq(spend_records.engagement_id, eid), sql`category_id IS NOT NULL`)).get();
    const duplicates = db.select({ count: sql<number>`COUNT(*)` })
      .from(spend_records).where(and(eq(spend_records.engagement_id, eid), eq(spend_records.is_duplicate_flag, 1))).get();

    const t = total?.count || 0;
    res.json({
      total_records: t,
      normalized: normalized?.count || 0,
      normalized_pct: t > 0 ? Math.round(((normalized?.count || 0) / t) * 100) : 0,
      categorized: categorized?.count || 0,
      categorized_pct: t > 0 ? Math.round(((categorized?.count || 0) / t) * 100) : 0,
      duplicates: duplicates?.count || 0,
    });
  });

  app.get("/api/engagements/:id/cleansing/supplier-groups", (req, res) => {
    const eid = Number(req.params.id);
    const groups = db.all(sql`
      SELECT supplier_name, normalized_supplier_name, COUNT(*) as record_count, SUM(amount) as total_spend
      FROM spend_records WHERE engagement_id = ${eid}
      GROUP BY supplier_name
      ORDER BY total_spend DESC
    `);
    res.json(groups);
  });

  app.get("/api/engagements/:id/cleansing/audit-log", (req, res) => {
    const eid = Number(req.params.id);
    const rows = db.select().from(cleansing_audit_log).where(eq(cleansing_audit_log.engagement_id, eid)).all();
    res.json(rows);
  });

  app.post("/api/engagements/:id/cleansing/supplier-mappings", (req, res) => {
    const eid = Number(req.params.id);
    const { mappings } = req.body; // [{original_name, canonical_name}]
    const now = new Date().toISOString();

    for (const m of mappings || []) {
      db.insert(supplier_mappings).values({
        engagement_id: eid,
        original_name: m.original_name,
        canonical_name: m.canonical_name,
        created_at: now,
      }).run();

      // Update spend records
      db.update(spend_records)
        .set({ normalized_supplier_name: m.canonical_name })
        .where(and(eq(spend_records.engagement_id, eid), eq(spend_records.supplier_name, m.original_name)))
        .run();

      // Log
      db.insert(cleansing_audit_log).values({
        engagement_id: eid,
        action: "NORMALIZE",
        field: "supplier_name",
        old_value: m.original_name,
        new_value: m.canonical_name,
        reason: "Manual mapping",
        created_at: now,
      }).run();
    }

    res.json({ success: true });
  });

  // ========== CATEGORIZATION ==========
  app.get("/api/engagements/:id/categories", (req, res) => {
    const rows = db.select().from(categories).all();
    res.json(rows);
  });

  app.get("/api/engagements/:id/categorization/coverage", (req, res) => {
    const eid = Number(req.params.id);
    const total = db.select({ count: sql<number>`COUNT(*)`, amount: sql<number>`COALESCE(SUM(amount),0)` })
      .from(spend_records).where(eq(spend_records.engagement_id, eid)).get();
    const categorized = db.select({ count: sql<number>`COUNT(*)`, amount: sql<number>`COALESCE(SUM(amount),0)` })
      .from(spend_records).where(and(eq(spend_records.engagement_id, eid), sql`category_id IS NOT NULL`)).get();

    const byCategory = db.all(sql`
      SELECT c.id, c.name, c.level, c.parent_id, COUNT(sr.id) as record_count, COALESCE(SUM(sr.amount), 0) as total_amount
      FROM categories c
      LEFT JOIN spend_records sr ON sr.category_id = c.id AND sr.engagement_id = ${eid}
      GROUP BY c.id
      HAVING record_count > 0
      ORDER BY total_amount DESC
    `);

    res.json({
      total_records: total?.count || 0,
      total_amount: total?.amount || 0,
      categorized_records: categorized?.count || 0,
      categorized_amount: categorized?.amount || 0,
      coverage_pct: (total?.count || 0) > 0 ? Math.round(((categorized?.count || 0) / (total?.count || 1)) * 100) : 0,
      by_category: byCategory,
    });
  });

  app.get("/api/engagements/:id/categorization/rules", (req, res) => {
    const eid = Number(req.params.id);
    const rows = db.select().from(category_rules).where(eq(category_rules.engagement_id, eid)).all();
    res.json(rows);
  });

  app.post("/api/engagements/:id/categorization/rules", (req, res) => {
    const eid = Number(req.params.id);
    const result = db.insert(category_rules).values({
      engagement_id: eid,
      ...req.body,
    }).returning().get();
    res.json(result);
  });

  app.delete("/api/engagements/:id/categorization/rules/:rid", (req, res) => {
    const rid = Number(req.params.rid);
    db.delete(category_rules).where(eq(category_rules.id, rid)).run();
    res.json({ success: true });
  });

  app.post("/api/engagements/:id/categorization/apply-rules", (req, res) => {
    const eid = Number(req.params.id);
    const rules = db.select().from(category_rules).where(eq(category_rules.engagement_id, eid)).all();
    const uncategorized = db.all(sql`
      SELECT * FROM spend_records WHERE engagement_id = ${eid} AND category_id IS NULL
    `) as any[];

    let applied = 0;
    for (const record of uncategorized) {
      for (const rule of rules) {
        let match = false;
        const field = rule.match_field === "GL_CODE" ? record.gl_code : record.supplier_name;
        if (!field) continue;
        if (rule.match_type === "STARTS_WITH") match = field.startsWith(rule.match_value || "");
        else if (rule.match_type === "CONTAINS") match = field.includes(rule.match_value || "");
        else if (rule.match_type === "EQUALS") match = field === rule.match_value;

        if (match && rule.category_id) {
          db.update(spend_records).set({ category_id: rule.category_id }).where(eq(spend_records.id, record.id)).run();
          applied++;
          break;
        }
      }
    }

    res.json({ applied });
  });

  // ========== AUTO-CATEGORIZATION (rule-based) ==========
  app.post("/api/engagements/:id/categorization/auto-categorize", (req, res) => {
    const eid = Number(req.params.id);
    const recategorizeAll = req.body?.recategorize_all === true;

    // If recategorize_all, clear existing categories first
    if (recategorizeAll) {
      db.run(sql`UPDATE spend_records SET category_id = NULL WHERE engagement_id = ${eid}`);
    }

    // Get ALL records for this engagement (for learning GL/supplier mappings)
    const allRecords = db.all(sql`
      SELECT id, supplier_name, gl_code, category_id FROM spend_records WHERE engagement_id = ${eid}
    `) as any[];

    // Get uncategorized records with all fields needed for matching
    const uncategorized = db.all(sql`
      SELECT id, supplier_name, description, gl_code, gl_description, l1_category, l2_category, l3_category
      FROM spend_records WHERE engagement_id = ${eid} AND category_id IS NULL
    `) as any[];

    if (uncategorized.length === 0) {
      return res.json({ categorized: 0, by_imported: 0, by_learned_gl: 0, by_learned_supplier: 0, by_supplier_keyword: 0, by_description_keyword: 0, by_user_rule: 0, message: "All records are already categorized" });
    }

    // Get available categories and user rules
    const cats = db.select().from(categories).all();
    const userRules = db.select().from(category_rules).where(eq(category_rules.engagement_id, eid)).all();

    const result = categorizeRecords(uncategorized, allRecords, cats, userRules);

    // Apply categorizations
    const now = new Date().toISOString();
    for (const r of result.results) {
      db.update(spend_records)
        .set({ category_id: r.category_id })
        .where(eq(spend_records.id, r.record_id))
        .run();

      db.insert(cleansing_audit_log).values({
        engagement_id: eid,
        record_id: r.record_id,
        action: "AUTO_CATEGORIZE",
        field: "category_id",
        old_value: null,
        new_value: r.category_name,
        reason: r.rule_matched,
        created_at: now,
      }).run();
    }

    res.json({
      categorized: result.categorized,
      total_uncategorized: uncategorized.length,
      by_imported: result.by_imported,
      by_learned_gl: result.by_learned_gl,
      by_learned_supplier: result.by_learned_supplier,
      by_supplier_keyword: result.by_supplier_keyword,
      by_description_keyword: result.by_description_keyword,
      by_user_rule: result.by_user_rule,
      results: result.results.slice(0, 50),
    });
  });

  // ========== AUTO SUPPLIER NORMALIZATION (fuzzy matching) ==========
  app.post("/api/engagements/:id/cleansing/auto-normalize", (req, res) => {
    const eid = Number(req.params.id);
    const renormalizeAll = req.body?.renormalize_all === true;

    // If renormalize_all, clear existing normalized names first
    if (renormalizeAll) {
      db.run(sql`UPDATE spend_records SET normalized_supplier_name = NULL WHERE engagement_id = ${eid}`);
    }

    const suppliers = db.all(sql`
      SELECT DISTINCT supplier_name FROM spend_records
      WHERE engagement_id = ${eid} AND normalized_supplier_name IS NULL
      ORDER BY supplier_name
    `) as any[];

    if (suppliers.length === 0) {
      return res.json({ normalized: 0, message: "All suppliers are already normalized" });
    }

    const supplierNames = suppliers.map((s: any) => s.supplier_name as string);
    const results = normalizeSuppliers(supplierNames);
    const now = new Date().toISOString();
    let normalized = 0;

    for (const m of results) {
      db.update(spend_records)
        .set({ normalized_supplier_name: m.canonical })
        .where(and(
          eq(spend_records.engagement_id, eid),
          eq(spend_records.supplier_name, m.original)
        ))
        .run();

      db.insert(supplier_mappings).values({
        engagement_id: eid,
        original_name: m.original,
        canonical_name: m.canonical,
        created_at: now,
      }).run();

      db.insert(cleansing_audit_log).values({
        engagement_id: eid,
        record_id: 0,
        action: "AUTO_NORMALIZE",
        field: "supplier_name",
        old_value: m.original,
        new_value: m.canonical,
        reason: `Fuzzy match (${Math.round(m.similarity * 100)}% similarity)`,
        created_at: now,
      }).run();

      normalized++;
    }

    res.json({ normalized, total: suppliers.length, mappings: results });
  });

  // ========== ANALYSIS ==========
  app.get("/api/engagements/:id/analysis/by-category", (req, res) => {
    const eid = Number(req.params.id);
    const rows = db.all(sql`
      SELECT c.id, c.name, c.level, c.parent_id, COUNT(sr.id) as record_count, COALESCE(SUM(sr.amount), 0) as total_amount
      FROM spend_records sr
      LEFT JOIN categories c ON sr.category_id = c.id
      WHERE sr.engagement_id = ${eid}
      GROUP BY COALESCE(c.id, 0)
      ORDER BY total_amount DESC
    `);
    res.json(rows);
  });

  app.get("/api/engagements/:id/analysis/by-supplier", (req, res) => {
    const eid = Number(req.params.id);
    const topN = parseInt(req.query.top as string) || 20;
    const rows = db.all(sql`
      SELECT COALESCE(normalized_supplier_name, supplier_name) as supplier, COUNT(*) as record_count, SUM(amount) as total_amount
      FROM spend_records WHERE engagement_id = ${eid}
      GROUP BY COALESCE(normalized_supplier_name, supplier_name)
      ORDER BY total_amount DESC
      LIMIT ${topN}
    `);
    res.json(rows);
  });

  app.get("/api/engagements/:id/analysis/by-business-unit", (req, res) => {
    const eid = Number(req.params.id);
    const rows = db.all(sql`
      SELECT business_unit, COUNT(*) as record_count, SUM(amount) as total_amount
      FROM spend_records WHERE engagement_id = ${eid} AND business_unit IS NOT NULL
      GROUP BY business_unit ORDER BY total_amount DESC
    `);
    res.json(rows);
  });

  app.get("/api/engagements/:id/analysis/over-time", (req, res) => {
    const eid = Number(req.params.id);
    const rows = db.all(sql`
      SELECT strftime('%Y-%m', date) as month, SUM(amount) as total_amount, COUNT(*) as record_count
      FROM spend_records WHERE engagement_id = ${eid} AND date IS NOT NULL
      GROUP BY month ORDER BY month
    `);
    res.json(rows);
  });

  app.get("/api/engagements/:id/analysis/pareto", (req, res) => {
    const eid = Number(req.params.id);
    const rows = db.all(sql`
      SELECT COALESCE(normalized_supplier_name, supplier_name) as supplier, SUM(amount) as total_amount
      FROM spend_records WHERE engagement_id = ${eid}
      GROUP BY COALESCE(normalized_supplier_name, supplier_name)
      ORDER BY total_amount DESC
    `) as any[];

    const totalSpend = rows.reduce((s: number, r: any) => s + r.total_amount, 0);
    let cumulative = 0;
    const pareto = rows.map((r: any, i: number) => {
      cumulative += r.total_amount;
      return {
        ...r,
        rank: i + 1,
        cumulative_amount: cumulative,
        cumulative_pct: totalSpend > 0 ? ((cumulative / totalSpend) * 100).toFixed(1) : "0",
        spend_pct: totalSpend > 0 ? ((r.total_amount / totalSpend) * 100).toFixed(1) : "0",
      };
    });

    res.json({ suppliers: pareto, total_spend: totalSpend });
  });

  app.get("/api/engagements/:id/analysis/concentration", (req, res) => {
    const eid = Number(req.params.id);
    const rows = db.all(sql`
      SELECT COALESCE(normalized_supplier_name, supplier_name) as supplier, SUM(amount) as total_amount
      FROM spend_records WHERE engagement_id = ${eid}
      GROUP BY COALESCE(normalized_supplier_name, supplier_name)
      ORDER BY total_amount DESC
    `) as any[];

    const totalSpend = rows.reduce((s: number, r: any) => s + r.total_amount, 0);
    const totalSuppliers = rows.length;
    const top5 = rows.slice(0, 5).reduce((s: number, r: any) => s + r.total_amount, 0);
    const top10 = rows.slice(0, 10).reduce((s: number, r: any) => s + r.total_amount, 0);
    const top20 = rows.slice(0, 20).reduce((s: number, r: any) => s + r.total_amount, 0);

    res.json({
      total_suppliers: totalSuppliers,
      total_spend: totalSpend,
      top_5_spend: top5,
      top_5_pct: totalSpend > 0 ? ((top5 / totalSpend) * 100).toFixed(1) : "0",
      top_10_spend: top10,
      top_10_pct: totalSpend > 0 ? ((top10 / totalSpend) * 100).toFixed(1) : "0",
      top_20_spend: top20,
      top_20_pct: totalSpend > 0 ? ((top20 / totalSpend) * 100).toFixed(1) : "0",
      segments: [
        { label: "Top 5", count: Math.min(5, totalSuppliers), spend: top5, pct: totalSpend > 0 ? ((top5 / totalSpend) * 100).toFixed(1) : "0" },
        { label: "6-10", count: Math.min(5, Math.max(0, totalSuppliers - 5)), spend: top10 - top5, pct: totalSpend > 0 ? (((top10 - top5) / totalSpend) * 100).toFixed(1) : "0" },
        { label: "11-20", count: Math.min(10, Math.max(0, totalSuppliers - 10)), spend: top20 - top10, pct: totalSpend > 0 ? (((top20 - top10) / totalSpend) * 100).toFixed(1) : "0" },
        { label: "Tail (21+)", count: Math.max(0, totalSuppliers - 20), spend: totalSpend - top20, pct: totalSpend > 0 ? (((totalSpend - top20) / totalSpend) * 100).toFixed(1) : "0" },
      ],
    });
  });

  app.get("/api/engagements/:id/analysis/tail-spend", (req, res) => {
    const eid = Number(req.params.id);
    const threshold = parseFloat(req.query.threshold as string) || 50000;

    const allSuppliers = db.all(sql`
      SELECT COALESCE(normalized_supplier_name, supplier_name) as supplier, SUM(amount) as total_amount, COUNT(*) as record_count
      FROM spend_records WHERE engagement_id = ${eid}
      GROUP BY COALESCE(normalized_supplier_name, supplier_name)
      ORDER BY total_amount DESC
    `) as any[];

    const totalSpend = allSuppliers.reduce((s: number, r: any) => s + r.total_amount, 0);
    const tail = allSuppliers.filter((r: any) => r.total_amount < threshold);
    const tailSpend = tail.reduce((s: number, r: any) => s + r.total_amount, 0);

    res.json({
      threshold,
      total_suppliers: allSuppliers.length,
      tail_suppliers: tail.length,
      tail_supplier_pct: allSuppliers.length > 0 ? ((tail.length / allSuppliers.length) * 100).toFixed(1) : "0",
      tail_spend: tailSpend,
      tail_spend_pct: totalSpend > 0 ? ((tailSpend / totalSpend) * 100).toFixed(1) : "0",
      tail_details: tail.slice(0, 50),
    });
  });

  // ========== INITIATIVES & MODELING ==========
  app.get("/api/engagements/:id/initiatives", (req, res) => {
    const eid = Number(req.params.id);
    const rows = db.select().from(savings_initiatives).where(eq(savings_initiatives.engagement_id, eid)).all();
    res.json(rows);
  });

  app.post("/api/engagements/:id/initiatives", (req, res) => {
    const eid = Number(req.params.id);
    const now = new Date().toISOString();
    const result = db.insert(savings_initiatives).values({
      engagement_id: eid,
      ...req.body,
      created_at: now,
      updated_at: now,
    }).returning().get();
    res.json(result);
  });

  // Status transition validation
  const VALID_TRANSITIONS: Record<string, string[]> = {
    identified: ["in_progress", "abandoned"],
    in_progress: ["committed", "abandoned", "identified"],
    committed: ["realized", "in_progress"],
    realized: [],
    abandoned: ["identified"],
  };

  app.put("/api/engagements/:id/initiatives/:iid", (req, res) => {
    const iid = Number(req.params.iid);
    const now = new Date().toISOString();

    // Validate status transition if status is being changed
    if (req.body.status) {
      const current = db.select().from(savings_initiatives).where(eq(savings_initiatives.id, iid)).get();
      if (current) {
        const currentStatus = (current.status || "identified").toLowerCase();
        const newStatus = req.body.status.toLowerCase();
        if (currentStatus !== newStatus) {
          const allowed = VALID_TRANSITIONS[currentStatus] || [];
          if (!allowed.includes(newStatus)) {
            return res.status(422).json({
              error: `Invalid status transition: ${currentStatus} → ${newStatus}`,
              allowed_transitions: allowed,
            });
          }
        }
      }
    }

    db.update(savings_initiatives)
      .set({ ...req.body, updated_at: now })
      .where(eq(savings_initiatives.id, iid)).run();
    const updated = db.select().from(savings_initiatives).where(eq(savings_initiatives.id, iid)).get();
    res.json(updated);
  });

  app.get("/api/initiatives/:iid/scenarios", (req, res) => {
    const iid = Number(req.params.iid);
    const rows = db.select().from(scenarios).where(eq(scenarios.initiative_id, iid)).all();
    res.json(rows);
  });

  app.post("/api/initiatives/:iid/scenarios", (req, res) => {
    const iid = Number(req.params.iid);
    const now = new Date().toISOString();
    const result = db.insert(scenarios).values({
      initiative_id: iid,
      ...req.body,
      created_at: now,
    }).returning().get();
    res.json(result);
  });

  app.post("/api/initiatives/:iid/scenarios/:sid/select", (req, res) => {
    const iid = Number(req.params.iid);
    const sid = Number(req.params.sid);
    // Deselect all scenarios for this initiative
    db.update(scenarios).set({ is_selected: 0 }).where(eq(scenarios.initiative_id, iid)).run();
    // Select the chosen one
    db.update(scenarios).set({ is_selected: 1 }).where(eq(scenarios.id, sid)).run();
    const result = db.select().from(scenarios).where(eq(scenarios.id, sid)).get();
    res.json(result);
  });

  // ========== AI SAVINGS SIZING ==========
  app.post("/api/engagements/:id/initiatives/size-from-benchmarks", (req, res) => {
    const eid = Number(req.params.id);

    const eng = db.select().from(engagements).where(eq(engagements.id, eid)).get();
    if (!eng) return res.status(404).json({ error: "Engagement not found" });

    // Get spend grouped at L2 category level (roll up L3 to parent L2)
    // This prevents duplicate initiatives for Facilities vs Janitorial vs Security
    // Get spend by category with top supplier concentration
    const spendByCategory = db.all(sql`
      SELECT 
        COALESCE(parent.id, c.id) as category_id,
        COALESCE(parent.name, c.name) as category_name,
        COUNT(sr.id) as record_count, 
        COALESCE(SUM(sr.amount), 0) as total_amount,
        COUNT(DISTINCT COALESCE(sr.normalized_supplier_name, sr.supplier_name)) as supplier_count
      FROM spend_records sr
      LEFT JOIN categories c ON sr.category_id = c.id
      LEFT JOIN categories parent ON c.parent_id = parent.id AND c.level = 'L3'
      WHERE sr.engagement_id = ${eid} AND sr.category_id IS NOT NULL
      GROUP BY COALESCE(parent.id, c.id)
      ORDER BY total_amount DESC
    `) as any[];

    // Compute top supplier concentration per category
    for (const cat of spendByCategory) {
      if (cat.total_amount > 0 && cat.supplier_count > 0) {
        const topSup = db.all(sql`
          SELECT COALESCE(SUM(sr.amount), 0) as top_spend
          FROM spend_records sr
          LEFT JOIN categories c ON sr.category_id = c.id
          LEFT JOIN categories parent ON c.parent_id = parent.id AND c.level = 'L3'
          WHERE sr.engagement_id = ${eid} AND COALESCE(parent.id, c.id) = ${cat.category_id}
          GROUP BY COALESCE(sr.normalized_supplier_name, sr.supplier_name)
          ORDER BY top_spend DESC LIMIT 1
        `) as any[];
        cat.top_supplier_concentration = topSup[0] ? topSup[0].top_spend / cat.total_amount : 0;
      } else {
        cat.top_supplier_concentration = 0;
      }
    }

    // Get existing initiatives to avoid duplicates
    const existingInits = db.select().from(savings_initiatives).where(eq(savings_initiatives.engagement_id, eid)).all();
    const existingNames = new Set(existingInits.map(i => i.name?.toLowerCase()));

    const sized = sizeInitiatives(spendByCategory, eng.industry || "Manufacturing", eng.company_size || "Mid-market");
    const created: any[] = [];
    const now = new Date().toISOString();

    for (const init of sized) {
      if (existingNames.has(init.name.toLowerCase())) continue;
      const result = db.insert(savings_initiatives).values({
        engagement_id: eid,
        name: init.name,
        lever_type: init.lever_type,
        confidence: init.confidence,
        status: "identified",
        target_amount: init.target_amount,
        realized_amount: 0,
        category_id: init.category_id,
        is_at_risk: 0,
        notes: init.formula,
        expected_realization_date: null,
        created_at: now,
        updated_at: now,
      }).returning().get();
      created.push({ ...result, formula: init.formula, addressable_spend: init.addressable_spend, benchmark_rate: init.benchmark_rate });
    }

    res.json({
      created: created.length,
      total_new_target: created.reduce((s: number, i: any) => s + (i.target_amount || 0), 0),
      initiatives: created,
    });
  });

  // ========== TRACKER ==========
  app.get("/api/engagements/:id/tracker/summary", (req, res) => {
    const eid = Number(req.params.id);
    const inits = db.select().from(savings_initiatives).where(eq(savings_initiatives.engagement_id, eid)).all();

    const pipeline = {
      total_initiatives: inits.length,
      total_target: inits.reduce((s, i) => s + (i.target_amount || 0), 0),
      total_realized: inits.reduce((s, i) => s + (i.realized_amount || 0), 0),
      at_risk_count: inits.filter(i => i.is_at_risk).length,
      at_risk_amount: inits.filter(i => i.is_at_risk).reduce((s, i) => s + (i.target_amount || 0), 0),
      by_status: {} as Record<string, { count: number; amount: number }>,
      by_confidence: {} as Record<string, { count: number; amount: number }>,
    };

    for (const i of inits) {
      const s = i.status;
      if (!pipeline.by_status[s]) pipeline.by_status[s] = { count: 0, amount: 0 };
      pipeline.by_status[s].count++;
      pipeline.by_status[s].amount += i.target_amount || 0;

      const c = i.confidence || "Unknown";
      if (!pipeline.by_confidence[c]) pipeline.by_confidence[c] = { count: 0, amount: 0 };
      pipeline.by_confidence[c].count++;
      pipeline.by_confidence[c].amount += i.target_amount || 0;
    }

    res.json(pipeline);
  });

  app.get("/api/engagements/:id/tracker/pipeline", (req, res) => {
    const eid = Number(req.params.id);
    const inits = db.select().from(savings_initiatives).where(eq(savings_initiatives.engagement_id, eid)).all();

    const grouped: Record<string, any[]> = {};
    for (const i of inits) {
      const status = (i.status || 'identified').toLowerCase();
      if (!grouped[status]) grouped[status] = [];
      grouped[status].push(i);
    }

    res.json(grouped);
  });

  app.get("/api/engagements/:id/tracker/timeline", (req, res) => {
    const eid = Number(req.params.id);
    const inits = db.select().from(savings_initiatives).where(eq(savings_initiatives.engagement_id, eid)).all();
    const gantt = inits.map(i => ({
      id: i.id,
      name: i.name,
      status: i.status,
      start: i.created_at,
      end: i.expected_realization_date,
      target_amount: i.target_amount,
      confidence: i.confidence,
      is_at_risk: i.is_at_risk,
    }));
    res.json(gantt);
  });

  app.get("/api/engagements/:id/tracker/realization-curve", (req, res) => {
    const eid = Number(req.params.id);
    const initIds = db.select({ id: savings_initiatives.id })
      .from(savings_initiatives).where(eq(savings_initiatives.engagement_id, eid)).all().map(r => r.id);

    if (initIds.length === 0) return res.json([]);

    const entries = db.all(sql`
      SELECT date, SUM(amount) as monthly_amount
      FROM realization_entries
      WHERE initiative_id IN (${sql.join(initIds.map(id => sql`${id}`), sql`, `)})
      GROUP BY date ORDER BY date
    `) as any[];

    let cumulative = 0;
    const curve = entries.map((e: any) => {
      cumulative += e.monthly_amount;
      return { month: e.date, monthly: e.monthly_amount, cumulative };
    });

    res.json(curve);
  });

  app.get("/api/engagements/:id/tracker/risk-view", (req, res) => {
    const eid = Number(req.params.id);
    const atRisk = db.select().from(savings_initiatives)
      .where(and(eq(savings_initiatives.engagement_id, eid), eq(savings_initiatives.is_at_risk, 1))).all();
    res.json(atRisk);
  });

  app.post("/api/initiatives/:iid/realization", (req, res) => {
    const iid = Number(req.params.iid);
    const now = new Date().toISOString();
    const result = db.insert(realization_entries).values({
      initiative_id: iid,
      ...req.body,
      created_at: now,
    }).returning().get();

    // Update realized amount on initiative
    const totalRealized = db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(realization_entries).where(eq(realization_entries.initiative_id, iid)).get();

    db.update(savings_initiatives)
      .set({ realized_amount: totalRealized?.total || 0, updated_at: now })
      .where(eq(savings_initiatives.id, iid)).run();

    res.json(result);
  });

  app.get("/api/initiatives/:iid/realization", (req, res) => {
    const iid = Number(req.params.iid);
    const rows = db.select().from(realization_entries).where(eq(realization_entries.initiative_id, iid)).all();
    res.json(rows);
  });

  // ========== CASH FLOW ==========
  app.get("/api/engagements/:id/cashflow/table", (req, res) => {
    const eid = Number(req.params.id);
    const initIds = db.select({ id: savings_initiatives.id })
      .from(savings_initiatives).where(eq(savings_initiatives.engagement_id, eid)).all().map(r => r.id);

    if (initIds.length === 0) return res.json([]);

    const rows = db.all(sql`
      SELECT cfp.*, si.name as initiative_name
      FROM cash_flow_phasing cfp
      LEFT JOIN savings_initiatives si ON cfp.initiative_id = si.id
      WHERE cfp.initiative_id IN (${sql.join(initIds.map(id => sql`${id}`), sql`, `)})
      ORDER BY cfp.date, cfp.initiative_id
    `);

    res.json(rows);
  });

  app.get("/api/engagements/:id/cashflow/bridge", (req, res) => {
    const eid = Number(req.params.id);
    const initIds = db.select({ id: savings_initiatives.id })
      .from(savings_initiatives).where(eq(savings_initiatives.engagement_id, eid)).all().map(r => r.id);

    if (initIds.length === 0) return res.json([]);

    const rows = db.all(sql`
      SELECT strftime('%Y-%m', date) as month, SUM(amount) as planned
      FROM cash_flow_phasing
      WHERE initiative_id IN (${sql.join(initIds.map(id => sql`${id}`), sql`, `)})
      GROUP BY month ORDER BY month
    `) as any[];

    // Also get actuals
    const actuals = db.all(sql`
      SELECT strftime('%Y-%m', date) as month, SUM(amount) as actual
      FROM realization_entries
      WHERE initiative_id IN (${sql.join(initIds.map(id => sql`${id}`), sql`, `)})
      GROUP BY month ORDER BY month
    `) as any[];

    const actualsMap = Object.fromEntries(actuals.map((a: any) => [a.month, a.actual]));

    const bridge = rows.map((r: any) => ({
      month: r.month,
      planned: r.planned,
      actual: actualsMap[r.month] || 0,
      variance: (actualsMap[r.month] || 0) - r.planned,
    }));

    res.json(bridge);
  });

  app.get("/api/engagements/:id/cashflow/cumulative", (req, res) => {
    const eid = Number(req.params.id);
    const initIds = db.select({ id: savings_initiatives.id })
      .from(savings_initiatives).where(eq(savings_initiatives.engagement_id, eid)).all().map(r => r.id);

    if (initIds.length === 0) return res.json([]);

    const planned = db.all(sql`
      SELECT strftime('%Y-%m', date) as month, SUM(amount) as amount
      FROM cash_flow_phasing
      WHERE initiative_id IN (${sql.join(initIds.map(id => sql`${id}`), sql`, `)})
      GROUP BY month ORDER BY month
    `) as any[];

    const actuals = db.all(sql`
      SELECT strftime('%Y-%m', date) as month, SUM(amount) as amount
      FROM realization_entries
      WHERE initiative_id IN (${sql.join(initIds.map(id => sql`${id}`), sql`, `)})
      GROUP BY month ORDER BY month
    `) as any[];

    const months = [...new Set([...planned.map((p: any) => p.month), ...actuals.map((a: any) => a.month)])].sort();
    const plannedMap = Object.fromEntries(planned.map((p: any) => [p.month, p.amount]));
    const actualMap = Object.fromEntries(actuals.map((a: any) => [a.month, a.amount]));

    let cumPlanned = 0;
    let cumActual = 0;
    const curve = months.map(m => {
      cumPlanned += plannedMap[m] || 0;
      cumActual += actualMap[m] || 0;
      return { month: m, cumulative_planned: cumPlanned, cumulative_actual: cumActual };
    });

    res.json(curve);
  });

  // ========== ASSUMPTIONS ==========
  app.get("/api/assumptions/benchmarks", (_req, res) => {
    const rows = db.select().from(assumption_benchmarks).all();
    res.json(rows);
  });

  app.get("/api/engagements/:id/assumptions/benchmarks", (req, res) => {
    const eid = Number(req.params.id);
    // Return engagement-specific benchmarks + global ones (no engagement_id)
    const rows = db.all(sql`
      SELECT * FROM assumption_benchmarks
      WHERE engagement_id = ${eid} OR engagement_id IS NULL
      ORDER BY lever_type, metric_name
    `);
    res.json(rows);
  });

  app.put("/api/assumptions/benchmarks/:bid", (req, res) => {
    const bid = Number(req.params.bid);
    const { low_value, mid_value, high_value, category, metric_name, notes } = req.body;
    const updates: any = {};
    if (low_value !== undefined) updates.low_value = Number(low_value);
    if (mid_value !== undefined) updates.mid_value = Number(mid_value);
    if (high_value !== undefined) updates.high_value = Number(high_value);
    if (category !== undefined) updates.category = category;
    if (metric_name !== undefined) updates.metric_name = metric_name;
    if (notes !== undefined) updates.source = notes;
    db.update(assumption_benchmarks).set(updates).where(eq(assumption_benchmarks.id, bid)).run();
    const updated = db.select().from(assumption_benchmarks).where(eq(assumption_benchmarks.id, bid)).get();
    res.json(updated);
  });

  app.delete("/api/assumptions/benchmarks/:bid", (req, res) => {
    const bid = Number(req.params.bid);
    db.delete(assumption_benchmarks).where(eq(assumption_benchmarks.id, bid)).run();
    res.json({ deleted: true });
  });

  app.post("/api/engagements/:id/assumptions/generate", (req, res) => {
    const eid = Number(req.params.id);

    // Delete old generated benchmarks for this engagement
    db.run(sql`DELETE FROM assumption_benchmarks WHERE engagement_id = ${eid}`);

    const engagement = db.select().from(engagements).where(eq(engagements.id, eid)).get();
    if (!engagement) return res.status(404).json({ error: "Engagement not found" });

    const benchmarks = generateBenchmarks(
      engagement.industry || "Manufacturing",
      engagement.company_size || "Mid-market"
    );

    let created = 0;
    for (const b of benchmarks) {
      db.insert(assumption_benchmarks).values({
        engagement_id: eid,
        lever_type: b.lever_type,
        category: b.category,
        metric_name: b.metric_name,
        low_value: b.low_value,
        mid_value: b.mid_value,
        high_value: b.high_value,
        unit: b.unit,
        source: b.source,
        rationale: b.rationale,
      }).run();
      created++;
    }

    res.json({ created, benchmarks });
  });

  // ========== TARIFF IMPACTS ==========
  app.get("/api/engagements/:id/tariffs", (req, res) => {
    const eid = Number(req.params.id);
    const rows = db.select().from(tariff_impacts).where(eq(tariff_impacts.engagement_id, eid)).all();
    res.json(rows);
  });

  app.post("/api/engagements/:id/tariffs/analyze", (req, res) => {
    const eid = Number(req.params.id);

    // Clear old tariff analysis
    db.delete(tariff_impacts).where(eq(tariff_impacts.engagement_id, eid)).run();

    // Get spend by category with top supplier info
    const catBreakdown = db.all(sql`
      SELECT c.name as category_name, SUM(sr.amount) as total_amount,
             COUNT(DISTINCT COALESCE(sr.normalized_supplier_name, sr.supplier_name)) as supplier_count
      FROM spend_records sr
      LEFT JOIN categories c ON sr.category_id = c.id
      WHERE sr.engagement_id = ${eid} AND sr.category_id IS NOT NULL
      GROUP BY c.name ORDER BY total_amount DESC LIMIT 15
    `) as any[];

    // Get top supplier per category
    const spendData = catBreakdown.map((cat: any) => {
      const topSup = db.all(sql`
        SELECT COALESCE(sr.normalized_supplier_name, sr.supplier_name) as supplier, SUM(sr.amount) as spend
        FROM spend_records sr
        LEFT JOIN categories c ON sr.category_id = c.id
        WHERE sr.engagement_id = ${eid} AND c.name = ${cat.category_name}
        GROUP BY supplier ORDER BY spend DESC LIMIT 1
      `) as any[];

      return {
        category_name: cat.category_name,
        total_amount: cat.total_amount,
        top_supplier: topSup[0]?.supplier || "Various",
        supplier_count: cat.supplier_count,
      };
    });

    const impacts = analyzeTariffImpact(spendData);
    const now = new Date().toISOString();
    let created = 0;

    for (const t of impacts) {
      db.insert(tariff_impacts).values({
        engagement_id: eid,
        category_name: t.category_name,
        supplier_name: t.supplier_name,
        country_of_origin: t.country_of_origin,
        tariff_layers: JSON.stringify(t.tariff_layers),
        effective_tariff_pct: t.effective_tariff_pct,
        annual_spend: t.annual_spend,
        estimated_impact: t.estimated_impact,
        risk_level: t.risk_level,
        mitigation_strategy: t.mitigation_strategy,
        notes: t.notes,
        created_at: now,
      }).run();
      created++;
    }

    res.json({ created, impacts });
  });

  // ========== INITIATIVE SCORING ==========
  app.get("/api/engagements/:id/initiatives/scores", (req, res) => {
    const eid = Number(req.params.id);
    const inits = db.select().from(savings_initiatives).where(eq(savings_initiatives.engagement_id, eid)).all();
    const records = db.select().from(spend_records).where(eq(spend_records.engagement_id, eid)).all();
    const cats = db.select().from(categories).all();
    const spendResult = db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(spend_records).where(eq(spend_records.engagement_id, eid)).get();
    const totalSpend = spendResult?.total || 0;
    const scores = scoreInitiatives(inits, records, cats, totalSpend);
    res.json(scores);
  });

  // ========== KRALJIC MATRIX ==========
  app.get("/api/engagements/:id/analysis/kraljic", (req, res) => {
    const eid = Number(req.params.id);
    const records = db.select().from(spend_records).where(eq(spend_records.engagement_id, eid)).all();
    const cats = db.select().from(categories).all();
    const spendResult = db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(spend_records).where(eq(spend_records.engagement_id, eid)).get();
    const totalSpend = spendResult?.total || 0;
    const positions = computeKraljicMatrix(records, cats, totalSpend);
    res.json(positions);
  });

  // ========== VENDOR ANALYSIS ==========
  app.get("/api/engagements/:id/analysis/vendor-profiles", (req, res) => {
    const eid = Number(req.params.id);
    const records = db.select().from(spend_records).where(eq(spend_records.engagement_id, eid)).all();
    const cats = db.select().from(categories).all();
    const spendResult = db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(spend_records).where(eq(spend_records.engagement_id, eid)).get();
    const totalSpend = spendResult?.total || 0;
    const profiles = analyzeVendors(records, cats, totalSpend);
    res.json(profiles);
  });

  app.get("/api/engagements/:id/analysis/vendor-profiles/:vendor", (req, res) => {
    const eid = Number(req.params.id);
    const vendorName = decodeURIComponent(req.params.vendor);
    const records = db.select().from(spend_records).where(eq(spend_records.engagement_id, eid)).all();
    const cats = db.select().from(categories).all();
    const spendResult = db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(spend_records).where(eq(spend_records.engagement_id, eid)).get();
    const totalSpend = spendResult?.total || 0;
    const profiles = analyzeVendors(records, cats, totalSpend);
    const profile = profiles.find(p => p.vendor_name === vendorName);
    if (!profile) return res.status(404).json({ error: "Vendor not found" });
    res.json(profile);
  });

  app.get("/api/engagements/:id/analysis/opportunity-summary", (req, res) => {
    const eid = Number(req.params.id);
    const records = db.select().from(spend_records).where(eq(spend_records.engagement_id, eid)).all();
    const cats = db.select().from(categories).all();
    const spendResult = db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(spend_records).where(eq(spend_records.engagement_id, eid)).get();
    const totalSpend = spendResult?.total || 0;
    const profiles = analyzeVendors(records, cats, totalSpend);
    const summary = buildOpportunitySummary(profiles);
    res.json(summary);
  });

  // ========== FINANCIAL MODEL ==========

  // Single initiative financials
  app.get("/api/engagements/:id/financial/initiative/:iid", async (req, res) => {
    const engagementId = Number(req.params.id);
    const initiativeId = Number(req.params.iid);
    const discountRate = Number(req.query.discount_rate) || 0.10;

    const initiative = await db.select().from(savings_initiatives)
      .where(and(eq(savings_initiatives.engagement_id, engagementId), eq(savings_initiatives.id, initiativeId)))
      .then(rows => rows[0]);

    if (!initiative) return res.status(404).json({ error: "Initiative not found" });

    const cat = initiative.category_id
      ? await db.select().from(categories).where(eq(categories.id, initiative.category_id)).then(rows => rows[0])
      : null;

    const result = computeInitiativeFinancials(initiative, cat?.name || "Uncategorized", discountRate);
    res.json(result);
  });

  // EBITDA Bridge
  app.get("/api/engagements/:id/financial/ebitda-bridge", async (req, res) => {
    const engagementId = Number(req.params.id);

    const initiatives = await db.select().from(savings_initiatives)
      .where(eq(savings_initiatives.engagement_id, engagementId));

    const spendResult = await db.select({ total: sql<number>`COALESCE(SUM(ABS(amount)), 0)` })
      .from(spend_records)
      .where(eq(spend_records.engagement_id, engagementId))
      .then(rows => rows[0]);

    const totalSpend = spendResult?.total || 0;
    const result = computeEbitdaBridge(initiatives, totalSpend);
    res.json(result);
  });

  // Working Capital
  app.get("/api/engagements/:id/financial/working-capital", async (req, res) => {
    const engagementId = Number(req.params.id);

    const initiatives = await db.select().from(savings_initiatives)
      .where(eq(savings_initiatives.engagement_id, engagementId));

    const records = await db.select().from(spend_records)
      .where(eq(spend_records.engagement_id, engagementId));

    const totalSpend = records.reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0);

    // Get engagement industry for industry-specific WC benchmarks
    const eng = db.select().from(engagements).where(eq(engagements.id, engagementId)).get();
    const result = computeWorkingCapital(initiatives, records, totalSpend, eng?.industry || undefined);
    res.json(result);
  });

  // Portfolio S-Curve
  app.get("/api/engagements/:id/financial/portfolio-scurve", async (req, res) => {
    const engagementId = Number(req.params.id);
    const discountRate = Number(req.query.discount_rate) || 0.10;

    const initiatives = await db.select().from(savings_initiatives)
      .where(eq(savings_initiatives.engagement_id, engagementId));

    const cats = await db.select().from(categories);

    const result = computePortfolioScurve(initiatives, cats, discountRate);
    res.json(result);
  });

  // NPV Sensitivity
  app.get("/api/engagements/:id/financial/initiative/:iid/sensitivity", async (req, res) => {
    const eid = Number(req.params.id);
    const iid = Number(req.params.iid);
    const init = db.select().from(savings_initiatives).where(eq(savings_initiatives.id, iid)).get() as any;
    if (!init) return res.status(404).json({ error: "Initiative not found" });
    const catMap = new Map<number, string>();
    for (const c of db.select().from(categories).all()) catMap.set(c.id, c.name);
    const catName = init.category_id ? catMap.get(init.category_id) || "Uncategorized" : "Uncategorized";
    const rates = [0.05, 0.08, 0.10, 0.12, 0.15, 0.20];
    const result = computeNpvSensitivity(init, catName, rates);
    res.json(result);
  });

  // ========== REFERENCE LIBRARY ==========
  app.get("/api/reference/benchmarks", (_req, res) => {
    res.json({
      benchmark_table: BENCHMARK_TABLE,
      industry_multipliers: INDUSTRY_MULTIPLIERS,
      size_multipliers: SIZE_MULTIPLIERS,
      industries: INDUSTRIES.map(i => ({ key: i.key, label: i.label, lever_adjustments: i.lever_adjustments, default_adjustment: i.default_adjustment })),
      size_tiers: SIZE_TIERS,
      maturity_multipliers: MATURITY_MULTIPLIERS,
      geography_multipliers: GEOGRAPHY_MULTIPLIERS,
      category_overrides: CATEGORY_BENCHMARK_OVERRIDES,
    });
  });

  app.get("/api/reference/categorization-rules", (_req, res) => {
    res.json({ supplier_rules: DEFAULT_SUPPLIER_RULES, description_rules: DEFAULT_DESCRIPTION_RULES });
  });

  app.get("/api/reference/tariff-rates", (_req, res) => {
    res.json({
      reciprocal_tariff_rates: RECIPROCAL_TARIFF_RATES,
      section_301_rates: SECTION_301_RATES,
      category_profiles: Object.entries(CATEGORY_TARIFF_PROFILES).map(([name, p]) => ({
        category: name,
        hts_chapters: p.hts_chapters,
        section_232: p.section_232_applies,
        section_301_key: p.section_301_key,
        is_service: p.is_service,
        default_origin: p.default_origin,
      })),
    });
  });

  app.get("/api/reference/sizing-rules", (_req, res) => {
    const category_lever_map = CATEGORY_LEVER_MAP.map(([regex, lever]) => ({
      pattern: regex.source,
      lever_type: lever,
    }));
    res.json({
      category_lever_map,
      lever_benchmarks: LEVER_BENCHMARKS,
      industry_adjustments: INDUSTRY_ADJ,
      size_adjustments: SIZE_ADJ,
      formula: "target = category_spend × addressable_pct × savings_rate × industry_adj × size_adj",
      confidence_rules: {
        high: ">5 records AND <5 unique suppliers in category",
        medium: "Default when not high or low",
        low: "<3 records in category",
      },
    });
  });

  // ========== TAXONOMY ==========
  app.get("/api/reference/taxonomy", (_req, res) => {
    res.json({ taxonomy: STANDARD_TAXONOMY });
  });

  app.get("/api/reference/taxonomy/map/:categoryName", (req, res) => {
    const result = mapToTaxonomy(req.params.categoryName);
    res.json(result || { error: "No taxonomy match found" });
  });

  // ========== 100-DAY PLAN (v2) ==========
  app.get("/api/engagements/:id/100-day-plan", (req, res) => {
    const eid = Number(req.params.id);
    const inits = db.select().from(savings_initiatives).where(eq(savings_initiatives.engagement_id, eid)).all();

    const phases: Record<string, any[]> = { quick_win: [], medium_term: [], long_term: [] };
    for (const init of inits) {
      const phase = (init.phase || "medium_term").toLowerCase();
      const bucket = phases[phase] || phases.medium_term;
      bucket.push(init);
    }

    const phaseTotals = (list: any[]) => ({
      count: list.length,
      total_target: list.reduce((s, i) => s + (i.target_amount || 0), 0),
      total_risk_adjusted: list.reduce((s, i) => s + (i.risk_adjusted_target || i.target_amount || 0), 0),
      probability_weighted: list.reduce((s, i) => s + (i.target_amount || 0) * (i.probability || 0.5), 0),
    });

    // Get latest Monte Carlo run for phase bands
    const latestMc = db.select().from(monte_carlo_runs)
      .where(eq(monte_carlo_runs.engagement_id, eid))
      .orderBy(desc(monte_carlo_runs.id)).limit(1).get();

    let mcByPhase: any = null;
    if (latestMc?.by_phase_json) {
      try { mcByPhase = JSON.parse(latestMc.by_phase_json); } catch {}
    }

    res.json({
      quick_win: { initiatives: phases.quick_win, ...phaseTotals(phases.quick_win), monte_carlo: mcByPhase?.quick_win || null },
      medium_term: { initiatives: phases.medium_term, ...phaseTotals(phases.medium_term), monte_carlo: mcByPhase?.medium_term || null },
      long_term: { initiatives: phases.long_term, ...phaseTotals(phases.long_term), monte_carlo: mcByPhase?.long_term || null },
    });
  });

  // ========== MONTE CARLO (v2) ==========
  app.post("/api/engagements/:id/monte-carlo", (req, res) => {
    const eid = Number(req.params.id);
    const eng = db.select().from(engagements).where(eq(engagements.id, eid)).get();
    if (!eng) return res.status(404).json({ error: "Engagement not found" });

    const inits = db.select().from(savings_initiatives).where(eq(savings_initiatives.engagement_id, eid)).all();
    if (inits.length === 0) return res.status(400).json({ error: "No initiatives to simulate" });

    const mcInput = inits.map(i => ({
      id: i.id,
      name: i.name || "",
      lever_type: i.lever_type || "renegotiation",
      category_name: "",
      target_amount: i.target_amount || 0,
      addressable_spend: i.target_amount || 0,
      phase: i.phase || "medium_term",
    }));

    const mcResult = runMonteCarlo(mcInput, { id: eid, discount_rate: eng.discount_rate || 0.10 });
    const now = new Date().toISOString();

    const stored = db.insert(monte_carlo_runs).values({
      engagement_id: eid,
      iterations: mcResult.n_iterations,
      p10_savings: mcResult.total_savings_p10,
      p50_savings: mcResult.total_savings_p50,
      p90_savings: mcResult.total_savings_p90,
      p10_npv: mcResult.npv_p10,
      p50_npv: mcResult.npv_p50,
      p90_npv: mcResult.npv_p90,
      by_initiative_json: JSON.stringify(mcResult.by_initiative),
      by_phase_json: JSON.stringify(mcResult.by_phase),
      run_at: now,
      params_json: JSON.stringify({ discount_rate: eng.discount_rate, initiative_count: inits.length }),
    }).returning().get();

    res.json({ run_id: stored.id, ...mcResult });
  });

  app.get("/api/engagements/:id/monte-carlo/latest", (req, res) => {
    const eid = Number(req.params.id);
    const row = db.select().from(monte_carlo_runs)
      .where(eq(monte_carlo_runs.engagement_id, eid))
      .orderBy(desc(monte_carlo_runs.id)).limit(1).get();
    if (!row) return res.status(404).json({ error: "No Monte Carlo runs found" });

    // Parse JSON fields for convenience
    const result: any = { ...row };
    try { result.by_initiative = JSON.parse(row.by_initiative_json || "[]"); } catch { result.by_initiative = []; }
    try { result.by_phase = JSON.parse(row.by_phase_json || "{}"); } catch { result.by_phase = {}; }
    res.json(result);
  });

  // ========== MATURITY (v2) ==========
  app.get("/api/engagements/:id/maturity", (req, res) => {
    const eid = Number(req.params.id);
    const rows = db.select().from(procurement_maturity_assessments)
      .where(eq(procurement_maturity_assessments.engagement_id, eid)).all();
    res.json(rows);
  });

  app.post("/api/engagements/:id/maturity", (req, res) => {
    const eid = Number(req.params.id);
    const { dimensions } = req.body; // [{dimension, score, evidence, assessed_by}]
    if (!dimensions || !Array.isArray(dimensions)) {
      return res.status(400).json({ error: "dimensions array required" });
    }

    // Upsert: delete existing, insert new
    db.delete(procurement_maturity_assessments)
      .where(eq(procurement_maturity_assessments.engagement_id, eid)).run();

    const now = new Date().toISOString();
    const saved: any[] = [];
    for (const dim of dimensions) {
      const row = db.insert(procurement_maturity_assessments).values({
        engagement_id: eid,
        dimension: dim.dimension,
        score: dim.score,
        evidence: dim.evidence || null,
        gap_to_next_level: dim.gap_to_next_level || null,
        priority: dim.priority || null,
        assessed_by: dim.assessed_by || null,
        assessed_at: now,
      }).returning().get();
      saved.push(row);
    }

    res.json({ saved: saved.length, assessments: saved });
  });

  app.get("/api/engagements/:id/maturity/gap-analysis", (req, res) => {
    const eid = Number(req.params.id);
    const eng = db.select().from(engagements).where(eq(engagements.id, eid)).get();
    if (!eng) return res.status(404).json({ error: "Engagement not found" });

    const assessments = db.select().from(procurement_maturity_assessments)
      .where(eq(procurement_maturity_assessments.engagement_id, eid)).all();

    const currentScores: Record<string, number> = {};
    for (const a of assessments) {
      currentScores[a.dimension] = a.score;
    }

    const gap = computeGapAnalysis(
      currentScores,
      eng.industry || "Manufacturing",
      eng.company_size || "Mid-market",
      eid,
    );

    res.json(gap);
  });

  // ========== CONTRACTS (v2) ==========
  app.get("/api/engagements/:id/contracts", (req, res) => {
    const eid = Number(req.params.id);
    const rows = db.select().from(contracts).where(eq(contracts.engagement_id, eid)).all();
    res.json(rows);
  });

  app.post("/api/engagements/:id/contracts", (req, res) => {
    const eid = Number(req.params.id);
    const now = new Date().toISOString();
    const result = db.insert(contracts).values({
      engagement_id: eid,
      ...req.body,
      created_at: now,
    }).returning().get();
    res.json(result);
  });

  app.put("/api/engagements/:id/contracts/:cid", (req, res) => {
    const cid = Number(req.params.cid);
    db.update(contracts).set(req.body).where(eq(contracts.id, cid)).run();
    const updated = db.select().from(contracts).where(eq(contracts.id, cid)).get();
    res.json(updated);
  });

  app.delete("/api/engagements/:id/contracts/:cid", (req, res) => {
    const cid = Number(req.params.cid);
    db.delete(contracts).where(eq(contracts.id, cid)).run();
    res.json({ deleted: true, id: cid });
  });

  // ========== SOURCING SCENARIOS (v2) ==========
  app.post("/api/engagements/:id/tariffs/sourcing-scenario", (req, res) => {
    const eid = Number(req.params.id);
    const { category_name, current_country, proposed_country, annual_spend, gross_savings_pct } = req.body;

    if (!category_name || !current_country || !proposed_country || !annual_spend) {
      return res.status(400).json({ error: "category_name, current_country, proposed_country, annual_spend required" });
    }

    const result = analyzeSourceShift(
      category_name, current_country, proposed_country,
      Number(annual_spend), Number(gross_savings_pct) || 0.10,
    );

    const now = new Date().toISOString();
    const stored = db.insert(tariff_sourcing_scenarios).values({
      engagement_id: eid,
      initiative_id: req.body.initiative_id || null,
      category_name: result.category_name,
      supplier_name: req.body.supplier_name || null,
      annual_spend: result.annual_spend,
      current_country: result.current_country,
      current_tariff_pct: result.current_tariff_pct,
      current_tariff_cost: Math.round(result.annual_spend * result.current_tariff_pct / 100),
      proposed_country: result.proposed_country,
      proposed_tariff_pct: result.proposed_tariff_pct,
      proposed_tariff_cost: Math.round(result.annual_spend * result.proposed_tariff_pct / 100),
      gross_savings_from_shift: result.gross_savings,
      tariff_delta_cost: result.tariff_delta_cost,
      net_savings_after_tariff: result.net_savings,
      logistics_delta: result.logistics_delta_cost,
      quality_risk_cost: result.quality_risk_cost,
      total_net_benefit: result.net_savings,
      scenario_type: current_country === proposed_country ? "baseline" : proposed_country === "Mexico" || proposed_country === "Canada" ? "nearshore" : proposed_country === "Domestic" || proposed_country === "US" ? "domestic" : "shift",
      risk_level: result.recommendation === "Not recommended" ? "High" : result.recommendation === "Marginal" ? "Medium" : "Low",
      mitigation_strategy: result.recommendation_rationale,
      tariff_layers_json: JSON.stringify({ current: result.current_tariff_layers, proposed: result.proposed_tariff_layers }),
      notes: null,
      created_at: now,
    }).returning().get();

    res.json({ scenario_id: stored.id, analysis: result, stored });
  });

  app.get("/api/engagements/:id/tariffs/sourcing-scenarios", (req, res) => {
    const eid = Number(req.params.id);
    const rows = db.select().from(tariff_sourcing_scenarios)
      .where(eq(tariff_sourcing_scenarios.engagement_id, eid)).all();
    res.json(rows);
  });

  app.delete("/api/engagements/:id/tariffs/sourcing-scenarios/:sid", (req, res) => {
    const sid = Number(req.params.sid);
    db.delete(tariff_sourcing_scenarios).where(eq(tariff_sourcing_scenarios.id, sid)).run();
    res.json({ deleted: true, id: sid });
  });

  // ========== SPEND FLAGS (v2) ==========
  app.get("/api/engagements/:id/analysis/spend-flags", (req, res) => {
    const eid = Number(req.params.id);
    const records = db.select().from(spend_records).where(eq(spend_records.engagement_id, eid)).all();
    const contractRows = db.select().from(contracts).where(eq(contracts.engagement_id, eid)).all();
    const cats = db.select().from(categories).all();
    const spendResult = db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(spend_records).where(eq(spend_records.engagement_id, eid)).get();
    const totalSpend = spendResult?.total || 0;
    const flags = computeSpendFlags(records, contractRows, cats, totalSpend);
    res.json(flags);
  });

  // ========== CATEGORY STRATEGY (v2) ==========
  app.get("/api/engagements/:id/category-strategy", (req, res) => {
    const eid = Number(req.params.id);
    const rows = db.select().from(category_strategy)
      .where(eq(category_strategy.engagement_id, eid)).all();

    if (rows.length > 0) {
      return res.json(rows);
    }

    // Compute on-the-fly if empty
    const records = db.select().from(spend_records).where(eq(spend_records.engagement_id, eid)).all();
    const cats = db.select().from(categories).all();
    const spendResult = db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(spend_records).where(eq(spend_records.engagement_id, eid)).get();
    const totalSpend = spendResult?.total || 0;

    if (records.length === 0) return res.json([]);

    const kraljicResults = computeKraljicMatrix(records, cats, totalSpend);
    const strategies = generateCategoryStrategies(kraljicResults);
    res.json(strategies);
  });

  app.post("/api/engagements/:id/category-strategy/generate", (req, res) => {
    const eid = Number(req.params.id);

    // Clear old strategies
    db.delete(category_strategy).where(eq(category_strategy.engagement_id, eid)).run();

    const records = db.select().from(spend_records).where(eq(spend_records.engagement_id, eid)).all();
    const cats = db.select().from(categories).all();
    const spendResult = db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(spend_records).where(eq(spend_records.engagement_id, eid)).get();
    const totalSpend = spendResult?.total || 0;

    const kraljicResults = computeKraljicMatrix(records, cats, totalSpend);
    const strategies = generateCategoryStrategies(kraljicResults);
    const now = new Date().toISOString();
    const saved: any[] = [];

    for (const s of strategies) {
      const row = db.insert(category_strategy).values({
        engagement_id: eid,
        category_id: s.category_id,
        kraljic_quadrant: s.quadrant,
        supply_risk_score: s.supply_risk,
        profit_impact_score: s.profit_impact,
        recommended_levers_json: JSON.stringify(s.top_levers),
        sourcing_strategy: s.sourcing_strategy,
        contract_strategy: s.contract_strategy,
        target_quadrant: s.target_quadrant,
        transition_actions_json: JSON.stringify(s.transition_actions),
        transition_timeline: s.transition_timeline,
        priority_rank: s.priority_rank,
        notes: null,
        created_at: now,
      }).returning().get();
      saved.push(row);
    }

    res.json({ created: saved.length, strategies: saved });
  });

  // ========== SCORING REFRESH (v2) ==========
  app.post("/api/engagements/:id/initiatives/:iid/refresh-score", (req, res) => {
    const eid = Number(req.params.id);
    const iid = Number(req.params.iid);

    const init = db.select().from(savings_initiatives).where(eq(savings_initiatives.id, iid)).get();
    if (!init) return res.status(404).json({ error: "Initiative not found" });

    const allInits = db.select().from(savings_initiatives).where(eq(savings_initiatives.engagement_id, eid)).all();
    const records = db.select().from(spend_records).where(eq(spend_records.engagement_id, eid)).all();
    const cats = db.select().from(categories).all();
    const spendResult = db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(spend_records).where(eq(spend_records.engagement_id, eid)).get();
    const totalSpend = spendResult?.total || 0;

    const contractRows = db.select().from(contracts).where(eq(contracts.engagement_id, eid)).all();
    const eng = db.select().from(engagements).where(eq(engagements.id, eid)).get();

    const scores = scoreInitiatives(allInits, records, cats, totalSpend, contractRows, undefined, eng || undefined);
    const score = scores.find(s => s.initiative_id === iid);

    if (score) {
      const now = new Date().toISOString();
      db.update(savings_initiatives).set({
        scoring_json: JSON.stringify(score),
        probability: score.probability,
        risk_adjusted_target: Math.round((init.target_amount || 0) * score.probability),
        phase: score.phase,
        updated_at: now,
      }).where(eq(savings_initiatives.id, iid)).run();
    }

    const updated = db.select().from(savings_initiatives).where(eq(savings_initiatives.id, iid)).get();
    res.json({ score, initiative: updated });
  });

  app.post("/api/engagements/:id/initiatives/refresh-all-scores", (req, res) => {
    const eid = Number(req.params.id);
    const inits = db.select().from(savings_initiatives).where(eq(savings_initiatives.engagement_id, eid)).all();
    if (inits.length === 0) return res.json({ updated: 0 });

    const records = db.select().from(spend_records).where(eq(spend_records.engagement_id, eid)).all();
    const cats = db.select().from(categories).all();
    const spendResult = db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(spend_records).where(eq(spend_records.engagement_id, eid)).get();
    const totalSpend = spendResult?.total || 0;

    const contractRows = db.select().from(contracts).where(eq(contracts.engagement_id, eid)).all();
    const eng = db.select().from(engagements).where(eq(engagements.id, eid)).get();

    const scores = scoreInitiatives(inits, records, cats, totalSpend, contractRows, undefined, eng || undefined);
    const now = new Date().toISOString();
    let updated = 0;

    for (const score of scores) {
      const init = inits.find(i => i.id === score.initiative_id);
      if (!init) continue;
      db.update(savings_initiatives).set({
        scoring_json: JSON.stringify(score),
        probability: score.probability,
        risk_adjusted_target: Math.round((init.target_amount || 0) * score.probability),
        phase: score.phase,
        updated_at: now,
      }).where(eq(savings_initiatives.id, score.initiative_id)).run();
      updated++;
    }

    res.json({ updated, scores });
  });

  // ========== SENSITIVITY GRID (v2) ==========
  app.get("/api/engagements/:id/financial/initiative/:iid/sensitivity-grid", (req, res) => {
    const iid = Number(req.params.iid);
    const discountRate = Number(req.query.discount_rate) || 0.10;
    const init = db.select().from(savings_initiatives).where(eq(savings_initiatives.id, iid)).get();
    if (!init) return res.status(404).json({ error: "Initiative not found" });

    const cat = init.category_id
      ? db.select().from(categories).where(eq(categories.id, init.category_id)).get()
      : null;

    const grid = computeSensitivityGrid(init, cat?.name || "Uncategorized", discountRate);
    res.json(grid);
  });

  // ========== HEALTH SCORE (v2) ==========
  app.get("/api/engagements/:id/health-score", (req, res) => {
    const eid = Number(req.params.id);

    // 1. Data completeness (0-100): % records categorized + % normalized
    const totalRec = db.select({ count: sql<number>`COUNT(*)` })
      .from(spend_records).where(eq(spend_records.engagement_id, eid)).get();
    const categorized = db.select({ count: sql<number>`COUNT(*)` })
      .from(spend_records).where(and(eq(spend_records.engagement_id, eid), sql`category_id IS NOT NULL`)).get();
    const normalized = db.select({ count: sql<number>`COUNT(*)` })
      .from(spend_records).where(and(eq(spend_records.engagement_id, eid), sql`normalized_supplier_name IS NOT NULL`)).get();
    const total = totalRec?.count || 0;
    const catPct = total > 0 ? (categorized?.count || 0) / total : 0;
    const normPct = total > 0 ? (normalized?.count || 0) / total : 0;
    const dataCompleteness = Math.round((catPct * 50 + normPct * 50) * 100) / 100;

    // 2. Pipeline strength (0-100): based on identified → committed conversion
    const inits = db.select().from(savings_initiatives).where(eq(savings_initiatives.engagement_id, eid)).all();
    const totalTarget = inits.reduce((s, i) => s + (i.target_amount || 0), 0);
    const committedTarget = inits.filter(i => ["committed", "realized"].includes((i.status || "").toLowerCase()))
      .reduce((s, i) => s + (i.target_amount || 0), 0);
    const pipelineStrength = totalTarget > 0 ? Math.min(100, Math.round((committedTarget / totalTarget) * 100)) : 0;

    // 3. Realization pace (0-100): realized vs committed (on-track indicator)
    const realizedAmount = inits.reduce((s, i) => s + (i.realized_amount || 0), 0);
    const realizationPace = committedTarget > 0 ? Math.min(100, Math.round((realizedAmount / committedTarget) * 100)) : 0;

    // 4. Initiative quality (0-100): avg confidence, at-risk ratio
    const confidenceMap: Record<string, number> = { "High": 90, "Medium": 60, "Low": 30 };
    const avgConfidence = inits.length > 0
      ? Math.round(inits.reduce((s, i) => s + (confidenceMap[(i.confidence || "Medium")] || 50), 0) / inits.length)
      : 0;
    const atRiskCount = inits.filter(i => i.is_at_risk).length;
    const atRiskPenalty = inits.length > 0 ? Math.round((atRiskCount / inits.length) * 30) : 0;
    const initiativeQuality = Math.max(0, avgConfidence - atRiskPenalty);

    const overall = Math.round((dataCompleteness * 0.25 + pipelineStrength * 0.30 + realizationPace * 0.25 + initiativeQuality * 0.20));

    res.json({
      overall,
      components: {
        data_completeness: dataCompleteness,
        pipeline_strength: pipelineStrength,
        realization_pace: realizationPace,
        initiative_quality: initiativeQuality,
      },
      details: {
        total_records: total,
        categorized_pct: Math.round(catPct * 100),
        normalized_pct: Math.round(normPct * 100),
        total_initiatives: inits.length,
        total_target: totalTarget,
        committed_target: committedTarget,
        realized_amount: realizedAmount,
        at_risk_count: atRiskCount,
      },
    });
  });

  // ========== OVERLAP DETECTION (v2) ==========
  app.get("/api/engagements/:id/initiatives/overlap", (req, res) => {
    const eid = Number(req.params.id);
    const inits = db.select().from(savings_initiatives).where(eq(savings_initiatives.engagement_id, eid)).all();

    const overlaps: { initiative_a: number; initiative_b: number; reason: string; overlap_pct: number }[] = [];

    // Detect overlap: same category + same lever type
    for (let i = 0; i < inits.length; i++) {
      for (let j = i + 1; j < inits.length; j++) {
        const a = inits[i];
        const b = inits[j];
        if (a.category_id && a.category_id === b.category_id && a.lever_type === b.lever_type) {
          overlaps.push({
            initiative_a: a.id,
            initiative_b: b.id,
            reason: `Same category (${a.category_id}) and lever type (${a.lever_type})`,
            overlap_pct: 30,
          });
        }
        // Same supplier across different categories with same lever
        if (a.lever_type === b.lever_type && a.lever_type === "renegotiation") {
          // Check if same supplier (via name match in initiative name)
          const nameA = (a.name || "").toLowerCase();
          const nameB = (b.name || "").toLowerCase();
          const wordsA = nameA.split(/[\s\-—]+/).filter(w => w.length > 3);
          const wordsB = nameB.split(/[\s\-—]+/).filter(w => w.length > 3);
          const commonWords = wordsA.filter(w => wordsB.includes(w));
          if (commonWords.length >= 2 && a.id !== b.id) {
            const alreadyFlagged = overlaps.some(o =>
              (o.initiative_a === a.id && o.initiative_b === b.id) ||
              (o.initiative_a === b.id && o.initiative_b === a.id)
            );
            if (!alreadyFlagged) {
              overlaps.push({
                initiative_a: a.id,
                initiative_b: b.id,
                reason: `Similar initiative names with same lever type — possible double-counting`,
                overlap_pct: 20,
              });
            }
          }
        }
      }
    }

    res.json({
      overlap_count: overlaps.length,
      overlaps,
      total_overlap_risk: overlaps.reduce((s, o) => s + o.overlap_pct, 0),
    });
  });

  // ========== SPEND SUMMARIES REBUILD (v2) ==========
  app.post("/api/engagements/:id/spend-summaries/rebuild", (req, res) => {
    const eid = Number(req.params.id);

    // Clear existing summaries
    db.delete(spend_summaries).where(eq(spend_summaries.engagement_id, eid)).run();

    // Rebuild by category
    const catSummaries = db.all(sql`
      SELECT
        sr.category_id,
        COALESCE(SUM(sr.amount), 0) as total_spend,
        COUNT(*) as record_count,
        COUNT(DISTINCT COALESCE(sr.normalized_supplier_name, sr.supplier_name)) as unique_suppliers,
        AVG(sr.amount) as avg_invoice,
        MIN(sr.date) as min_date,
        MAX(sr.date) as max_date,
        COUNT(DISTINCT sr.gl_code) as gl_code_count
      FROM spend_records sr
      WHERE sr.engagement_id = ${eid} AND sr.category_id IS NOT NULL
      GROUP BY sr.category_id
    `) as any[];

    const now = new Date().toISOString();
    let created = 0;

    for (const s of catSummaries) {
      db.insert(spend_summaries).values({
        engagement_id: eid,
        category_id: s.category_id,
        supplier_name: null,
        total_spend: s.total_spend,
        record_count: s.record_count,
        unique_suppliers: s.unique_suppliers,
        avg_invoice: Math.round(s.avg_invoice || 0),
        min_date: s.min_date,
        max_date: s.max_date,
        non_po_rate: null,
        credit_memo_rate: null,
        price_cv: null,
        price_trend_annual_pct: null,
        gl_code_count: s.gl_code_count,
        computed_at: now,
      }).run();
      created++;
    }

    res.json({ created, computed_at: now });
  });

  // ========== AT-RISK DETECTION (v2) ==========
  app.post("/api/engagements/:id/initiatives/detect-at-risk", (req, res) => {
    const eid = Number(req.params.id);
    const inits = db.select().from(savings_initiatives).where(eq(savings_initiatives.engagement_id, eid)).all();
    const now = new Date().toISOString();
    const flagged: { id: number; reason: string }[] = [];

    for (const init of inits) {
      if ((init.status || "").toLowerCase() === "abandoned") continue;
      if ((init.status || "").toLowerCase() === "realized") continue;

      let atRisk = false;
      let reason = "";

      // Rule 1: Committed but realized < 50% of target and expected date is past
      if ((init.status || "").toLowerCase() === "committed") {
        const realizedPct = (init.target_amount || 0) > 0 ? (init.realized_amount || 0) / init.target_amount! : 0;
        if (init.expected_realization_date && init.expected_realization_date < now && realizedPct < 0.5) {
          atRisk = true;
          reason = `Past expected date with only ${Math.round(realizedPct * 100)}% realized`;
        }
      }

      // Rule 2: In-progress for >90 days with no realization entries
      if ((init.status || "").toLowerCase() === "in_progress" && init.created_at) {
        const daysSinceCreation = Math.floor((Date.now() - new Date(init.created_at).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceCreation > 90 && (init.realized_amount || 0) === 0) {
          atRisk = true;
          reason = `In-progress for ${daysSinceCreation} days with no realization`;
        }
      }

      // Rule 3: Low confidence and high target
      if ((init.confidence || "").toLowerCase() === "low" && (init.target_amount || 0) > 100000) {
        atRisk = true;
        reason = reason ? reason + "; Low confidence with high target (>$100K)" : "Low confidence with high target (>$100K)";
      }

      if (atRisk) {
        db.update(savings_initiatives)
          .set({ is_at_risk: 1, at_risk_reason: reason, updated_at: now })
          .where(eq(savings_initiatives.id, init.id)).run();
        flagged.push({ id: init.id, reason });
      } else if (init.is_at_risk) {
        // Clear at-risk flag if no longer at risk
        db.update(savings_initiatives)
          .set({ is_at_risk: 0, at_risk_reason: null, updated_at: now })
          .where(eq(savings_initiatives.id, init.id)).run();
      }
    }

    res.json({ flagged_count: flagged.length, flagged });
  });

  // ========== DEMO DATA SEEDER ==========
  app.post("/api/seed/demo-engagement", (_req, res) => {
    const now = new Date().toISOString();

    // Create engagement
    const engResult = db.insert(engagements).values({
      name: "Demo: Acme Manufacturing — Procurement Assessment",
      portfolio_company: "Acme Manufacturing Co.",
      pe_sponsor: "Summit Partners",
      engagement_mode: "pe_100_day",
      industry: "manufacturing",
      company_size: "mid-market",
      business_type: "manufacturer",
      location: "Midwest US",
      geography: "north_america",
      annual_revenue: 750000000,
      ebitda_margin_pct: 14.5,
      procurement_maturity: "developing",
      discount_rate: 0.10,
      status: "active",
      start_date: now.split("T")[0],
      created_at: now,
      updated_at: now,
    }).run();
    const eid = Number(engResult.lastInsertRowid);

    // Create categories
    const DEMO_CATS = ["IT Services", "Facilities Management", "Staffing & Contingent", "MRO & Industrial", "Freight & Logistics", "Professional Services"];
    const catIds: Record<string, number> = {};
    for (const catName of DEMO_CATS) {
      const catResult = db.insert(categories).values({ name: catName, level: "L1", is_global: 0 }).run();
      catIds[catName] = Number(catResult.lastInsertRowid);
    }

    // Generate 500 spend records
    const SUPPLIERS: Record<string, string[]> = {
      "IT Services": ["Cognizant", "Infosys", "Accenture", "TCS", "Wipro", "DXC Technology", "HCL Tech", "IBM Consulting"],
      "Facilities Management": ["CBRE", "JLL", "Sodexo", "ABM Industries", "Cushman & Wakefield", "Aramark"],
      "Staffing & Contingent": ["Robert Half", "Adecco", "ManpowerGroup", "Kelly Services", "Randstad", "Hays"],
      "MRO & Industrial": ["Grainger", "Fastenal", "MSC Industrial", "Applied Industrial", "Motion Industries", "Kaman Distribution"],
      "Freight & Logistics": ["XPO Logistics", "FedEx", "UPS", "CH Robinson", "JB Hunt", "Schneider National"],
      "Professional Services": ["Deloitte", "McKinsey", "BCG", "EY", "PwC", "KPMG", "Bain"],
    };

    const glCodes: Record<string, string> = {
      "IT Services": "6100", "Facilities Management": "6200", "Staffing & Contingent": "6300",
      "MRO & Industrial": "6400", "Freight & Logistics": "6500", "Professional Services": "6600",
    };

    const poTypes = ["PO", "P-Card", "Non-PO", "BlanketPO"];
    let seed = 12345;
    const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

    for (let i = 0; i < 500; i++) {
      const catName = DEMO_CATS[Math.floor(rand() * DEMO_CATS.length)];
      const suppliers = SUPPLIERS[catName];
      const supplier = suppliers[Math.floor(rand() * suppliers.length)];
      const amount = 500 + rand() * 499500; // $500 - $500K
      const monthOffset = Math.floor(rand() * 18);
      const baseDate = new Date(2024, 6 + monthOffset, 1 + Math.floor(rand() * 28));
      const dateStr = baseDate.toISOString().split("T")[0];

      db.insert(spend_records).values({
        engagement_id: eid,
        supplier_name: supplier,
        normalized_supplier_name: supplier.toUpperCase(),
        amount: Math.round(amount * 100) / 100,
        description: `${catName} services - Invoice #${10000 + i}`,
        gl_code: glCodes[catName] || "6000",
        date: dateStr,
        business_unit: rand() > 0.5 ? "Corporate" : "Operations",
        po_type: poTypes[Math.floor(rand() * poTypes.length)],
        category_id: catIds[catName],
        is_duplicate_flag: 0,
        created_at: now,
      }).run();
    }

    // Create 3 demo initiatives
    const demoInits = [
      { name: "Payment Terms Optimization — IT Services", category_id: catIds["IT Services"], lever_type: "payment_terms", phase: "quick_win", target_amount: 450000, status: "identified", probability: 0.85 },
      { name: "IT Services Contract Renegotiation", category_id: catIds["IT Services"], lever_type: "renegotiation", phase: "medium_term", target_amount: 1200000, status: "identified", probability: 0.65 },
      { name: "Global Sourcing — MRO & Industrial", category_id: catIds["MRO & Industrial"], lever_type: "global_sourcing", phase: "long_term", target_amount: 2800000, status: "identified", probability: 0.45 },
    ];

    for (const init of demoInits) {
      db.insert(savings_initiatives).values({
        engagement_id: eid,
        name: init.name,
        category_id: init.category_id,
        lever_type: init.lever_type,
        phase: init.phase,
        target_amount: init.target_amount,
        status: init.status,
        probability: init.probability,
        risk_adjusted_target: init.target_amount * init.probability,
        confidence: init.probability >= 0.7 ? "High" : init.probability >= 0.5 ? "Medium" : "Low",
        created_at: now,
        updated_at: now,
      }).run();
    }

    // Compute total_addressable_spend
    const totalSpend = db.get(sql`SELECT SUM(amount) as total FROM spend_records WHERE engagement_id = ${eid}`) as any;
    db.update(engagements).set({ total_addressable_spend: totalSpend?.total || 0, updated_at: now }).where(eq(engagements.id, eid)).run();

    const eng = db.select().from(engagements).where(eq(engagements.id, eid)).get();
    res.json(eng);
  });

  // =========================================================================
  // v3 — MARKET INTELLIGENCE ROUTES (P1-13, P1-14, P1-17)
  // =========================================================================

  app.get("/api/market/health", async (_req, res) => {
    const health = await checkSidecarHealth();
    res.json(health);
  });

  app.get("/api/market/cache", (_req, res) => {
    const data = getCachedMarketData();
    res.json({ data, count: data.length });
  });

  app.post("/api/market/commodities", async (req, res) => {
    try {
      const force = Boolean(req.body?.force_refresh);
      const result = await fetchCommodities(force);
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/market/commodities", async (_req, res) => {
    try {
      const result = await fetchCommodities(false);
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/market/fred", async (req, res) => {
    try {
      const force = Boolean(req.body?.force_refresh);
      const ids: string[] | undefined = req.body?.series_ids;
      const result = await fetchFredSeries(ids, force);
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/market/eia", async (req, res) => {
    try {
      const force = Boolean(req.body?.force_refresh);
      const ids: string[] | undefined = req.body?.series_ids;
      const result = await fetchEiaSeries(ids, force);
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/market/refresh-all", async (_req, res) => {
    try {
      const [commodities, fred, eia] = await Promise.allSettled([
        fetchCommodities(true),
        fetchFredSeries(undefined, true),
        fetchEiaSeries(undefined, true),
      ]);
      const summary = {
        commodities: commodities.status === "fulfilled"
          ? { ok: true, count: commodities.value.data.length, errors: commodities.value.errors }
          : { ok: false, error: (commodities.reason as Error).message },
        fred: fred.status === "fulfilled"
          ? { ok: true, count: fred.value.data.length, errors: fred.value.errors }
          : { ok: false, error: (fred.reason as Error).message },
        eia: eia.status === "fulfilled"
          ? { ok: true, count: eia.value.data.length, errors: eia.value.errors }
          : { ok: false, error: (eia.reason as Error).message },
        refreshed_at: new Date().toISOString(),
      };
      res.json(summary);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // =========================================================================
  // v3 — JOB QUEUE ROUTES (P1-02, P1-03)
  // =========================================================================

  /** GET /api/jobs/status — system status: Redis availability */
  app.get("/api/jobs/status", (_req, res) => {
    res.json({ redis_available: isRedisAvailable(), mode: isRedisAvailable() ? "bullmq" : "inline" });
  });

  /** POST /api/jobs — enqueue a new job */
  app.post("/api/jobs", async (req, res) => {
    try {
      const { job_type, engagement_id, payload, priority, delay_ms } = req.body;
      if (!job_type) return res.status(400).json({ error: "job_type is required" });
      const result = await enqueue({ job_type, engagement_id, payload, priority, delay_ms });
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** GET /api/jobs/:id — get job status */
  app.get("/api/jobs/:id", (req, res) => {
    const job = getJobStatus(Number(req.params.id));
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  });

  /** GET /api/jobs/:id/stream — SSE progress stream */
  app.get("/api/jobs/:id/stream", (req, res) => {
    const jobId = Number(req.params.id);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Send current status immediately
    const job = getJobStatus(jobId);
    if (job) {
      res.write(`data: ${JSON.stringify({ progress_pct: job.progress_pct, message: job.progress_message, status: job.status })}

`);
      if (job.status === "complete" || job.status === "failed" || job.status === "cancelled") {
        res.end();
        return;
      }
    }

    const unregister = registerSseClient(jobId, (msg) => {
      res.write(`data: ${msg}

`);
      // Auto-close if job terminal
      try {
        const parsed = JSON.parse(msg);
        if (parsed.progress_pct === 100 || parsed.status === "failed") {
          setTimeout(() => res.end(), 500);
        }
      } catch {}
    });

    // Polling fallback: check DB every 3s if SSE not firing
    const pollInterval = setInterval(() => {
      const current = getJobStatus(jobId);
      if (!current) return;
      res.write(`data: ${JSON.stringify({ progress_pct: current.progress_pct, message: current.progress_message, status: current.status })}

`);
      if (current.status === "complete" || current.status === "failed" || current.status === "cancelled") {
        clearInterval(pollInterval);
        setTimeout(() => res.end(), 500);
      }
    }, 3000);

    req.on("close", () => {
      unregister();
      clearInterval(pollInterval);
    });
  });

  /** DELETE /api/jobs/:id — cancel a job */
  app.delete("/api/jobs/:id", (req, res) => {
    const ok = cancelJob(Number(req.params.id));
    res.json({ cancelled: ok });
  });

  /** GET /api/engagements/:id/jobs — all jobs for an engagement */
  app.get("/api/engagements/:id/jobs", (req, res) => {
    const jobs = getJobsForEngagement(Number(req.params.id));
    res.json(jobs);
  });

  // =========================================================================
  // v3 — NL CO-PILOT ROUTES (P1-05, P1-07, P1-08)
  // =========================================================================

  /**
   * POST /api/engagements/:id/copilot
   * Main streaming chat endpoint. Returns SSE.
   * Body: { message: string, history: [{role, content}], session_id?: number }
   */
  app.post("/api/engagements/:id/copilot", async (req, res) => {
    const engagement_id = Number(req.params.id);
    const { message, history = [], session_id } = req.body;
    if (!message) return res.status(400).json({ error: "message is required" });
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: "ANTHROPIC_API_KEY not set. Add it to your environment." });
    }
    await streamCopilotResponse({ engagement_id, message, history, session_id }, res);
  });

  /** GET /api/engagements/:id/copilot/sessions — list saved sessions */
  app.get("/api/engagements/:id/copilot/sessions", (req, res) => {
    const sessions = getSessions(Number(req.params.id));
    res.json(sessions);
  });

  /** GET /api/copilot/sessions/:sid — load a specific session */
  app.get("/api/copilot/sessions/:sid", (req, res) => {
    const session = getSession(Number(req.params.sid));
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
  });

  /** PATCH /api/copilot/sessions/:sid — rename a session */
  app.patch("/api/copilot/sessions/:sid", (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    renameSession(Number(req.params.sid), name);
    res.json({ ok: true });
  });

  // =========================================================================
  // v3 — CONTRACT EXTRACTION ROUTES (P1-18, P1-19)
  // =========================================================================

  /**
   * POST /api/engagements/:id/contracts/upload
   * Upload a contract file (PDF, DOCX, TXT). Creates extraction row + enqueues job.
   * Returns { extraction_id, job_id } for SSE tracking.
   */
  app.post(
    "/api/engagements/:id/contracts/upload",
    upload.single("file"),
    async (req, res) => {
      const engagementId = Number(req.params.id);

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { originalname, buffer, mimetype } = req.file;
      const ext = originalname.split(".").pop()?.toLowerCase();
      const allowed = ["pdf", "docx", "doc", "txt"];
      if (!ext || !allowed.includes(ext)) {
        return res.status(400).json({ error: `Unsupported file type: .${ext}. Allowed: PDF, DOCX, TXT` });
      }

      if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured. Cannot run Claude extraction." });
      }

      const now = new Date().toISOString();

      // Save file to disk for queue-based processing
      const uploadDir = "./uploads/contracts";
      if (!fsSync.existsSync(uploadDir)) fsSync.mkdirSync(uploadDir, { recursive: true });
      const safeName = `${Date.now()}-${originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const filePath = pathMod.join(uploadDir, safeName);
      fsSync.writeFileSync(filePath, buffer);

      // Create extraction row
      const extraction = db
        .insert(contract_extractions)
        .values({
          engagement_id: engagementId,
          file_name: originalname,
          file_path: filePath,
          extraction_status: "pending",
        })
        .returning({ id: contract_extractions.id })
        .get();

      const extractionId = extraction.id;

      // Enqueue job
      const jobResult = await enqueue({
        job_type: "contract_extract",
        engagement_id: engagementId,
        agent_id: "agent_1d",
        payload: {
          extraction_id: extractionId,
          engagement_id: engagementId,
          file_name: originalname,
          file_path: filePath,
        },
      });

      res.json({
        extraction_id: extractionId,
        job_id: jobResult.job_id,
        job_mode: jobResult.mode,
        file_name: originalname,
        message: "File uploaded. Extraction queued.",
      });
    },
  );

  /**
   * GET /api/engagements/:id/contracts/extractions
   * List all extractions for an engagement.
   */
  app.get("/api/engagements/:id/contracts/extractions", (req, res) => {
    const extractions = getExtractions(Number(req.params.id));
    res.json(extractions);
  });

  /**
   * GET /api/engagements/:id/contracts/extractions/:eid
   * Get a single extraction with full details.
   */
  app.get("/api/engagements/:id/contracts/extractions/:eid", (req, res) => {
    const extraction = getExtraction(Number(req.params.eid));
    if (!extraction) return res.status(404).json({ error: "Extraction not found" });
    res.json(extraction);
  });

  /**
   * POST /api/engagements/:id/contracts/extractions/:eid/retry
   * Re-run extraction on a failed or low-confidence result.
   */
  app.post("/api/engagements/:id/contracts/extractions/:eid/retry", async (req, res) => {
    const engagementId = Number(req.params.id);
    const extractionId = Number(req.params.eid);
    const extraction = getExtraction(extractionId);
    if (!extraction) return res.status(404).json({ error: "Extraction not found" });

    // Reset status
    db.update(contract_extractions)
      .set({ extraction_status: "pending" })
      .where(eq(contract_extractions.id, extractionId))
      .run();

    const jobResult = await enqueue({
      job_type: "contract_extract",
      engagement_id: engagementId,
      agent_id: "agent_1d",
      payload: {
        extraction_id: extractionId,
        engagement_id: engagementId,
        file_name: extraction.file_name,
        file_path: extraction.file_path ?? "",
      },
    });

    res.json({ job_id: jobResult.job_id, extraction_id: extractionId, message: "Re-extraction queued." });
  });

  /**
   * GET /api/engagements/:id/alerts
   * Get watchlist alerts (contract expiry, supplier distress, commodity spike, etc.)
   */
  /** GET /api/engagements/:id/alerts — list alerts, grouped and sorted by severity */
  app.get("/api/engagements/:id/alerts", (req, res) => {
    const engagementId = Number(req.params.id);
    const onlyUnresolved = req.query.unresolved !== "false";
    const alerts = getAlerts(engagementId, onlyUnresolved);
    res.json(alerts);
  });

  /** GET /api/engagements/:id/alerts/counts — badge counts */
  app.get("/api/engagements/:id/alerts/counts", (req, res) => {
    const counts = getAlertCounts(Number(req.params.id));
    res.json(counts);
  });

  /** POST /api/engagements/:id/alerts/scan — trigger alert scan job */
  app.post("/api/engagements/:id/alerts/scan", async (req, res) => {
    const engagementId = Number(req.params.id);
    const jobResult = await enqueue({
      job_type: "alert_scan",
      engagement_id: engagementId,
      agent_id: "agent_13",
      payload: { engagement_id: engagementId },
    });
    res.json({ job_id: jobResult.job_id, mode: jobResult.mode });
  });

  /** PATCH /api/engagements/:id/alerts/:aid/acknowledge */
  app.patch("/api/engagements/:id/alerts/:aid/acknowledge", (req, res) => {
    acknowledgeAlert(Number(req.params.aid));
    res.json({ ok: true });
  });

  /** PATCH /api/engagements/:id/alerts/:aid/resolve */
  app.patch("/api/engagements/:id/alerts/:aid/resolve", (req, res) => {
    resolveAlert(Number(req.params.aid));
    res.json({ ok: true });
  });

  /** POST /api/engagements/:id/alerts/resolve-all — bulk resolve by type */
  app.post("/api/engagements/:id/alerts/resolve-all", (req, res) => {
    const alertType: string | undefined = req.body?.alert_type;
    bulkResolveAlerts(Number(req.params.id), alertType);
    res.json({ ok: true });
  });


  // =========================================================================
  // v3 — WEB SEARCH ROUTES (P1-15b)
  // =========================================================================

  /** GET /api/search/health — which search tiers are available */
  app.get("/api/search/health", async (_req, res) => {
    const health = await getSearchHealth();
    res.json(health);
  });

  /** POST /api/search/web — general web search */
  app.post("/api/search/web", async (req, res) => {
    const { query, high_value, semantic, max_results } = req.body ?? {};
    if (!query) return res.status(400).json({ error: "query is required" });
    try {
      const result = await search(String(query), {
        highValue: Boolean(high_value),
        semantic: Boolean(semantic),
        maxResults: Number(max_results ?? 10),
      });
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** POST /api/search/news — news search */
  app.post("/api/search/news", async (req, res) => {
    const { query, max_results } = req.body ?? {};
    if (!query) return res.status(400).json({ error: "query is required" });
    try {
      const result = await searchNews(String(query), { maxResults: Number(max_results ?? 20) });
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** POST /api/search/supplier — supplier web lookup */
  app.post("/api/search/supplier", async (req, res) => {
    const { supplier_name, context } = req.body ?? {};
    if (!supplier_name) return res.status(400).json({ error: "supplier_name is required" });
    try {
      const result = await lookupSupplier(String(supplier_name), context ? String(context) : undefined);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** POST /api/search/similar-suppliers — semantic supplier discovery */
  app.post("/api/search/similar-suppliers", async (req, res) => {
    const { description } = req.body ?? {};
    if (!description) return res.status(400).json({ error: "description is required" });
    try {
      const result = await findSimilarSuppliers(String(description));
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // =========================================================================
  // v3 — NEWS & SUPPLIER RISK ROUTES (P1-23)
  // =========================================================================

  /** GET /api/engagements/:id/supplier-risk — get all risk profiles */
  app.get("/api/engagements/:id/supplier-risk", (req, res) => {
    const profiles = getRiskProfiles(Number(req.params.id));
    res.json(profiles);
  });

  /** POST /api/engagements/:id/supplier-risk/scan — trigger full news scan */
  app.post("/api/engagements/:id/supplier-risk/scan", async (req, res) => {
    const engagementId = Number(req.params.id);
    const topN = Number(req.body?.top_n ?? 20);

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });
    }

    const jobResult = await enqueue({
      job_type: "news_scan",
      engagement_id: engagementId,
      agent_id: "agent_5b",
      payload: { engagement_id: engagementId, top_n: topN },
    });

    res.json({ job_id: jobResult.job_id, mode: jobResult.mode, message: `News scan queued for top ${topN} suppliers` });
  });

  /** POST /api/engagements/:id/supplier-risk/scan/:supplier — scan single supplier */
  app.post("/api/engagements/:id/supplier-risk/scan/:supplier", async (req, res) => {
    const engagementId = Number(req.params.id);
    const supplierName = decodeURIComponent(req.params.supplier);

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });
    }

    try {
      const result = await scanSupplier(engagementId, supplierName);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** GET /api/news/rss — trade journal RSS items */
  app.get("/api/news/rss", async (_req, res) => {
    const items = await getRssItems();
    res.json({ items, count: items.length });
  });

  // =========================================================================
  // v3 — DELIVERABLE GENERATION ROUTES (P1-09, P1-10, P1-11)
  // =========================================================================

  /** GET /api/engagements/:id/deliverables — list all generated files */
  app.get("/api/engagements/:id/deliverables", (req, res) => {
    const deliverables = getDeliverables(Number(req.params.id));
    res.json(deliverables);
  });

  /** POST /api/engagements/:id/generate/steerco — enqueue steerco deck */
  app.post("/api/engagements/:id/generate/steerco", async (req, res) => {
    const engagementId = Number(req.params.id);
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });
    }
    const jobResult = await enqueue({
      job_type: "deliverable_gen",
      engagement_id: engagementId,
      agent_id: "agent_6",
      payload: { engagement_id: engagementId, type: "steerco_pptx" },
    });
    res.json({ job_id: jobResult.job_id, mode: jobResult.mode, type: "steerco_pptx" });
  });

  /** POST /api/engagements/:id/generate/odd-memo — enqueue ODD memo */
  app.post("/api/engagements/:id/generate/odd-memo", async (req, res) => {
    const engagementId = Number(req.params.id);
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });
    }
    const jobResult = await enqueue({
      job_type: "deliverable_gen",
      engagement_id: engagementId,
      agent_id: "agent_6",
      payload: { engagement_id: engagementId, type: "odd_memo_docx" },
    });
    res.json({ job_id: jobResult.job_id, mode: jobResult.mode, type: "odd_memo_docx" });
  });

  /** POST /api/engagements/:id/generate/excel — enqueue Excel model */
  app.post("/api/engagements/:id/generate/excel", async (req, res) => {
    const engagementId = Number(req.params.id);
    const jobResult = await enqueue({
      job_type: "deliverable_gen",
      engagement_id: engagementId,
      agent_id: "agent_6",
      payload: { engagement_id: engagementId, type: "excel_model" },
    });
    res.json({ job_id: jobResult.job_id, mode: jobResult.mode, type: "excel_model" });
  });

  /** GET /api/deliverables/:id/download — download a generated file */
  app.get("/api/deliverables/:id/download", (req, res) => {
    const deliverable = db
      .select()
      .from(deliverable_outputs)
      .where(eq(deliverable_outputs.id, Number(req.params.id)))
      .get();
    if (!deliverable) return res.status(404).json({ error: "Deliverable not found" });

    if (!fsSync.existsSync(deliverable.file_path)) {
      return res.status(404).json({ error: "File not found on disk" });
    }

    const mimeTypes: Record<string, string> = {
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
    const ext = deliverable.file_name.split(".").pop() ?? "bin";
    res.setHeader("Content-Type", mimeTypes[ext] ?? "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${deliverable.file_name}"`);
    fsSync.createReadStream(deliverable.file_path).pipe(res);
  });


  // =========================================================================
  // v3 — SANCTIONS & FINANCIAL SCREENING ROUTES (P2-02, P2-03)
  // =========================================================================

  /** POST /api/engagements/:id/supplier-risk/sanctions-scan
   *  Enqueue OFAC + SAM.gov batch screening for top-N suppliers */
  app.post("/api/engagements/:id/supplier-risk/sanctions-scan", async (req, res) => {
    const engagementId = Number(req.params.id);
    const topN = Number(req.body?.top_n ?? 30);
    const includeEdgar = Boolean(req.body?.include_edgar ?? false);
    const jobResult = await enqueue({
      job_type: "sanctions_scan",
      engagement_id: engagementId,
      agent_id: "agent_5d",
      payload: { engagement_id: engagementId, top_n: topN, include_edgar: includeEdgar },
    });
    res.json({ job_id: jobResult.job_id, mode: jobResult.mode, message: `Sanctions scan queued for top ${topN} suppliers` });
  });

  /** POST /api/engagements/:id/supplier-risk/screen/:supplier
   *  Screen a single supplier (OFAC + SAM + optional EDGAR) */
  app.post("/api/engagements/:id/supplier-risk/screen/:supplier", async (req, res) => {
    const engagementId = Number(req.params.id);
    const supplierName = decodeURIComponent(req.params.supplier);
    const includeEdgar = Boolean(req.body?.include_edgar ?? false);
    try {
      const result = await screenSupplier(engagementId, supplierName, includeEdgar);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** GET /api/engagements/:id/supplier-risk/hhi
   *  Herfindahl-Hirschman Index per category */
  app.get("/api/engagements/:id/supplier-risk/hhi", (req, res) => {
    const hhi = computeHHI(Number(req.params.id));
    res.json(hhi);
  });

  /** GET /api/engagements/:id/supplier-risk/:supplier
   *  Get a single supplier's risk profile */
  app.get("/api/engagements/:id/supplier-risk/:supplier", (req, res) => {
    const engagementId = Number(req.params.id);
    const supplierName = decodeURIComponent(req.params.supplier);
    const profile = db.get(sql`
      SELECT * FROM supplier_risk_profiles
      WHERE engagement_id = ${engagementId} AND supplier_name = ${supplierName}
    `);
    if (!profile) return res.status(404).json({ error: "Profile not found" });
    res.json(profile);
  });


  // =========================================================================
  // v3 — PORTFOLIO COMMAND CENTER ROUTES (P3-01, P3-02)
  // =========================================================================

  /** GET /api/portfolio/summary — live cross-engagement KPI rollup */
  app.get("/api/portfolio/summary", (_req, res) => {
    try {
      const summary = getPortfolioSummary();
      res.json(summary);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** POST /api/portfolio/snapshot — trigger nightly snapshot (manual) */
  app.post("/api/portfolio/snapshot", async (_req, res) => {
    try {
      savePortfolioSnapshot();
      res.json({ ok: true, message: "Snapshot saved" });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** GET /api/portfolio/history — last N daily snapshots for trend */
  app.get("/api/portfolio/history", (req, res) => {
    const days = Number(req.query.days ?? 30);
    res.json(getSnapshotHistory(days));
  });


  // =========================================================================
  // v3 — FX RATES & EXPOSURE (P2-06, P2-07)
  // =========================================================================

  /** GET /api/engagements/:id/fx/rates — get current FX rates */
  app.get("/api/engagements/:id/fx/rates", async (req, res) => {
    const engagementId = Number(req.params.id);
    try {
      const result = await refreshFxRates(engagementId);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** POST /api/engagements/:id/fx/refresh — force refresh from ECB */
  app.post("/api/engagements/:id/fx/refresh", async (req, res) => {
    const engagementId = Number(req.params.id);
    try {
      const result = await refreshFxRates(engagementId);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** GET /api/engagements/:id/fx/exposure — currency exposure analysis */
  app.get("/api/engagements/:id/fx/exposure", (req, res) => {
    try {
      const analysis = analyzeExposure(Number(req.params.id));
      res.json(analysis);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // =========================================================================
  // v3 — LIVE TARIFF LOOKUP (P2-13)
  // =========================================================================

  /** POST /api/engagements/:id/tariffs/live-lookup — USITC live rates + delta check */
  app.post("/api/engagements/:id/tariffs/live-lookup", async (req, res) => {
    const engagementId = Number(req.params.id);
    const jobResult = await enqueue({
      job_type: "tariff_lookup",
      engagement_id: engagementId,
      agent_id: "agent_4",
      payload: { engagement_id: engagementId },
    });
    res.json({ job_id: jobResult.job_id, mode: jobResult.mode });
  });

  /** GET /api/tariffs/hts/:code — spot check single HTS code */
  app.get("/api/tariffs/hts/:code", async (req, res) => {
    const htsCode = req.params.code;
    const country = String(req.query.country ?? "CN");
    try {
      const result = await lookupHtsRate(htsCode, country);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // =========================================================================
  // v3 — CATEGORY BRIEF GENERATOR (P3-06, P3-07)
  // =========================================================================

  /** POST /api/engagements/:id/categories/:cid/brief — generate 1-page category brief */
  app.post("/api/engagements/:id/categories/:cid/brief", async (req, res) => {
    const engagementId = Number(req.params.id);
    const categoryId = Number(req.params.cid);

    // Get category name
    const cat = db.get(sql`SELECT name FROM categories WHERE id = ${categoryId}`);
    const categoryName = (cat as any)?.name ?? "Category";

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });
    }

    const jobResult = await enqueue({
      job_type: "category_brief",
      engagement_id: engagementId,
      agent_id: "agent_10",
      payload: { engagement_id: engagementId, category_id: categoryId, category_name: categoryName },
    });

    res.json({
      job_id: jobResult.job_id,
      mode: jobResult.mode,
      category: categoryName,
      message: "Category brief queued. Uses Exa.ai for competitor supplier research.",
    });
  });

  /** GET /api/engagements/:id/categories/:cid/briefs — list briefs for a category */
  app.get("/api/engagements/:id/categories/:cid/briefs", (req, res) => {
    const engagementId = Number(req.params.id);
    const catName = db.get(sql`SELECT name FROM categories WHERE id = ${Number(req.params.cid)}`);
    const name = (catName as any)?.name ?? "";
    const briefs = db.all(sql`
      SELECT * FROM deliverable_outputs
      WHERE engagement_id = ${engagementId}
        AND deliverable_type = 'category_brief_docx'
        AND file_name LIKE ${'%' + name.replace(/[^a-zA-Z0-9]/g, '_').slice(0,20) + '%'}
      ORDER BY generated_at DESC LIMIT 5
    `);
    res.json(briefs);
  });


  // =========================================================================
  // P2-11/12 — LIVE RISK-FREE RATE + EBITDA NARRATIVE
  // =========================================================================

  /**
   * GET /api/engagements/:id/financial/live-rates
   * Pull FEDFUNDS + GS10 from market_data_cache.
   * Returns suggested discount_rate and current vs. applied delta.
   */
  app.get("/api/engagements/:id/financial/live-rates", async (req, res) => {
    const engagementId = Number(req.params.id);

    // Fetch from cache
    const fedFunds = db.get(sql`
      SELECT value, yoy_change_pct, period, fetched_at
      FROM market_data_cache WHERE series_id = 'FEDFUNDS'
    `) as { value: number; yoy_change_pct: number | null; period: string; fetched_at: string } | undefined;

    const gs10 = db.get(sql`
      SELECT value, yoy_change_pct, period, fetched_at
      FROM market_data_cache WHERE series_id = 'GS10'
    `) as { value: number; yoy_change_pct: number | null; period: string; fetched_at: string } | undefined;

    // Get current engagement discount rate
    const eng = db.select().from(engagements).where(eq(engagements.id, engagementId)).get();
    const currentRate = eng?.discount_rate ?? 0.10;

    // Suggest: GS10 + 300bps equity risk premium (PE standard), floored at 8%
    const gs10Rate = gs10?.value ? gs10.value / 100 : null;
    const suggestedRate = gs10Rate ? Math.max(0.08, gs10Rate + 0.03) : null;
    const deltaBps = suggestedRate ? Math.round((suggestedRate - currentRate) * 10000) : null;

    res.json({
      fedfunds: fedFunds ? { rate_pct: fedFunds.value, period: fedFunds.period, fetched_at: fedFunds.fetched_at, yoy_change_pct: fedFunds.yoy_change_pct } : null,
      gs10: gs10 ? { rate_pct: gs10.value, period: gs10.period, fetched_at: gs10.fetched_at, yoy_change_pct: gs10.yoy_change_pct } : null,
      current_discount_rate: currentRate,
      suggested_discount_rate: suggestedRate,
      delta_bps: deltaBps,
      methodology: "GS10 + 300bps equity risk premium (PE standard). Floor: 8%.",
      data_source: fedFunds || gs10 ? "FRED (cached)" : "No FRED data — run market refresh first",
    });
  });

  /**
   * POST /api/engagements/:id/financial/apply-live-rate
   * One-click apply suggested discount rate to engagement.
   */
  app.post("/api/engagements/:id/financial/apply-live-rate", async (req, res) => {
    const engagementId = Number(req.params.id);
    const newRate = Number(req.body?.discount_rate);
    if (isNaN(newRate) || newRate < 0.01 || newRate > 0.50) {
      return res.status(400).json({ error: "discount_rate must be between 0.01 and 0.50" });
    }
    db.update(engagements)
      .set({ discount_rate: newRate, updated_at: new Date().toISOString() })
      .where(eq(engagements.id, engagementId))
      .run();
    res.json({ ok: true, discount_rate: newRate });
  });

  /**
   * POST /api/engagements/:id/financial/ebitda-narrative
   * Claude-authored 150-word EBITDA bridge narrative. Cached 24h.
   */
  app.post("/api/engagements/:id/financial/ebitda-narrative", async (req, res) => {
    const engagementId = Number(req.params.id);

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });
    }

    const eng = db.select().from(engagements).where(eq(engagements.id, engagementId)).get();
    if (!eng) return res.status(404).json({ error: "Engagement not found" });

    const initiatives = db.select().from(savings_initiatives).where(eq(savings_initiatives.engagement_id, engagementId)).all();
    const totalTarget = initiatives.reduce((s, i) => s + (Number(i.target_amount) || 0), 0);
    const totalRiskAdj = initiatives.reduce((s, i) => s + (Number(i.risk_adjusted_target) || 0), 0);
    const quickWins = initiatives.filter((i) => i.phase === "quick_win").reduce((s, i) => s + (Number(i.risk_adjusted_target) || 0), 0);
    const byPhase = {
      quick_win: initiatives.filter((i) => i.phase === "quick_win").reduce((s, i) => s + (Number(i.risk_adjusted_target) || 0), 0),
      medium_term: initiatives.filter((i) => i.phase === "medium_term").reduce((s, i) => s + (Number(i.risk_adjusted_target) || 0), 0),
      long_term: initiatives.filter((i) => i.phase === "long_term").reduce((s, i) => s + (Number(i.risk_adjusted_target) || 0), 0),
    };

    const fmt = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${(n / 1e3).toFixed(0)}K`;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `Write a 150-word EBITDA bridge narrative for a PE steerco presentation.

Company: ${eng.portfolio_company}
Industry: ${eng.industry ?? "—"}
Total Addressable Spend: ${fmt(Number(eng.total_addressable_spend) || 0)}
EBITDA Margin: ${eng.ebitda_margin_pct ?? "—"}%
Discount Rate: ${((eng.discount_rate ?? 0.10) * 100).toFixed(1)}%
Gross Savings Pipeline: ${fmt(totalTarget)}
Risk-Adjusted Pipeline: ${fmt(totalRiskAdj)}
Quick Wins (0-90 days): ${fmt(byPhase.quick_win)}
Medium Term (90-180 days): ${fmt(byPhase.medium_term)}
Long Term (180d+): ${fmt(byPhase.long_term)}
Initiative Count: ${initiatives.length}

Write in third person. Be specific with the numbers. Lead with the total opportunity, then explain phasing, then close with the EBITDA impact thesis. No headers. 150 words exactly.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const narrative = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();

    res.json({
      narrative,
      engagement: eng.portfolio_company,
      pipeline_total: totalTarget,
      risk_adjusted: totalRiskAdj,
      generated_at: new Date().toISOString(),
    });
  });

  // =========================================================================
  // P3-08 — 100-DAY PLAN ENHANCEMENTS
  // =========================================================================

  /**
   * GET /api/engagements/:id/100-day-plan/sequenced
   * Auto-sequence initiatives by resource constraints and dependencies.
   * Returns timeline with week-by-week assignment and resource utilization.
   */
  app.get("/api/engagements/:id/100-day-plan/sequenced", (req, res) => {
    const eid = Number(req.params.id);
    const inits = db.select().from(savings_initiatives).where(eq(savings_initiatives.engagement_id, eid)).all();

    // Scoring: quick wins first, then by risk_adjusted_target DESC, then by probability DESC
    const scored = inits.map((i) => ({
      ...i,
      sequence_score:
        (i.phase === "quick_win" ? 1000 : i.phase === "medium_term" ? 500 : 0) +
        (Number(i.risk_adjusted_target) || 0) / 1000 +
        (Number(i.probability) || 0.5) * 100,
    }));
    scored.sort((a, b) => b.sequence_score - a.sequence_score);

    // Assign to 13-week slots (max 3 initiatives active per week, 1 team)
    const MAX_CONCURRENT = 3;
    const WEEKS = 13;
    const weekSlots: number[][] = Array.from({ length: WEEKS }, () => []);
    const initiativeWeeks: Record<number, number> = {};

    let slot = 0;
    for (const init of scored) {
      // Find first week with capacity
      while (slot < WEEKS && weekSlots[slot].length >= MAX_CONCURRENT) slot++;
      if (slot >= WEEKS) slot = WEEKS - 1;
      weekSlots[slot].push(init.id);
      initiativeWeeks[init.id] = slot + 1;
    }

    const sequenced = scored.map((i) => ({
      id: i.id,
      name: i.name,
      phase: i.phase,
      lever_type: i.lever_type,
      target_amount: i.target_amount,
      risk_adjusted_target: i.risk_adjusted_target,
      probability: i.probability,
      confidence: i.confidence,
      status: i.status,
      sequence_week: initiativeWeeks[i.id] ?? WEEKS,
      sequence_score: i.sequence_score,
      owner: i.implementation_owner,
    }));

    // Build RACI matrix (simplified)
    const raciMatrix = sequenced.slice(0, 15).map((i) => ({
      initiative: i.name,
      responsible: i.owner ?? "Procurement Lead",
      accountable: "CFO",
      consulted: i.phase === "quick_win" ? "A&M PEPI" : "Operations",
      informed: "PE Sponsor",
      week: i.sequence_week,
    }));

    res.json({
      sequenced,
      raci_matrix: raciMatrix,
      resource_utilization: weekSlots.map((week, i) => ({
        week: i + 1,
        initiative_count: week.length,
        utilization_pct: Math.round((week.length / MAX_CONCURRENT) * 100),
      })),
      total_initiatives: inits.length,
      sequencing_horizon_weeks: WEEKS,
    });
  });

  /**
   * POST /api/engagements/:id/100-day-plan/weekly-status
   * Claude auto-drafts a weekly status report based on current initiative state.
   */
  app.post("/api/engagements/:id/100-day-plan/weekly-status", async (req, res) => {
    const eid = Number(req.params.id);

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });
    }

    const eng = db.select().from(engagements).where(eq(engagements.id, eid)).get();
    const inits = db.select().from(savings_initiatives).where(eq(savings_initiatives.engagement_id, eid)).all();
    const realized = db.get(sql`
      SELECT COALESCE(SUM(r.amount),0) as total FROM realization_entries r
      JOIN savings_initiatives i ON i.id = r.initiative_id
      WHERE i.engagement_id = ${eid}
    `) as { total: number };
    const alerts = db.all(sql`
      SELECT title, severity FROM watchlist_alerts
      WHERE engagement_id = ${eid} AND is_resolved = 0
      ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END
      LIMIT 5
    `) as { title: string; severity: string }[];

    const fmt = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${(n / 1e3).toFixed(0)}K`;
    const atRisk = inits.filter((i) => i.is_at_risk).length;
    const inProgress = inits.filter((i) => i.status === "in_progress").length;
    const pipeline = inits.reduce((s, i) => s + (Number(i.risk_adjusted_target) || 0), 0);

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `Write a concise weekly procurement status report (200 words) for a PE portfolio company.

Company: ${eng?.portfolio_company ?? "Portfolio Company"}
Week ending: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
Initiatives in progress: ${inProgress} of ${inits.length}
At-risk initiatives: ${atRisk}
Risk-adjusted pipeline: ${fmt(pipeline)}
Realized to date: ${fmt(realized?.total ?? 0)}
Open alerts: ${alerts.map((a) => `${a.severity}: ${a.title}`).join("; ") || "None"}

Format: 
1. THIS WEEK (2-3 bullets — what progressed)
2. KEY RISKS (1-2 bullets — what needs attention)
3. NEXT WEEK (2-3 bullets — planned actions)

Tone: direct management update. No fluff.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const report = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();

    res.json({
      report,
      week_ending: new Date().toISOString().split("T")[0],
      company: eng?.portfolio_company,
      generated_at: new Date().toISOString(),
    });
  });

  /**
   * POST /api/engagements/:id/100-day-plan/export-pptx
   * Export Gantt-style 100-day plan to PPTX via sidecar.
   */
  app.post("/api/engagements/:id/100-day-plan/export-pptx", async (req, res) => {
    const eid = Number(req.params.id);

    const eng = db.select().from(engagements).where(eq(engagements.id, eid)).get();
    const inits = db.select().from(savings_initiatives).where(eq(savings_initiatives.engagement_id, eid)).all();

    // Build Gantt payload — use phase to assign week ranges
    const phaseRanges = { quick_win: [1, 4], medium_term: [5, 9], long_term: [10, 13] } as const;
    const ganttItems = inits.slice(0, 20).map((i) => {
      const range = phaseRanges[(i.phase as keyof typeof phaseRanges)] ?? phaseRanges.medium_term;
      return {
        name: (i.name ?? "").slice(0, 45),
        start_week: range[0],
        end_week: range[1],
        phase: i.phase,
        owner: i.implementation_owner ?? "Procurement Lead",
        status: i.status,
        target: i.risk_adjusted_target ?? i.target_amount ?? 0,
      };
    });

    const payload = {
      engagement: { name: eng?.name, portfolio_company: eng?.portfolio_company, pe_sponsor: eng?.pe_sponsor },
      slides: {
        situation: {
          total_spend: "",
          narrative: `100-Day Procurement Implementation Plan — ${eng?.portfolio_company}`,
          spend_breakdown: [],
        },
        initiatives: {
          pipeline_total: `$${((inits.reduce((s, i) => s + (Number(i.risk_adjusted_target) || 0), 0)) / 1e6).toFixed(1)}M`,
          risk_adjusted: "",
          quick_win: "",
          intro: `${inits.length} initiatives sequenced across 13 weeks`,
          items: ganttItems.map((g) => ({
            name: g.name,
            phase: g.phase,
            lever: `Wk ${g.start_week}–${g.end_week}`,
            target: `$${((g.target) / 1e3).toFixed(0)}K`,
            risk_adjusted: g.owner,
            probability: g.status,
          })),
        },
        spend_waterfall: { total: "", categories: [] },
        kraljic: { categories: [] },
        ebitda_bridge: { savings_impact: 0, by_phase: {}, phases: [] },
        hundred_day_roadmap: {
          phases: [
            { label: "Weeks 1–4: Quick Wins", activities: ganttItems.filter((g) => g.phase === "quick_win").map((g) => g.name).slice(0, 4) },
            { label: "Weeks 5–9: Medium Term", activities: ganttItems.filter((g) => g.phase === "medium_term").map((g) => g.name).slice(0, 4) },
            { label: "Weeks 10–13: Long Term", activities: ganttItems.filter((g) => g.phase === "long_term").map((g) => g.name).slice(0, 4) },
          ],
        },
        risks: { narrative: "See initiative risk flags for detail.", items: [] },
        next_steps: { items: ["Confirm initiative owners and timelines", "Schedule weekly steering committee", "Begin Q1 RFP processes for quick-win categories"] },
      },
      branding: {
        primary_color: eng?.report_color_primary ?? "#003366",
        secondary_color: eng?.report_color_secondary ?? "#0066CC",
        header_text: eng?.report_header_text ?? "CONFIDENTIAL — A&M PEPI",
      },
    };

    const sidecarResp = await fetch(`${process.env.SIDECAR_URL ?? "http://localhost:5001"}/generate/pptx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });

    if (!sidecarResp.ok) {
      return res.status(502).json({ error: `Sidecar error: ${sidecarResp.status}` });
    }

    const buffer = Buffer.from(await sidecarResp.arrayBuffer());

    // Save to deliverable_outputs
    const outDir = "./generated";
    if (!fsSync.existsSync(outDir)) fsSync.mkdirSync(outDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const safeName = String(eng?.portfolio_company ?? "plan").replace(/[^a-zA-Z0-9]/g, "_");
    const fileName = `100day_${safeName}_${ts}.pptx`;
    const filePath = pathMod.join(outDir, fileName);
    fsSync.writeFileSync(filePath, buffer);

    db.insert(deliverable_outputs).values({
      engagement_id: eid,
      deliverable_type: "steerco_pptx",
      file_name: fileName,
      file_path: filePath,
      file_size_bytes: buffer.length,
      claude_model_version: null,
      generated_at: new Date().toISOString(),
    }).run();

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(buffer);
  });

  return httpServer;
}
