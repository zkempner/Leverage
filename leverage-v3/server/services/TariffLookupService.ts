/**
 * LEVERAGE v3 — TariffLookupService (P2-13)
 *
 * Fetches live HTS tariff rates from USITC DataWeb API.
 * Compares to static rates in tariff_impacts and flags deltas > 2pp.
 * Creates watchlist_alerts for significant changes.
 *
 * USITC DataWeb API: https://dataweb.usitc.gov/
 * Requires free account registration. Key set via USITC_API_KEY env var.
 * Falls back to static engine rates if API unavailable.
 */

import { db } from "../storage";
import { tariff_impacts, watchlist_alerts } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { CATEGORY_TARIFF_PROFILES } from "../engines/tariffs";

const USITC_BASE = "https://dataweb.usitc.gov/tariff/api";
const USITC_KEY = process.env.USITC_API_KEY ?? "";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface LiveTariffRate {
  hts_code: string;
  description: string;
  mfn_rate_pct: number | null;
  effective_rate_pct: number | null;
  country: string;
  source: "usitc_live" | "static_engine";
  fetched_at: string;
}

export interface TariffDelta {
  category: string;
  supplier: string | null;
  country: string;
  hts_chapter: string;
  static_rate: number;
  live_rate: number | null;
  delta_pp: number | null;
  flag: boolean;  // true if |delta| > 2pp
}

