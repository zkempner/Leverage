/**
 * LEVERAGE v4 — Pipeline Step Executors
 *
 * Registers step executor functions with the PipelineOrchestrator.
 * Each executor wraps an existing engine/service call and reads/writes
 * through the database (the artifact bus between steps).
 *
 * Import this file at server startup to register all executors.
 */

import { registerStepExecutor } from "./services/PipelineOrchestrator";
import { db } from "./storage";
import {
  spend_records, categories, category_rules, contracts,
  cleansing_audit_log, supplier_mappings, savings_initiatives,
  category_strategy, spend_summaries, engagements,
} from "@shared/schema";
import { eq, and, sql, isNull } from "drizzle-orm";

// Engines
import { normalizeSuppliers } from "./engines/normalization";
import { categorizeRecords } from "./engines/categorization";
import { sizeInitiatives } from "./engines/sizing";
import { analyzeVendors, buildOpportunitySummary, computeSpendFlags } from "./engines/vendor-analysis";
import { computeKraljicMatrix, generateCategoryStrategies } from "./engines/kraljic";
import { generateBenchmarks } from "./engines/benchmarks";
import { computeInitiativeFinancials, computeEbitdaBridge } from "./engines/financial-model";
import { runMonteCarlo } from "./engines/monte-carlo";

// ---------------------------------------------------------------------------
// data_intake — Verifies data has been imported
// ---------------------------------------------------------------------------
registerStepExecutor("data_intake", async (ctx) => {
  const records = db
    .select()
    .from(spend_records)
    .where(eq(spend_records.engagement_id, ctx.engagement_id))
    .all();

  if (records.length === 0) {
    throw new Error(
      "No spend records found. Please import data via Data Import before running the pipeline.",
    );
  }

  const suppliers = new Set(records.map(r => r.supplier_name));
  const totalSpend = records.reduce((sum, r) => sum + (r.amount ?? 0), 0);

  return {
    record_count: records.length,
    unique_suppliers: suppliers.size,
    total_spend: totalSpend,
  };
});

// ---------------------------------------------------------------------------
// cleansing — Basic data cleansing (zero amounts, duplicates, blanks)
// Already done at import time, but this step verifies and reports
// ---------------------------------------------------------------------------
registerStepExecutor("cleansing", async (ctx) => {
  const records = db
    .select()
    .from(spend_records)
    .where(eq(spend_records.engagement_id, ctx.engagement_id))
    .all();

  const duplicates = records.filter(r => r.is_duplicate_flag === 1).length;
  const outliers = records.filter(r => r.is_outlier_flag === 1).length;
  const zeroAmounts = records.filter(r => r.amount === 0).length;
  const blankSuppliers = records.filter(
    r => !r.supplier_name || r.supplier_name === "UNKNOWN SUPPLIER",
  ).length;

  return {
    total_records: records.length,
    duplicates_flagged: duplicates,
    outliers_flagged: outliers,
    zero_amounts: zeroAmounts,
    blank_suppliers: blankSuppliers,
    clean_records: records.length - duplicates - outliers,
  };
});

// ---------------------------------------------------------------------------
// normalization — Supplier name normalization
// ---------------------------------------------------------------------------
registerStepExecutor("normalization", async (ctx) => {
  const suppliers = db.all(sql`
    SELECT DISTINCT supplier_name FROM spend_records
    WHERE engagement_id = ${ctx.engagement_id} AND normalized_supplier_name IS NULL
    ORDER BY supplier_name
  `) as { supplier_name: string }[];

  if (suppliers.length === 0) {
    return { normalized: 0, message: "All suppliers already normalized" };
  }

  const supplierNames = suppliers.map(s => s.supplier_name);
  const results = normalizeSuppliers(supplierNames);
  const now = new Date().toISOString();
  let normalized = 0;

  for (const m of results) {
    db.update(spend_records)
      .set({ normalized_supplier_name: m.canonical })
      .where(
        and(
          eq(spend_records.engagement_id, ctx.engagement_id),
          eq(spend_records.supplier_name, m.original),
        ),
      )
      .run();

    db.insert(supplier_mappings)
      .values({
        engagement_id: ctx.engagement_id,
        original_name: m.original,
        canonical_name: m.canonical,
        created_at: now,
      })
      .run();

    if (m.original !== m.canonical) normalized++;
  }

  return {
    total_suppliers: supplierNames.length,
    normalized,
    distinct_canonical: new Set(results.map(r => r.canonical)).size,
  };
});

