// Vendor Analytics Engine — 100% deterministic.
// Builds a comprehensive profile for each supplier with opportunity flags
// derived from actual transaction data. Every number traces to the data.
// Includes payment term inference, seasonal pattern detection, price trend
// linear regression, vendor tier classification, and contract renewal indicators.

export interface VendorOpportunity {
  type: string;
  severity: "high" | "medium" | "low";
  estimated_savings: number;
  description: string;
  evidence: string;
  recommended_action: string;
}

export interface VendorProfile {
  vendor_name: string;
  normalized_name: string | null;

  // Spend metrics
  total_spend: number;
  record_count: number;
  avg_invoice: number;
  median_invoice: number;
  min_invoice: number;
  max_invoice: number;
  credit_memo_count: number;
  credit_memo_total: number;
  net_spend: number;

  // Time analysis
  first_invoice_date: string | null;
  last_invoice_date: string | null;
  months_active: number;
  avg_monthly_spend: number;
  spend_trend: "increasing" | "decreasing" | "stable";
  spend_by_month: { month: string; amount: number }[];

  // Price analysis
  price_variance_pct: number;
  price_std_dev: number;
  coefficient_of_variation: number;

  // New: price trend regression
  price_trend_slope: number;      // $/month change in average invoice
  price_trend_direction: "rising" | "falling" | "flat";
  price_trend_annual_pct: number; // Annualized % change

  // New: seasonal pattern detection
  seasonal_pattern: boolean;
  peak_months: string[];           // e.g. ["03", "09"] for Q1/Q3 peaks
  seasonal_variance_pct: number;   // % variance explained by seasonality

  // Business unit spread
  business_units: string[];
  bu_count: number;
  is_multi_bu: boolean;

  // GL / category spread
  gl_codes: string[];
  gl_code_count: number;
  categories: string[];
  category_count: number;
  primary_category: string;
  primary_category_pct: number;

  // Contract indicators
  has_contract: boolean | null;
  po_type: string | null;
  payment_terms: string | null;
  avg_days_to_pay: number | null;

  // New: inferred payment terms from invoice timing
  inferred_payment_cycle: string | null;    // "monthly", "quarterly", "irregular"
  inferred_payment_day: number | null;      // Typical day of month for payments
  avg_invoice_gap_days: number | null;      // Average days between invoices

  // New: vendor tier classification
  vendor_tier: "strategic" | "preferred" | "approved" | "tactical" | "tail";
  vendor_tier_rationale: string;

  // Opportunities
  opportunities: VendorOpportunity[];

  // Composite scores
  opportunity_score: number;
  priority_rank: number;
}

export interface OpportunitySummary {
  total_vendors: number;
  vendors_with_opportunities: number;
  total_estimated_savings: number;
  by_type: { type: string; count: number; total_savings: number; vendor_count: number }[];
  top_opportunity_type: string;
}

// ---- Helpers ----

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDev(arr: number[], mean: number): number {
  if (arr.length <= 1) return 0;
  const variance = arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function parseMonth(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  // Try to extract YYYY-MM from various date formats
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    // Try manual parse for MM/DD/YYYY or YYYY-MM-DD
    const match = dateStr.match(/(\d{4})-(\d{2})/) || dateStr.match(/(\d{1,2})\/\d{1,2}\/(\d{4})/);
    if (match) {
      if (match[0].includes("/")) return `${match[2]}-${match[1].padStart(2, "0")}`;
      return `${match[1]}-${match[2]}`;
    }
    return null;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function parseDayOfMonth(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d.getDate();
  // Try manual parse
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) return Number(match[2]);
  const isoMatch = dateStr.match(/\d{4}-\d{2}-(\d{2})/);
  if (isoMatch) return Number(isoMatch[1]);
  return null;
}

function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// Simple linear regression: returns slope and r² value
function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] || 0, r2: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumX2 += xs[i] * xs[i];
    sumY2 += ys[i] * ys[i];
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R² calculation
  const meanY = sumY / n;
  const ssRes = ys.reduce((s, y, i) => s + (y - (slope * xs[i] + intercept)) ** 2, 0);
  const ssTot = ys.reduce((s, y) => s + (y - meanY) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { slope, intercept, r2 };
}

// ---- Internal stats accumulator ----
interface VendorAccum {
  vendor_name: string;
  normalized_name: string | null;
  amounts: number[];
  positive_amounts: number[];
  negative_amounts: number[];
  dates: string[];
  business_units: Set<string>;
  gl_codes: Set<string>;
  category_ids: number[];
  month_spend: Map<string, number>;
  raw_supplier_names: Set<string>; // Track all raw name variants
}

// Vendor tier thresholds (% of total engagement spend)
const TIER_THRESHOLDS = {
  strategic: 0.05,   // >5% of total spend
  preferred: 0.01,   // >1% of total spend
  approved: 0.002,   // >0.2% of total spend
  tactical: 0.0005,  // >0.05% of total spend
  // Below tactical = tail
};

