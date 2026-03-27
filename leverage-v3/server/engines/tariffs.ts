// Deterministic tariff calculator — no AI.
// Models tariff stacking: MFN + Section 301 (by list level) + Section 232 + Reciprocal tariffs.
// Includes exclusion modeling, de minimis threshold, FTZ benefit estimation,
// effective_date tracking, and per-layer impact breakdown.
// All rates from published HTS schedules and executive orders as of March 2026.

interface TariffLayer {
  name: string;
  rate: number; // percent
  applies_to: string; // "all" | specific product scope
  effective_date: string; // YYYY-MM-DD when this rate took effect
}

export interface TariffResult {
  category_name: string;
  supplier_name: string;
  country_of_origin: string;
  tariff_layers: { name: string; rate: number; effective_date: string }[];
  effective_tariff_pct: number;
  annual_spend: number;
  estimated_impact: number;
  risk_level: string;
  mitigation_strategy: string;
  notes: string;

  // New: per-layer impact breakdown
  impact_by_layer: { layer_name: string; rate: number; impact: number }[];

  // New: exclusion and de minimis modeling
  exclusion_eligible: boolean;
  exclusion_notes: string;
  de_minimis_eligible: boolean;
  de_minimis_threshold: number;

  // New: FTZ benefit estimation
  ftz_potential_savings: number;
  ftz_notes: string;

  // New: Section 301 list-level detail (China only)
  section_301_list?: string;
  section_301_rate?: number;
}

interface SpendByCategory {
  category_name: string;
  total_amount: number;
  top_supplier: string;
  supplier_count: number;
  country_of_origin?: string; // user-configurable override
  avg_shipment_value?: number; // for de minimis check
}

// ---- Reciprocal Tariff Rates (White House EO, July 2025, updated Aug 2025) ----
// Source: whitehouse.gov/presidential-actions/2025/07/further-modifying-the-reciprocal-tariff-rates/
export const RECIPROCAL_TARIFF_RATES: Record<string, { rate: number; effective_date: string }> = {
  "China":       { rate: 30, effective_date: "2025-07-09" },   // Fentanyl-related tariff (stacks separately from Section 301)
  "EU":          { rate: 15, effective_date: "2025-07-09" },
  "United Kingdom": { rate: 10, effective_date: "2025-07-09" },
  "Japan":       { rate: 15, effective_date: "2025-07-09" },
  "South Korea": { rate: 15, effective_date: "2025-07-09" },
  "Taiwan":      { rate: 20, effective_date: "2025-07-09" },
  "India":       { rate: 25, effective_date: "2025-07-09" },
  "Vietnam":     { rate: 20, effective_date: "2025-07-09" },
  "Thailand":    { rate: 19, effective_date: "2025-07-09" },
  "Indonesia":   { rate: 19, effective_date: "2025-07-09" },
  "Malaysia":    { rate: 19, effective_date: "2025-07-09" },
  "Philippines": { rate: 19, effective_date: "2025-07-09" },
  "Bangladesh":  { rate: 20, effective_date: "2025-07-09" },
  "Cambodia":    { rate: 19, effective_date: "2025-07-09" },
  "Mexico":      { rate: 25, effective_date: "2025-03-04" },   // IEEPA fentanyl tariff
  "Canada":      { rate: 25, effective_date: "2025-03-04" },   // IEEPA fentanyl tariff
  "Brazil":      { rate: 10, effective_date: "2025-07-09" },
  "Switzerland": { rate: 39, effective_date: "2025-07-09" },
  "Israel":      { rate: 15, effective_date: "2025-07-09" },
  "Turkey":      { rate: 15, effective_date: "2025-07-09" },
  "New Zealand": { rate: 15, effective_date: "2025-07-09" },
  "Norway":      { rate: 15, effective_date: "2025-07-09" },
  "Iceland":     { rate: 15, effective_date: "2025-07-09" },
  "South Africa": { rate: 30, effective_date: "2025-07-09" },
  "Pakistan":    { rate: 19, effective_date: "2025-07-09" },
  "Sri Lanka":   { rate: 20, effective_date: "2025-07-09" },
  "Default":     { rate: 10, effective_date: "2025-07-09" },   // Baseline reciprocal for unlisted countries
};

// ---- Section 232 Rates (Steel/Aluminum, updated June 2025) ----
// Source: china-briefing.com, tradecomplianceresourcehub.com
// Steel & aluminum: 50% for all countries (raised from 25% on June 4, 2025)
// Automobiles & parts: 25% for all countries (effective April 3, 2025)
const SECTION_232_STEEL_ALUMINUM = { rate: 50, effective_date: "2025-06-04" };
const SECTION_232_AUTO = { rate: 25, effective_date: "2025-04-03" };

// ---- Section 301 Rates (China-specific, by list level and product category) ----
// Source: USTR four-year review (Sept 2024), china-briefing.com
// These are ADDITIONAL to reciprocal tariffs on Chinese goods

// List-level breakdown for accurate stacking
interface Section301Entry {
  rate: number;
  list: string; // "List 1", "List 2", "List 3", "List 4A", "List 4B", "Special"
  effective_date: string;
  notes: string;
}

