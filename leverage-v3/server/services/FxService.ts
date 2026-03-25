/**
 * LEVERAGE v3 — FxService (P2-06, P2-07)
 *
 * ECB FX API → fx_rates table (TTL 4h)
 * Exposure analysis: spend by currency, volatility risk, hedging flags
 *
 * ECB endpoint: https://data-api.ecb.europa.eu/service/data/EXR/
 * Returns 40+ currency pairs to EUR. We convert EUR→USD using USD/EUR rate.
 */

import { db } from "../storage";
import { fx_rates, spend_records, engagements } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const ECB_BASE = "https://data-api.ecb.europa.eu/service/data/EXR/";
const FX_TTL_HOURS = 4;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface FxRate {
  currency: string;
  rate_to_usd: number;
  rate_date: string;
  source: "ecb" | "manual" | "static_reference";
}

export interface CurrencyExposure {
  currency: string;
  total_spend_original: number;
  total_spend_usd: number;
  record_count: number;
  pct_of_total: number;
  rate_to_usd: number | null;
  volatility_flag: boolean;  // true if currency is high-volatility
  rate_source: string | null;
}

// High-volatility currencies (emerging markets, sanctions-adjacent)
const HIGH_VOLATILITY_CURRENCIES = new Set([
  "TRY", "ARS", "VES", "NGN", "EGP", "PKR", "BDT", "UAH", "RUB",
  "IRR", "ZWL", "LBP", "SDG", "SYP", "MMK",
]);

// Static fallback rates (USD base, approximate) if ECB is unavailable
const STATIC_FALLBACK: Record<string, number> = {
  EUR: 1.08, GBP: 1.27, CAD: 0.74, AUD: 0.65, JPY: 0.0067,
  CHF: 1.12, CNY: 0.138, INR: 0.012, MXN: 0.058, BRL: 0.20,
  KRW: 0.00075, SGD: 0.74, HKD: 0.128, NOK: 0.095, SEK: 0.095,
  DKK: 0.145, PLN: 0.25, CZK: 0.044, HUF: 0.0028, RON: 0.22,
  TRY: 0.031, ARS: 0.0011, ZAR: 0.055, IDR: 0.000065, THB: 0.028,
  VND: 0.000040, PHP: 0.018, MYR: 0.22, NZD: 0.60,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isCacheStale(rateDate: string | null): boolean {
  if (!rateDate) return true;
  const age = (Date.now() - new Date(rateDate).getTime()) / 3_600_000;
  return age > FX_TTL_HOURS;
}

// ---------------------------------------------------------------------------
// ECB fetch — returns EUR-based rates, converted to USD
// ---------------------------------------------------------------------------
async function fetchEcbRates(): Promise<Record<string, number>> {
  // First get EUR/USD rate
  let eurUsd = 1.08; // fallback
  try {
    const usdResp = await fetch(
      `${ECB_BASE}D.USD.EUR.SP00.A?format=jsondata&lastNObservations=1`,
      { signal: AbortSignal.timeout(8_000), headers: { Accept: "application/json" } },
    );
    if (usdResp.ok) {
      const d = await usdResp.json() as any;
      const obs = d?.dataSets?.[0]?.series?.["0:0:0:0:0"]?.observations;
      if (obs) {
        const vals = Object.values(obs) as number[][];
        if (vals.length > 0) eurUsd = 1 / (vals[vals.length - 1][0] as number);
      }
    }
  } catch {
    console.warn("[FxService] Could not fetch EUR/USD, using fallback");
  }

  // Fetch a batch of major currencies vs EUR
  const CURRENCIES = [
    "GBP", "JPY", "CHF", "CAD", "AUD", "CNY", "INR", "MXN", "BRL",
    "KRW", "SGD", "HKD", "NOK", "SEK", "DKK", "PLN", "CZK", "HUF",
    "RON", "TRY", "ARS", "ZAR", "IDR", "THB", "VND", "PHP", "MYR",
    "NZD", "CLP", "COP", "NGN", "EGP", "SAR", "AED", "ILS", "QAR",
  ];

  const ratesVsUsd: Record<string, number> = { USD: 1.0, EUR: eurUsd };

  for (const cur of CURRENCIES) {
    try {
      const url = `${ECB_BASE}D.${cur}.EUR.SP00.A?format=jsondata&lastNObservations=1`;
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(5_000),
        headers: { Accept: "application/json" },
      });
      if (!resp.ok) {
        ratesVsUsd[cur] = (STATIC_FALLBACK[cur] ?? 1.0);
        continue;
      }
      const data = await resp.json() as any;
      const obs = data?.dataSets?.[0]?.series?.["0:0:0:0:0"]?.observations;
      if (!obs) { ratesVsUsd[cur] = (STATIC_FALLBACK[cur] ?? 1.0); continue; }

      const vals = Object.values(obs) as number[][];
      const rateVsEur = vals[vals.length - 1][0] as number;
      // rateVsEur is units of currency per 1 EUR
      // 1 USD = (1/eurUsd) EUR → 1 USD = (1/eurUsd) * rateVsEur units of currency
      // rate_to_usd = 1 / ((1/eurUsd) * rateVsEur) = eurUsd / rateVsEur
      ratesVsUsd[cur] = eurUsd / rateVsEur;
    } catch {
      ratesVsUsd[cur] = STATIC_FALLBACK[cur] ?? 1.0;
    }

    // Brief delay to avoid ECB rate limits
    await new Promise((r) => setTimeout(r, 100));
  }

  return ratesVsUsd;
}