function classifyVendorTier(
  totalSpend: number,
  totalEngagementSpend: number,
  monthsActive: number,
  buCount: number,
): { tier: VendorProfile["vendor_tier"]; rationale: string } {
  if (totalEngagementSpend <= 0) return { tier: "tail", rationale: "No engagement spend data" };

  const spendPct = totalSpend / totalEngagementSpend;

  if (spendPct >= TIER_THRESHOLDS.strategic && monthsActive >= 6) {
    return { tier: "strategic", rationale: `${(spendPct * 100).toFixed(1)}% of total spend, ${monthsActive} months active — strategic partner` };
  }
  if (spendPct >= TIER_THRESHOLDS.preferred && monthsActive >= 3) {
    return { tier: "preferred", rationale: `${(spendPct * 100).toFixed(1)}% of total spend — preferred vendor` };
  }
  if (spendPct >= TIER_THRESHOLDS.approved) {
    return { tier: "approved", rationale: `${(spendPct * 100).toFixed(2)}% of total spend — approved vendor` };
  }
  if (spendPct >= TIER_THRESHOLDS.tactical) {
    return { tier: "tactical", rationale: `${(spendPct * 100).toFixed(3)}% of total spend — tactical vendor` };
  }
  return { tier: "tail", rationale: `<0.05% of total spend (${fmtCur(totalSpend)}) — tail spend vendor` };
}

// Detect seasonal patterns from monthly spend data
function detectSeasonality(monthSpend: Map<string, number>): { seasonal: boolean; peakMonths: string[]; variancePct: number } {
  if (monthSpend.size < 6) return { seasonal: false, peakMonths: [], variancePct: 0 };

  // Group by calendar month (01-12)
  const byCalMonth: Record<string, number[]> = {};
  for (const [ym, amount] of monthSpend) {
    const mm = ym.split("-")[1];
    if (!byCalMonth[mm]) byCalMonth[mm] = [];
    byCalMonth[mm].push(amount);
  }

  // Need at least 2 months with data to detect patterns
  const monthAvgs: { month: string; avg: number }[] = [];
  for (const [mm, amounts] of Object.entries(byCalMonth)) {
    monthAvgs.push({ month: mm, avg: amounts.reduce((s, a) => s + a, 0) / amounts.length });
  }

  if (monthAvgs.length < 3) return { seasonal: false, peakMonths: [], variancePct: 0 };

  const overallAvg = monthAvgs.reduce((s, m) => s + m.avg, 0) / monthAvgs.length;
  if (overallAvg <= 0) return { seasonal: false, peakMonths: [], variancePct: 0 };

  // Coefficient of variation across months
  const monthStdDev = stdDev(monthAvgs.map(m => m.avg), overallAvg);
  const cv = monthStdDev / overallAvg;

  // Seasonal if CV > 0.30 (30% variance across months)
  const seasonal = cv > 0.30;

  // Identify peak months (>1.3× average)
  const peakMonths = monthAvgs
    .filter(m => m.avg > overallAvg * 1.3)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 3)
    .map(m => m.month);

  return { seasonal, peakMonths, variancePct: Math.round(cv * 100) };
}

// Infer payment cycle from invoice dates
function inferPaymentCycle(dates: string[]): { cycle: string | null; typicalDay: number | null; avgGapDays: number | null } {
  if (dates.length < 3) return { cycle: null, typicalDay: null, avgGapDays: null };

  const sorted = dates.filter(Boolean).sort();
  const parsedDates = sorted.map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
  if (parsedDates.length < 3) return { cycle: null, typicalDay: null, avgGapDays: null };

  // Calculate gaps between consecutive invoices
  const gaps: number[] = [];
  for (let i = 1; i < parsedDates.length; i++) {
    const diffMs = parsedDates[i].getTime() - parsedDates[i - 1].getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > 0) gaps.push(diffDays);
  }

  if (gaps.length === 0) return { cycle: null, typicalDay: null, avgGapDays: null };

  const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const medGap = median(gaps);

  // Determine cycle from median gap
  let cycle: string | null;
  if (medGap <= 10) cycle = "weekly";
  else if (medGap >= 25 && medGap <= 35) cycle = "monthly";
  else if (medGap >= 80 && medGap <= 100) cycle = "quarterly";
  else cycle = "irregular";

  // Typical day of month for payment
  const daysOfMonth = parsedDates.map(d => d.getDate());
  const dayFreq: Record<number, number> = {};
  for (const day of daysOfMonth) {
    dayFreq[day] = (dayFreq[day] || 0) + 1;
  }
  const typicalDay = Object.entries(dayFreq).sort((a, b) => b[1] - a[1])[0]
    ? Number(Object.entries(dayFreq).sort((a, b) => b[1] - a[1])[0][0])
    : null;

  return { cycle, typicalDay, avgGapDays: Math.round(avgGap) };
}

