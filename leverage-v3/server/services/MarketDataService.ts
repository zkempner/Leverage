/**
 * LEVERAGE v3 — MarketDataService
 *
 * TTL-aware cache layer over the Python sidecar for all market data:
 *   - Commodities via yfinance (20 tickers, TTL 1h)
 *   - FRED macro/PPI series (TTL 24h)
 *   - EIA energy prices (TTL 12h)
 *
 * All data flows through market_data_cache (Table 23).
 * Callers never hit the sidecar directly — always go through this service.
 */

import { db } from "../storage";
import { market_data_cache } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

const SIDECAR_URL = process.env.SIDECAR_URL ?? "http://localhost:5001";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface MarketDataPoint {
  series_id: string;
  series_name: string | null;
  category_tag: string | null;
  value: number | null;
  unit: string | null;
  period: string | null;
  yoy_change_pct: number | null;
  mom_change_pct: number | null;
  data_source: string;
  ttl_hours: number;
  fetched_at: string;
  /** true if data came from cache, false if freshly fetched */
  from_cache?: boolean;
}

interface SidecarCommodityResponse {
  results: MarketDataPoint[];
  errors: string[];
  fetched_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isCacheStale(fetchedAt: string | null, ttlHours: number | null): boolean {
  if (!fetchedAt || !ttlHours) return true;
  const age = (Date.now() - new Date(fetchedAt).getTime()) / 1000 / 3600;
  return age > ttlHours;
}

function upsertCacheRow(point: MarketDataPoint): void {
  const now = new Date().toISOString();
  // Use raw SQL upsert keyed on (data_source, series_id)
  db.run(sql`
    INSERT INTO market_data_cache
      (data_source, series_id, series_name, category_tag, value, unit, period,
       yoy_change_pct, mom_change_pct, fetched_at, ttl_hours, raw_json)
    VALUES
      (${point.data_source}, ${point.series_id}, ${point.series_name ?? null},
       ${point.category_tag ?? null}, ${point.value ?? null}, ${point.unit ?? null},
       ${point.period ?? null}, ${point.yoy_change_pct ?? null},
       ${point.mom_change_pct ?? null}, ${now}, ${point.ttl_hours},
       ${JSON.stringify(point)})
    ON CONFLICT(data_source, series_id) DO UPDATE SET
      series_name       = excluded.series_name,
      category_tag      = excluded.category_tag,
      value             = excluded.value,
      unit              = excluded.unit,
      period            = excluded.period,
      yoy_change_pct    = excluded.yoy_change_pct,
      mom_change_pct    = excluded.mom_change_pct,
      fetched_at        = excluded.fetched_at,
      ttl_hours         = excluded.ttl_hours,
      raw_json          = excluded.raw_json
  `);
}

async function callSidecar<T>(path: string, body: unknown): Promise<T> {
  const url = `${SIDECAR_URL}${path}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Sidecar ${path} returned ${resp.status}: ${text}`);
  }
  return resp.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch all 20 commodity tickers.
 * Returns cached rows where TTL is still valid; refreshes stale/missing ones.
 */