// ---------------------------------------------------------------------------
// categorization — Auto-categorize spend records
// ---------------------------------------------------------------------------
registerStepExecutor("categorization", async (ctx) => {
  const allRecords = db
    .select()
    .from(spend_records)
    .where(eq(spend_records.engagement_id, ctx.engagement_id))
    .all();

  const uncategorized = allRecords.filter(r => !r.category_id);
  if (uncategorized.length === 0) {
    return { categorized: 0, total: allRecords.length, message: "All records already categorized" };
  }

  const cats = db.select().from(categories).all();
  const userRules = db
    .select()
    .from(category_rules)
    .where(eq(category_rules.engagement_id, ctx.engagement_id))
    .all();

  const result = categorizeRecords(uncategorized, allRecords, cats, userRules);
  const now = new Date().toISOString();

  for (const r of result.results) {
    db.update(spend_records)
      .set({ category_id: r.category_id })
      .where(eq(spend_records.id, r.record_id))
      .run();

    db.insert(cleansing_audit_log)
      .values({
        engagement_id: ctx.engagement_id,
        record_id: r.record_id,
        action: "AUTO_CATEGORIZE",
        field: "category_id",
        old_value: null,
        new_value: r.category_name,
        reason: r.rule_matched,
        created_at: now,
      })
      .run();
  }

  return {
    categorized: result.categorized,
    total: allRecords.length,
    uncategorized_remaining: uncategorized.length - result.categorized,
  };
});

// ---------------------------------------------------------------------------
// spend_analysis — Compute spend summaries (pre-aggregated for performance)
// ---------------------------------------------------------------------------
registerStepExecutor("spend_analysis", async (ctx) => {
  const records = db
    .select()
    .from(spend_records)
    .where(eq(spend_records.engagement_id, ctx.engagement_id))
    .all();

  const cats = db.select().from(categories).all();
  const catMap = new Map(cats.map(c => [c.id, c]));

  // Aggregate by category
  const byCat = new Map<number, { spend: number; count: number; suppliers: Set<string> }>();
  let totalSpend = 0;

  for (const r of records) {
    if (r.is_duplicate_flag === 1) continue;
    totalSpend += r.amount ?? 0;
    const cid = r.category_id ?? 0;
    if (!byCat.has(cid)) byCat.set(cid, { spend: 0, count: 0, suppliers: new Set() });
    const acc = byCat.get(cid)!;
    acc.spend += r.amount ?? 0;
    acc.count++;
    acc.suppliers.add(r.normalized_supplier_name ?? r.supplier_name);
  }

  // Write spend summaries
  const now = new Date().toISOString();
  // Clear existing summaries for this engagement
  db.delete(spend_summaries).where(eq(spend_summaries.engagement_id, ctx.engagement_id)).run();

  for (const [catId, data] of Array.from(byCat.entries())) {
    db.insert(spend_summaries)
      .values({
        engagement_id: ctx.engagement_id,
        category_id: catId || null,
        total_spend: data.spend,
        record_count: data.count,
        unique_suppliers: data.suppliers.size,
        computed_at: now,
      })
      .run();
  }

  // Update engagement total addressable spend
  db.update(engagements)
    .set({ total_addressable_spend: totalSpend })
    .where(eq(engagements.id, ctx.engagement_id))
    .run();

  return {
    total_spend: totalSpend,
    categories_with_spend: byCat.size,
    total_records_analyzed: records.length,
  };
});