export const SECTION_301_RATES: Record<string, Section301Entry> = {
  "steel_aluminum":          { rate: 25, list: "List 1", effective_date: "2018-07-06", notes: "Original List 1 (34B), stacks with Section 232" },
  "electronics_general":     { rate: 25, list: "List 1", effective_date: "2018-07-06", notes: "Original List 1/2 industrial goods" },
  "semiconductors":          { rate: 50, list: "Special", effective_date: "2024-09-27", notes: "Increased under USTR 4-year review Sept 2024" },
  "solar_cells":             { rate: 50, list: "Special", effective_date: "2024-09-27", notes: "Increased under USTR 4-year review Sept 2024" },
  "electric_vehicles":       { rate: 100, list: "Special", effective_date: "2024-09-27", notes: "Increased under USTR 4-year review Sept 2024" },
  "lithium_ion_batteries":   { rate: 25, list: "Special", effective_date: "2024-09-27", notes: "Increased under USTR 4-year review Sept 2024" },
  "critical_minerals":       { rate: 25, list: "Special", effective_date: "2025-01-01", notes: "New tariff effective 2025" },
  "medical_gloves":          { rate: 25, list: "Special", effective_date: "2026-01-01", notes: "Effective Jan 2026 per USTR review" },
  "syringes_needles":        { rate: 50, list: "Special", effective_date: "2024-09-27", notes: "Increased under USTR 4-year review" },
  "chemicals_general":       { rate: 25, list: "List 3", effective_date: "2018-09-24", notes: "List 3 (200B)" },
  "plastics_general":        { rate: 25, list: "List 3", effective_date: "2018-09-24", notes: "List 3 (200B)" },
  "machinery_general":       { rate: 25, list: "List 2", effective_date: "2018-08-23", notes: "List 2 (16B)" },
  "paper_products":          { rate: 7.5, list: "List 4A", effective_date: "2020-02-14", notes: "List 4A reduced from 15% to 7.5%" },
  "consumer_goods":          { rate: 7.5, list: "List 4A", effective_date: "2020-02-14", notes: "List 4A reduced from 15% to 7.5%" },
  "list_4b_goods":           { rate: 0, list: "List 4B", effective_date: "2019-12-15", notes: "List 4B suspended indefinitely" },
  "default":                 { rate: 25, list: "List 1", effective_date: "2018-07-06", notes: "Default rate for most industrial goods" },
};

// ---- Average MFN (Most-Favored-Nation) Rates by Category ----
// Source: WTO tariff database, avg ~3.3% across all goods
const MFN_RATES: Record<string, number> = {
  "Metals":                   0,    // Covered by 232
  "Raw Materials":            2.5,
  "Chemicals":                5.5,
  "Plastics/Polymers":        5.0,
  "Electronics/Hardware":     1.5,
  "Semiconductors":           0,
  "IT":                       0,    // ITA zero
  "Paper/Fiber":              0,
  "Packaging":                3.0,
  "Spare Parts":              2.5,
  "MRO":                      3.0,
  "Contract Manufacturing":   3.5,
  "Energy":                   0,
  "Automobiles/Parts":        2.5,
  "Default":                  3.3,
};

// ---- De Minimis Thresholds by Country ----
// Source: CBP, various trade agreements
// Shipments below this value are exempt from tariffs
const DE_MINIMIS_THRESHOLDS: Record<string, number> = {
  "US":            800,    // USD, raised from $200 in 2016
  "Canada":        150,    // CAD (~$110 USD)
  "EU":            150,    // EUR (~$160 USD)
  "United Kingdom": 135,   // GBP (~$170 USD)
  "Japan":         10000,  // JPY (~$67 USD)
  "Australia":     1000,   // AUD (~$650 USD)
  "Default":       200,    // Conservative default in USD
};

// ---- Product Exclusion Profiles ----
// Tracks whether product-specific exclusions have been available
interface ExclusionProfile {
  exclusion_available: boolean;
  exclusion_window: string; // "expired", "open", "pending", "n/a"
  exclusion_notes: string;
}

const EXCLUSION_PROFILES: Record<string, ExclusionProfile> = {
  "steel_aluminum": { exclusion_available: false, exclusion_window: "expired", exclusion_notes: "Section 232 product exclusions expired March 2025; no renewal announced" },
  "electronics_general": { exclusion_available: false, exclusion_window: "expired", exclusion_notes: "List 1-3 exclusions expired Dec 2023; some reinstated briefly in 2024" },
  "machinery_general": { exclusion_available: false, exclusion_window: "expired", exclusion_notes: "List 2 exclusions expired; check USTR portal for reinstatements" },
  "chemicals_general": { exclusion_available: false, exclusion_window: "expired", exclusion_notes: "List 3 exclusions expired; limited reinstatements in 2024" },
  "semiconductors": { exclusion_available: false, exclusion_window: "n/a", exclusion_notes: "No exclusion program for special-review categories" },
  "consumer_goods": { exclusion_available: false, exclusion_window: "expired", exclusion_notes: "List 4A exclusions expired March 2025" },
  "default": { exclusion_available: false, exclusion_window: "expired", exclusion_notes: "Most Section 301 exclusions have expired; monitor USTR Federal Register notices" },
};

