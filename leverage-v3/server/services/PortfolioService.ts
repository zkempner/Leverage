/**
 * LEVERAGE v3 — PortfolioService (P3-01, P3-02)
 *
 * Aggregates KPIs across all active engagements into portfolio_snapshots.
 * Provides data for the MD Portfolio Command Center.
 *
 * Nightly job handler: "portfolio_snapshot"
 */

import { db } from "../storage";
import {
  engagements, savings_initiatives, realization_entries,
  watchlist_alerts, portfolio_snapshots,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface EngagementKPI {
  id: number;
  name: string;
  portfolio_company: string;
  pe_sponsor: string | null;
  industry: string | null;
  status: string;
  total_addressable_spend: number | null;
  pipeline_total: number;
  risk_adjusted_total: number;
  realized_total: number;
  savings_rate_pct: number | null;
  initiative_count: number;
  at_risk_count: number;
  critical_alert_count: number;
  start_date: string | null;
}

export interface PortfolioSummary {
  active_engagements: number;
  total_pipeline: number;
  total_risk_adjusted: number;
  total_realized: number;
  avg_savings_rate_pct: number | null;
  at_risk_initiatives: number;
  critical_alerts: number;
  engagements: EngagementKPI[];
  snapshot_date: string;
}

// ---------------------------------------------------------------------------
// Compute per-engagement KPIs
// ---------------------------------------------------------------------------
function computeEngagementKPIs(engagementId: number): Omit<EngagementKPI, "id" | "name" | "portfolio_company" | "pe_sponsor" | "industry" | "status" | "total_addressable_spend" | "start_date"> {
  const pipeline = db.get(sql`
    SELECT
      COALESCE(SUM(target_amount), 0) as pipeline_total,
      COALESCE(SUM(risk_adjusted_target), 0) as risk_adjusted_total,
      COUNT(*) as initiative_count,
      SUM(CASE WHEN is_at_risk = 1 THEN 1 ELSE 0 END) as at_risk_count
    FROM savings_initiatives
    WHERE engagement_id = ${engagementId}
  `) as { pipeline_total: number; risk_adjusted_total: number; initiative_count: number; at_risk_count: number };

  const realized = db.get(sql`
    SELECT COALESCE(SUM(r.amount), 0) as realized_total
    FROM realization_entries r
    JOIN savings_initiatives i ON i.id = r.initiative_id
    WHERE i.engagement_id = ${engagementId}
  `) as { realized_total: number };

  const alerts = db.get(sql`
    SELECT COUNT(*) as critical_alert_count
    FROM watchlist_alerts
    WHERE engagement_id = ${engagementId}
      AND severity = 'critical'
      AND is_resolved = 0
  `) as { critical_alert_count: number };

  const realizedTotal = realized?.realized_total ?? 0;
  const pipelineTotal = pipeline?.pipeline_total ?? 0;

  return {
    pipeline_total: pipelineTotal,
    risk_adjusted_total: pipeline?.risk_adjusted_total ?? 0,
    realized_total: realizedTotal,
    savings_rate_pct: pipelineTotal > 0 ? Math.round((realizedTotal / pipelineTotal) * 1000) / 10 : null,
    initiative_count: pipeline?.initiative_count ?? 0,
    at_risk_count: pipeline?.at_risk_count ?? 0,
    critical_alert_count: alerts?.critical_alert_count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Build full portfolio summary (live, no snapshot)
// ---------------------------------------------------------------------------
export function getPortfolioSummary(): PortfolioSummary {
  const allEngagements = db.select().from(engagements).all();
  const active = allEngagements.filter((e) => e.status === "active");

  const engagementKPIs: EngagementKPI[] = active.map((e) => ({
    id: e.id,
    name: e.name,
    portfolio_company: e.portfolio_company,
    pe_sponsor: e.pe_sponsor ?? null,
    industry: e.industry ?? null,
    status: e.status,
    total_addressable_spend: e.total_addressable_spend ?? null,
    start_date: e.start_date ?? null,
    ...computeEngagementKPIs(e.id),
  }));

  const totalPipeline = engagementKPIs.reduce((s, e) => s + e.pipeline_total, 0);
  const totalRiskAdj = engagementKPIs.reduce((s, e) => s + e.risk_adjusted_total, 0);
  const totalRealized = engagementKPIs.reduce((s, e) => s + e.realized_total, 0);
  const avgSavingsRate = engagementKPIs.length > 0
    ? engagementKPIs
        .filter((e) => e.savings_rate_pct !== null)
        .reduce((s, e, _, arr) => s + (e.savings_rate_pct ?? 0) / arr.length, 0)
    : null;
  const atRisk = engagementKPIs.reduce((s, e) => s + e.at_risk_count, 0);
  const criticalAlerts = engagementKPIs.reduce((s, e) => s + e.critical_alert_count, 0);

  return {
    active_engagements: active.length,
    total_pipeline: totalPipeline,
    total_risk_adjusted: totalRiskAdj,
    total_realized: totalRealized,
    avg_savings_rate_pct: avgSavingsRate ? Math.round(avgSavingsRate * 10) / 10 : null,
    at_risk_initiatives: atRisk,
    critical_alerts: criticalAlerts,
    engagements: engagementKPIs.sort((a, b) => b.risk_adjusted_total - a.risk_adjusted_total),
    snapshot_date: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Save nightly snapshot
// ---------------------------------------------------------------------------
export function savePortfolioSnapshot(): void {
  const summary = getPortfolioSummary();
  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();

  // Compute simple peer benchmarks (anonymized — min 2 engagements required)
  const withRates = summary.engagements.filter((e) => e.savings_rate_pct !== null);
  const peerBenchmark = withRates.length >= 2 ? {
    median_savings_rate: withRates
      .map((e) => e.savings_rate_pct ?? 0)
      .sort((a, b) => a - b)[Math.floor(withRates.length / 2)],
    sample_size: withRates.length,
    note: "Anonymized — based on active engagements in this instance",
  } : null;

  db.run(sql`
    INSERT INTO portfolio_snapshots (
      snapshot_date, total_pipeline_usd, total_realized_usd,
      avg_savings_rate_pct, at_risk_initiative_count,
      active_engagement_count, peer_benchmark_json, computed_at
    ) VALUES (
      ${today},
      ${summary.total_pipeline},
      ${summary.total_realized},
      ${summary.avg_savings_rate_pct},
      ${summary.at_risk_initiatives},
      ${summary.active_engagements},
      ${peerBenchmark ? JSON.stringify(peerBenchmark) : null},
      ${now}
    )
    ON CONFLICT(snapshot_date) DO UPDATE SET
      total_pipeline_usd = excluded.total_pipeline_usd,
      total_realized_usd = excluded.total_realized_usd,
      avg_savings_rate_pct = excluded.avg_savings_rate_pct,
      at_risk_initiative_count = excluded.at_risk_initiative_count,
      active_engagement_count = excluded.active_engagement_count,
      peer_benchmark_json = excluded.peer_benchmark_json,
      computed_at = excluded.computed_at
  `);
}

// ---------------------------------------------------------------------------
// Job handler
// ---------------------------------------------------------------------------
export async function runPortfolioSnapshot(
  payload: Record<string, unknown>,
  progressCb: (pct: number, msg: string) => void,
): Promise<PortfolioSummary> {
  progressCb(30, "Aggregating engagement KPIs…");
  const summary = getPortfolioSummary();

  progressCb(70, "Saving portfolio snapshot…");
  savePortfolioSnapshot();

  progressCb(100, `Snapshot saved — ${summary.active_engagements} active engagements, $${(summary.total_pipeline / 1e6).toFixed(1)}M pipeline`);
  return summary;
}

// ---------------------------------------------------------------------------
// Historical snapshots for trend charts
// ---------------------------------------------------------------------------
export function getSnapshotHistory(days = 30) {
  return db.all(sql`
    SELECT * FROM portfolio_snapshots
    ORDER BY snapshot_date DESC
    LIMIT ${days}
  `);
}

// ---------------------------------------------------------------------------
// Fix: add UNIQUE constraint to portfolio_snapshots.snapshot_date
// Called at startup if not already present
// ---------------------------------------------------------------------------
export function ensurePortfolioSnapshotIndex() {
  try {
    db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolio_snapshot_date ON portfolio_snapshots(snapshot_date)`);
  } catch {
    // already exists
  }
}
