/**
 * LEVERAGE v3 — CopilotService (P1-05, P1-06)
 *
 * NL co-pilot powered by Claude. Exposes 12 tools that map to LEVERAGE's
 * existing data layer. Streams responses via SSE.
 *
 * Tools (per spec P1-06):
 *   get_spend_summary, get_top_vendors, get_initiative_scores,
 *   get_kraljic_matrix, get_financial_model, get_maturity_gap,
 *   get_tariff_exposure, get_contract_status, run_market_lookup,
 *   get_supplier_risk, search_engagement_data, generate_deliverable
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../storage";
import {
  engagements, spend_records, savings_initiatives, contracts,
  category_strategy, procurement_maturity_assessments, tariff_impacts,
  supplier_risk_profiles, market_data_cache, copilot_sessions,
} from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import type { Response } from "express";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

const MODEL = "claude-sonnet-4-20250514";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface CopilotMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CopilotRequest {
  engagement_id: number;
  message: string;
  history: CopilotMessage[];
  session_id?: number;
}

// ---------------------------------------------------------------------------
// Tool definitions (12 tools per spec)
// ---------------------------------------------------------------------------
const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_spend_summary",
    description: "Get total spend by L1 category, top suppliers, and spend flags for the engagement. Use this when the user asks about spend breakdown, category spend, or top vendors.",
    input_schema: {
      type: "object" as const,
      properties: {
        top_n: { type: "number", description: "Number of top suppliers to return (default 10)" },
        category: { type: "string", description: "Optional: filter to specific L1 category" },
      },
      required: [],
    },
  },
  {
    name: "get_top_vendors",
    description: "Get ranked list of top vendors by spend with flags (maverick, off-contract, tail). Use when user asks about specific vendors or vendor concentration.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Number of vendors to return (default 20)" },
        flag: { type: "string", description: "Filter by flag: 'maverick' | 'off-contract' | 'tail' | 'critical'" },
      },
      required: [],
    },
  },
  {
    name: "get_initiative_scores",
    description: "Get savings initiatives with their scoring, probability, and risk-adjusted targets. Use when user asks about savings pipeline, initiatives, or EBITDA impact.",
    input_schema: {
      type: "object" as const,
      properties: {
        phase: { type: "string", description: "Filter by phase: 'quick_win' | 'medium_term' | 'long_term'" },
        min_probability: { type: "number", description: "Minimum probability threshold (0-1)" },
        status: { type: "string", description: "Filter by status: 'identified' | 'approved' | 'in_progress' | 'realized'" },
      },
      required: [],
    },
  },
  {
    name: "get_kraljic_matrix",
    description: "Get Kraljic matrix positioning for all categories — quadrant, supply risk, profit impact, and recommended strategy. Use when user asks about category strategy or sourcing approach.",
    input_schema: {
      type: "object" as const,
      properties: {
        quadrant: { type: "string", description: "Filter by quadrant: 'Leverage' | 'Strategic' | 'Bottleneck' | 'Non-critical'" },
      },
      required: [],
    },
  },
  {
    name: "get_financial_model",
    description: "Get NPV, IRR, payback period, and EBITDA bridge for the engagement's savings pipeline. Use for financial impact questions.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_maturity_gap",
    description: "Get procurement maturity assessment scores across all 8 dimensions and gap analysis to next level. Use when user asks about procurement capability or maturity.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_tariff_exposure",
    description: "Get tariff impact analysis — affected categories, exposure $, risk level, and mitigation strategies. Use when user asks about tariffs, trade risk, or country of origin.",
    input_schema: {
      type: "object" as const,
      properties: {
        min_risk_level: { type: "string", description: "Filter: 'low' | 'medium' | 'high' | 'critical'" },
      },
      required: [],
    },
  },
  {
    name: "get_contract_status",
    description: "Get contract inventory — expiry dates, auto-renewal flags, payment terms gaps, compliance rates. Use when user asks about contracts, renewals, or terms.",
    input_schema: {
      type: "object" as const,
      properties: {
        expiring_within_days: { type: "number", description: "Return contracts expiring within N days" },
        has_auto_renew: { type: "boolean", description: "Filter to auto-renew contracts only" },
      },
      required: [],
    },
  },
  {
    name: "run_market_lookup",
    description: "Look up live commodity prices, PPI indices, or macro rates from the market data cache. Use when user asks about market prices, commodity trends, or benchmarks.",
    input_schema: {
      type: "object" as const,
      properties: {
        category_tag: { type: "string", description: "Filter: 'commodity_metal' | 'commodity_energy' | 'commodity_ag' | 'ppi' | 'macro' | 'labor'" },
        series_id: { type: "string", description: "Specific series ID e.g. 'GC=F', 'CPIAUCSL', 'WPU10'" },
      },
      required: [],
    },
  },
  {
    name: "get_supplier_risk",
    description: "Get supplier risk profiles — Altman Z-score, news sentiment, OFAC/SAM flags, overall risk score. Use when user asks about supplier health, risk, or news.",
    input_schema: {
      type: "object" as const,
      properties: {
        min_risk_score: { type: "number", description: "Return suppliers with overall_risk_score >= this value (0-100)" },
        flag: { type: "string", description: "Filter: 'ofac' | 'sam' | 'distress' | 'negative_news'" },
      },
      required: [],
    },
  },
  {
    name: "search_engagement_data",
    description: "Free-text search across spend records, initiatives, and contracts for the engagement. Use when user asks about specific suppliers, descriptions, or GL codes. For live web information about a supplier, use run_market_lookup with a supplier query instead.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search term to look for in supplier names, descriptions, GL codes" },
        entity: { type: "string", description: "What to search: 'spend' | 'initiatives' | 'contracts' | 'all'" },
      },
      required: ["query"],
    },
  },
  {
    name: "generate_deliverable",
    description: "Trigger generation of a deliverable — steerco deck, ODD memo, or Excel model. Returns a job ID to track progress.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: { type: "string", description: "'steerco_pptx' | 'odd_memo_docx' | 'excel_model'" },
      },
      required: ["type"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool execution — maps tool calls to DB queries
// ---------------------------------------------------------------------------
async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  engagementId: number,
): Promise<unknown> {
  switch (toolName) {
    case "get_spend_summary": {
      const topN = Number(toolInput.top_n ?? 10);
      const totalSpend = db.get(sql`
        SELECT SUM(amount) as total, COUNT(*) as records, COUNT(DISTINCT supplier_name) as suppliers
        FROM spend_records WHERE engagement_id = ${engagementId}
      `) as { total: number; records: number; suppliers: number };

      const byCategory = db.all(sql`
        SELECT l1_category, SUM(amount) as spend, COUNT(*) as records
        FROM spend_records WHERE engagement_id = ${engagementId}
        GROUP BY l1_category ORDER BY spend DESC LIMIT 15
      `) as { l1_category: string; spend: number; records: number }[];

      const topVendors = db.all(sql`
        SELECT supplier_name, SUM(amount) as spend, spend_flag
        FROM spend_records WHERE engagement_id = ${engagementId}
        ${toolInput.category ? sql`AND l1_category = ${toolInput.category}` : sql``}
        GROUP BY supplier_name ORDER BY spend DESC LIMIT ${topN}
      `) as { supplier_name: string; spend: number; spend_flag: string }[];

      return { total: totalSpend, by_category: byCategory, top_vendors: topVendors };
    }

    case "get_top_vendors": {
      const limit = Number(toolInput.limit ?? 20);
      const flag = toolInput.flag as string | undefined;
      const vendors = db.all(sql`
        SELECT supplier_name, SUM(amount) as spend, spend_flag, COUNT(*) as invoice_count,
               normalized_supplier_name, l1_category
        FROM spend_records WHERE engagement_id = ${engagementId}
        ${flag ? sql`AND spend_flag = ${flag}` : sql``}
        GROUP BY supplier_name ORDER BY spend DESC LIMIT ${limit}
      `);
      return { vendors };
    }

    case "get_initiative_scores": {
      let query = db.select().from(savings_initiatives).where(eq(savings_initiatives.engagement_id, engagementId));
      const initiatives = db.all(sql`
        SELECT id, name, lever_type, phase, status, target_amount, realized_amount,
               probability, risk_adjusted_target, confidence, is_at_risk, at_risk_reason
        FROM savings_initiatives WHERE engagement_id = ${engagementId}
        ${toolInput.phase ? sql`AND phase = ${toolInput.phase}` : sql``}
        ${toolInput.status ? sql`AND status = ${toolInput.status}` : sql``}
        ORDER BY risk_adjusted_target DESC
      `) as any[];

      const pipeline = initiatives.reduce((s: number, i: any) => s + (i.risk_adjusted_target ?? 0), 0);
      const at_risk = initiatives.filter((i: any) => i.is_at_risk).length;
      return { initiatives, pipeline_total: pipeline, at_risk_count: at_risk };
    }

    case "get_kraljic_matrix": {
      const strategies = db.all(sql`
        SELECT cs.*, c.name as category_name
        FROM category_strategy cs
        LEFT JOIN categories c ON c.id = cs.category_id
        WHERE cs.engagement_id = ${engagementId}
        ${toolInput.quadrant ? sql`AND cs.kraljic_quadrant = ${toolInput.quadrant}` : sql``}
        ORDER BY cs.profit_impact_score DESC
      `);
      return { strategies };
    }

    case "get_financial_model": {
      const initiatives = db.all(sql`
        SELECT target_amount, risk_adjusted_target, probability, phase
        FROM savings_initiatives WHERE engagement_id = ${engagementId}
      `) as any[];
      const total = initiatives.reduce((s: number, i: any) => s + (i.risk_adjusted_target ?? 0), 0);
      const by_phase = {
        quick_win: initiatives.filter((i: any) => i.phase === "quick_win").reduce((s: number, i: any) => s + (i.risk_adjusted_target ?? 0), 0),
        medium_term: initiatives.filter((i: any) => i.phase === "medium_term").reduce((s: number, i: any) => s + (i.risk_adjusted_target ?? 0), 0),
        long_term: initiatives.filter((i: any) => i.phase === "long_term").reduce((s: number, i: any) => s + (i.risk_adjusted_target ?? 0), 0),
      };
      const engagement = db.select().from(engagements).where(eq(engagements.id, engagementId)).get();
      return { total_risk_adjusted: total, by_phase, discount_rate: engagement?.discount_rate, initiative_count: initiatives.length };
    }

    case "get_maturity_gap": {
      const assessments = db.all(sql`
        SELECT dimension, score, evidence, gap_to_next_level, priority
        FROM procurement_maturity_assessments WHERE engagement_id = ${engagementId}
        ORDER BY score ASC
      `);
      const avg = assessments.length > 0
        ? (assessments as any[]).reduce((s, a) => s + a.score, 0) / assessments.length
        : null;
      return { dimensions: assessments, average_score: avg ? Math.round(avg * 10) / 10 : null };
    }

    case "get_tariff_exposure": {
      const impacts = db.all(sql`
        SELECT category_name, supplier_name, country_of_origin, effective_tariff_pct,
               annual_spend, estimated_impact, risk_level, mitigation_strategy
        FROM tariff_impacts WHERE engagement_id = ${engagementId}
        ${toolInput.min_risk_level ? sql`AND risk_level IN ('high','critical')` : sql``}
        ORDER BY estimated_impact DESC
      `);
      const total_exposure = (impacts as any[]).reduce((s, i) => s + (i.estimated_impact ?? 0), 0);
      return { impacts, total_exposure };
    }

    case "get_contract_status": {
      const days = Number(toolInput.expiring_within_days ?? 365);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + days);
      const cutoffStr = cutoff.toISOString().split("T")[0];
      const contractList = db.all(sql`
        SELECT supplier_name, contract_value_annual, start_date, end_date,
               auto_renew, payment_terms, compliance_rate_pct, is_sole_source
        FROM contracts WHERE engagement_id = ${engagementId}
        AND end_date IS NOT NULL AND end_date <= ${cutoffStr}
        ${toolInput.has_auto_renew ? sql`AND auto_renew = 1` : sql``}
        ORDER BY end_date ASC
      `);
      return { contracts: contractList, cutoff_date: cutoffStr };
    }

    case "run_market_lookup": {
      const catTag = toolInput.category_tag as string | undefined;
      const seriesId = toolInput.series_id as string | undefined;
      let data: unknown[];
      if (catTag && seriesId) {
        data = db.all(sql`SELECT series_id, series_name, category_tag, value, unit, period, yoy_change_pct, mom_change_pct, fetched_at, data_source FROM market_data_cache WHERE category_tag = ${catTag} AND series_id = ${seriesId} ORDER BY category_tag, series_name`);
      } else if (catTag) {
        data = db.all(sql`SELECT series_id, series_name, category_tag, value, unit, period, yoy_change_pct, mom_change_pct, fetched_at, data_source FROM market_data_cache WHERE category_tag = ${catTag} ORDER BY category_tag, series_name`);
      } else if (seriesId) {
        data = db.all(sql`SELECT series_id, series_name, category_tag, value, unit, period, yoy_change_pct, mom_change_pct, fetched_at, data_source FROM market_data_cache WHERE series_id = ${seriesId} ORDER BY category_tag, series_name`);
      } else {
        data = db.all(sql`SELECT series_id, series_name, category_tag, value, unit, period, yoy_change_pct, mom_change_pct, fetched_at, data_source FROM market_data_cache ORDER BY category_tag, series_name`);
      }
      return { market_data: data, count: (data as any[]).length };
    }

    case "get_supplier_risk": {
      const minScore = Number(toolInput.min_risk_score ?? 0);
      const flag = toolInput.flag as string | undefined;
      let profiles: unknown[];
      if (flag === "ofac") {
        profiles = db.all(sql`SELECT supplier_name, altman_z_score, financial_risk_level, news_sentiment_score, news_risk_flags, latest_news_headline, ofac_match, sam_exclusion, overall_risk_score, risk_narrative, last_refreshed_at FROM supplier_risk_profiles WHERE engagement_id = ${engagementId} AND overall_risk_score >= ${minScore} AND ofac_match = 1 ORDER BY overall_risk_score DESC LIMIT 25`);
      } else if (flag === "sam") {
        profiles = db.all(sql`SELECT supplier_name, altman_z_score, financial_risk_level, news_sentiment_score, news_risk_flags, latest_news_headline, ofac_match, sam_exclusion, overall_risk_score, risk_narrative, last_refreshed_at FROM supplier_risk_profiles WHERE engagement_id = ${engagementId} AND overall_risk_score >= ${minScore} AND sam_exclusion = 1 ORDER BY overall_risk_score DESC LIMIT 25`);
      } else if (flag === "distress") {
        profiles = db.all(sql`SELECT supplier_name, altman_z_score, financial_risk_level, news_sentiment_score, news_risk_flags, latest_news_headline, ofac_match, sam_exclusion, overall_risk_score, risk_narrative, last_refreshed_at FROM supplier_risk_profiles WHERE engagement_id = ${engagementId} AND overall_risk_score >= ${minScore} AND financial_risk_level IN ('high','critical') ORDER BY overall_risk_score DESC LIMIT 25`);
      } else if (flag === "negative_news") {
        profiles = db.all(sql`SELECT supplier_name, altman_z_score, financial_risk_level, news_sentiment_score, news_risk_flags, latest_news_headline, ofac_match, sam_exclusion, overall_risk_score, risk_narrative, last_refreshed_at FROM supplier_risk_profiles WHERE engagement_id = ${engagementId} AND overall_risk_score >= ${minScore} AND news_sentiment_score < -0.3 ORDER BY overall_risk_score DESC LIMIT 25`);
      } else {
        profiles = db.all(sql`SELECT supplier_name, altman_z_score, financial_risk_level, news_sentiment_score, news_risk_flags, latest_news_headline, ofac_match, sam_exclusion, overall_risk_score, risk_narrative, last_refreshed_at FROM supplier_risk_profiles WHERE engagement_id = ${engagementId} AND overall_risk_score >= ${minScore} ORDER BY overall_risk_score DESC LIMIT 25`);
      }
      return { suppliers: profiles };
    }

    case "search_engagement_data": {
      const q = `%${toolInput.query}%`;
      const entity = (toolInput.entity as string) ?? "all";
      const results: Record<string, unknown[]> = {};

      if (entity === "spend" || entity === "all") {
        results.spend = db.all(sql`
          SELECT supplier_name, amount, description, l1_category, date, spend_flag
          FROM spend_records WHERE engagement_id = ${engagementId}
          AND (supplier_name LIKE ${q} OR description LIKE ${q} OR gl_code LIKE ${q})
          ORDER BY amount DESC LIMIT 20
        `);
      }
      if (entity === "initiatives" || entity === "all") {
        results.initiatives = db.all(sql`
          SELECT name, lever_type, phase, target_amount, status, probability
          FROM savings_initiatives WHERE engagement_id = ${engagementId}
          AND name LIKE ${q} ORDER BY target_amount DESC LIMIT 10
        `);
      }
      if (entity === "contracts" || entity === "all") {
        results.contracts = db.all(sql`
          SELECT supplier_name, contract_value_annual, end_date, payment_terms
          FROM contracts WHERE engagement_id = ${engagementId}
          AND supplier_name LIKE ${q} ORDER BY contract_value_annual DESC LIMIT 10
        `);
      }
      return results;
    }

    case "generate_deliverable": {
      // Stub — full impl in P1-09/10/11
      const type = toolInput.type as string;
      return {
        status: "queued",
        message: `Deliverable generation for '${type}' will be available in Phase 1 P1-09/10/11. Feature coming soon.`,
        job_id: null,
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------
function buildSystemPrompt(engagement: {
  name: string;
  portfolio_company: string;
  pe_sponsor?: string | null;
  industry?: string | null;
  total_addressable_spend?: number | null;
}): string {
  const spend = engagement.total_addressable_spend
    ? `$${(engagement.total_addressable_spend / 1e6).toFixed(1)}M`
    : "not yet quantified";

  return `You are LEVERAGE Co-pilot, an elite procurement AI assistant embedded in A&M PEPI's LEVERAGE platform. You are working on a specific client engagement.

ENGAGEMENT CONTEXT:
- Engagement: ${engagement.name}
- Portfolio Company: ${engagement.portfolio_company}
- PE Sponsor: ${engagement.pe_sponsor ?? "—"}
- Industry: ${engagement.industry ?? "—"}
- Total Addressable Spend: ${spend}

YOUR ROLE:
You help A&M PEPI consultants rapidly analyze procurement data, size savings opportunities, assess supplier risk, and prepare client-ready insights. You have direct access to all engagement data via your tools.

BEHAVIORAL GUIDELINES:
- Be direct and precise. This is a professional consulting context — no fluff.
- Lead with the numbers. If you pull data, synthesize it immediately into insight.
- When quoting dollar figures, use $Xm or $Xk format. Round appropriately.
- Flag risks proactively — don't wait to be asked.
- Cite which tool you used when referencing data (e.g., "From the spend analysis...").
- If a question requires live market data and none is cached, say so and suggest running a market refresh.
- Do not hallucinate data. Only reference what the tools return.
- Keep responses concise — consultants are time-constrained. Use tables where helpful.

SCOPE:
You can answer questions about: spend analysis, savings initiatives, category strategy, Kraljic positioning, financial model, maturity assessment, tariff exposure, contracts, supplier risk, and live market data. For questions outside this scope, say so clearly.`;
}

// ---------------------------------------------------------------------------
// Session persistence
// ---------------------------------------------------------------------------
function saveSession(
  engagementId: number,
  sessionId: number | null,
  history: CopilotMessage[],
  toolCallsUsed: string[],
): number {
  const now = new Date().toISOString();
  if (sessionId) {
    db.run(sql`
      UPDATE copilot_sessions SET
        message_history_json = ${JSON.stringify(history)},
        tool_calls_json = ${JSON.stringify(toolCallsUsed)},
        updated_at = ${now}
      WHERE id = ${sessionId}
    `);
    return sessionId;
  } else {
    const result = db.run(sql`
      INSERT INTO copilot_sessions (engagement_id, message_history_json, tool_calls_json, created_at, updated_at)
      VALUES (${engagementId}, ${JSON.stringify(history)}, ${JSON.stringify(toolCallsUsed)}, ${now}, ${now})
    `);
    return Number((result as any).lastInsertRowid);
  }
}

export function getSessions(engagementId: number) {
  return db.all(sql`
    SELECT id, session_name, created_at, updated_at,
           json_array_length(json(message_history_json)) as message_count
    FROM copilot_sessions WHERE engagement_id = ${engagementId}
    ORDER BY updated_at DESC LIMIT 20
  `);
}

export function getSession(sessionId: number) {
  return db.get(sql`SELECT * FROM copilot_sessions WHERE id = ${sessionId}`);
}

export function renameSession(sessionId: number, name: string) {
  db.run(sql`UPDATE copilot_sessions SET session_name = ${name} WHERE id = ${sessionId}`);
}

// ---------------------------------------------------------------------------
// Main streaming handler
// ---------------------------------------------------------------------------
export async function streamCopilotResponse(
  req: CopilotRequest,
  res: Response,
): Promise<void> {
  const { engagement_id, message, history, session_id } = req;

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Load engagement context
  const engagement = db.select().from(engagements).where(eq(engagements.id, engagement_id)).get();
  if (!engagement) {
    send("error", { message: "Engagement not found" });
    res.end();
    return;
  }

  // Build message history for Claude
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: message },
  ];

  const toolCallsUsed: string[] = [];
  let assistantContent = "";
  let newSessionId = session_id ?? null;

  try {
    let continueLoop = true;

    while (continueLoop) {
      // Create streaming message
      const stream = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: buildSystemPrompt(engagement),
        tools: TOOLS,
        messages,
        stream: true,
      });

      let currentToolUse: { id: string; name: string; input_parts: string[] } | null = null;
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      const assistantBlocks: Anthropic.ContentBlock[] = [];

      for await (const event of stream) {
        if (event.type === "content_block_start") {
          if (event.content_block.type === "text") {
            // Text block starting
          } else if (event.content_block.type === "tool_use") {
            currentToolUse = {
              id: event.content_block.id,
              name: event.content_block.name,
              input_parts: [],
            };
            send("tool_start", { tool: event.content_block.name });
            toolCallsUsed.push(event.content_block.name);
          }
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            assistantContent += event.delta.text;
            send("text", { delta: event.delta.text });
          } else if (event.delta.type === "input_json_delta" && currentToolUse) {
            currentToolUse.input_parts.push(event.delta.partial_json);
          }
        } else if (event.type === "content_block_stop") {
          if (currentToolUse) {
            // Execute tool
            let toolInput: Record<string, unknown> = {};
            try {
              toolInput = JSON.parse(currentToolUse.input_parts.join("") || "{}");
            } catch {
              toolInput = {};
            }

            send("tool_running", { tool: currentToolUse.name, input: toolInput });

            let toolResult: unknown;
            try {
              toolResult = await executeTool(currentToolUse.name, toolInput, engagement_id);
            } catch (err: unknown) {
              toolResult = { error: err instanceof Error ? err.message : String(err) };
            }

            send("tool_result", { tool: currentToolUse.name, preview: summarizeToolResult(toolResult) });

            toolResults.push({
              type: "tool_result",
              tool_use_id: currentToolUse.id,
              content: JSON.stringify(toolResult),
            });

            assistantBlocks.push({
              type: "tool_use",
              id: currentToolUse.id,
              name: currentToolUse.name,
              input: toolInput,
            } as Anthropic.ToolUseBlock);

            currentToolUse = null;
          }
        } else if (event.type === "message_stop") {
          if (assistantContent) {
            assistantBlocks.push({ type: "text", text: assistantContent });
          }
        }
      }

      // Add assistant turn to messages
      messages.push({ role: "assistant", content: assistantBlocks });

      if (toolResults.length > 0) {
        // Add tool results and continue loop
        messages.push({ role: "user", content: toolResults });
        assistantContent = ""; // reset for next pass
      } else {
        continueLoop = false;
      }
    }

    // Save session
    const updatedHistory: CopilotMessage[] = [
      ...history,
      { role: "user", content: message },
      { role: "assistant", content: assistantContent },
    ];
    newSessionId = saveSession(engagement_id, newSessionId, updatedHistory, toolCallsUsed);

    send("done", { session_id: newSessionId, tool_calls: toolCallsUsed });
    res.end();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CopilotService] Stream error:", msg);
    send("error", { message: msg });
    res.end();
  }
}

// ---------------------------------------------------------------------------
// Utility: create a short preview of tool results for SSE display
// ---------------------------------------------------------------------------
function summarizeToolResult(result: unknown): string {
  if (!result || typeof result !== "object") return String(result);
  const r = result as Record<string, unknown>;
  const keys = Object.keys(r);
  const preview = keys
    .slice(0, 3)
    .map((k) => {
      const v = r[k];
      if (Array.isArray(v)) return `${k}: [${v.length} items]`;
      if (typeof v === "number") return `${k}: ${v.toLocaleString()}`;
      return `${k}: ${String(v).slice(0, 40)}`;
    })
    .join(", ");
  return preview;
}
