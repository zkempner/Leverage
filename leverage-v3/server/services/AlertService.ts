/**
 * LEVERAGE v3 — AlertService (P2-08, P2-09)
 *
 * Generates watchlist_alerts for:
 *   - Commodity price spikes (MoM change > 5% in market_data_cache)
 *   - Savings at-risk (YTD realization < 50% of prorated target)
 *   - Contract expiry (30/60/90 day windows) — already handled in ContractExtractionService
 *
 * Registered as job handler "alert_scan".
 * Also provides read helpers used by the alerts UI.
 */

import { db } from "../storage";
import {
  watchlist_alerts, market_data_cache, savings_initiatives,
  realization_entries, engagements,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Commodity spike detection (P2-08)
// ---------------------------------------------------------------------------
export function runCommoditySpikeCheck(engagementId: number): number {
  const now = new Date().toISOString();
  let created = 0;

  // Get all market data with MoM change
  const commodities = db.all(sql`
    SELECT series_id, series_name, category_tag, value, unit, mom_change_pct, yoy_change_pct, fetched_at
    FROM market_data_cache
    WHERE mom_change_pct IS NOT NULL
      AND ABS(mom_change_pct) > 5
      AND category_tag IN ('commodity_metal','commodity_energy','commodity_ag','ppi')
  `) as {
    series_id: string; series_name: string; category_tag: string;
    value: number; unit: string; mom_change_pct: number; yoy_change_pct: number | null;
    fetched_at: string;
  }[];

  for (const c of commodities) {
    const direction = c.mom_change_pct > 0 ? "spike" : "drop";
    const severity = Math.abs(c.mom_change_pct) > 15 ? "critical"
      : Math.abs(c.mom_change_pct) > 10 ? "high"
      : Math.abs(c.mom_change_pct) > 5 ? "medium" : "low";

    // Deduplicate: don't create if an unresolved alert for this commodity already exists this week
    const existing = db.get(sql`
      SELECT id FROM watchlist_alerts
      WHERE engagement_id = ${engagementId}
        AND alert_type = 'commodity_spike'
        AND title LIKE ${`%${c.series_id}%`}
        AND is_resolved = 0
        AND created_at > ${new Date(Date.now() - 7 * 86400000).toISOString()}
    `);
    if (existing) continue;

    const sign = c.mom_change_pct > 0 ? "+" : "";
    db.insert(watchlist_alerts).values({
      engagement_id: engagementId,
      alert_type: "commodity_spike",
      severity,
      title: `${c.series_name ?? c.series_id}: ${sign}${c.mom_change_pct.toFixed(1)}% MoM`,
      message: `${c.series_name} has moved ${sign}${c.mom_change_pct.toFixed(1)}% month-over-month${c.yoy_change_pct !== null ? ` (${c.yoy_change_pct > 0 ? "+" : ""}${c.yoy_change_pct.toFixed(1)}% YoY)` : ""}. Current value: ${c.value} ${c.unit ?? ""}. Review impact on relevant spend categories and benchmark assumptions.`,
      related_entity_type: "commodity",
      is_acknowledged: 0,
      is_resolved: 0,
      created_at: now,
    }).run();
    created++;
  }

  return created;
}

// ---------------------------------------------------------------------------
// Savings at-risk detection (P2-09)
// ---------------------------------------------------------------------------
export function runSavingsAtRiskCheck(engagementId: number): number {
  const now = new Date();
  const nowIso = now.toISOString();
  let created = 0;

  // Get all in-progress initiatives with targets
  const initiatives = db.all(sql`
    SELECT i.id, i.name, i.target_amount, i.realized_amount, i.phase,
           i.expected_realization_date, i.is_at_risk,
           COALESCE(SUM(r.amount), 0) as actual_realized
    FROM savings_initiatives i
    LEFT JOIN realization_entries r ON r.initiative_id = i.id
    WHERE i.engagement_id = ${engagementId}
      AND i.status IN ('approved','in_progress')
      AND i.target_amount > 0
    GROUP BY i.id
  `) as {
    id: number; name: string; target_amount: number; realized_amount: number;
    phase: string; expected_realization_date: string | null; is_at_risk: number;
    actual_realized: number;
  }[];

  for (const init of initiatives) {
    const target = init.target_amount;
    const realized = init.actual_realized || init.realized_amount || 0;
    const realizationRate = target > 0 ? realized / target : 0;

    // Determine prorated expected realization based on phase
    let proratedExpected = 0;
    if (init.expected_realization_date) {
      const realization = new Date(init.expected_realization_date);
      const engagement = db.select().from(engagements).where(eq(engagements.id, engagementId)).get();
      const startDate = engagement?.start_date ? new Date(engagement.start_date) : new Date(now.getTime() - 90 * 86400000);
      const totalDays = (realization.getTime() - startDate.getTime()) / 86400000;
      const elapsedDays = (now.getTime() - startDate.getTime()) / 86400000;
      const progress = totalDays > 0 ? Math.min(1, elapsedDays / totalDays) : 0;
      proratedExpected = target * progress * 0.5; // flag if < 50% of prorated
    } else {
      // No date — flag if any in-progress initiative has < 10% realized
      proratedExpected = target * 0.1;
    }

    const isAtRisk = realized < proratedExpected;
    if (!isAtRisk) continue;

    // Update initiative is_at_risk flag
    db.update(savings_initiatives)
      .set({ is_at_risk: 1, at_risk_reason: `Realization ${(realizationRate * 100).toFixed(0)}% of target vs. expected pace` })
      .where(eq(savings_initiatives.id, init.id))
      .run();

    // Don't duplicate unresolved alert for same initiative
    const existing = db.get(sql`
      SELECT id FROM watchlist_alerts
      WHERE engagement_id = ${engagementId}
        AND alert_type = 'savings_at_risk'
        AND related_entity_id = ${init.id}
        AND is_resolved = 0
    `);
    if (existing) continue;

    const fmt = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${(n / 1000).toFixed(0)}K`;
    const severity = realizationRate < 0.1 ? "high" : "medium";

    db.insert(watchlist_alerts).values({
      engagement_id: engagementId,
      alert_type: "savings_at_risk",
      severity,
      title: `Savings at risk: ${init.name}`,
      message: `Initiative "${init.name}" has realized ${fmt(realized)} of ${fmt(target)} target (${(realizationRate * 100).toFixed(0)}%). Expected realization pace is not being met. Review blockers and update status.`,
      related_entity_type: "initiative",
      related_entity_id: init.id,
      is_acknowledged: 0,
      is_resolved: 0,
      created_at: nowIso,
    }).run();
    created++;
  }

  return created;
}

// ---------------------------------------------------------------------------
// Combined nightly alert scan (job handler)
// ---------------------------------------------------------------------------
export async function runAlertScan(
  payload: Record<string, unknown>,
  progressCb: (pct: number, msg: string) => void,
): Promise<{ engagement_id: number; commodity_alerts: number; savings_alerts: number; total: number }> {
  const engagementId = Number(payload.engagement_id);

  progressCb(20, "Checking commodity price spikes…");
  const commodityAlerts = runCommoditySpikeCheck(engagementId);

  progressCb(60, "Checking savings realization pace…");
  const savingsAlerts = runSavingsAtRiskCheck(engagementId);

  progressCb(100, `Alert scan complete — ${commodityAlerts + savingsAlerts} new alerts`);

  return {
    engagement_id: engagementId,
    commodity_alerts: commodityAlerts,
    savings_alerts: savingsAlerts,
    total: commodityAlerts + savingsAlerts,
  };
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------
export function getAlerts(engagementId: number, onlyUnresolved = true) {
  return db.all(sql`
    SELECT * FROM watchlist_alerts
    WHERE engagement_id = ${engagementId}
    ${onlyUnresolved ? sql.raw("AND is_resolved = 0") : sql.raw("")}
    ORDER BY
      CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      created_at DESC
  `);
}

export function getAlertCounts(engagementId: number): {
  total: number; critical: number; high: number; unacknowledged: number;
} {
  const row = db.get(sql`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical,
      SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) as high,
      SUM(CASE WHEN is_acknowledged = 0 THEN 1 ELSE 0 END) as unacknowledged
    FROM watchlist_alerts
    WHERE engagement_id = ${engagementId} AND is_resolved = 0
  `) as { total: number; critical: number; high: number; unacknowledged: number };
  return row ?? { total: 0, critical: 0, high: 0, unacknowledged: 0 };
}

export function acknowledgeAlert(alertId: number) {
  db.update(watchlist_alerts)
    .set({ is_acknowledged: 1, acknowledged_at: new Date().toISOString() })
    .where(eq(watchlist_alerts.id, alertId))
    .run();
}

export function resolveAlert(alertId: number) {
  db.update(watchlist_alerts)
    .set({ is_resolved: 1, resolved_at: new Date().toISOString() })
    .where(eq(watchlist_alerts.id, alertId))
    .run();
}

export function bulkResolveAlerts(engagementId: number, alertType?: string) {
  const now = new Date().toISOString();
  if (alertType) {
    db.run(sql`
      UPDATE watchlist_alerts SET is_resolved = 1, resolved_at = ${now}
      WHERE engagement_id = ${engagementId} AND alert_type = ${alertType} AND is_resolved = 0
    `);
  } else {
    db.run(sql`
      UPDATE watchlist_alerts SET is_resolved = 1, resolved_at = ${now}
      WHERE engagement_id = ${engagementId} AND is_resolved = 0
    `);
  }
}
