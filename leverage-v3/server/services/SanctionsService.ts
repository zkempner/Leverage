/**
 * LEVERAGE v3 — SanctionsService (P2-02)
 *
 * Three sub-agents per spec:
 *   5A: SEC EDGAR — Altman Z-score from 10-K XBRL facts
 *   5C: HHI concentration (computed from spend_records)
 *   5D: OFAC SDN + SAM.gov debarment screening
 *
 * OFAC approach: bulk XML download from Treasury, parse, fuzzy match
 * SAM.gov approach: REST API entity search by name
 * EDGAR approach: search CIK by company name, fetch XBRL financial facts
 */

import { db } from "../storage";
import { supplier_risk_profiles, spend_records, watchlist_alerts } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const OFAC_XML_URL = "https://www.treasury.gov/ofac/downloads/sdn.xml";
const SAM_API_BASE = "https://api.sam.gov/entity-information/v3/entities";
const EDGAR_SEARCH = "https://efts.sec.gov/LATEST/search-index?q=%22{name}%22&dateRange=custom&startdt=2020-01-01&forms=10-K";
const EDGAR_FACTS  = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json";

const SAM_API_KEY  = process.env.SAM_API_KEY ?? "";

// ---------------------------------------------------------------------------
// Fuzzy match helpers
// ---------------------------------------------------------------------------
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,\-_&'"`()\[\]{}]/g, " ")
    .replace(/\b(inc|llc|ltd|corp|co|company|the|group|holdings?|international|intl)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(" ").filter(Boolean));
  const setB = new Set(b.split(" ").filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

function fuzzyMatch(query: string, candidates: string[], threshold = 0.55): string | null {
  const normQuery = normalize(query);
  let best: { name: string; score: number } | null = null;
  for (const candidate of candidates) {
    const score = jaccardSimilarity(normQuery, normalize(candidate));
    if (score >= threshold && (!best || score > best.score)) {
      best = { name: candidate, score };
    }
  }
  return best?.name ?? null;
}

// ---------------------------------------------------------------------------
// OFAC SDN XML fetch + parse
// Cached in-process for the session (XML is ~8MB, weekly refresh)
// ---------------------------------------------------------------------------
let ofacNamesCache: string[] | null = null;
let ofacCacheTime = 0;
const OFAC_TTL_MS = 7 * 24 * 3600 * 1000; // 1 week

async function getOfacNames(): Promise<string[]> {
  if (ofacNamesCache && Date.now() - ofacCacheTime < OFAC_TTL_MS) {
    return ofacNamesCache;
  }

  try {
    console.log("[SanctionsService] Downloading OFAC SDN list…");
    const resp = await fetch(OFAC_XML_URL, { signal: AbortSignal.timeout(30_000) });
    if (!resp.ok) throw new Error(`OFAC HTTP ${resp.status}`);
    const xml = await resp.text();

    // Extract <lastName> and <firstName> entries (SDN list structure)
    const names: string[] = [];
    const lastNameRx = /<lastName>([^<]+)<\/lastName>/g;
    const firstNameRx = /<firstName>([^<]+)<\/firstName>/g;
    let match: RegExpExecArray | null;

    // Also extract <sdnEntry> combined names
    const entryRx = /<sdnEntry>[\s\S]*?<\/sdnEntry>/g;
    let entry: RegExpExecArray | null;
    while ((entry = entryRx.exec(xml)) !== null) {
      const block = entry[0];
      const last = /<lastName>([^<]+)<\/lastName>/.exec(block)?.[1] ?? "";
      const first = /<firstName>([^<]+)<\/firstName>/.exec(block)?.[1] ?? "";
      const full = [first, last].filter(Boolean).join(" ").trim();
      if (full) names.push(full);

      // Also grab aka names
      const akaRx = /<aka>[\s\S]*?<\/aka>/g;
      let aka: RegExpExecArray | null;
      while ((aka = akaRx.exec(block)) !== null) {
        const akaLast = /<lastName>([^<]+)<\/lastName>/.exec(aka[0])?.[1] ?? "";
        const akaFirst = /<firstName>([^<]+)<\/firstName>/.exec(aka[0])?.[1] ?? "";
        const akaFull = [akaFirst, akaLast].filter(Boolean).join(" ").trim();
        if (akaFull) names.push(akaFull);
      }
    }

    console.log(`[SanctionsService] OFAC list loaded: ${names.length} entries`);
    ofacNamesCache = names;
    ofacCacheTime = Date.now();
    return names;
  } catch (err) {
    console.warn("[SanctionsService] OFAC download failed:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// SAM.gov debarment check
// ---------------------------------------------------------------------------
async function checkSam(supplierName: string): Promise<boolean> {
  if (!SAM_API_KEY) {
    // Without key, skip SAM check
    return false;
  }
  try {
    const url = new URL(SAM_API_BASE);
    url.searchParams.set("api_key", SAM_API_KEY);
    url.searchParams.set("legalBusinessName", supplierName);
    url.searchParams.set("exclusionStatusFlag", "Y");
    url.searchParams.set("pageSize", "5");

    const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) return false;
    const data = await resp.json() as { entityData?: unknown[] };
    return (data.entityData ?? []).length > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// SEC EDGAR — Altman Z-score
// ---------------------------------------------------------------------------
async function searchEdgarCik(companyName: string): Promise<string | null> {
  try {
    const url = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(companyName)}%22&forms=10-K&dateRange=custom&startdt=2022-01-01`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "LEVERAGE/3.0 compliance@ampepi.com" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { hits?: { hits?: Array<{ _source?: { entity_name?: string; file_num?: string; period_of_report?: string; entity_id?: string } }> } };
    const hits = data?.hits?.hits ?? [];
    if (hits.length === 0) return null;
    const entityId = hits[0]?._source?.entity_id;
    return entityId ? String(entityId).padStart(10, "0") : null;
  } catch {
    return null;
  }
}

async function fetchEdgarFacts(cik: string): Promise<Record<string, unknown> | null> {
  try {
    const url = EDGAR_FACTS.replace("{cik}", cik);
    const resp = await fetch(url, {
      headers: { "User-Agent": "LEVERAGE/3.0 compliance@ampepi.com" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) return null;
    return await resp.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractLatestValue(factsData: Record<string, unknown>, concept: string): number | null {
  try {
    const usGaap = (factsData as any)?.facts?.["us-gaap"];
    if (!usGaap) return null;
    const entry = usGaap[concept];
    if (!entry?.units) return null;
    const units = Object.values(entry.units as Record<string, unknown[]>)[0] as Array<{ val: number; end: string; form: string }>;
    if (!units) return null;
    // Get most recent 10-K value
    const annual = units
      .filter((u) => u.form === "10-K" && typeof u.val === "number")
      .sort((a, b) => b.end.localeCompare(a.end));
    return annual[0]?.val ?? null;
  } catch {
    return null;
  }
}

async function computeAltmanZ(
  supplierName: string,
): Promise<{ cik: string | null; z_score: number | null; revenue_trend: string | null; leverage_ratio: number | null; financial_risk_level: string }> {
  const result = { cik: null as string | null, z_score: null as number | null, revenue_trend: null as string | null, leverage_ratio: null as number | null, financial_risk_level: "unknown" };

  const cik = await searchEdgarCik(supplierName);
  if (!cik) return result;
  result.cik = cik;

  const facts = await fetchEdgarFacts(cik);
  if (!facts) return result;

  // Extract key financials for Altman Z-score (public company model)
  // Z = 1.2*X1 + 1.4*X2 + 3.3*X3 + 0.6*X4 + 1.0*X5
  const totalAssets       = extractLatestValue(facts, "Assets");
  const currentAssets     = extractLatestValue(facts, "AssetsCurrent");
  const currentLiab       = extractLatestValue(facts, "LiabilitiesCurrent");
  const retainedEarnings  = extractLatestValue(facts, "RetainedEarningsAccumulatedDeficit");
  const ebit              = extractLatestValue(facts, "OperatingIncomeLoss");
  const revenue           = extractLatestValue(facts, "RevenueFromContractWithCustomerExcludingAssessedTax")
                         ?? extractLatestValue(facts, "Revenues");
  const totalLiab         = extractLatestValue(facts, "Liabilities");
  const marketCap         = extractLatestValue(facts, "CommonStockValue"); // proxy

  if (!totalAssets || totalAssets === 0) return result;

  const workingCapital = (currentAssets ?? 0) - (currentLiab ?? 0);
  const X1 = workingCapital / totalAssets;
  const X2 = (retainedEarnings ?? 0) / totalAssets;
  const X3 = (ebit ?? 0) / totalAssets;
  const X4 = (marketCap ?? totalAssets * 0.5) / ((totalLiab ?? totalAssets) || 1);
  const X5 = (revenue ?? 0) / totalAssets;

  const Z = 1.2 * X1 + 1.4 * X2 + 3.3 * X3 + 0.6 * X4 + 1.0 * X5;
  result.z_score = Math.round(Z * 100) / 100;

  // Financial risk level
  if (Z < 1.81)       result.financial_risk_level = "critical";  // distress zone
  else if (Z < 2.99)  result.financial_risk_level = "high";      // grey zone
  else if (Z < 4.0)   result.financial_risk_level = "medium";    // safe zone
  else                result.financial_risk_level = "low";

  // Leverage ratio (total debt / EBITDA proxy)
  if (totalLiab && ebit && ebit > 0) {
    result.leverage_ratio = Math.round((totalLiab / (ebit * 1.2)) * 10) / 10;
  }

  return result;
}

// ---------------------------------------------------------------------------
// HHI concentration per category
// ---------------------------------------------------------------------------
export function computeHHI(engagementId: number): Array<{ category: string; hhi: number; concentration: string }> {
  const rows = db.all(sql`
    SELECT l1_category as category, supplier_name, SUM(amount) as spend
    FROM spend_records
    WHERE engagement_id = ${engagementId} AND l1_category IS NOT NULL
    GROUP BY l1_category, supplier_name
    ORDER BY l1_category, spend DESC
  `) as { category: string; supplier_name: string; spend: number }[];

  const byCategory: Record<string, { total: number; supplierSpends: number[] }> = {};
  for (const row of rows) {
    if (!byCategory[row.category]) byCategory[row.category] = { total: 0, supplierSpends: [] };
    byCategory[row.category].total += row.spend;
    byCategory[row.category].supplierSpends.push(row.spend);
  }

  return Object.entries(byCategory).map(([category, data]) => {
    const hhi = data.total > 0
      ? Math.round(data.supplierSpends.reduce((s, v) => s + Math.pow((v / data.total) * 100, 2), 0))
      : 0;
    const concentration = hhi > 5000 ? "highly_concentrated" : hhi > 2500 ? "concentrated" : "competitive";
    return { category, hhi, concentration };
  }).sort((a, b) => b.hhi - a.hhi);
}

// ---------------------------------------------------------------------------
// Main: screen a single supplier (OFAC + SAM + optional EDGAR)
// ---------------------------------------------------------------------------
export async function screenSupplier(
  engagementId: number,
  supplierName: string,
  includeEdgar = false,
): Promise<{
  supplier: string;
  ofac_match: boolean;
  sam_exclusion: boolean;
  altman_z?: number | null;
  financial_risk_level?: string;
}> {
  const [ofacNames] = await Promise.all([getOfacNames()]);

  // OFAC check
  const ofacHit = ofacNames.length > 0
    ? fuzzyMatch(supplierName, ofacNames, 0.70) !== null
    : false;

  // SAM.gov check
  const samHit = await checkSam(supplierName);

  // EDGAR (optional — only for public companies)
  let edgarResult: Awaited<ReturnType<typeof computeAltmanZ>> | null = null;
  if (includeEdgar) {
    edgarResult = await computeAltmanZ(supplierName);
  }

  const now = new Date().toISOString();

  // Upsert base fields (OFAC + SAM) always
  db.run(sql`
    INSERT INTO supplier_risk_profiles (
      engagement_id, supplier_name, ofac_match, sam_exclusion, last_refreshed_at
    ) VALUES (
      ${engagementId}, ${supplierName}, ${ofacHit ? 1 : 0}, ${samHit ? 1 : 0}, ${now}
    )
    ON CONFLICT(engagement_id, supplier_name) DO UPDATE SET
      ofac_match = excluded.ofac_match,
      sam_exclusion = excluded.sam_exclusion,
      last_refreshed_at = excluded.last_refreshed_at
  `);

  // If EDGAR result available, update financial fields separately
  if (edgarResult) {
    db.run(sql`
      UPDATE supplier_risk_profiles SET
        sec_cik = ${edgarResult.cik ?? null},
        altman_z_score = ${edgarResult.z_score ?? null},
        leverage_ratio = ${edgarResult.leverage_ratio ?? null},
        financial_risk_level = ${edgarResult.financial_risk_level},
        last_refreshed_at = ${now}
      WHERE engagement_id = ${engagementId} AND supplier_name = ${supplierName}
    `);
  }

  // Create critical alert for OFAC match
  if (ofacHit) {
    const existing = db.get(sql`
      SELECT id FROM watchlist_alerts
      WHERE engagement_id = ${engagementId}
        AND alert_type = 'ofac_match'
        AND title LIKE ${`%${supplierName}%`}
        AND is_resolved = 0
    `);
    if (!existing) {
      db.insert(watchlist_alerts).values({
        engagement_id: engagementId,
        alert_type: "ofac_match",
        severity: "critical",
        title: `OFAC SDN match: ${supplierName}`,
        message: `Supplier "${supplierName}" has a potential match on the OFAC Specially Designated Nationals list. Immediate review required. Do not process payments until cleared by compliance.`,
        related_entity_type: "supplier",
        is_acknowledged: 0,
        is_resolved: 0,
        created_at: now,
      }).run();
    }
  }

  // Create high alert for SAM exclusion
  if (samHit) {
    const existing = db.get(sql`
      SELECT id FROM watchlist_alerts
      WHERE engagement_id = ${engagementId}
        AND alert_type = 'supplier_distress'
        AND title LIKE ${`%SAM%${supplierName}%`}
        AND is_resolved = 0
    `);
    if (!existing) {
      db.insert(watchlist_alerts).values({
        engagement_id: engagementId,
        alert_type: "supplier_distress",
        severity: "high",
        title: `SAM.gov exclusion: ${supplierName}`,
        message: `Supplier "${supplierName}" appears on the SAM.gov debarment/exclusions list. This supplier may be ineligible for federal contracting. Review engagement context.`,
        related_entity_type: "supplier",
        is_acknowledged: 0,
        is_resolved: 0,
        created_at: now,
      }).run();
    }
  }

  // Create high alert for Altman Z distress
  if (edgarResult?.financial_risk_level === "critical") {
    const existing = db.get(sql`
      SELECT id FROM watchlist_alerts
      WHERE engagement_id = ${engagementId}
        AND alert_type = 'supplier_distress'
        AND title LIKE ${`%${supplierName}%distress%`}
        AND is_resolved = 0
    `);
    if (!existing) {
      db.insert(watchlist_alerts).values({
        engagement_id: engagementId,
        alert_type: "supplier_distress",
        severity: "high",
        title: `Financial distress: ${supplierName}`,
        message: `Altman Z-score of ${edgarResult.z_score?.toFixed(2)} indicates ${supplierName} is in the financial distress zone (<1.81). Supply continuity risk is elevated.`,
        related_entity_type: "supplier",
        is_acknowledged: 0,
        is_resolved: 0,
        created_at: now,
      }).run();
    }
  }

  return {
    supplier: supplierName,
    ofac_match: ofacHit,
    sam_exclusion: samHit,
    altman_z: edgarResult?.z_score,
    financial_risk_level: edgarResult?.financial_risk_level,
  };
}

// ---------------------------------------------------------------------------
// Job handler: batch screen top-N suppliers
// ---------------------------------------------------------------------------
export async function runSanctionsScan(
  payload: Record<string, unknown>,
  progressCb: (pct: number, msg: string) => void,
): Promise<{ scanned: number; ofac_hits: number; sam_hits: number; results: unknown[] }> {
  const engagementId = Number(payload.engagement_id);
  const topN = Number(payload.top_n ?? 30);
  const includeEdgar = Boolean(payload.include_edgar ?? false);

  progressCb(5, "Loading top suppliers…");

  const suppliers = db.all(sql`
    SELECT normalized_supplier_name as name, SUM(amount) as spend
    FROM spend_records
    WHERE engagement_id = ${engagementId}
      AND normalized_supplier_name IS NOT NULL
      AND normalized_supplier_name != ''
    GROUP BY normalized_supplier_name
    ORDER BY spend DESC LIMIT ${topN}
  `) as { name: string; spend: number }[];

  if (suppliers.length === 0) {
    progressCb(100, "No suppliers found");
    return { scanned: 0, ofac_hits: 0, sam_hits: 0, results: [] };
  }

  progressCb(10, "Downloading OFAC SDN list…");
  await getOfacNames(); // warm the cache

  const results: Awaited<ReturnType<typeof screenSupplier>>[] = [];
  let ofacHits = 0;
  let samHits = 0;

  for (let i = 0; i < suppliers.length; i++) {
    const { name } = suppliers[i];
    const pct = Math.round(10 + (i / suppliers.length) * 85);
    progressCb(pct, `[${i + 1}/${suppliers.length}] Screening ${name}…`);

    const result = await screenSupplier(engagementId, name, includeEdgar && i < 10);
    results.push(result);
    if (result.ofac_match) ofacHits++;
    if (result.sam_exclusion) samHits++;

    // Brief pause between EDGAR calls to respect rate limits
    if (includeEdgar && i < 10) await new Promise((r) => setTimeout(r, 800));
  }

  progressCb(100, `Screening complete — ${ofacHits} OFAC, ${samHits} SAM hits`);
  return { scanned: suppliers.length, ofac_hits: ofacHits, sam_hits: samHits, results };
}