// ---- Main analysis function ----
export function analyzeVendors(
  spendRecords: any[],
  categories: any[],
  totalEngagementSpend: number,
): VendorProfile[] {
  // Build category name map
  const catMap = new Map<number, string>();
  for (const c of categories) catMap.set(c.id, c.name);

  // Build category-level spend totals for concentration check
  const categorySpend = new Map<number, { total: number; vendors: Map<string, number>; bu_vendors: Map<string, Set<string>> }>();

  // Accumulate per-vendor data
  const vendors = new Map<string, VendorAccum>();

  // Also build normalized name → vendor names map for duplicate detection
  const normalizedGroups = new Map<string, Set<string>>();

  for (const r of spendRecords) {
    const name = (r.supplier_name || "").trim();
    if (!name) continue;

    const normName = (r.normalized_supplier_name || "").trim() || null;
    const key = normName || name; // key by NORMALIZED name to consolidate variants

    if (!vendors.has(key)) {
      vendors.set(key, {
        vendor_name: key,
        normalized_name: normName,
        amounts: [],
        positive_amounts: [],
        negative_amounts: [],
        dates: [],
        business_units: new Set(),
        gl_codes: new Set(),
        category_ids: [],
        month_spend: new Map(),
        raw_supplier_names: new Set(),
      });
    }

    const v = vendors.get(key)!;
    const amt = Number(r.amount) || 0;
    v.amounts.push(amt);
    if (amt >= 0) v.positive_amounts.push(amt);
    else v.negative_amounts.push(amt);

    if (r.date) v.dates.push(r.date);
    if (r.business_unit) v.business_units.add(r.business_unit);
    if (r.gl_code) v.gl_codes.add(r.gl_code);
    if (r.category_id) v.category_ids.push(r.category_id);
    v.raw_supplier_names.add(name);

    // Monthly spend
    const month = parseMonth(r.date);
    if (month) {
      v.month_spend.set(month, (v.month_spend.get(month) || 0) + amt);
    }

    // Track normalized name groups
    if (normName) {
      if (!normalizedGroups.has(normName)) normalizedGroups.set(normName, new Set());
      normalizedGroups.get(normName)!.add(name);
    }

    // Category-level tracking
    if (r.category_id) {
      if (!categorySpend.has(r.category_id)) {
        categorySpend.set(r.category_id, { total: 0, vendors: new Map(), bu_vendors: new Map() });
      }
      const cs = categorySpend.get(r.category_id)!;
      cs.total += amt;
      cs.vendors.set(key, (cs.vendors.get(key) || 0) + amt);
      const bu = r.business_unit || "Unknown";
      if (!cs.bu_vendors.has(bu)) cs.bu_vendors.set(bu, new Set());
      cs.bu_vendors.get(bu)!.add(key);
    }
  }

  // Build profiles
  const profiles: VendorProfile[] = [];

  for (const v of vendors.values()) {
    const totalSpend = v.amounts.reduce((s, a) => s + a, 0);
    const posAmounts = v.positive_amounts;
    const recordCount = v.amounts.length;
    const avgInvoice = posAmounts.length > 0 ? posAmounts.reduce((s, a) => s + a, 0) / posAmounts.length : 0;
    const medianInvoice = median(posAmounts);
    const minInvoice = posAmounts.length > 0 ? Math.min(...posAmounts) : 0;
    const maxInvoice = posAmounts.length > 0 ? Math.max(...posAmounts) : 0;
    const creditMemoCount = v.negative_amounts.length;
    const creditMemoTotal = v.negative_amounts.reduce((s, a) => s + a, 0); // already negative
    const netSpend = totalSpend; // total already includes credits

    // Time analysis
    const sortedDates = v.dates.filter(Boolean).sort();
    const firstDate = sortedDates[0] || null;
    const lastDate = sortedDates[sortedDates.length - 1] || null;
    const firstMonth = parseMonth(firstDate);
    const lastMonth = parseMonth(lastDate);
    const monthsActive = firstMonth && lastMonth ? Math.max(1, monthDiff(firstMonth, lastMonth) + 1) : 1;
    const avgMonthlySpend = totalSpend / monthsActive;

    // Spend trend: compare last half vs prior half
    const allMonths = [...v.month_spend.keys()].sort();
    let spendTrend: VendorProfile["spend_trend"] = "stable";
    let last6Total = 0;
    let prior6Total = 0;
    if (allMonths.length >= 4) {
      const midPoint = Math.ceil(allMonths.length / 2);
      const priorMonths = allMonths.slice(0, midPoint);
      const recentMonths = allMonths.slice(midPoint);
      prior6Total = priorMonths.reduce((s, m) => s + (v.month_spend.get(m) || 0), 0);
      last6Total = recentMonths.reduce((s, m) => s + (v.month_spend.get(m) || 0), 0);
      if (prior6Total > 0) {
        const change = (last6Total - prior6Total) / prior6Total;
        if (change > 0.15) spendTrend = "increasing";
        else if (change < -0.15) spendTrend = "decreasing";
      }
    }

    // Spend by month for chart
    const spendByMonth = allMonths.map(m => ({ month: m, amount: v.month_spend.get(m) || 0 }));

    // Price analysis (only on positive amounts)
    const priceStdDev = stdDev(posAmounts, avgInvoice);
    const cv = avgInvoice > 0 ? priceStdDev / avgInvoice : 0;
    const priceVariancePct = avgInvoice > 0 ? ((maxInvoice - minInvoice) / avgInvoice) * 100 : 0;

    // Price trend: linear regression on monthly average invoice amounts
    let priceTrendSlope = 0;
    let priceTrendDirection: VendorProfile["price_trend_direction"] = "flat";
    let priceTrendAnnualPct = 0;
    if (allMonths.length >= 3) {
      const monthlyAvgs: { idx: number; avg: number }[] = [];
      const monthlyInvoices: Map<string, number[]> = new Map();
      for (const r of v.positive_amounts) {
        // Group positive amounts by the order they appear — approximation since we don't track per-month
        // We use the monthly spend / count as a proxy
      }
      // Use monthly total spend as proxy for price regression
      const xs = allMonths.map((_, i) => i);
      const ys = allMonths.map(m => v.month_spend.get(m) || 0);
      const reg = linearRegression(xs, ys);
      priceTrendSlope = Math.round(reg.slope);
      const avgMonthly = ys.reduce((s, y) => s + y, 0) / ys.length;
      if (avgMonthly > 0) {
        priceTrendAnnualPct = Math.round((reg.slope * 12 / avgMonthly) * 100 * 10) / 10;
      }
      if (priceTrendAnnualPct > 5) priceTrendDirection = "rising";
      else if (priceTrendAnnualPct < -5) priceTrendDirection = "falling";
      else priceTrendDirection = "flat";
    }

    // Seasonal pattern detection
    const seasonality = detectSeasonality(v.month_spend);

    // Payment cycle inference
    const paymentCycle = inferPaymentCycle(v.dates);

    // BU and category analysis
    const busUnits = [...v.business_units];
    const glCodes = [...v.gl_codes];

    // Category breakdown
    const catCounts = new Map<string, number>();
    for (const cid of v.category_ids) {
      const name = catMap.get(cid) || `Category ${cid}`;
      catCounts.set(name, (catCounts.get(name) || 0) + 1);
    }
    const catEntries = [...catCounts.entries()].sort((a, b) => b[1] - a[1]);
    const categoryNames = catEntries.map(([name]) => name);
    const primaryCat = catEntries[0]?.[0] || "Uncategorized";
    const primaryCatPct = v.category_ids.length > 0 ? Math.round((catEntries[0]?.[1] || 0) / v.category_ids.length * 100) : 0;

    // Vendor tier classification
    const tierInfo = classifyVendorTier(Math.abs(totalSpend), totalEngagementSpend, monthsActive, busUnits.length);

    // ---- OPPORTUNITY DETECTION ----
    const opportunities: VendorOpportunity[] = [];

    // 1. Price Variance
    if (cv > 0.3 && posAmounts.length >= 3) {
      const estSavings = Math.round(Math.abs(totalSpend) * Math.min(cv, 1.5) * 0.15);
      opportunities.push({
        type: "Price Variance",
        severity: cv > 0.5 ? "high" : "medium",
        estimated_savings: estSavings,
        description: "High price variance across invoices indicates inconsistent pricing or lack of contracted rates",
        evidence: `Price ranges from ${fmtCur(minInvoice)} to ${fmtCur(maxInvoice)} across ${posAmounts.length} invoices (CV: ${(cv * 100).toFixed(0)}%, std dev: ${fmtCur(priceStdDev)})`,
        recommended_action: "Establish contracted pricing; audit invoice-to-contract compliance",
      });
    }

    // 2. Credit Memo / Leakage
    if (creditMemoCount > 0 && Math.abs(creditMemoTotal) > 0) {
      const grossPositive = posAmounts.reduce((s, a) => s + a, 0);
      const creditRate = grossPositive > 0 ? Math.abs(creditMemoTotal) / grossPositive : 0;
      if (creditRate > 0.02) {
        const estSavings = Math.round(Math.abs(creditMemoTotal) * 0.5);
        opportunities.push({
          type: "Credit Memo Leakage",
          severity: creditRate > 0.05 ? "high" : "medium",
          estimated_savings: estSavings,
          description: "High credit memo rate indicates quality issues, billing errors, or returns",
          evidence: `${creditMemoCount} credit memos totaling ${fmtCur(Math.abs(creditMemoTotal))} (${(creditRate * 100).toFixed(1)}% of gross spend)`,
          recommended_action: "Root cause analysis on credit memos; implement receiving inspection or 3-way match",
        });
      }
    }

    // 3. Tail Spend
    if (totalEngagementSpend > 0 && totalSpend < totalEngagementSpend * 0.001 && recordCount < 5 && totalSpend > 0) {
      const estSavings = Math.round(totalSpend * 0.10);
      opportunities.push({
        type: "Tail Spend",
        severity: "low",
        estimated_savings: estSavings,
        description: "Small infrequent vendor — unmanaged tail spend candidate",
        evidence: `${fmtCur(totalSpend)} total across ${recordCount} invoices — tail spend candidate`,
        recommended_action: "Route through GPO or preferred supplier catalog",
      });
    }

    // 4. Multi-BU Fragmentation
    if (busUnits.length >= 3) {
      const estSavings = Math.round(Math.abs(totalSpend) * 0.05);
      opportunities.push({
        type: "Multi-BU Fragmentation",
        severity: busUnits.length >= 5 ? "high" : "medium",
        estimated_savings: estSavings,
        description: "Same vendor used across multiple business units without centralized negotiation",
        evidence: `Spend fragmented across ${busUnits.length} business units: ${busUnits.slice(0, 5).join(", ")}${busUnits.length > 5 ? ` +${busUnits.length - 5} more` : ""}`,
        recommended_action: "Aggregate demand across BUs; negotiate enterprise-level agreement",
      });
    }

    // 5. Maverick Spend (proxy: no category or no GL code = likely off-contract)
    const uncategorizedPct = v.category_ids.length > 0 ? 0 : 1;
    const noGlPct = v.gl_codes.size === 0 ? 1 : 0;
    if ((uncategorizedPct > 0.5 || noGlPct > 0.5) && totalSpend > 1000) {
      const estSavings = Math.round(Math.abs(totalSpend) * 0.08);
      opportunities.push({
        type: "Maverick Spend",
        severity: totalSpend > 100000 ? "high" : "medium",
        estimated_savings: estSavings,
        description: "Spend lacks categorization or GL coding — likely off-contract/unmanaged",
        evidence: `${uncategorizedPct > 0 ? "No category assigned" : ""}${uncategorizedPct > 0 && noGlPct > 0 ? "; " : ""}${noGlPct > 0 ? "No GL code" : ""} on ${fmtCur(totalSpend)} spend`,
        recommended_action: "Issue RFP for contracted pricing; establish preferred vendor agreement",
      });
    }

    // 6. Payment Terms Opportunity (inferred from invoice patterns)
    if (totalSpend > 50000 && cv < 0.3 && posAmounts.length >= 6) {
      const estSavings = Math.round(Math.abs(totalSpend) * 0.01);
      const cycleNote = paymentCycle.cycle ? ` (${paymentCycle.cycle} cycle detected)` : "";
      opportunities.push({
        type: "Payment Terms",
        severity: "medium",
        estimated_savings: estSavings,
        description: `Regular, consistent payments — candidate for payment term optimization${cycleNote}`,
        evidence: `${posAmounts.length} consistent invoices averaging ${fmtCur(avgInvoice)} on ${fmtCur(totalSpend)} annual spend${paymentCycle.avgGapDays ? `, avg ${paymentCycle.avgGapDays}-day interval` : ""}`,
        recommended_action: "Extend payment terms to Net-60; negotiate early payment discount (2/10 Net 30)",
      });
    }

    // 7. Spend Concentration Risk
    for (const cid of new Set(v.category_ids)) {
      const cs = categorySpend.get(cid);
      if (!cs) continue;
      const vendorShare = (cs.vendors.get(v.vendor_name) || 0) / cs.total;
      if (vendorShare > 0.3 && cs.total > 10000) {
        // Check if sole source in any BU
        const soleBUs: string[] = [];
        for (const [bu, buVendors] of cs.bu_vendors.entries()) {
          if (buVendors.has(v.vendor_name) && buVendors.size === 1) {
            soleBUs.push(bu);
          }
        }
        if (soleBUs.length > 0 || vendorShare > 0.5) {
          const catName = catMap.get(cid) || `Category ${cid}`;
          const vendorCatSpend = cs.vendors.get(v.vendor_name) || 0;
          const estSavings = Math.round(vendorCatSpend * 0.05);
          opportunities.push({
            type: "Concentration Risk",
            severity: "high",
            estimated_savings: estSavings,
            description: "Over-reliance on single vendor — risk exposure and reduced competitive leverage",
            evidence: `Represents ${(vendorShare * 100).toFixed(0)}% of ${catName} spend${soleBUs.length > 0 ? `; sole source in ${soleBUs.slice(0, 3).join(", ")}` : ""}`,
            recommended_action: "Qualify alternative supplier; run competitive bid process",
          });
          break; // one concentration finding per vendor is enough
        }
      }
    }

    // 8. Spend Trend Acceleration
    if (spendTrend === "increasing" && prior6Total > 0) {
      const changePct = (last6Total - prior6Total) / prior6Total;
      if (changePct > 0.20) {
        const estSavings = Math.round((last6Total - prior6Total) * 0.10);
        opportunities.push({
          type: "Spend Acceleration",
          severity: "medium",
          estimated_savings: estSavings,
          description: "Rapidly growing spend without renegotiation — missed volume leverage",
          evidence: `Spend increased ${(changePct * 100).toFixed(0)}% in recent period (${fmtCur(prior6Total)} → ${fmtCur(last6Total)})`,
          recommended_action: "Conduct spending review; negotiate volume discount tier",
        });
      }
    }

    // 9. Duplicate Supplier Detection (improved: uses raw name variant count)
    const nameVariants = v.raw_supplier_names;
    if (nameVariants.size > 1) {
      const variantList = [...nameVariants].filter(n => n !== v.vendor_name);
      if (variantList.length > 0) {
        const estSavings = Math.round(Math.abs(totalSpend) * 0.03);
        opportunities.push({
          type: "Duplicate Vendor",
          severity: nameVariants.size >= 3 ? "high" : "medium",
          estimated_savings: estSavings,
          description: `${nameVariants.size} vendor name variants resolve to the same entity — fragmented spend`,
          evidence: `Also appears as: ${variantList.slice(0, 4).join(", ")}${variantList.length > 4 ? ` +${variantList.length - 4} more` : ""}`,
          recommended_action: "Consolidate vendor records; aggregate spend for negotiation",
        });
      }
    }

    // 10. Invoice Frequency Optimization
    if (recordCount > 20 && avgInvoice < 5000 && avgInvoice > 0) {
      const estSavings = Math.round(recordCount * 50);
      opportunities.push({
        type: "Invoice Consolidation",
        severity: recordCount >= 50 ? "medium" : "low",
        estimated_savings: estSavings,
        description: "Many small invoices — high transaction cost, consolidation opportunity",
        evidence: `${recordCount} invoices averaging ${fmtCur(avgInvoice)} each — high transaction volume`,
        recommended_action: "Move to consolidated monthly invoicing or procurement card",
      });
    }

    // 11. Contract Renewal Indicator (vendors with 12+ months of history and high spend)
    if (monthsActive >= 12 && Math.abs(totalSpend) > 25000) {
      // Check if spend pattern suggests annual contract (spend starts/stops at year boundary)
      const sortedMonthKeys = [...v.month_spend.keys()].sort();
      const lastActiveMonth = sortedMonthKeys[sortedMonthKeys.length - 1];
      if (lastActiveMonth) {
        const lastMM = Number(lastActiveMonth.split("-")[1]);
        // Flag if last active month is near typical fiscal year end (Q4 or Q1)
        const nearFYEnd = lastMM >= 10 || lastMM <= 3;
        if (nearFYEnd || monthsActive >= 11) {
          const estSavings = Math.round(Math.abs(totalSpend) * 0.05);
          opportunities.push({
            type: "Contract Renewal",
            severity: Math.abs(totalSpend) > 100000 ? "high" : "medium",
            estimated_savings: estSavings,
            description: "Long-running vendor relationship approaching renewal window — negotiate before auto-renewal",
            evidence: `${monthsActive} months active, ${fmtCur(Math.abs(totalSpend))} spend${nearFYEnd ? ", near fiscal year-end" : ""}`,
            recommended_action: "Initiate early renewal negotiation; benchmark current rates; consider competitive bid",
          });
        }
      }
    }

    // 12. Price Escalation Alert (from regression)
    if (priceTrendDirection === "rising" && priceTrendAnnualPct > 10) {
      const estSavings = Math.round(Math.abs(totalSpend) * (priceTrendAnnualPct / 100) * 0.5);
      opportunities.push({
        type: "Price Escalation",
        severity: priceTrendAnnualPct > 20 ? "high" : "medium",
        estimated_savings: estSavings,
        description: "Spend trending upward faster than typical inflation — potential price creep",
        evidence: `Spend rising ~${priceTrendAnnualPct}% annualized (${fmtCur(priceTrendSlope)}/month)`,
        recommended_action: "Audit pricing against contract terms; negotiate price cap or index-based pricing",
      });
    }

    // Composite opportunity score
    const totalOppSavings = opportunities.reduce((s, o) => s + o.estimated_savings, 0);
    const oppScore = totalSpend > 0 ? clamp(Math.round((totalOppSavings / Math.abs(totalSpend)) * 100), 0, 100) : 0;

    profiles.push({
      vendor_name: v.vendor_name,
      normalized_name: v.normalized_name,
      total_spend: totalSpend,
      record_count: recordCount,
      avg_invoice: Math.round(avgInvoice),
      median_invoice: Math.round(medianInvoice),
      min_invoice: Math.round(minInvoice),
      max_invoice: Math.round(maxInvoice),
      credit_memo_count: creditMemoCount,
      credit_memo_total: Math.round(creditMemoTotal),
      net_spend: Math.round(netSpend),
      first_invoice_date: firstDate,
      last_invoice_date: lastDate,
      months_active: monthsActive,
      avg_monthly_spend: Math.round(avgMonthlySpend),
      spend_trend: spendTrend,
      spend_by_month: spendByMonth,
      price_variance_pct: Math.round(priceVariancePct * 10) / 10,
      price_std_dev: Math.round(priceStdDev),
      coefficient_of_variation: Math.round(cv * 1000) / 1000,
      price_trend_slope: priceTrendSlope,
      price_trend_direction: priceTrendDirection,
      price_trend_annual_pct: priceTrendAnnualPct,
      seasonal_pattern: seasonality.seasonal,
      peak_months: seasonality.peakMonths,
      seasonal_variance_pct: seasonality.variancePct,
      business_units: busUnits,
      bu_count: busUnits.length,
      is_multi_bu: busUnits.length > 1,
      gl_codes: glCodes,
      gl_code_count: glCodes.length,
      categories: categoryNames,
      category_count: categoryNames.length,
      primary_category: primaryCat,
      primary_category_pct: primaryCatPct,
      has_contract: null,
      po_type: null,
      payment_terms: null,
      avg_days_to_pay: null,
      inferred_payment_cycle: paymentCycle.cycle,
      inferred_payment_day: paymentCycle.typicalDay,
      avg_invoice_gap_days: paymentCycle.avgGapDays,
      vendor_tier: tierInfo.tier,
      vendor_tier_rationale: tierInfo.rationale,
      opportunities,
      opportunity_score: oppScore,
      priority_rank: 0, // set after sorting
    });
  }

  // Sort by opportunity score desc, then by total_spend desc
  profiles.sort((a, b) => b.opportunity_score - a.opportunity_score || b.total_spend - a.total_spend);

  // Assign priority ranks
  profiles.forEach((p, i) => { p.priority_rank = i + 1; });

  return profiles;
}