// ---- FTZ (Foreign Trade Zone) Benefit Rates ----
// FTZ allows inverted tariff benefits: pay duty on finished goods vs components
// Typical benefit is the difference between component tariff and finished-goods tariff
// Source: NAFTZ, CBP FTZ Board annual report
const FTZ_BENEFIT_RATES: Record<string, number> = {
  "Metals": 0.10,               // 10% of tariff can be saved via FTZ inverted tariff
  "Raw Materials": 0.08,
  "Chemicals": 0.08,
  "Plastics/Polymers": 0.10,
  "Electronics/Hardware": 0.15, // Higher benefit due to component/finished-goods inversion
  "Semiconductors": 0.05,
  "Packaging": 0.08,
  "Spare Parts": 0.10,
  "MRO": 0.08,
  "Contract Manufacturing": 0.12,
  "Automobiles/Parts": 0.15,    // Significant FTZ usage in auto sector
  "Default": 0.08,
};

// ---- Category → tariff profile mapping ----
interface CategoryTariffProfile {
  hts_chapters: string;
  section_232_applies: boolean;
  section_232_type?: "steel_aluminum" | "auto";
  section_301_key: string;       // Key into SECTION_301_RATES
  is_service: boolean;           // Services are not tariffed
  default_origin: string;        // Default if user doesn't specify
  mfn_key: string;
}

export const CATEGORY_TARIFF_PROFILES: Record<string, CategoryTariffProfile> = {
  "Metals": {
    hts_chapters: "72-73",
    section_232_applies: true,
    section_232_type: "steel_aluminum",
    section_301_key: "steel_aluminum",
    is_service: false,
    default_origin: "China",
    mfn_key: "Metals",
  },
  "Raw Materials": {
    hts_chapters: "25-27",
    section_232_applies: false,
    section_301_key: "chemicals_general",
    is_service: false,
    default_origin: "China",
    mfn_key: "Raw Materials",
  },
  "Chemicals": {
    hts_chapters: "28-38",
    section_232_applies: false,
    section_301_key: "chemicals_general",
    is_service: false,
    default_origin: "China",
    mfn_key: "Chemicals",
  },
  "Plastics/Polymers": {
    hts_chapters: "39",
    section_232_applies: false,
    section_301_key: "plastics_general",
    is_service: false,
    default_origin: "China",
    mfn_key: "Plastics/Polymers",
  },
  "Electronics/Hardware": {
    hts_chapters: "84-85",
    section_232_applies: false,
    section_301_key: "electronics_general",
    is_service: false,
    default_origin: "China",
    mfn_key: "Electronics/Hardware",
  },
  "Semiconductors": {
    hts_chapters: "8541-8542",
    section_232_applies: false,
    section_301_key: "semiconductors",
    is_service: false,
    default_origin: "Taiwan",
    mfn_key: "Semiconductors",
  },
  "IT": {
    hts_chapters: "84-85 (ITA)",
    section_232_applies: false,
    section_301_key: "electronics_general",
    is_service: false,
    default_origin: "China",
    mfn_key: "IT",
  },
  "Paper/Fiber": {
    hts_chapters: "47-48",
    section_232_applies: false,
    section_301_key: "paper_products",
    is_service: false,
    default_origin: "Canada",
    mfn_key: "Paper/Fiber",
  },
  "Packaging": {
    hts_chapters: "39,48",
    section_232_applies: false,
    section_301_key: "plastics_general",
    is_service: false,
    default_origin: "China",
    mfn_key: "Packaging",
  },
  "Primary Packaging": {
    hts_chapters: "39,48",
    section_232_applies: false,
    section_301_key: "plastics_general",
    is_service: false,
    default_origin: "China",
    mfn_key: "Packaging",
  },
  "Spare Parts": {
    hts_chapters: "84-85",
    section_232_applies: false,
    section_301_key: "machinery_general",
    is_service: false,
    default_origin: "China",
    mfn_key: "Spare Parts",
  },
  "MRO": {
    hts_chapters: "82-84",
    section_232_applies: false,
    section_301_key: "machinery_general",
    is_service: false,
    default_origin: "China",
    mfn_key: "MRO",
  },
  "Contract Manufacturing": {
    hts_chapters: "Various",
    section_232_applies: false,
    section_301_key: "default",
    is_service: false,
    default_origin: "Mexico",
    mfn_key: "Contract Manufacturing",
  },
  "Energy": {
    hts_chapters: "27",
    section_232_applies: false,
    section_301_key: "default",
    is_service: false,
    default_origin: "Canada",
    mfn_key: "Energy",
  },
  "Automobiles/Parts": {
    hts_chapters: "87",
    section_232_applies: true,
    section_232_type: "auto",
    section_301_key: "electronics_general",
    is_service: false,
    default_origin: "Mexico",
    mfn_key: "Automobiles/Parts",
  },
  // ---- Services (not tariffed) ----
  "Consulting":           { hts_chapters: "N/A", section_232_applies: false, section_301_key: "default", is_service: true, default_origin: "Domestic", mfn_key: "Default" },
  "Legal":                { hts_chapters: "N/A", section_232_applies: false, section_301_key: "default", is_service: true, default_origin: "Domestic", mfn_key: "Default" },
  "Audit & Accounting":   { hts_chapters: "N/A", section_232_applies: false, section_301_key: "default", is_service: true, default_origin: "Domestic", mfn_key: "Default" },
  "Staffing/Temp Labor":  { hts_chapters: "N/A", section_232_applies: false, section_301_key: "default", is_service: true, default_origin: "Domestic", mfn_key: "Default" },
  "IT Services":          { hts_chapters: "N/A", section_232_applies: false, section_301_key: "default", is_service: true, default_origin: "Domestic", mfn_key: "Default" },
  "Software Licensing":   { hts_chapters: "N/A", section_232_applies: false, section_301_key: "default", is_service: true, default_origin: "Domestic", mfn_key: "Default" },
  "Cloud/Hosting":        { hts_chapters: "N/A", section_232_applies: false, section_301_key: "default", is_service: true, default_origin: "Domestic", mfn_key: "Default" },
  "Travel":               { hts_chapters: "N/A", section_232_applies: false, section_301_key: "default", is_service: true, default_origin: "Domestic", mfn_key: "Default" },
  "Insurance":            { hts_chapters: "N/A", section_232_applies: false, section_301_key: "default", is_service: true, default_origin: "Domestic", mfn_key: "Default" },
  "Marketing":            { hts_chapters: "N/A", section_232_applies: false, section_301_key: "default", is_service: true, default_origin: "Domestic", mfn_key: "Default" },
  "Facilities":           { hts_chapters: "N/A", section_232_applies: false, section_301_key: "default", is_service: true, default_origin: "Domestic", mfn_key: "Default" },
  "Telecom":              { hts_chapters: "N/A", section_232_applies: false, section_301_key: "default", is_service: true, default_origin: "Domestic", mfn_key: "Default" },
  "Training":             { hts_chapters: "N/A", section_232_applies: false, section_301_key: "default", is_service: true, default_origin: "Domestic", mfn_key: "Default" },
  "Benefits Administration": { hts_chapters: "N/A", section_232_applies: false, section_301_key: "default", is_service: true, default_origin: "Domestic", mfn_key: "Default" },
};