// ---------------------------------------------------------------------------
// Public: refresh FX rates for an engagement
// ---------------------------------------------------------------------------
export async function refreshFxRates(engagementId: number): Promise<{
  updated: number; source: string; rates: Record<string, number>;
}> {
  // Check if any cached rates are still fresh
  const existing = db.all(sql`
    SELECT currency, rate_date FROM fx_rates WHERE engagement_id = ${engagementId}
  `) as { currency: string; rate_date: string | null }[];

  const allFresh = existing.length > 0 && existing.every((r) => !isCacheStale(r.rate_date));
  if (allFresh) {
    const rates: Record<string, number> = {};
    const rows = db.all(sql`SELECT currency, rate_to_usd FROM fx_rates WHERE engagement_id = ${engagementId}`) as { currency: string; rate_to_usd: number }[];
    for (const r of rows) rates[r.currency] = r.rate_to_usd;
    return { updated: 0, source: "cache", rates };
  }

  let ratesMap: Record<string, number>;
  let source = "ecb";

  try {
    ratesMap = await fetchEcbRates();
  } catch (err) {
    console.warn("[FxService] ECB fetch failed, using static fallback:", err);
    ratesMap = { USD: 1.0, ...STATIC_FALLBACK };
    source = "static_fallback";
  }

  const now = new Date().toISOString();
  const today = now.split("T")[0];
  let updated = 0;

  for (const [currency, rate] of Object.entries(ratesMap)) {
    db.run(sql`
      INSERT INTO fx_rates (engagement_id, currency, rate_to_usd, rate_date, source)
      VALUES (${engagementId}, ${currency}, ${rate}, ${today}, ${source})
      ON CONFLICT(engagement_id, currency) DO UPDATE SET
        rate_to_usd = excluded.rate_to_usd,
        rate_date = excluded.rate_date,
        source = excluded.source
    `);
    updated++;
  }

  return { updated, source, rates: ratesMap };
}

// ---------------------------------------------------------------------------
// Public: exposure analysis
// ---------------------------------------------------------------------------
export function analyzeExposure(engagementId: number): {
  exposures: CurrencyExposure[];
  total_spend_usd: number;
  total_non_usd_spend: number;
  non_usd_pct: number;
  high_volatility_exposure: number;
  currency_count: number;
} {
  // Get spend by currency
  const spendByCurrency = db.all(sql`
    SELECT
      currency,
      SUM(amount) as spend_usd,
      SUM(CASE WHEN original_amount IS NOT NULL THEN original_amount ELSE amount END) as spend_original,
      COUNT(*) as record_count
    FROM spend_records
    WHERE engagement_id = ${engagementId}
      AND currency IS NOT NULL
    GROUP BY currency
    ORDER BY spend_usd DESC
  `) as { currency: string; spend_usd: number; spend_original: number; record_count: number }[];

  // Get current FX rates
  const fxRows = db.all(sql`
    SELECT currency, rate_to_usd, source FROM fx_rates WHERE engagement_id = ${engagementId}
  `) as { currency: string; rate_to_usd: number; source: string }[];
  const fxMap = new Map(fxRows.map((r) => [r.currency, r]));

  const totalSpend = spendByCurrency.reduce((s, r) => s + r.spend_usd, 0);

  const exposures: CurrencyExposure[] = spendByCurrency.map((r) => {
    const fxRow = fxMap.get(r.currency);
    return {
      currency: r.currency,
      total_spend_original: r.spend_original,
      total_spend_usd: r.spend_usd,
      record_count: r.record_count,
      pct_of_total: totalSpend > 0 ? (r.spend_usd / totalSpend) * 100 : 0,
      rate_to_usd: fxRow?.rate_to_usd ?? null,
      volatility_flag: HIGH_VOLATILITY_CURRENCIES.has(r.currency),
      rate_source: fxRow?.source ?? null,
    };
  });

  const nonUsd = exposures.filter((e) => e.currency !== "USD");
  const totalNonUsd = nonUsd.reduce((s, e) => s + e.total_spend_usd, 0);
  const highVol = exposures
    .filter((e) => e.volatility_flag)
    .reduce((s, e) => s + e.total_spend_usd, 0);

  return {
    exposures,
    total_spend_usd: totalSpend,
    total_non_usd_spend: totalNonUsd,
    non_usd_pct: totalSpend > 0 ? (totalNonUsd / totalSpend) * 100 : 0,
    high_volatility_exposure: highVol,
    currency_count: exposures.length,
  };
}

// ---------------------------------------------------------------------------
// Ensure unique index on fx_rates(engagement_id, currency)
// ---------------------------------------------------------------------------
export function ensureFxIndex() {
  try {
    db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_fx_rates_eng_cur ON fx_rates(engagement_id, currency)`);
  } catch { /* already exists */ }
}
