/**
 * LEVERAGE v3 — CategoryBriefService (P3-06, P3-07)
 *
 * Generates a 1-page category strategy brief per category:
 *   1. Pull category data: Kraljic position, spend, vendor risk, market benchmarks
 *   2. Exa.ai semantic search for competitor supplier intel (P3-07)
 *   3. Claude authors the brief (strategy, market context, recommended actions)
 *   4. python-docx renders to Word doc via sidecar
 *   5. Store in deliverable_outputs
 *
 * Registered as job handler "category_brief".
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import { db } from "../storage";
import { sql } from "drizzle-orm";
import { findSimilarSuppliers } from "./WebSearchService";

const SIDECAR_URL = process.env.SIDECAR_URL ?? "http://localhost:5001";
const MODEL = "claude-sonnet-4-20250514";
const OUTPUT_DIR = "./generated";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface CategoryBriefInput {
  engagement_id: number;
  category_id: number;
  category_name: string;
}

interface CategoryContext {
  category_name: string;
  spending: {
    total_spend: number;
    supplier_count: number;
    top_suppliers: Array<{ name: string; spend: number; pct: number }>;
    invoice_count: number;
    non_po_rate: number | null;
  };
  strategy: {
    quadrant: string | null;
    supply_risk_score: number | null;
    profit_impact_score: number | null;
    sourcing_strategy: string | null;
    contract_strategy: string | null;
    target_quadrant: string | null;
    recommended_levers: string[];
    transition_timeline: string | null;
  };
  market_data: Array<{ series: string; value: number; unit: string; yoy: number | null }>;
  risk_profiles: Array<{ supplier: string; overall_risk: number; flags: string[] }>;
  contracts: Array<{ supplier: string; value: number | null; end_date: string | null; auto_renew: boolean }>;
  competitor_suppliers: Array<{ title: string; url: string; snippet: string }>;
}

// ---------------------------------------------------------------------------
// Data assembly
// ---------------------------------------------------------------------------
async function assembleCategory(
  engagementId: number,
  categoryId: number,
  categoryName: string,
): Promise<CategoryContext> {
  // Spend analysis
  const spendRow = db.get(sql`
    SELECT
      SUM(amount) as total, COUNT(DISTINCT supplier_name) as suppliers,
      COUNT(*) as invoices,
      AVG(CASE WHEN po_number IS NULL OR po_number = '' THEN 1.0 ELSE 0.0 END) as non_po_rate
    FROM spend_records
    WHERE engagement_id = ${engagementId} AND category_id = ${categoryId}
  `) as { total: number; suppliers: number; invoices: number; non_po_rate: number | null };

  const topSuppliers = db.all(sql`
    SELECT supplier_name as name, SUM(amount) as spend
    FROM spend_records
    WHERE engagement_id = ${engagementId} AND category_id = ${categoryId}
    GROUP BY supplier_name ORDER BY spend DESC LIMIT 6
  `) as { name: string; spend: number }[];

  const totalSpend = spendRow?.total ?? 0;

  // Kraljic / strategy
  const strategy = db.get(sql`
    SELECT * FROM category_strategy
    WHERE engagement_id = ${engagementId} AND category_id = ${categoryId}
  `) as any;

  let recommendedLevers: string[] = [];
  try { recommendedLevers = JSON.parse(strategy?.recommended_levers_json ?? "[]"); } catch {}

  // Market data (matching category tag)
  const categoryTagMap: Record<string, string[]> = {
    "Metals & Mining": ["commodity_metal"],
    "Energy": ["commodity_energy"],
    "Agricultural / Food": ["commodity_ag"],
    "Chemicals & Plastics": ["ppi"],
    "Lumber & Paper": ["ppi"],
    "Labor / Professional Services": ["labor"],
    "Freight & Logistics": ["freight"],
  };

  const tags = Object.entries(categoryTagMap)
    .find(([k]) => categoryName.toLowerCase().includes(k.toLowerCase().split("/")[0].trim()))
    ?.[1] ?? [];

  const marketRows = tags.length > 0
    ? db.all(sql`
        SELECT series_name as series, value, unit, yoy_change_pct as yoy
        FROM market_data_cache
        WHERE category_tag = ${tags[0]}
           OR category_tag = ${tags[1] ?? tags[0]}
        ORDER BY fetched_at DESC LIMIT 5
      `) as any[]
    : [];

  // Supplier risk profiles
  const riskRows = db.all(sql`
    SELECT rp.supplier_name as supplier, rp.overall_risk_score as overall_risk, rp.news_risk_flags as flags_json
    FROM supplier_risk_profiles rp
    JOIN spend_records sr ON sr.normalized_supplier_name = rp.supplier_name
      AND sr.engagement_id = ${engagementId}
      AND sr.category_id = ${categoryId}
    WHERE rp.engagement_id = ${engagementId}
    GROUP BY rp.supplier_name
    ORDER BY rp.overall_risk_score DESC LIMIT 5
  `) as any[];

  const riskProfiles = riskRows.map((r: any) => {
    let flags: string[] = [];
    try { flags = JSON.parse(r.flags_json ?? "[]"); } catch {}
    return { supplier: r.supplier, overall_risk: r.overall_risk ?? 0, flags };
  });

  // Contracts
  const contractRows = db.all(sql`
    SELECT supplier_name as supplier, contract_value_annual as value,
           end_date, auto_renew
    FROM contracts
    WHERE engagement_id = ${engagementId} AND category_id = ${categoryId}
    ORDER BY contract_value_annual DESC LIMIT 5
  `) as any[];

  // Exa.ai competitor supplier intel
  let competitorSuppliers: Array<{ title: string; url: string; snippet: string }> = [];
  try {
    const searchResult = await findSimilarSuppliers(
      `suppliers of ${categoryName} similar to ${topSuppliers[0]?.name ?? categoryName} procurement alternatives`,
    );
    competitorSuppliers = searchResult.results.slice(0, 5).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet.slice(0, 200),
    }));
  } catch {
    // Exa.ai unavailable — continue without competitor intel
  }

  return {
    category_name: categoryName,
    spending: {
      total_spend: totalSpend,
      supplier_count: spendRow?.suppliers ?? 0,
      top_suppliers: topSuppliers.map((s) => ({
        name: s.name,
        spend: s.spend,
        pct: totalSpend > 0 ? (s.spend / totalSpend) * 100 : 0,
      })),
      invoice_count: spendRow?.invoices ?? 0,
      non_po_rate: spendRow?.non_po_rate ?? null,
    },
    strategy: {
      quadrant: strategy?.kraljic_quadrant ?? null,
      supply_risk_score: strategy?.supply_risk_score ?? null,
      profit_impact_score: strategy?.profit_impact_score ?? null,
      sourcing_strategy: strategy?.sourcing_strategy ?? null,
      contract_strategy: strategy?.contract_strategy ?? null,
      target_quadrant: strategy?.target_quadrant ?? null,
      recommended_levers: recommendedLevers,
      transition_timeline: strategy?.transition_timeline ?? null,
    },
    market_data: marketRows.map((r: any) => ({
      series: r.series, value: r.value, unit: r.unit, yoy: r.yoy,
    })),
    risk_profiles: riskProfiles,
    contracts: contractRows.map((r: any) => ({
      supplier: r.supplier,
      value: r.value,
      end_date: r.end_date,
      auto_renew: r.auto_renew === 1,
    })),
    competitor_suppliers: competitorSuppliers,
  };
}

// ---------------------------------------------------------------------------
// Claude brief authoring
// ---------------------------------------------------------------------------
async function authorBrief(ctx: CategoryContext): Promise<string> {
  const fmt = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${(n / 1000).toFixed(0)}K`;

  const contextStr = JSON.stringify({
    category: ctx.category_name,
    total_spend: fmt(ctx.spending.total_spend),
    supplier_count: ctx.spending.supplier_count,
    top_3_suppliers: ctx.spending.top_suppliers.slice(0, 3).map((s) => `${s.name} (${s.pct.toFixed(0)}%)`),
    non_po_rate_pct: ctx.spending.non_po_rate ? `${(ctx.spending.non_po_rate * 100).toFixed(0)}%` : null,
    kraljic_quadrant: ctx.strategy.quadrant,
    sourcing_strategy: ctx.strategy.sourcing_strategy,
    contract_strategy: ctx.strategy.contract_strategy,
    target_quadrant: ctx.strategy.target_quadrant,
    recommended_levers: ctx.strategy.recommended_levers,
    transition_timeline: ctx.strategy.transition_timeline,
    top_risk_supplier: ctx.risk_profiles[0]?.supplier ?? null,
    market_signals: ctx.market_data.map((m) => `${m.series}: ${m.value} ${m.unit}${m.yoy ? ` (${m.yoy > 0 ? "+" : ""}${m.yoy.toFixed(1)}% YoY)` : ""}`),
    contracts: ctx.contracts.length,
    competitor_suppliers_found: ctx.competitor_suppliers.length,
  }, null, 2);

  const prompt = `You are an A&M PEPI procurement consultant writing a category strategy brief. 
Be direct, data-driven, and concise. Write for a PE-experienced audience — no fluff.

CATEGORY DATA:
${contextStr}

Write a structured category strategy brief with these EXACT sections:

## Strategic Position
2-3 sentences on current Kraljic positioning, why it matters, and what the target position should be.

## Spend Profile
2-3 sentences covering total spend, supplier concentration, and non-PO rate (if relevant). Name specific suppliers.

## Market Intelligence
2-3 sentences on commodity/labor/freight market context relevant to this category. Reference specific market data if available. Note if competitor supplier alternatives exist.

## Key Levers
4-5 bullet points. Each: specific lever → expected impact → timeline. Be concrete (e.g., "Competitive RFP for top 3 MRO suppliers → 8-12% savings → Q2").

## Risk Assessment  
2-3 bullet points on top risks (supplier concentration, contract gaps, market volatility, sole-source dependency).

## Recommended Actions (Next 90 Days)
3 numbered action items with owner type and expected outcome.

Tone: consulting memo. No markdown headers with #. Use bold labels instead. Concise — target 350 words total.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  return response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("")
    .trim();
}

// ---------------------------------------------------------------------------
// Render to DOCX via sidecar
// ---------------------------------------------------------------------------
async function renderToDocx(ctx: CategoryContext, briefText: string, engagementId: number): Promise<string> {
  const fmt = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${(n / 1000).toFixed(0)}K`;

  const payload = {
    engagement: {
      name: `Category Brief: ${ctx.category_name}`,
      portfolio_company: ctx.category_name,
      pe_sponsor: "",
      generated_date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    },
    summary_metrics: {
      total_spend: fmt(ctx.spending.total_spend),
      pipeline_total: "—",
      risk_adjusted: "—",
      quick_wins: "—",
      initiative_count: ctx.strategy.recommended_levers.length,
      maturity_score: null,
      tariff_exposure: "—",
      contracts_expiring_90d: ctx.contracts.filter((c) => {
        if (!c.end_date) return false;
        return new Date(c.end_date) < new Date(Date.now() + 90 * 86400000);
      }).length,
    },
    sections: {
      executive_summary: briefText,
      methodology: `Spend data analysis + Kraljic positioning + ${ctx.competitor_suppliers.length > 0 ? "Exa.ai semantic supplier research + " : ""}market intelligence`,
      spend_findings: ctx.spending.top_suppliers.map((s) => `${s.name}: ${fmt(s.spend)} (${s.pct.toFixed(0)}%)`).join("\n"),
      initiative_pipeline: ctx.strategy.recommended_levers.join("\n"),
      risk_matrix: ctx.risk_profiles.map((r) => `${r.supplier}: risk score ${r.overall_risk}`).join("\n") || "No risk profiles available",
      implementation_roadmap: `Timeline: ${ctx.strategy.transition_timeline ?? "TBD"}\nSourcing: ${ctx.strategy.sourcing_strategy ?? "TBD"}\nContract: ${ctx.strategy.contract_strategy ?? "TBD"}`,
    },
    data_tables: {
      spend_by_category: ctx.spending.top_suppliers.map((s) => ({
        category: s.name,
        spend: fmt(s.spend),
        suppliers: "—",
        pct_of_total: `${s.pct.toFixed(1)}%`,
      })),
      top_initiatives: ctx.strategy.recommended_levers.map((l, i) => ({
        name: l, lever: l, phase: "medium_term",
        target: "TBD", risk_adjusted: "TBD", confidence: "Medium",
      })),
      maturity_dimensions: ctx.market_data.map((m) => ({
        dimension: m.series,
        score: `${m.value} ${m.unit}`,
        gap: m.yoy ? `${m.yoy > 0 ? "+" : ""}${m.yoy.toFixed(1)}% YoY` : "—",
      })),
    },
    branding: {
      header_text: "CONFIDENTIAL — A&M PEPI",
      primary_color: "#003366",
    },
  };

  const resp = await fetch(`${SIDECAR_URL}/generate/docx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });

  if (!resp.ok) throw new Error(`Sidecar docx error: ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const safeName = ctx.category_name.replace(/[^a-zA-Z0-9]/g, "_");
  const fileName = `brief_${safeName}_${ts}.docx`;
  const filePath = path.join(OUTPUT_DIR, fileName);
  fs.writeFileSync(filePath, buffer);

  db.run(sql`
    INSERT INTO deliverable_outputs
      (engagement_id, deliverable_type, file_name, file_path, file_size_bytes, claude_model_version, generated_at)
    VALUES
      (${engagementId}, 'category_brief_docx', ${fileName}, ${filePath}, ${buffer.length}, ${MODEL}, ${new Date().toISOString()})
  `);

  return filePath;
}

// ---------------------------------------------------------------------------
// Public: job handler
// ---------------------------------------------------------------------------
export async function runCategoryBrief(
  payload: Record<string, unknown>,
  progressCb: (pct: number, msg: string) => void,
): Promise<{ file_path: string; category: string; has_competitor_intel: boolean }> {
  const engagementId = Number(payload.engagement_id);
  const categoryId = Number(payload.category_id);
  const categoryName = String(payload.category_name ?? "Unknown Category");

  progressCb(10, "Loading category data…");
  const ctx = await assembleCategory(engagementId, categoryId, categoryName);

  if (ctx.competitor_suppliers.length > 0) {
    progressCb(30, `Found ${ctx.competitor_suppliers.length} competitor suppliers via Exa.ai`);
  } else {
    progressCb(30, "Assembling market context…");
  }

  progressCb(50, "Claude authoring strategy brief…");
  const briefText = await authorBrief(ctx);

  progressCb(75, "Rendering to Word document…");
  const filePath = await renderToDocx(ctx, briefText, engagementId);

  progressCb(100, `Category brief ready: ${path.basename(filePath)}`);
  return { file_path: filePath, category: categoryName, has_competitor_intel: ctx.competitor_suppliers.length > 0 };
}