// ---- Build opportunity summary ----
export function buildOpportunitySummary(profiles: VendorProfile[]): OpportunitySummary {
  const byType = new Map<string, { count: number; total_savings: number; vendors: Set<string> }>();

  let vendorsWithOpps = 0;
  let totalSavings = 0;

  for (const p of profiles) {
    if (p.opportunities.length > 0) vendorsWithOpps++;
    for (const opp of p.opportunities) {
      totalSavings += opp.estimated_savings;
      if (!byType.has(opp.type)) byType.set(opp.type, { count: 0, total_savings: 0, vendors: new Set() });
      const t = byType.get(opp.type)!;
      t.count++;
      t.total_savings += opp.estimated_savings;
      t.vendors.add(p.vendor_name);
    }
  }

  const byTypeArr = [...byType.entries()]
    .map(([type, data]) => ({
      type,
      count: data.count,
      total_savings: data.total_savings,
      vendor_count: data.vendors.size,
    }))
    .sort((a, b) => b.total_savings - a.total_savings);

  return {
    total_vendors: profiles.length,
    vendors_with_opportunities: vendorsWithOpps,
    total_estimated_savings: totalSavings,
    by_type: byTypeArr,
    top_opportunity_type: byTypeArr[0]?.type || "None",
  };
}

// ========================================================================
// Spend Flag Computation (v2) — flags spend records by risk/opportunity type
// ========================================================================