const MITIGATION_STRATEGIES: Record<string, string> = {
  Critical: "Immediate dual-sourcing with domestic/FTA suppliers; renegotiate contracts with tariff pass-through or sharing clauses; accelerate inventory build; evaluate bonded warehouse/FTZ strategies; file for product-specific exclusions if available",
  High: "Qualify alternative suppliers in lower-tariff countries; include tariff escalation clauses in new contracts; evaluate nearshoring options; review classification for duty optimization",
  Medium: "Monitor rate changes quarterly; evaluate alternative sourcing countries; include tariff adjustment mechanisms in contracts at renewal",
  Low: "No immediate action needed; review at next contract renewal; monitor trade policy developments",
};

function findBestTariffProfile(categoryName: string): CategoryTariffProfile | null {
  const lower = (categoryName || "").toLowerCase();

  // Try exact key match first
  for (const key of Object.keys(CATEGORY_TARIFF_PROFILES)) {
    if (key.toLowerCase() === lower) return CATEGORY_TARIFF_PROFILES[key];
  }
  // Partial match
  for (const key of Object.keys(CATEGORY_TARIFF_PROFILES)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return CATEGORY_TARIFF_PROFILES[key];
  }
  // Keyword fallback
  if (lower.includes("metal") || lower.includes("steel") || lower.includes("aluminum")) return CATEGORY_TARIFF_PROFILES["Metals"];
  if (lower.includes("chem") || lower.includes("resin")) return CATEGORY_TARIFF_PROFILES["Chemicals"];
  if (lower.includes("plastic") || lower.includes("polymer")) return CATEGORY_TARIFF_PROFILES["Plastics/Polymers"];
  if (lower.includes("electron") || lower.includes("hardware") || lower.includes("computer")) return CATEGORY_TARIFF_PROFILES["Electronics/Hardware"];
  if (lower.includes("semiconductor") || lower.includes("chip") || lower.includes("wafer")) return CATEGORY_TARIFF_PROFILES["Semiconductors"];
  if (lower.includes("software") || lower.includes("saas") || lower.includes("license")) return CATEGORY_TARIFF_PROFILES["Software Licensing"];
  if (lower.includes("paper") || lower.includes("fiber")) return CATEGORY_TARIFF_PROFILES["Paper/Fiber"];
  if (lower.includes("packag")) return CATEGORY_TARIFF_PROFILES["Packaging"];
  if (lower.includes("mro") || lower.includes("maintenance")) return CATEGORY_TARIFF_PROFILES["MRO"];
  if (lower.includes("contract manuf")) return CATEGORY_TARIFF_PROFILES["Contract Manufacturing"];
  if (lower.includes("energy") || lower.includes("electric") || lower.includes("fuel")) return CATEGORY_TARIFF_PROFILES["Energy"];
  if (lower.includes("auto") || lower.includes("vehicle")) return CATEGORY_TARIFF_PROFILES["Automobiles/Parts"];
  if (lower.includes("raw") || lower.includes("material")) return CATEGORY_TARIFF_PROFILES["Raw Materials"];
  if (lower.includes("spare") || lower.includes("part")) return CATEGORY_TARIFF_PROFILES["Spare Parts"];
  // Service keywords
  if (lower.includes("consult") || lower.includes("advisory")) return CATEGORY_TARIFF_PROFILES["Consulting"];
  if (lower.includes("legal")) return CATEGORY_TARIFF_PROFILES["Legal"];
  if (lower.includes("audit") || lower.includes("account")) return CATEGORY_TARIFF_PROFILES["Audit & Accounting"];
  if (lower.includes("staff") || lower.includes("temp")) return CATEGORY_TARIFF_PROFILES["Staffing/Temp Labor"];
  if (lower.includes("it service")) return CATEGORY_TARIFF_PROFILES["IT Services"];
  if (lower.includes("cloud") || lower.includes("hosting")) return CATEGORY_TARIFF_PROFILES["Cloud/Hosting"];
  if (lower.includes("travel") || lower.includes("lodg")) return CATEGORY_TARIFF_PROFILES["Travel"];
  if (lower.includes("insur")) return CATEGORY_TARIFF_PROFILES["Insurance"];
  if (lower.includes("market") || lower.includes("advertis")) return CATEGORY_TARIFF_PROFILES["Marketing"];
  if (lower.includes("facilit") || lower.includes("janitor") || lower.includes("security")) return CATEGORY_TARIFF_PROFILES["Facilities"];
  if (lower.includes("telecom") || lower.includes("phone")) return CATEGORY_TARIFF_PROFILES["Telecom"];
  if (lower.includes("train")) return CATEGORY_TARIFF_PROFILES["Training"];

  return null;
}

