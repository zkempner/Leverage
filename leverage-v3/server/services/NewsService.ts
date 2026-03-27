/**
 * LEVERAGE v3 — NewsService (P1-23)
 * Agent 5B: Supplier news monitoring pipeline
 *
 * Pipeline per spec:
 *   1. NewsData.io (primary) → DDGS news (fallback) via sidecar
 *   2. Trafilatura full-text extraction for each article URL (via sidecar)
 *   3. Claude risk classification → sentiment_score, risk_flags[], severity, narrative
 *   4. Upsert to supplier_risk_profiles table
 *
 * Also exposes RSS feed monitoring for trade journals.
 * Registered as job handler "news_scan" on JobQueueService.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../storage";
import { supplier_risk_profiles, spend_records } from "@shared/schema";
import { eq, sql, desc } from "drizzle-orm";

const SIDECAR_URL = process.env.SIDECAR_URL ?? "http://localhost:5001";
const MODEL = "claude-sonnet-4-20250514";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ArticleData {
  title: string;
  url: string;
  snippet: string;
  published?: string;
  source?: string;
  full_text?: string | null;
  extraction_confidence?: "high" | "medium" | "low";
}

export interface RiskClassification {
  sentiment_score: number;        // -1.0 to +1.0
  risk_flags: string[];           // e.g. ['bankruptcy_risk', 'labor_dispute']
  severity: "none" | "low" | "medium" | "high" | "critical";
  risk_narrative: string;         // 2-3 sentence summary
  headline: string;               // most relevant headline
  headline_url: string;
  article_confidence: "high" | "medium" | "low";
}

const RISK_FLAG_VALUES = [
  "labor_dispute", "regulatory_action", "bankruptcy_risk", "exec_departure",
  "ma_activity", "cyber_incident", "recall", "sanctions", "lawsuit",
  "supply_disruption", "financial_distress", "fraud_investigation",
] as const;

// ---------------------------------------------------------------------------
// Step 1: Fetch news articles for a supplier
// ---------------------------------------------------------------------------
async function fetchSupplierNews(
  supplierName: string,
  maxResults = 10,
): Promise<ArticleData[]> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/api/search/news`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `${supplierName} risk lawsuit bankruptcy regulatory`,
        max_results: maxResults,
        language: "en",
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!resp.ok) return [];
    const data = await resp.json() as { results?: ArticleData[] };
    return data.results ?? [];
  } catch (err) {
    console.warn(`[NewsService] News fetch failed for ${supplierName}:`, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Step 2: Extract full text for each article via Trafilatura
// ---------------------------------------------------------------------------
async function extractArticleTexts(
  articles: ArticleData[],
  supplierName: string,
): Promise<ArticleData[]> {
  if (articles.length === 0) return [];

  try {
    const resp = await fetch(`${SIDECAR_URL}/api/search/extract-and-classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articles, supplier_name: supplierName }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!resp.ok) return articles; // return unenriched if sidecar fails
    const data = await resp.json() as { articles?: ArticleData[] };
    return data.articles ?? articles;
  } catch {
    return articles;
  }
}

// ---------------------------------------------------------------------------
// Step 3: Claude risk classification
// ---------------------------------------------------------------------------
async function classifyRisk(
  supplierName: string,
  articles: ArticleData[],
): Promise<RiskClassification | null> {
  if (articles.length === 0) return null;

  // Build article content for Claude — prefer full text, fall back to snippet
  const articleSummaries = articles
    .slice(0, 8)
    .map((a, i) => {
      const body = a.full_text
        ? a.full_text.slice(0, 1500)
        : a.snippet;
      return `Article ${i + 1} [${a.extraction_confidence ?? "low"} confidence]\nTitle: ${a.title}\nSource: ${a.source ?? "unknown"} | ${a.published ?? ""}\nURL: ${a.url}\n${body}`;
    })
    .join("\n\n---\n\n");

  const prompt = `You are a procurement risk analyst. Assess the supplier risk based on recent news articles.

SUPPLIER: ${supplierName}

NEWS ARTICLES:
${articleSummaries}

---

Analyze the articles and return ONLY valid JSON (no markdown, no preamble):

{
  "sentiment_score": <-1.0 very negative to +1.0 very positive, 0.0 if neutral/no relevant news>,
  "risk_flags": [<zero or more from: "labor_dispute", "regulatory_action", "bankruptcy_risk", "exec_departure", "ma_activity", "cyber_incident", "recall", "sanctions", "lawsuit", "supply_disruption", "financial_distress", "fraud_investigation">],
  "severity": <"none" | "low" | "medium" | "high" | "critical">,
  "risk_narrative": "<2-3 sentences summarizing the risk landscape for this supplier based on the news>",
  "headline": "<most risk-relevant headline from the articles, or empty string if no relevant news>",
  "headline_url": "<URL of the most relevant article, or empty string>",
  "article_confidence": <"high" if 3+ full-text articles, "medium" if 1-2 full-text, "low" if snippets only>
}

Severity guide:
- none: No negative signals, business as usual
- low: Minor issues, no material impact expected
- medium: Meaningful risk, warrants monitoring
- high: Significant risk, may affect supply continuity or relationship
- critical: Imminent risk — bankruptcy, sanctions, major regulatory action

Return ONLY the JSON object.`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("")
      .trim()
      .replace(/^```json?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    return JSON.parse(raw) as RiskClassification;
  } catch (err) {
    console.error(`[NewsService] Claude classification failed for ${supplierName}:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Step 4: Upsert supplier_risk_profiles
// ---------------------------------------------------------------------------
function upsertRiskProfile(
  engagementId: number,
  supplierName: string,
  classification: RiskClassification,
): void {
  const now = new Date().toISOString();

  // Compute overall_risk_score (0-100)
  // Base: severity → score
  const severityScore: Record<string, number> = {
    none: 0, low: 20, medium: 45, high: 70, critical: 95,
  };
  const base = severityScore[classification.severity] ?? 0;
  // Adjust by number of risk flags
  const flagBoost = Math.min(classification.risk_flags.length * 5, 20);
  // Adjust by sentiment (negative → higher risk)
  const sentimentAdj = Math.round((1 - ((classification.sentiment_score + 1) / 2)) * 10);
  const overall_risk_score = Math.min(100, base + flagBoost + sentimentAdj);

  db.run(sql`
    INSERT INTO supplier_risk_profiles (
      engagement_id, supplier_name,
      news_sentiment_score, news_risk_flags,
      latest_news_headline, latest_news_url,
      article_confidence, overall_risk_score,
      risk_narrative, last_refreshed_at
    ) VALUES (
      ${engagementId}, ${supplierName},
      ${classification.sentiment_score},
      ${JSON.stringify(classification.risk_flags)},
      ${classification.headline || null},
      ${classification.headline_url || null},
      ${classification.article_confidence},
      ${overall_risk_score},
      ${classification.risk_narrative},
      ${now}
    )
    ON CONFLICT(engagement_id, supplier_name) DO UPDATE SET
      news_sentiment_score  = excluded.news_sentiment_score,
      news_risk_flags       = excluded.news_risk_flags,
      latest_news_headline  = excluded.latest_news_headline,
      latest_news_url       = excluded.latest_news_url,
      article_confidence    = excluded.article_confidence,
      overall_risk_score    = excluded.overall_risk_score,
      risk_narrative        = excluded.risk_narrative,
      last_refreshed_at     = excluded.last_refreshed_at
  `);
}

// ---------------------------------------------------------------------------
// Public: scan a single supplier
// ---------------------------------------------------------------------------
export async function scanSupplier(
  engagementId: number,
  supplierName: string,
  progressCb?: (pct: number, msg: string) => void,
): Promise<{ supplier: string; risk_score: number | null; severity: string; flags: string[] }> {
  progressCb?.(10, `Fetching news for ${supplierName}…`);
  const rawArticles = await fetchSupplierNews(supplierName);

  if (rawArticles.length === 0) {
    progressCb?.(100, `No news found for ${supplierName}`);
    return { supplier: supplierName, risk_score: null, severity: "none", flags: [] };
  }

  progressCb?.(40, `Extracting full text for ${rawArticles.length} articles…`);
  const enrichedArticles = await extractArticleTexts(rawArticles, supplierName);

  progressCb?.(70, `Classifying risk via Claude…`);
  const classification = await classifyRisk(supplierName, enrichedArticles);

  if (!classification) {
    progressCb?.(100, `Classification failed for ${supplierName}`);
    return { supplier: supplierName, risk_score: null, severity: "none", flags: [] };
  }

  progressCb?.(90, `Updating risk profile…`);
  upsertRiskProfile(engagementId, supplierName, classification);

  progressCb?.(100, `${supplierName} — severity: ${classification.severity}`);
  return {
    supplier: supplierName,
    risk_score: Math.min(100, Math.round(
      ({ none: 0, low: 20, medium: 45, high: 70, critical: 95 }[classification.severity] ?? 0) +
      classification.risk_flags.length * 5,
    )),
    severity: classification.severity,
    flags: classification.risk_flags,
  };
}

// ---------------------------------------------------------------------------
// Public: scan top-N suppliers for an engagement (job handler)
// ---------------------------------------------------------------------------
export async function runNewsScan(
  payload: Record<string, unknown>,
  progressCb: (pct: number, msg: string) => void,
): Promise<{ scanned: number; high_risk: number; results: unknown[] }> {
  const engagementId = Number(payload.engagement_id);
  const topN = Number(payload.top_n ?? 20);

  progressCb(5, "Loading top suppliers by spend…");

  // Get top suppliers by spend
  const topSuppliers = db.all(sql`
    SELECT normalized_supplier_name as name, SUM(amount) as spend
    FROM spend_records
    WHERE engagement_id = ${engagementId}
      AND normalized_supplier_name IS NOT NULL
      AND normalized_supplier_name != ''
    GROUP BY normalized_supplier_name
    ORDER BY spend DESC
    LIMIT ${topN}
  `) as { name: string; spend: number }[];

  if (topSuppliers.length === 0) {
    progressCb(100, "No suppliers found — import spend data first");
    return { scanned: 0, high_risk: 0, results: [] };
  }

  progressCb(10, `Scanning ${topSuppliers.length} suppliers…`);

  const results: Array<{ supplier: string; risk_score: number | null; severity: string; flags: string[] }> = [];
  let highRisk = 0;

  for (let i = 0; i < topSuppliers.length; i++) {
    const supplier = topSuppliers[i];
    const pct = Math.round(10 + (i / topSuppliers.length) * 85);
    progressCb(pct, `[${i + 1}/${topSuppliers.length}] Scanning ${supplier.name}…`);

    const result = await scanSupplier(engagementId, supplier.name);
    results.push(result);
    if (result.severity === "high" || result.severity === "critical") highRisk++;

    // Rate limit: 1.5s between Claude calls to avoid overload
    if (i < topSuppliers.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  progressCb(100, `Scan complete — ${highRisk} high/critical risk suppliers found`);
  return { scanned: topSuppliers.length, high_risk: highRisk, results };
}

// ---------------------------------------------------------------------------
// Public: get risk profiles for an engagement
// ---------------------------------------------------------------------------
export function getRiskProfiles(engagementId: number) {
  return db
    .select()
    .from(supplier_risk_profiles)
    .where(eq(supplier_risk_profiles.engagement_id, engagementId))
    .all();
}

// ---------------------------------------------------------------------------
// Public: get RSS trade journal items (via sidecar feedparser)
// ---------------------------------------------------------------------------
export async function getRssItems(feedUrls?: string[]): Promise<unknown[]> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/api/extract/rss`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feed_urls: feedUrls ?? [], max_items_per_feed: 15 }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) return [];
    const data = await resp.json() as { items?: unknown[] };
    return data.items ?? [];
  } catch {
    return [];
  }
}