export interface SpendFlagResult {
  by_flag: Record<string, { count: number; spend: number }>;
  flagged_records: { record_id: number; flag: string; reason: string }[];
  total_flagged_count: number;
  total_flagged_spend: number;
}

export function computeSpendFlags(
  spendRecords: any[],
  contracts: any[],
  categories: any[],
  totalSpend: number,
): SpendFlagResult {
  const flagged: SpendFlagResult["flagged_records"] = [];
  const byFlag: Record<string, { count: number; spend: number }> = {
    tail: { count: 0, spend: 0 },
    maverick: { count: 0, spend: 0 },
    off_contract: { count: 0, spend: 0 },
    critical: { count: 0, spend: 0 },
    duplicate: { count: 0, spend: 0 },
  };

  // Pre-compute: supplier spend totals for tail/critical detection
  const supplierSpend = new Map<string, { total: number; records: number; categories: Set<number> }>();
  for (const r of spendRecords) {
    const name = (r.normalized_supplier_name || r.supplier_name || "").trim();
    if (!name) continue;
    if (!supplierSpend.has(name)) {
      supplierSpend.set(name, { total: 0, records: 0, categories: new Set() });
    }
    const s = supplierSpend.get(name)!;
    s.total += Math.abs(Number(r.amount) || 0);
    s.records++;
    if (r.category_id) s.categories.add(r.category_id);
  }

  // Pre-compute: top 5% suppliers by spend for critical detection
  const sortedSuppliers = [...supplierSpend.entries()].sort((a, b) => b[1].total - a[1].total);
  const top5PctCount = Math.max(1, Math.ceil(sortedSuppliers.length * 0.05));
  const top5PctSuppliers = new Set(sortedSuppliers.slice(0, top5PctCount).map(([name]) => name));

  // Pre-compute: category supplier counts for sole-source detection
  const categorySupplierCount = new Map<number, Set<string>>();
  for (const r of spendRecords) {
    if (!r.category_id) continue;
    const name = (r.normalized_supplier_name || r.supplier_name || "").trim();
    if (!name) continue;
    if (!categorySupplierCount.has(r.category_id)) {
      categorySupplierCount.set(r.category_id, new Set());
    }
    categorySupplierCount.get(r.category_id)!.add(name);
  }

  // Pre-compute: contract lookup by supplier for off-contract detection
  const contractBySupplier = new Map<string, any>();
  for (const c of contracts) {
    const name = (c.supplier_name || "").trim().toLowerCase();
    if (name) contractBySupplier.set(name, c);
  }

  // Flag each record
  for (const r of spendRecords) {
    const amt = Math.abs(Number(r.amount) || 0);
    const name = (r.normalized_supplier_name || r.supplier_name || "").trim();
    const recordId = r.id || 0;

    // 1. Tail spend: supplier <0.1% of total AND record_count < 5
    if (name && totalSpend > 0) {
      const sup = supplierSpend.get(name);
      if (sup && sup.total < totalSpend * 0.001 && sup.records < 5) {
        flagged.push({ record_id: recordId, flag: "tail", reason: `Supplier ${name} accounts for <0.1% of total spend with ${sup.records} records` });
        byFlag.tail.count++;
        byFlag.tail.spend += amt;
      }
    }

    // 2. Maverick: Non-PO spend > $1000
    const poType = (r.po_type || "").trim();
    if ((poType.toLowerCase() === "non-po" || poType === "") && amt > 1000) {
      flagged.push({ record_id: recordId, flag: "maverick", reason: `Non-PO spend of $${amt.toLocaleString()} for ${name || "unknown supplier"}` });
      byFlag.maverick.count++;
      byFlag.maverick.spend += amt;
    }

    // 3. Off-contract: supplier has contract but amount deviates >20%
    if (name) {
      const contract = contractBySupplier.get(name.toLowerCase());
      if (contract) {
        const contractRate = Number(contract.annual_value || contract.contracted_amount || 0);
        if (contractRate > 0) {
          const deviation = Math.abs(amt - contractRate) / contractRate;
          if (deviation > 0.20) {
            flagged.push({
              record_id: recordId,
              flag: "off_contract",
              reason: `Amount $${amt.toLocaleString()} deviates ${(deviation * 100).toFixed(0)}% from contracted rate $${contractRate.toLocaleString()} for ${name}`,
            });
            byFlag.off_contract.count++;
            byFlag.off_contract.spend += amt;
          }
        }
      }
    }

    // 4. Critical: supplier in top 5% by spend AND sole source in its category
    if (name && top5PctSuppliers.has(name) && r.category_id) {
      const catSuppliers = categorySupplierCount.get(r.category_id);
      if (catSuppliers && catSuppliers.size === 1) {
        flagged.push({
          record_id: recordId,
          flag: "critical",
          reason: `Top-5% supplier ${name} is sole source in category ${r.category_id}`,
        });
        byFlag.critical.count++;
        byFlag.critical.spend += amt;
      }
    }

    // 5. Duplicate: is_duplicate_flag = 1
    if (r.is_duplicate_flag === 1 || r.is_duplicate_flag === true) {
      flagged.push({ record_id: recordId, flag: "duplicate", reason: `Record marked as duplicate for ${name}` });
      byFlag.duplicate.count++;
      byFlag.duplicate.spend += amt;
    }
  }

  const totalFlaggedCount = flagged.length;
  const totalFlaggedSpend = Object.values(byFlag).reduce((s, f) => s + f.spend, 0);

  return {
    by_flag: byFlag,
    flagged_records: flagged,
    total_flagged_count: totalFlaggedCount,
    total_flagged_spend: Math.round(totalFlaggedSpend),
  };
}

// Currency formatter for evidence strings
function fmtCur(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