// ---------------------------------------------------------------------------
// USITC DataWeb fetch (single HTS chapter)
// Returns MFN rate for a given HTS code and country
// ---------------------------------------------------------------------------
async function fetchUsitcRate(
  htsChapter: string,
  country: string = "CN",
): Promise<number | null> {
  if (!USITC_KEY) return null;

  // Clean HTS chapter to first 4 digits
  const htsCode = htsChapter.replace(/[^0-9]/g, "").padEnd(4, "0").slice(0, 4);

  try {
    const url = new URL(`${USITC_BASE}/tariff`);
    url.searchParams.set("htsno", htsCode);
    url.searchParams.set("reporter", "840"); // US
    url.searchParams.set("partner", country === "CN" ? "156" : "0");
    url.searchParams.set("year", String(new Date().getFullYear()));
    url.searchParams.set("key", USITC_KEY);

    const resp = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
    });

    if (!resp.ok) return null;
    const data = await resp.json() as {
      results?: Array<{ duty_rate?: string; general_rate?: string }>;
    };

    const results = data?.results ?? [];
    if (results.length === 0) return null;

    // Parse rate string like "5.5%" or "5.5 cents/kg" — extract numeric pct
    const rateStr = results[0]?.general_rate ?? results[0]?.duty_rate ?? "";
    const match = rateStr.match(/(\d+\.?\d*)%/);
    if (match) return parseFloat(match[1]);
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Compare live vs static rates for all tariff_impacts in an engagement
// ---------------------------------------------------------------------------
export async function runTariffLookup(
  engagementId: number,
  progressCb: (pct: number, msg: string) => void,
): Promise<{ checked: number; flagged: number; deltas: TariffDelta[] }> {
  progressCb(5, "Loading tariff impact records…");

  const impacts = db.all(sql`
    SELECT id, category_name, supplier_name, country_of_origin,
           effective_tariff_pct, tariff_layers, annual_spend
    FROM tariff_impacts WHERE engagement_id = ${engagementId}
  `) as {
    id: number; category_name: string; supplier_name: string | null;
    country_of_origin: string; effective_tariff_pct: number | null;
    tariff_layers: string | null; annual_spend: number | null;
  }[];

  if (impacts.length === 0) {
    progressCb(100, "No tariff impact records found — run tariff analysis first");
    return { checked: 0, flagged: 0, deltas: [] };
  }

  const deltas: TariffDelta[] = [];
  let flagged = 0;

  for (let i = 0; i < impacts.length; i++) {
    const impact = impacts[i];
    const pct = Math.round(10 + (i / impacts.length) * 80);
    progressCb(pct, `[${i + 1}/${impacts.length}] Checking ${impact.category_name}…`);

    // Find HTS chapter for this category
    const profile = CATEGORY_TARIFF_PROFILES[impact.category_name ?? ""];
    const htsChapter = profile?.hts_chapters ?? "8400";

    const staticRate = impact.effective_tariff_pct ?? 0;
    const country = impact.country_of_origin ?? "CN";

    // Fetch live rate
    const liveRate = await fetchUsitcRate(htsChapter, country);
    const deltaPp = liveRate !== null ? liveRate - staticRate : null;
    const isFlagged = deltaPp !== null && Math.abs(deltaPp) > 2;

    const delta: TariffDelta = {
      category: impact.category_name,
      supplier: impact.supplier_name,
      country,
      hts_chapter: htsChapter,
      static_rate: staticRate,
      live_rate: liveRate,
      delta_pp: deltaPp,
      flag: isFlagged,
    };
    deltas.push(delta);

    if (isFlagged) {
      flagged++;

      // Update tariff_impacts with live rate
      if (liveRate !== null) {
        const layers = impact.tariff_layers ? JSON.parse(impact.tariff_layers) : [];
        const updatedLayers = layers.map((l: any) =>
          l.name?.includes("MFN") ? { ...l, rate: liveRate } : l,
        );
        db.update(tariff_impacts)
          .set({
            effective_tariff_pct: liveRate,
            estimated_impact: (impact.annual_spend ?? 0) * (liveRate / 100),
            tariff_layers: JSON.stringify(updatedLayers),
            notes: `Live USITC rate updated ${new Date().toISOString().split("T")[0]}. Was ${staticRate}%, now ${liveRate}%.`,
          })
          .where(eq(tariff_impacts.id, impact.id))
          .run();
      }

      // Create watchlist alert for significant delta
      const existing = db.get(sql`
        SELECT id FROM watchlist_alerts
        WHERE engagement_id = ${engagementId}
          AND alert_type = 'commodity_spike'
          AND title LIKE ${'%tariff%' + impact.category_name + '%'}
          AND is_resolved = 0
          AND created_at > ${new Date(Date.now() - 7 * 86400000).toISOString()}
      `);

      if (!existing) {
        const direction = (deltaPp ?? 0) > 0 ? "increased" : "decreased";
        const severity = Math.abs(deltaPp ?? 0) > 5 ? "high" : "medium";
        db.insert(watchlist_alerts).values({
          engagement_id: engagementId,
          alert_type: "commodity_spike",
          severity,
          title: `Tariff rate change: ${impact.category_name} (${direction} ${Math.abs(deltaPp ?? 0).toFixed(1)}pp)`,
          message: `USITC live rate for ${impact.category_name} (HTS ${htsChapter}, origin: ${country}) has ${direction} from ${staticRate}% to ${liveRate}%. Annual impact delta: ${impact.annual_spend ? `$${((impact.annual_spend * Math.abs(deltaPp ?? 0)) / 100 / 1000).toFixed(0)}K` : "unknown"}. Review tariff assumptions and sourcing alternatives.`,
          related_entity_type: "commodity",
          is_acknowledged: 0,
          is_resolved: 0,
          created_at: new Date().toISOString(),
        }).run();
      }
    }

    // Rate limit — 500ms between calls if using live API
    if (USITC_KEY && i < impacts.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  progressCb(100, `Tariff lookup complete — ${flagged} rate changes flagged (>2pp)`);
  return { checked: impacts.length, flagged, deltas };
}

// ---------------------------------------------------------------------------
// Spot check a specific HTS code (used by co-pilot tool)
// ---------------------------------------------------------------------------
export async function lookupHtsRate(
  htsCode: string,
  countryOfOrigin = "CN",
): Promise<LiveTariffRate> {
  const now = new Date().toISOString();

  if (!USITC_KEY) {
    // Return static engine rate if available
    const category = Object.entries(CATEGORY_TARIFF_PROFILES).find(([, p]) =>
      p.hts_chapters.includes(htsCode.slice(0, 4))
    );
    return {
      hts_code: htsCode,
      description: category?.[0] ?? "Unknown",
      mfn_rate_pct: null,
      effective_rate_pct: null,
      country: countryOfOrigin,
      source: "static_engine",
      fetched_at: now,
    };
  }

  const liveRate = await fetchUsitcRate(htsCode, countryOfOrigin);
  return {
    hts_code: htsCode,
    description: "HTS lookup",
    mfn_rate_pct: liveRate,
    effective_rate_pct: liveRate,
    country: countryOfOrigin,
    source: "usitc_live",
    fetched_at: now,
  };
}