// ---------------------------------------------------------------------------
// opportunity_sizing — Size savings initiatives
// ---------------------------------------------------------------------------
registerStepExecutor("opportunity_sizing", async (ctx) => {
  const eng = db.select().from(engagements).where(eq(engagements.id, ctx.engagement_id)).get();
  if (!eng) throw new Error("Engagement not found");

  const summaries = db
    .select()
    .from(spend_summaries)
    .where(eq(spend_summaries.engagement_id, ctx.engagement_id))
    .all();

  const cats = db.select().from(categories).all();
  const catMap = new Map(cats.map(c => [c.id, c]));

  // Build spend by category for sizing
  const spendByCategory: Record<string, number> = {};
  for (const s of summaries) {
    const catName = s.category_id ? catMap.get(s.category_id)?.name ?? "Uncategorized" : "Uncategorized";
    spendByCategory[catName] = (spendByCategory[catName] ?? 0) + (s.total_spend ?? 0);
  }

  const sized = sizeInitiatives(
    spendByCategory,
    eng.industry || "Manufacturing",
    eng.company_size || "Mid-market",
  );

  // Write initiatives
  const now = new Date().toISOString();
  let created = 0;

  for (const init of sized) {
    db.insert(savings_initiatives)
      .values({
        engagement_id: ctx.engagement_id,
        name: init.name,
        category_id: init.category_id ?? null,
        lever_type: init.lever_type,
        phase: init.phase,
        confidence: init.confidence,
        status: "identified",
        target_amount: init.target_amount,
        probability: init.probability,
        risk_adjusted_target: init.risk_adjusted_target,
        created_at: now,
        updated_at: now,
      })
      .run();
    created++;
  }

  return {
    initiatives_created: created,
    total_target: sized.reduce((s, i) => s + (i.target_amount ?? 0), 0),
  };
});

// ---------------------------------------------------------------------------
// spend_flags — Compute tail/maverick/off-contract/critical flags
// ---------------------------------------------------------------------------
registerStepExecutor("spend_flags", async (ctx) => {
  const records = db
    .select()
    .from(spend_records)
    .where(eq(spend_records.engagement_id, ctx.engagement_id))
    .all();
  const cats = db.select().from(categories).all();
  const contractRows = db
    .select()
    .from(contracts)
    .where(eq(contracts.engagement_id, ctx.engagement_id))
    .all();
  const totalSpend = records.reduce((s, r) => s + (r.amount ?? 0), 0);

  const flags = computeSpendFlags(records, contractRows, cats, totalSpend);

  // Apply flags to records
  for (const flag of flags) {
    db.update(spend_records)
      .set({ spend_flag: flag.spend_flag })
      .where(eq(spend_records.id, flag.record_id))
      .run();
  }

  const flagCounts: Record<string, number> = {};
  for (const f of flags) {
    flagCounts[f.spend_flag] = (flagCounts[f.spend_flag] ?? 0) + 1;
  }

  return { flags_applied: flags.length, by_type: flagCounts };
});

// ---------------------------------------------------------------------------
// vendor_analysis — Analyze vendor profiles
// ---------------------------------------------------------------------------
registerStepExecutor("vendor_analysis", async (ctx) => {
  const records = db
    .select()
    .from(spend_records)
    .where(eq(spend_records.engagement_id, ctx.engagement_id))
    .all();
  const cats = db.select().from(categories).all();
  const totalSpend = records.reduce((s, r) => s + (r.amount ?? 0), 0);

  const profiles = analyzeVendors(records, cats, totalSpend);
  const summary = buildOpportunitySummary(profiles);

  return {
    vendor_count: profiles.length,
    top_vendors: profiles.slice(0, 10).map(p => ({ name: p.vendor_name, spend: p.total_spend })),
    opportunity_summary: summary,
  };
});