export async function fetchCommodities(forceRefresh = false): Promise<{
  data: MarketDataPoint[];
  errors: string[];
  stale_tickers: string[];
}> {
  const ALL_TICKERS = [
    "GC=F","HG=F","ALI=F","SI=F","NI=F","PA=F","PL=F",
    "CL=F","BZ=F","NG=F",
    "ZW=F","ZC=F","ZS=F","CT=F","KC=F","SB=F",
    "LBS=F","HR=F",
  ];

  // Pull all cached rows for yfinance commodities
  const cached = db
    .select()
    .from(market_data_cache)
    .where(eq(market_data_cache.data_source, "yfinance"))
    .all();

  const cachedMap = new Map(cached.map((r) => [r.series_id, r]));

  const stale_tickers: string[] = [];
  const fresh: MarketDataPoint[] = [];

  for (const ticker of ALL_TICKERS) {
    const row = cachedMap.get(ticker);
    if (!forceRefresh && row && !isCacheStale(row.fetched_at, row.ttl_hours)) {
      fresh.push({ ...row, from_cache: true } as unknown as MarketDataPoint);
    } else {
      stale_tickers.push(ticker);
    }
  }

  let errors: string[] = [];

  if (stale_tickers.length > 0) {
    try {
      const result = await callSidecar<SidecarCommodityResponse>("/api/commodities", {
        tickers: stale_tickers,
      });
      for (const point of result.results) {
        upsertCacheRow(point);
        fresh.push({ ...point, from_cache: false });
      }
      errors = result.errors ?? [];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[MarketDataService] Commodity fetch failed:", msg);
      // Fall back to any stale cache data we have
      for (const ticker of stale_tickers) {
        const row = cachedMap.get(ticker);
        if (row) fresh.push({ ...row, from_cache: true } as unknown as MarketDataPoint);
      }
      errors.push(`Sidecar unavailable: ${msg}`);
    }
  }

  // Sort: metals first, then energy, then ag, then other
  const ORDER = ["commodity_metal", "commodity_energy", "commodity_ag", "ppi", "macro", "labor", "freight", "fx"];
  fresh.sort((a, b) => {
    const ai = ORDER.indexOf(a.category_tag ?? "");
    const bi = ORDER.indexOf(b.category_tag ?? "");
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return { data: fresh, errors, stale_tickers };
}

/**
 * Fetch FRED macro/PPI series.
 * Default series: CPI, metals PPI, chemicals PPI, lumber PPI, Fed Funds, 10Y Treasury, ECI
 */
export async function fetchFredSeries(
  seriesIds: string[] = ["CPIAUCSL", "WPU10", "WPU06", "WPU05", "WPU091", "FEDFUNDS", "GS10", "ECI"],
  forceRefresh = false,
): Promise<{ data: MarketDataPoint[]; errors: string[] }> {
  const cached = db
    .select()
    .from(market_data_cache)
    .where(eq(market_data_cache.data_source, "fred"))
    .all();
  const cachedMap = new Map(cached.map((r) => [r.series_id, r]));

  const stale: string[] = [];
  const fresh: MarketDataPoint[] = [];

  for (const id of seriesIds) {
    const row = cachedMap.get(id);
    if (!forceRefresh && row && !isCacheStale(row.fetched_at, row.ttl_hours)) {
      fresh.push({ ...row, from_cache: true } as unknown as MarketDataPoint);
    } else {
      stale.push(id);
    }
  }

  let errors: string[] = [];

  if (stale.length > 0) {
    try {
      const result = await callSidecar<SidecarCommodityResponse>("/api/fred", { series_ids: stale });
      for (const point of result.results) {
        upsertCacheRow(point);
        fresh.push({ ...point, from_cache: false });
      }
      errors = result.errors ?? [];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[MarketDataService] FRED fetch failed:", msg);
      for (const id of stale) {
        const row = cachedMap.get(id);
        if (row) fresh.push({ ...row, from_cache: true } as unknown as MarketDataPoint);
      }
      errors.push(`FRED sidecar unavailable: ${msg}`);
    }
  }

  return { data: fresh, errors };
}

/**
 * Fetch EIA energy series.
 */
export async function fetchEiaSeries(
  seriesIds: string[] = ["PET.RWTC.W", "NG.RNGWHHD.W"],
  forceRefresh = false,
): Promise<{ data: MarketDataPoint[]; errors: string[] }> {
  const cached = db
    .select()
    .from(market_data_cache)
    .where(eq(market_data_cache.data_source, "eia"))
    .all();
  const cachedMap = new Map(cached.map((r) => [r.series_id, r]));

  const stale: string[] = [];
  const fresh: MarketDataPoint[] = [];

  for (const id of seriesIds) {
    const row = cachedMap.get(id);
    if (!forceRefresh && row && !isCacheStale(row.fetched_at, row.ttl_hours)) {
      fresh.push({ ...row, from_cache: true } as unknown as MarketDataPoint);
    } else {
      stale.push(id);
    }
  }

  let errors: string[] = [];

  if (stale.length > 0) {
    try {
      const result = await callSidecar<SidecarCommodityResponse>("/api/eia", { series_ids: stale });
      for (const point of result.results) {
        upsertCacheRow(point);
        fresh.push({ ...point, from_cache: false });
      }
      errors = result.errors ?? [];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[MarketDataService] EIA fetch failed:", msg);
      for (const id of stale) {
        const row = cachedMap.get(id);
        if (row) fresh.push({ ...row, from_cache: true } as unknown as MarketDataPoint);
      }
      errors.push(`EIA sidecar unavailable: ${msg}`);
    }
  }

  return { data: fresh, errors };
}

/**
 * Return everything currently in market_data_cache — no refresh.
 * Useful for the UI "last known" display.
 */
export function getCachedMarketData(): MarketDataPoint[] {
  return db
    .select()
    .from(market_data_cache)
    .all() as unknown as MarketDataPoint[];
}

/**
 * Check sidecar health.
 */
export async function checkSidecarHealth(): Promise<{ ok: boolean; detail: string }> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (resp.ok) {
      const body = await resp.json() as Record<string, unknown>;
      return { ok: true, detail: JSON.stringify(body) };
    }
    return { ok: false, detail: `HTTP ${resp.status}` };
  } catch (err: unknown) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
