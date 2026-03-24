/**
 * LEVERAGE v3 — DeliverableService (P1-09, P1-10, P1-11)
 *
 * Orchestrates deliverable generation:
 *   1. Assembles engagement data from DB
 *   2. Calls Claude to author narrative sections
 *   3. POSTs structured payload to Python sidecar (/generate/pptx|docx|xlsx)
 *   4. Saves output path to deliverable_outputs table
 *
 * Registered as job handler "deliverable_gen" on JobQueueService.
 */

import Anthropic from "@anthropic-ai/sdk";
import * as path from "path";
import * as fs from "fs";
import { db } from "../storage";
import {
  engagements, savings_initiatives, spend_records, category_strategy,
  procurement_maturity_assessments, tariff_impacts, contracts,
  market_data_cache, deliverable_outputs,
} from "@shared/schema";
import { eq, sql, desc } from "drizzle-orm";
import { computeEbitdaBridge, computeInitiativeFinancials } from "../engines/financial-model";

const SIDECAR_URL = process.env.SIDECAR_URL ?? "http://localhost:5001";
const MODEL = "claude-sonnet-4-20250514";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

// Output directory for generated files
const OUTPUT_DIR = "./generated";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type DeliverableType = "steerco_pptx" | "odd_memo_docx" | "excel_model";