// ---------------------------------------------------------------------------
// kraljic — Compute Kraljic matrix and category strategies
// ---------------------------------------------------------------------------
registerStepExecutor("kraljic", async (ctx) => {
  const records = db
    .select()
    .from(spend_records)
    .where(eq(spend_records.engagement_id, ctx.engagement_id))
    .all();
  const cats = db.select().from(categories).all();
  const contractRows = db
    .select()
    .from(contracts)
    .where(eq(contracts.engagement_id, ctx.engagement_id))
    .all();

  const matrix = computeKraljicMatrix(records, cats, contractRows);
  const strategies = generateCategoryStrategies(matrix);

  // Write category strategies
  const now = new Date().toISOString();
  // Clear existing strategies
  db.delete(category_strategy).where(eq(category_strategy.engagement_id, ctx.engagement_id)).run();

  for (const s of strategies) {
    db.insert(category_strategy)
      .values({
        engagement_id: ctx.engagement_id,
        category_id: s.category_id,
        kraljic_quadrant: s.quadrant,
        supply_risk_score: s.supply_risk,
        profit_impact_score: s.profit_impact,
        recommended_levers_json: JSON.stringify(s.recommended_levers ?? []),
        sourcing_strategy: s.sourcing_strategy,
        contract_strategy: s.contract_strategy,
        notes: s.notes,
        created_at: now,
      })
      .run();
  }

  return {
    categories_analyzed: matrix.length,
    strategies_generated: strategies.length,
    by_quadrant: strategies.reduce(
      (acc, s) => {
        acc[s.quadrant] = (acc[s.quadrant] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  };
});

// ---------------------------------------------------------------------------
// benchmarks — Generate industry benchmarks
// ---------------------------------------------------------------------------
registerStepExecutor("benchmarks", async (ctx) => {
  const eng = db.select().from(engagements).where(eq(engagements.id, ctx.engagement_id)).get();
  if (!eng) throw new Error("Engagement not found");

  const records = db
    .select()
    .from(spend_records)
    .where(eq(spend_records.engagement_id, ctx.engagement_id))
    .all();

  const benchmarks = generateBenchmarks(
    records,
    eng.industry || "Manufacturing",
    eng.company_size || "Mid-market",
  );

  return {
    benchmark_categories: Object.keys(benchmarks).length,
    industry: eng.industry,
    company_size: eng.company_size,
  };
});

// ---------------------------------------------------------------------------
// financial_model — Compute initiative financials and EBITDA bridge
// ---------------------------------------------------------------------------
registerStepExecutor("financial_model", async (ctx) => {
  const eng = db.select().from(engagements).where(eq(engagements.id, ctx.engagement_id)).get();
  if (!eng) throw new Error("Engagement not found");

  const initiatives = db
    .select()
    .from(savings_initiatives)
    .where(eq(savings_initiatives.engagement_id, ctx.engagement_id))
    .all();

  if (initiatives.length === 0) {
    return { message: "No initiatives to model", initiatives: 0 };
  }

  const financials = computeInitiativeFinancials(initiatives, eng.discount_rate ?? 0.1);
  const bridge = computeEbitdaBridge(
    initiatives,
    eng.annual_revenue ?? 0,
    eng.ebitda_margin_pct ?? 10,
  );

  return {
    initiatives_modeled: initiatives.length,
    total_npv: financials.total_npv,
    total_annual_savings: financials.total_annual_savings,
    ebitda_current: bridge.current_ebitda,
    ebitda_projected: bridge.projected_ebitda,
    ebitda_improvement_pct: bridge.improvement_pct,
  };
});

// ---------------------------------------------------------------------------
// monte_carlo — Run Monte Carlo simulation
// ---------------------------------------------------------------------------
registerStepExecutor("monte_carlo", async (ctx) => {
  const eng = db.select().from(engagements).where(eq(engagements.id, ctx.engagement_id)).get();
  if (!eng) throw new Error("Engagement not found");

  const initiatives = db
    .select()
    .from(savings_initiatives)
    .where(eq(savings_initiatives.engagement_id, ctx.engagement_id))
    .all();

  if (initiatives.length === 0) {
    return { message: "No initiatives for simulation", iterations: 0 };
  }

  const result = runMonteCarlo(initiatives, {
    iterations: 10000,
    discount_rate: eng.discount_rate ?? 0.1,
  });

  // Store the run
  const now = new Date().toISOString();
  db.insert(
    // Use raw SQL since monte_carlo_runs may need different import
    sql`INSERT INTO monte_carlo_runs (engagement_id, iterations, p10_savings, p50_savings, p90_savings, p10_npv, p50_npv, p90_npv, run_at)
        VALUES (${ctx.engagement_id}, 10000, ${result.p10_savings}, ${result.p50_savings}, ${result.p90_savings}, ${result.p10_npv}, ${result.p50_npv}, ${result.p90_npv}, ${now})`,
  );

  return {
    iterations: 10000,
    p10_savings: result.p10_savings,
    p50_savings: result.p50_savings,
    p90_savings: result.p90_savings,
  };
});

// ---------------------------------------------------------------------------
// deliverable_gen — Placeholder (will be wired to DeliverableService in Phase 1D)
// ---------------------------------------------------------------------------
registerStepExecutor("deliverable_gen", async (ctx) => {
  // TODO: Wire to DeliverableService in Phase 1D
  return {
    message: "Deliverable generation step placeholder — will be implemented in Phase 1D",
    engagement_id: ctx.engagement_id,
  };
});