function formatCurrency(v: number): string {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

// ---- Compute stacked tariff for a category × country ----
function computeStackedTariff(
  profile: CategoryTariffProfile,
  country: string,
): { layers: { name: string; rate: number; effective_date: string }[]; effective_rate: number; section_301_list?: string; section_301_rate?: number } {
  const layers: { name: string; rate: number; effective_date: string }[] = [];

  if (profile.is_service) {
    return { layers: [{ name: "Services (not subject to tariffs)", rate: 0, effective_date: "N/A" }], effective_rate: 0 };
  }

  // Layer 1: MFN duty
  const mfn = MFN_RATES[profile.mfn_key] ?? MFN_RATES["Default"] ?? 3.3;
  if (mfn > 0) {
    layers.push({ name: `MFN Duty (HTS ${profile.hts_chapters})`, rate: mfn, effective_date: "2024-01-01" });
  }

  // Layer 2: Section 232 (steel/aluminum or auto — applies to ALL countries)
  if (profile.section_232_applies) {
    const s232 = profile.section_232_type === "auto" ? SECTION_232_AUTO : SECTION_232_STEEL_ALUMINUM;
    layers.push({ name: `Section 232 (${profile.section_232_type === "auto" ? "Auto" : "Steel/Aluminum"})`, rate: s232.rate, effective_date: s232.effective_date });
  }

  // Layer 3: Section 301 (China only) — with list-level detail
  let section301List: string | undefined;
  let section301Rate: number | undefined;
  const isChina = country === "China";
  if (isChina) {
    const s301Entry = SECTION_301_RATES[profile.section_301_key] ?? SECTION_301_RATES["default"];
    if (s301Entry.rate > 0) {
      layers.push({ name: `Section 301 (China — ${s301Entry.list})`, rate: s301Entry.rate, effective_date: s301Entry.effective_date });
      section301List = s301Entry.list;
      section301Rate = s301Entry.rate;
    }
  }

  // Layer 4: Reciprocal tariff
  // Note: Section 232 products are generally exempt from reciprocal tariffs,
  // but the non-232 portion of derivative products is subject to reciprocal.
  // For simplicity, if 232 applies to the whole product, skip reciprocal.
  if (!profile.section_232_applies) {
    const recipEntry = RECIPROCAL_TARIFF_RATES[country] ?? RECIPROCAL_TARIFF_RATES["Default"];
    if (recipEntry.rate > 0) {
      layers.push({ name: `Reciprocal Tariff (${country})`, rate: recipEntry.rate, effective_date: recipEntry.effective_date });
    }
  }

  // Tariffs stack additively (they are cumulative ad valorem duties)
  const effective_rate = layers.reduce((sum, l) => sum + l.rate, 0);

  return { layers, effective_rate, section_301_list: section301List, section_301_rate: section301Rate };
}

// ---- Check de minimis eligibility ----
function checkDeMinimis(avgShipmentValue: number | undefined): { eligible: boolean; threshold: number } {
  // US de minimis is $800 per shipment
  const threshold = DE_MINIMIS_THRESHOLDS["US"];
  if (avgShipmentValue !== undefined && avgShipmentValue > 0 && avgShipmentValue <= threshold) {
    return { eligible: true, threshold };
  }
  return { eligible: false, threshold };
}

// ---- Estimate FTZ savings ----
function estimateFtzSavings(
  annualSpend: number,
  effectiveTariffPct: number,
  mfnKey: string,
): { savings: number; notes: string } {
  if (effectiveTariffPct <= 0) return { savings: 0, notes: "No tariff liability — FTZ not applicable" };

  const benefitRate = FTZ_BENEFIT_RATES[mfnKey] ?? FTZ_BENEFIT_RATES["Default"];
  const tariffAmount = annualSpend * (effectiveTariffPct / 100);
  const savings = Math.round(tariffAmount * benefitRate);

  if (savings < 5000) {
    return { savings: 0, notes: "FTZ benefit too small to justify setup costs (est. <$5K annual savings)" };
  }

  return {
    savings,
    notes: `Estimated ${(benefitRate * 100).toFixed(0)}% tariff reduction via FTZ inverted tariff/duty deferral = ${formatCurrency(savings)} annual savings (source: NAFTZ benefit estimates)`,
  };
}

// ---- Check exclusion eligibility ----
function checkExclusion(section301Key: string): { eligible: boolean; notes: string } {
  const profile = EXCLUSION_PROFILES[section301Key] ?? EXCLUSION_PROFILES["default"];
  return {
    eligible: profile.exclusion_available,
    notes: profile.exclusion_notes,
  };
}

// ========================================================================
// Sourcing Shift Net Benefit Analysis — NEW for v2
// ========================================================================

// Logistics cost delta estimates (% of annual spend) for common sourcing shifts.
// Source: Deloitte Global Supply Chain Survey 2024, ISM logistics benchmarks.
// Key: "from→to" or separate origin/destination matching.
interface LogisticsDelta {
  logistics_pct: number; // additional logistics cost as % of spend
  transit_days: number;  // estimated transit time change (days)
  notes: string;
}

const LOGISTICS_DELTA_TABLE: Record<string, LogisticsDelta> = {
  // From China
  "China→US":          { logistics_pct: 0.030, transit_days: 25, notes: "Trans-Pacific ocean freight + US inland" },
  "China→Mexico":      { logistics_pct: 0.035, transit_days: 30, notes: "Trans-Pacific + Mexico inland" },
  "China→Vietnam":     { logistics_pct: 0.015, transit_days: 5,  notes: "Short-haul intra-Asia" },
  "China→India":       { logistics_pct: 0.020, transit_days: 10, notes: "Intra-Asia ocean freight" },
  "China→EU":          { logistics_pct: 0.035, transit_days: 30, notes: "Asia-Europe ocean/rail" },
  // From Vietnam
  "Vietnam→US":        { logistics_pct: 0.040, transit_days: 28, notes: "Trans-Pacific ocean freight, less mature port infra" },
  "Vietnam→EU":        { logistics_pct: 0.040, transit_days: 32, notes: "Asia-Europe ocean freight" },
  // From India
  "India→US":          { logistics_pct: 0.035, transit_days: 30, notes: "Indian Ocean + trans-Atlantic" },
  "India→EU":          { logistics_pct: 0.030, transit_days: 22, notes: "Indian Ocean → Suez → Mediterranean" },
  // From Mexico (nearshoring)
  "Mexico→US":         { logistics_pct: 0.015, transit_days: 3,  notes: "Cross-border trucking, USMCA benefits" },
  "US→Mexico":         { logistics_pct: 0.015, transit_days: 3,  notes: "Cross-border trucking" },
  // From Canada
  "Canada→US":         { logistics_pct: 0.010, transit_days: 2,  notes: "USMCA cross-border" },
  "US→Canada":         { logistics_pct: 0.010, transit_days: 2,  notes: "USMCA cross-border" },
  // From EU
  "EU→US":             { logistics_pct: 0.025, transit_days: 14, notes: "Trans-Atlantic ocean freight" },
  "EU→Mexico":         { logistics_pct: 0.030, transit_days: 18, notes: "Trans-Atlantic + Mexico inland" },
  // From Japan/South Korea/Taiwan
  "Japan→US":          { logistics_pct: 0.030, transit_days: 14, notes: "Trans-Pacific ocean freight" },
  "South Korea→US":    { logistics_pct: 0.030, transit_days: 16, notes: "Trans-Pacific ocean freight" },
  "Taiwan→US":         { logistics_pct: 0.030, transit_days: 18, notes: "Trans-Pacific ocean freight" },
  // From Brazil
  "Brazil→US":         { logistics_pct: 0.025, transit_days: 16, notes: "Atlantic ocean freight" },
  // Domestic (no shift)
  "US→US":             { logistics_pct: 0.000, transit_days: 0,  notes: "Domestic — no logistics delta" },
  "Domestic→Domestic": { logistics_pct: 0.000, transit_days: 0,  notes: "Domestic — no logistics delta" },
};

const DEFAULT_LOGISTICS: LogisticsDelta = { logistics_pct: 0.030, transit_days: 20, notes: "Estimated based on average international freight costs" };

// Quality risk cost as % of spend for different shift scenarios
// Source: A&M Performance Improvement Practice (n=200+ supplier transitions)
const QUALITY_RISK_TABLE: Record<string, number> = {
  "same_region":     0.005, // 0.5% — minimal risk (e.g., EU→EU)
  "near_shore":      0.010, // 1.0% — nearshoring (e.g., China→Mexico for US buyer)
  "cross_region":    0.015, // 1.5% — cross-region (e.g., EU→Asia)
  "emerging_market": 0.020, // 2.0% — to/from emerging market
};

const DEVELOPED_COUNTRIES = new Set([
  "US", "USA", "Domestic", "Canada", "EU", "United Kingdom", "Japan",
  "South Korea", "Taiwan", "Australia", "New Zealand", "Switzerland",
  "Norway", "Iceland", "Israel",
]);

const NEARSHORE_PAIRS = new Set([
  "Mexico→US", "US→Mexico", "Canada→US", "US→Canada",
  "EU→United Kingdom", "United Kingdom→EU",
]);

function getQualityRiskPct(currentCountry: string, proposedCountry: string): number {
  if (currentCountry === proposedCountry) return 0;
  const key = `${currentCountry}→${proposedCountry}`;
  if (NEARSHORE_PAIRS.has(key)) return QUALITY_RISK_TABLE["near_shore"];
  const currentDev = DEVELOPED_COUNTRIES.has(currentCountry);
  const proposedDev = DEVELOPED_COUNTRIES.has(proposedCountry);
  if (currentDev && proposedDev) return QUALITY_RISK_TABLE["same_region"];
  if (!currentDev && !proposedDev) return QUALITY_RISK_TABLE["cross_region"];
  if (!proposedDev) return QUALITY_RISK_TABLE["emerging_market"];
  return QUALITY_RISK_TABLE["cross_region"];
}

function getLogisticsDelta(from: string, to: string): LogisticsDelta {
  const key = `${from}→${to}`;
  if (LOGISTICS_DELTA_TABLE[key]) return LOGISTICS_DELTA_TABLE[key];
  // Try reverse
  const rev = `${to}→${from}`;
  if (LOGISTICS_DELTA_TABLE[rev]) return LOGISTICS_DELTA_TABLE[rev];
  return DEFAULT_LOGISTICS;
}

export interface SourceShiftResult {
  category_name: string;
  current_country: string;
  proposed_country: string;
  annual_spend: number;

  // Savings
  gross_savings_pct: number;
  gross_savings: number;

  // Current tariff
  current_tariff_pct: number;
  current_tariff_layers: { name: string; rate: number; effective_date: string }[];

  // Proposed tariff
  proposed_tariff_pct: number;
  proposed_tariff_layers: { name: string; rate: number; effective_date: string }[];

  // Deltas
  tariff_delta_pct: number;
  tariff_delta_cost: number;
  logistics_delta_pct: number;
  logistics_delta_cost: number;
  logistics_notes: string;
  logistics_transit_days: number;
  quality_risk_pct: number;
  quality_risk_cost: number;

  // Net result
  net_savings: number;
  net_savings_pct: number;
  break_even_savings_rate: number;
  recommendation: "Proceed" | "Marginal" | "Not recommended";
  recommendation_rationale: string;
}

export function analyzeSourceShift(
  categoryName: string,
  currentCountry: string,
  proposedCountry: string,
  annualSpend: number,
  grossSavingsPct: number,
): SourceShiftResult {
  const profile = findBestTariffProfile(categoryName);

  // Compute tariff stacks for both countries
  let currentTariff = { layers: [] as { name: string; rate: number; effective_date: string }[], effective_rate: 0 };
  let proposedTariff = { layers: [] as { name: string; rate: number; effective_date: string }[], effective_rate: 0 };

  if (profile && !profile.is_service) {
    const isDomesticCurrent = currentCountry === "Domestic" || currentCountry === "USA" || currentCountry === "US";
    const isDomesticProposed = proposedCountry === "Domestic" || proposedCountry === "USA" || proposedCountry === "US";

    if (!isDomesticCurrent) {
      currentTariff = computeStackedTariff(profile, currentCountry);
    }
    if (!isDomesticProposed) {
      proposedTariff = computeStackedTariff(profile, proposedCountry);
    }
  }

  const grossSavings = Math.round(annualSpend * grossSavingsPct);

  const tariffDeltaPct = proposedTariff.effective_rate - currentTariff.effective_rate;
  const tariffDeltaCost = Math.round(annualSpend * (tariffDeltaPct / 100));

  const logistics = getLogisticsDelta(currentCountry, proposedCountry);
  const logisticsDeltaCost = Math.round(annualSpend * logistics.logistics_pct);

  const qualityRiskPct = getQualityRiskPct(currentCountry, proposedCountry);
  const qualityRiskCost = Math.round(annualSpend * qualityRiskPct);

  const netSavings = grossSavings - tariffDeltaCost - logisticsDeltaCost - qualityRiskCost;
  const netSavingsPct = annualSpend > 0 ? Math.round((netSavings / annualSpend) * 10000) / 100 : 0;

  const breakEvenRate = annualSpend > 0
    ? Math.round(((tariffDeltaCost + logisticsDeltaCost + qualityRiskCost) / annualSpend) * 10000) / 10000
    : 0;

  let recommendation: SourceShiftResult["recommendation"];
  let rationale: string;
  if (netSavings <= 0) {
    recommendation = "Not recommended";
    rationale = `Net savings negative (${formatCurrency(netSavings)}). Tariff delta (${tariffDeltaPct.toFixed(1)}%), logistics (${(logistics.logistics_pct * 100).toFixed(1)}%), and quality risk (${(qualityRiskPct * 100).toFixed(1)}%) exceed gross savings.`;
  } else if (netSavingsPct < 2) {
    recommendation = "Marginal";
    rationale = `Net savings positive but thin (${netSavingsPct.toFixed(1)}% of spend). Break-even at ${(breakEvenRate * 100).toFixed(1)}% gross savings. Consider implementation risk before proceeding.`;
  } else {
    recommendation = "Proceed";
    rationale = `Net savings of ${formatCurrency(netSavings)} (${netSavingsPct.toFixed(1)}% of spend) after all costs. Break-even at ${(breakEvenRate * 100).toFixed(1)}% gross savings — comfortable margin.`;
  }

  return {
    category_name: categoryName,
    current_country: currentCountry,
    proposed_country: proposedCountry,
    annual_spend: annualSpend,
    gross_savings_pct: grossSavingsPct,
    gross_savings: grossSavings,
    current_tariff_pct: currentTariff.effective_rate,
    current_tariff_layers: currentTariff.layers,
    proposed_tariff_pct: proposedTariff.effective_rate,
    proposed_tariff_layers: proposedTariff.layers,
    tariff_delta_pct: tariffDeltaPct,
    tariff_delta_cost: tariffDeltaCost,
    logistics_delta_pct: logistics.logistics_pct,
    logistics_delta_cost: logisticsDeltaCost,
    logistics_notes: logistics.notes,
    logistics_transit_days: logistics.transit_days,
    quality_risk_pct: qualityRiskPct,
    quality_risk_cost: qualityRiskCost,
    net_savings: netSavings,
    net_savings_pct: netSavingsPct,
    break_even_savings_rate: breakEvenRate,
    recommendation,
    recommendation_rationale: rationale,
  };
}

export function analyzeTariffImpact(spendByCategory: SpendByCategory[]): TariffResult[] {
  const results: TariffResult[] = [];

  for (const cat of spendByCategory) {
    const profile = findBestTariffProfile(cat.category_name);
    if (!profile) continue;

    // User-configured country override, or profile default
    const country = cat.country_of_origin || profile.default_origin;

    // Skip domestic-origin (no tariff)
    if (country === "Domestic" || country === "USA" || country === "US") continue;

    const { layers, effective_rate, section_301_list, section_301_rate } = computeStackedTariff(profile, country);
    if (effective_rate <= 0) continue;

    const impact = Math.round(cat.total_amount * (effective_rate / 100));

    // Per-layer impact breakdown
    const impactByLayer = layers
      .filter(l => l.rate > 0)
      .map(l => ({
        layer_name: l.name,
        rate: l.rate,
        impact: Math.round(cat.total_amount * (l.rate / 100)),
      }));

    let riskLevel: string;
    if (effective_rate > 40) riskLevel = "Critical";
    else if (effective_rate > 20) riskLevel = "High";
    else if (effective_rate > 10) riskLevel = "Medium";
    else riskLevel = "Low";

    const layerStr = layers.map(l => `${l.name}: ${l.rate}%`).join(" + ");

    // De minimis check
    const deMinimis = checkDeMinimis(cat.avg_shipment_value);

    // Exclusion eligibility (only relevant for China Section 301)
    const exclusion = country === "China"
      ? checkExclusion(profile.section_301_key)
      : { eligible: false, notes: "Exclusions only apply to Section 301 (China)" };

    // FTZ savings estimate
    const ftz = estimateFtzSavings(cat.total_amount, effective_rate, profile.mfn_key);

    const result: TariffResult = {
      category_name: cat.category_name,
      supplier_name: cat.top_supplier || "Various",
      country_of_origin: country,
      tariff_layers: layers,
      effective_tariff_pct: effective_rate,
      annual_spend: cat.total_amount,
      estimated_impact: impact,
      risk_level: riskLevel,
      mitigation_strategy: MITIGATION_STRATEGIES[riskLevel] || MITIGATION_STRATEGIES["Low"],
      notes: `HTS ${profile.hts_chapters}. Stacked: ${layerStr} = ${effective_rate}%. Impact: ${formatCurrency(impact)}`,
      impact_by_layer: impactByLayer,
      exclusion_eligible: exclusion.eligible,
      exclusion_notes: exclusion.notes,
      de_minimis_eligible: deMinimis.eligible,
      de_minimis_threshold: deMinimis.threshold,
      ftz_potential_savings: ftz.savings,
      ftz_notes: ftz.notes,
    };

    if (section_301_list) result.section_301_list = section_301_list;
    if (section_301_rate !== undefined) result.section_301_rate = section_301_rate;

    results.push(result);
  }

  return results.sort((a, b) => b.estimated_impact - a.estimated_impact);
}