interface EngagementContext {
  engagement: Record<string, unknown>;
  initiatives: Record<string, unknown>[];
  spend_by_category: Record<string, unknown>[];
  top_vendors: Record<string, unknown>[];
  kraljic: Record<string, unknown>[];
  maturity: Record<string, unknown>[];
  tariffs: Record<string, unknown>[];
  contracts_expiring: Record<string, unknown>[];
  market_data: Record<string, unknown>[];
  pipeline_total: number;
  risk_adjusted_total: number;
  quick_win_total: number;
  by_phase: Record<string, number>;
  ebitda_bridge: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Data assembler
// ---------------------------------------------------------------------------
async function assembleContext(engagementId: number): Promise<EngagementContext> {
  const engagement = db.select().from(engagements).where(eq(engagements.id, engagementId)).get();
  if (!engagement) throw new Error(`Engagement ${engagementId} not found`);

  const initiatives = db.all(sql`
    SELECT i.*, c.name as category_name
    FROM savings_initiatives i
    LEFT JOIN categories c ON c.id = i.category_id
    WHERE i.engagement_id = ${engagementId}
    ORDER BY i.risk_adjusted_target DESC
  `) as Record<string, unknown>[];

  const spend_by_category = db.all(sql`
    SELECT l1_category as category, SUM(amount) as spend, COUNT(DISTINCT supplier_name) as suppliers
    FROM spend_records WHERE engagement_id = ${engagementId}
    GROUP BY l1_category ORDER BY spend DESC LIMIT 12
  `) as Record<string, unknown>[];

  const top_vendors = db.all(sql`
    SELECT supplier_name, SUM(amount) as spend, spend_flag
    FROM spend_records WHERE engagement_id = ${engagementId}
    GROUP BY supplier_name ORDER BY spend DESC LIMIT 10
  `) as Record<string, unknown>[];

  const kraljic = db.all(sql`
    SELECT cs.*, c.name as category_name
    FROM category_strategy cs
    LEFT JOIN categories c ON c.id = cs.category_id
    WHERE cs.engagement_id = ${engagementId}
    ORDER BY cs.profit_impact_score DESC
  `) as Record<string, unknown>[];

  const maturity = db.all(sql`
    SELECT * FROM procurement_maturity_assessments
    WHERE engagement_id = ${engagementId} ORDER BY score ASC
  `) as Record<string, unknown>[];

  const tariffs = db.all(sql`
    SELECT * FROM tariff_impacts WHERE engagement_id = ${engagementId}
    ORDER BY estimated_impact DESC LIMIT 10
  `) as Record<string, unknown>[];

  // Contracts expiring in 180 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 180);
  const contracts_expiring = db.all(sql`
    SELECT supplier_name, contract_value_annual, end_date, auto_renew, payment_terms
    FROM contracts WHERE engagement_id = ${engagementId}
    AND end_date IS NOT NULL AND end_date <= ${cutoff.toISOString().split("T")[0]}
    ORDER BY end_date ASC LIMIT 10
  `) as Record<string, unknown>[];

  const market_data = db.all(sql`
    SELECT series_id, series_name, category_tag, value, unit, yoy_change_pct, period
    FROM market_data_cache ORDER BY category_tag, series_name LIMIT 30
  `) as Record<string, unknown>[];

  // Compute pipeline totals
  const pipeline_total = initiatives.reduce((s, i) => s + (Number(i.target_amount) || 0), 0);
  const risk_adjusted_total = initiatives.reduce((s, i) => s + (Number(i.risk_adjusted_target) || 0), 0);
  const quick_win_total = initiatives
    .filter((i) => i.phase === "quick_win")
    .reduce((s, i) => s + (Number(i.risk_adjusted_target) || 0), 0);
  const by_phase = {
    quick_win: initiatives.filter((i) => i.phase === "quick_win").reduce((s, i) => s + (Number(i.risk_adjusted_target) || 0), 0),
    medium_term: initiatives.filter((i) => i.phase === "medium_term").reduce((s, i) => s + (Number(i.risk_adjusted_target) || 0), 0),
    long_term: initiatives.filter((i) => i.phase === "long_term").reduce((s, i) => s + (Number(i.risk_adjusted_target) || 0), 0),
  };

  // EBITDA bridge
  let ebitda_bridge: Record<string, unknown> | null = null;
  try {
    const totalSpend = Number(ctx.engagement.total_addressable_spend) || 0;
    const bridgeResult = computeEbitdaBridge(
      ctx.initiatives as Parameters<typeof computeEbitdaBridge>[0],
      totalSpend,
    );
    ebitda_bridge = bridgeResult as unknown as Record<string, unknown>;
  } catch {
    // bridge calc is optional
  }

  return {
    engagement: engagement as Record<string, unknown>,
    initiatives,
    spend_by_category,
    top_vendors,
    kraljic,
    maturity,
    tariffs,
    contracts_expiring,
    market_data,
    pipeline_total,
    risk_adjusted_total,
    quick_win_total,
    by_phase,
    ebitda_bridge,
  };
}

// ---------------------------------------------------------------------------
// Claude narrative generation
// ---------------------------------------------------------------------------
async function generateNarrative(
  template: string,
  ctx: EngagementContext,
): Promise<string> {
  const ctxSummary = JSON.stringify({
    company: ctx.engagement.portfolio_company,
    pe_sponsor: ctx.engagement.pe_sponsor,
    industry: ctx.engagement.industry,
    total_spend: ctx.engagement.total_addressable_spend,
    pipeline_total: ctx.pipeline_total,
    risk_adjusted_total: ctx.risk_adjusted_total,
    quick_win_total: ctx.quick_win_total,
    by_phase: ctx.by_phase,
    top_categories: ctx.spend_by_category.slice(0, 5),
    initiative_count: ctx.initiatives.length,
    at_risk_count: ctx.initiatives.filter((i) => i.is_at_risk).length,
    maturity_avg: ctx.maturity.length > 0
      ? Math.round(ctx.maturity.reduce((s, m) => s + (Number(m.score) || 0), 0) / ctx.maturity.length * 10) / 10
      : null,
    tariff_exposure: ctx.tariffs.reduce((s, t) => s + (Number(t.estimated_impact) || 0), 0),
    contracts_expiring_90d: ctx.contracts_expiring.filter((c) => {
      const d = new Date(String(c.end_date));
      return d <= new Date(Date.now() + 90 * 86_400_000);
    }).length,
  });

  const prompt = `You are writing content for a client deliverable for A&M PEPI (Alvarez & Marsal Private Equity Portfolio Improvement). 
Be professional, data-driven, and concise. Use specific numbers. Write in active voice.
Engagement data: ${ctxSummary}

${template}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
  });

  return response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("")
    .trim();
}

// ---------------------------------------------------------------------------
// Save file and record to DB
// ---------------------------------------------------------------------------
async function saveDeliverable(
  engagementId: number,
  type: DeliverableType,
  fileName: string,
  fileBuffer: Buffer,
): Promise<string> {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const filePath = path.join(OUTPUT_DIR, fileName);
  fs.writeFileSync(filePath, fileBuffer);

  const now = new Date().toISOString();
  db.insert(deliverable_outputs).values({
    engagement_id: engagementId,
    deliverable_type: type,
    file_name: fileName,
    file_path: filePath,
    file_size_bytes: fileBuffer.length,
    claude_model_version: MODEL,
    generated_at: now,
  }).run();

  return filePath;
}

// ---------------------------------------------------------------------------
// POST to sidecar and get file buffer back
// ---------------------------------------------------------------------------
async function callSidecarGenerate(
  endpoint: string,
  payload: unknown,
): Promise<Buffer> {
  const resp = await fetch(`${SIDECAR_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Sidecar ${endpoint} returned ${resp.status}: ${text}`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  if (buffer.length < 100) {
    throw new Error(`Sidecar returned suspiciously small file: ${buffer.length} bytes`);
  }
  return buffer;
}

// ---------------------------------------------------------------------------
// Steerco deck (P1-09) — 8 slides
// ---------------------------------------------------------------------------
async function generateSteerco(
  engagementId: number,
  progressCb: (pct: number, msg: string) => void,
): Promise<string> {
  progressCb(5, "Loading engagement data…");
  const ctx = await assembleContext(engagementId);

  progressCb(20, "Generating narrative with Claude…");

  // Generate narrative sections in parallel
  const [situationNarrative, initiativeBrief, riskNarrative, nextSteps] = await Promise.all([
    generateNarrative(
      `Write a 3-sentence "Situation" slide narrative for a PE steerco deck. Cover: addressable spend, procurement maturity gap, and the opportunity. Be specific with numbers.`,
      ctx,
    ),
    generateNarrative(
      `Write a 2-sentence "Top 3 Initiatives" intro for a steerco. Highlight the highest-value quick wins and their combined impact. Use $Xm format.`,
      ctx,
    ),
    generateNarrative(
      `Write 3 concise risk bullets for a steerco (format: "Risk: [risk]. Mitigation: [action]."). Focus on implementation risks, supplier concentration, and contract expiry.`,
      ctx,
    ),
    generateNarrative(
      `Write 4 crisp "Next Steps" bullets for a steerco. Each should be an action item with an owner type (e.g., "Procurement Lead", "CFO", "A&M") and timing (e.g., "Next 30 days").`,
      ctx,
    ),
  ]);

  progressCb(50, "Building slide deck payload…");

  // Format numbers
  const fmt = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : `$${n.toFixed(0)}`;

  const topInitiatives = ctx.initiatives.slice(0, 10).map((i) => ({
    name: i.name,
    phase: i.phase,
    lever: i.lever_type,
    target: fmt(Number(i.target_amount) || 0),
    risk_adjusted: fmt(Number(i.risk_adjusted_target) || 0),
    probability: `${Math.round((Number(i.probability) || 0) * 100)}%`,
    status: i.status,
  }));

  const payload = {
    engagement: {
      name: ctx.engagement.name,
      portfolio_company: ctx.engagement.portfolio_company,
      pe_sponsor: ctx.engagement.pe_sponsor,
      industry: ctx.engagement.industry,
    },
    slides: {
      situation: {
        total_spend: fmt(Number(ctx.engagement.total_addressable_spend) || 0),
        narrative: situationNarrative,
        spend_breakdown: ctx.spend_by_category.slice(0, 6).map((s) => ({
          category: s.category,
          spend: fmt(Number(s.spend) || 0),
        })),
      },
      spend_waterfall: {
        total: fmt(Number(ctx.engagement.total_addressable_spend) || 0),
        categories: ctx.spend_by_category.slice(0, 8).map((s) => ({
          name: String(s.category || "Other"),
          value: Number(s.spend) || 0,
        })),
      },
      initiatives: {
        pipeline_total: fmt(ctx.pipeline_total),
        risk_adjusted: fmt(ctx.risk_adjusted_total),
        quick_win: fmt(ctx.quick_win_total),
        intro: initiativeBrief,
        items: topInitiatives,
      },
      kraljic: {
        categories: ctx.kraljic.slice(0, 12).map((k) => ({
          name: k.category_name,
          quadrant: k.kraljic_quadrant,
          supply_risk: Number(k.supply_risk_score) || 0,
          profit_impact: Number(k.profit_impact_score) || 0,
          strategy: k.sourcing_strategy,
        })),
      },
      ebitda_bridge: {
        baseline_ebitda: Number(ctx.engagement.annual_revenue) && Number(ctx.engagement.ebitda_margin_pct)
          ? Number(ctx.engagement.annual_revenue) * (Number(ctx.engagement.ebitda_margin_pct) / 100)
          : null,
        savings_impact: ctx.risk_adjusted_total,
        by_phase: ctx.by_phase,
        phases: [
          { label: "Quick Wins (0–90d)", value: ctx.by_phase.quick_win },
          { label: "Medium Term (90–180d)", value: ctx.by_phase.medium_term },
          { label: "Long Term (180d+)", value: ctx.by_phase.long_term },
        ],
      },
      hundred_day_roadmap: {
        phases: [
          {
            label: "Weeks 1–4: Assess",
            activities: ["Complete data cleansing", "Finalize spend taxonomy", "Map contracts to spend"],
          },
          {
            label: "Weeks 5–8: Plan",
            activities: ["Launch quick-win sourcing events", "Negotiate payment terms", "Establish supplier scorecards"],
          },
          {
            label: "Weeks 9–13: Execute",
            activities: ["Execute contracts", "Track realization", "Deliver 100-day report"],
          },
        ],
      },
      risks: {
        narrative: riskNarrative,
        items: [
          { risk: "Implementation bandwidth", severity: "Medium" },
          { risk: "Supplier resistance to renegotiation", severity: "Low" },
          { risk: "Data quality gaps in non-PO spend", severity: "Medium" },
        ],
      },
      next_steps: {
        items: nextSteps.split("\n").filter((l) => l.trim()).slice(0, 5),
      },
    },
    branding: {
      primary_color: String(ctx.engagement.report_color_primary || "#003366"),
      secondary_color: String(ctx.engagement.report_color_secondary || "#0066CC"),
      header_text: String(ctx.engagement.report_header_text || "CONFIDENTIAL — A&M PEPI"),
    },
  };

  progressCb(60, "Sending to Python sidecar for PPTX rendering…");
  const fileBuffer = await callSidecarGenerate("/generate/pptx", payload);

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `steerco_${String(ctx.engagement.portfolio_company).replace(/[^a-zA-Z0-9]/g, "_")}_${ts}.pptx`;

  progressCb(90, "Saving file…");
  const filePath = await saveDeliverable(engagementId, "steerco_pptx", fileName, fileBuffer);

  progressCb(100, `Steerco deck ready: ${fileName}`);
  return filePath;
}

// ---------------------------------------------------------------------------
// ODD Memo (P1-10) — full Word document
// ---------------------------------------------------------------------------
async function generateOddMemo(
  engagementId: number,
  progressCb: (pct: number, msg: string) => void,
): Promise<string> {
  progressCb(5, "Loading engagement data…");
  const ctx = await assembleContext(engagementId);

  progressCb(20, "Drafting ODD memo sections with Claude…");

  const [execSummary, methodologySection, spendFindings, initiativePipeline, riskMatrix, implementationRoadmap] =
    await Promise.all([
      generateNarrative(
        `Write a 150-word executive summary for a Procurement Operational Due Diligence (ODD) memo. 
        Cover: scope of analysis, total addressable spend, procurement maturity assessment, key savings opportunity, and primary risks.
        Tone: professional advisory, third-person.`,
        ctx,
      ),
      generateNarrative(
        `Write a 100-word "Methodology" section for a Procurement ODD memo.
        Cover: data sources reviewed, analysis approach, benchmarking methodology, and time period analyzed.
        Mention UNSPSC taxonomy, spend classification, and Kraljic matrix as tools used.`,
        ctx,
      ),
      generateNarrative(
        `Write a 200-word "Spend Findings" section for a Procurement ODD memo.
        Cover: spend concentration (top 10 vendors), category breakdown, non-PO spend rate, tail spend, and key anomalies.
        Reference specific numbers from the data. Identify 2-3 structural findings.`,
        ctx,
      ),
      generateNarrative(
        `Write a 200-word "Savings Initiative Pipeline" section for a Procurement ODD memo.
        Cover: total pipeline, risk-adjusted estimate, phasing (quick wins vs. medium/long-term), top 3 initiatives by value, and confidence basis.
        Format: narrative paragraphs, no bullet lists.`,
        ctx,
      ),
      generateNarrative(
        `Write a 150-word "Risk Matrix" section for a Procurement ODD memo.
        Cover: top 3 procurement risks (supplier concentration, contract gaps, tariff exposure, data quality).
        For each: describe the risk, quantify where possible, and state the mitigation.`,
        ctx,
      ),
      generateNarrative(
        `Write a 120-word "Implementation Roadmap" section for a Procurement ODD memo.
        Cover: 3-phase approach (0-30 days: foundation, 30-90 days: quick wins, 90-180 days: medium-term).
        Each phase: 2-3 key activities and expected outcome. End with a sentence on governance cadence.`,
        ctx,
      ),
    ]);

  progressCb(55, "Building ODD memo payload…");

  const fmt = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : `$${n.toFixed(0)}`;

  const avgMaturity = ctx.maturity.length > 0
    ? Math.round(ctx.maturity.reduce((s, m) => s + (Number(m.score) || 0), 0) / ctx.maturity.length * 10) / 10
    : null;

  const payload = {
    engagement: {
      name: ctx.engagement.name,
      portfolio_company: ctx.engagement.portfolio_company,
      pe_sponsor: ctx.engagement.pe_sponsor,
      industry: ctx.engagement.industry,
      total_addressable_spend: fmt(Number(ctx.engagement.total_addressable_spend) || 0),
      generated_date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    },
    summary_metrics: {
      total_spend: fmt(Number(ctx.engagement.total_addressable_spend) || 0),
      pipeline_total: fmt(ctx.pipeline_total),
      risk_adjusted: fmt(ctx.risk_adjusted_total),
      quick_wins: fmt(ctx.quick_win_total),
      initiative_count: ctx.initiatives.length,
      maturity_score: avgMaturity,
      tariff_exposure: fmt(ctx.tariffs.reduce((s, t) => s + (Number(t.estimated_impact) || 0), 0)),
      contracts_expiring_90d: ctx.contracts_expiring.filter((c) => {
        const d = new Date(String(c.end_date));
        return d <= new Date(Date.now() + 90 * 86_400_000);
      }).length,
    },
    sections: {
      executive_summary: execSummary,
      methodology: methodologySection,
      spend_findings: spendFindings,
      initiative_pipeline: initiativePipeline,
      risk_matrix: riskMatrix,
      implementation_roadmap: implementationRoadmap,
    },
    data_tables: {
      spend_by_category: ctx.spend_by_category.slice(0, 10).map((s) => ({
        category: s.category || "Uncategorized",
        spend: fmt(Number(s.spend) || 0),
        suppliers: s.suppliers,
        pct_of_total: ctx.engagement.total_addressable_spend
          ? `${((Number(s.spend) / Number(ctx.engagement.total_addressable_spend)) * 100).toFixed(1)}%`
          : "—",
      })),
      top_initiatives: ctx.initiatives.slice(0, 10).map((i) => ({
        name: i.name,
        lever: i.lever_type,
        phase: String(i.phase || "").replace(/_/g, " "),
        target: fmt(Number(i.target_amount) || 0),
        risk_adjusted: fmt(Number(i.risk_adjusted_target) || 0),
        confidence: i.confidence,
      })),
      maturity_dimensions: ctx.maturity.map((m) => ({
        dimension: String(m.dimension || "").replace(/_/g, " "),
        score: m.score,
        gap: m.gap_to_next_level,
      })),
    },
    branding: {
      header_text: String(ctx.engagement.report_header_text || "CONFIDENTIAL — A&M PEPI"),
      primary_color: String(ctx.engagement.report_color_primary || "#003366"),
    },
  };

  progressCb(65, "Sending to Python sidecar for DOCX rendering…");
  const fileBuffer = await callSidecarGenerate("/generate/docx", payload);

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `ODD_memo_${String(ctx.engagement.portfolio_company).replace(/[^a-zA-Z0-9]/g, "_")}_${ts}.docx`;

  progressCb(90, "Saving file…");
  const filePath = await saveDeliverable(engagementId, "odd_memo_docx", fileName, fileBuffer);

  progressCb(100, `ODD memo ready: ${fileName}`);
  return filePath;
}

// ---------------------------------------------------------------------------
// Excel model (P1-11) — multi-tab workbook
// ---------------------------------------------------------------------------
async function generateExcel(
  engagementId: number,
  progressCb: (pct: number, msg: string) => void,
): Promise<string> {
  progressCb(5, "Loading engagement data…");
  const ctx = await assembleContext(engagementId);
  progressCb(30, "Sending to Python sidecar for Excel rendering…");

  const fmt_num = (n: number | null) => (n !== null ? Math.round(n) : null);

  const payload = {
    engagement: {
      name: ctx.engagement.name,
      portfolio_company: ctx.engagement.portfolio_company,
      pe_sponsor: ctx.engagement.pe_sponsor,
      discount_rate: ctx.engagement.discount_rate,
    },
    tabs: {
      summary: {
        total_spend: fmt_num(Number(ctx.engagement.total_addressable_spend) || null),
        pipeline_total: fmt_num(ctx.pipeline_total),
        risk_adjusted: fmt_num(ctx.risk_adjusted_total),
        quick_wins: fmt_num(ctx.quick_win_total),
        by_phase: ctx.by_phase,
        initiative_count: ctx.initiatives.length,
      },
      initiative_pipeline: ctx.initiatives.map((i) => ({
        name: i.name,
        category: i.category_name,
        lever: i.lever_type,
        phase: i.phase,
        status: i.status,
        target: fmt_num(Number(i.target_amount) || null),
        risk_adjusted: fmt_num(Number(i.risk_adjusted_target) || null),
        probability: Number(i.probability) || null,
        confidence: i.confidence,
        is_at_risk: i.is_at_risk,
      })),
      spend_analysis: ctx.spend_by_category.map((s) => ({
        category: s.category,
        spend: fmt_num(Number(s.spend) || null),
        suppliers: s.suppliers,
      })),
      assumptions: {
        discount_rate: Number(ctx.engagement.discount_rate) || 0.10,
        market_data: ctx.market_data.slice(0, 20).map((m) => ({
          series: m.series_name,
          value: m.value,
          unit: m.unit,
          yoy_pct: m.yoy_change_pct,
          period: m.period,
        })),
      },
    },
  };

  const fileBuffer = await callSidecarGenerate("/generate/xlsx", payload);

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `model_${String(ctx.engagement.portfolio_company).replace(/[^a-zA-Z0-9]/g, "_")}_${ts}.xlsx`;

  progressCb(90, "Saving file…");
  const filePath = await saveDeliverable(engagementId, "excel_model", fileName, fileBuffer);

  progressCb(100, `Excel model ready: ${fileName}`);
  return filePath;
}

// ---------------------------------------------------------------------------
// Public: job handler dispatcher
// ---------------------------------------------------------------------------
export async function runDeliverableGen(
  payload: Record<string, unknown>,
  progressCb: (pct: number, msg: string) => void,
): Promise<{ file_path: string; type: DeliverableType }> {
  const engagementId = Number(payload.engagement_id);
  const type = String(payload.type) as DeliverableType;

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  switch (type) {
    case "steerco_pptx": {
      const fp = await generateSteerco(engagementId, progressCb);
      return { file_path: fp, type };
    }
    case "odd_memo_docx": {
      const fp = await generateOddMemo(engagementId, progressCb);
      return { file_path: fp, type };
    }
    case "excel_model": {
      const fp = await generateExcel(engagementId, progressCb);
      return { file_path: fp, type };
    }
    default:
      throw new Error(`Unknown deliverable type: ${type}`);
  }
}

// ---------------------------------------------------------------------------
// Public: get deliverables for an engagement
// ---------------------------------------------------------------------------
export function getDeliverables(engagementId: number) {
  return db
    .select()
    .from(deliverable_outputs)
    .where(eq(deliverable_outputs.engagement_id, engagementId))
    .all();
}
