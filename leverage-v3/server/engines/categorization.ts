// Data-driven categorization engine.
// Six strategies in priority order:
//   1. Imported category data (L1/L2/L3 from the file itself)
//   2. User-defined rules (GL/supplier/description matching)
//   3. Learned GL→Category mappings (inferred from already-categorized records)
//   4. Learned Supplier→Category mappings
//   5. Default supplier keyword rules
//   6. Default description keyword rules
//
// Multi-signal boosting: when supplier and description signals agree, confidence is boosted.
// Ambiguity detection: when signals conflict, alternative_categories are reported.
// UNSPSC-aligned L1/L2/L3 taxonomy for standardized rollup analytics.
// Based on UN Standard Products and Services Code (UNSPSC) segments/families.

// ---- Standard Taxonomy (UNSPSC-aligned) ----
export interface TaxonomyNode {
  code: string;      // UNSPSC-style code
  name: string;
  level: "L1" | "L2" | "L3";
  parent_code?: string;
}

// L1 = Segment, L2 = Family, L3 = Class (simplified for procurement)
export const STANDARD_TAXONOMY: TaxonomyNode[] = [
  // L1: Direct Materials
  { code: "10", name: "Direct Materials", level: "L1" },
  { code: "1010", name: "Raw Materials", level: "L2", parent_code: "10" },
  { code: "101001", name: "Metals & Steel", level: "L3", parent_code: "1010" },
  { code: "101002", name: "Chemicals & Solvents", level: "L3", parent_code: "1010" },
  { code: "101003", name: "Plastics & Polymers", level: "L3", parent_code: "1010" },
  { code: "101004", name: "Paper & Fiber", level: "L3", parent_code: "1010" },
  { code: "101005", name: "Lumber & Wood", level: "L3", parent_code: "1010" },
  { code: "1020", name: "Packaging", level: "L2", parent_code: "10" },
  { code: "102001", name: "Primary Packaging", level: "L3", parent_code: "1020" },
  { code: "102002", name: "Secondary Packaging", level: "L3", parent_code: "1020" },
  { code: "1030", name: "Components & Assemblies", level: "L2", parent_code: "10" },
  { code: "103001", name: "Electronics Components", level: "L3", parent_code: "1030" },
  { code: "103002", name: "Mechanical Components", level: "L3", parent_code: "1030" },
  { code: "1040", name: "Contract Manufacturing", level: "L2", parent_code: "10" },

  // L1: Indirect — Facilities & Operations
  { code: "20", name: "Facilities & Operations", level: "L1" },
  { code: "2010", name: "Facilities Management", level: "L2", parent_code: "20" },
  { code: "201001", name: "Janitorial & Cleaning", level: "L3", parent_code: "2010" },
  { code: "201002", name: "Security Services", level: "L3", parent_code: "2010" },
  { code: "201003", name: "Waste Management", level: "L3", parent_code: "2010" },
  { code: "2020", name: "Energy & Utilities", level: "L2", parent_code: "20" },
  { code: "202001", name: "Electricity", level: "L3", parent_code: "2020" },
  { code: "202002", name: "Natural Gas", level: "L3", parent_code: "2020" },
  { code: "202003", name: "Fuel", level: "L3", parent_code: "2020" },
  { code: "2030", name: "MRO & Maintenance", level: "L2", parent_code: "20" },
  { code: "203001", name: "Spare Parts", level: "L3", parent_code: "2030" },
  { code: "203002", name: "Safety Equipment", level: "L3", parent_code: "2030" },
  { code: "2040", name: "Fleet & Vehicles", level: "L2", parent_code: "20" },
  { code: "2050", name: "Office Supplies & Equipment", level: "L2", parent_code: "20" },
  { code: "2060", name: "Warehousing & Storage", level: "L2", parent_code: "20" },

  // L1: Indirect — IT & Technology
  { code: "30", name: "IT & Technology", level: "L1" },
  { code: "3010", name: "Software Licensing", level: "L2", parent_code: "30" },
  { code: "3020", name: "Cloud & Hosting", level: "L2", parent_code: "30" },
  { code: "3030", name: "IT Hardware", level: "L2", parent_code: "30" },
  { code: "3040", name: "IT Services", level: "L2", parent_code: "30" },
  { code: "3050", name: "Telecom", level: "L2", parent_code: "30" },

  // L1: Indirect — Professional Services
  { code: "40", name: "Professional Services", level: "L1" },
  { code: "4010", name: "Consulting", level: "L2", parent_code: "40" },
  { code: "4020", name: "Legal", level: "L2", parent_code: "40" },
  { code: "4030", name: "Audit & Accounting", level: "L2", parent_code: "40" },
  { code: "4040", name: "Staffing & Temp Labor", level: "L2", parent_code: "40" },
  { code: "4050", name: "Recruiting", level: "L2", parent_code: "40" },
  { code: "4060", name: "Training", level: "L2", parent_code: "40" },

  // L1: Indirect — Logistics & Transportation
  { code: "50", name: "Logistics & Transportation", level: "L1" },
  { code: "5010", name: "Freight & Shipping", level: "L2", parent_code: "50" },
  { code: "5020", name: "Courier & Parcel", level: "L2", parent_code: "50" },

  // L1: Indirect — Travel & Events
  { code: "60", name: "Travel & Events", level: "L1" },
  { code: "6010", name: "Travel", level: "L2", parent_code: "60" },
  { code: "6020", name: "Lodging", level: "L2", parent_code: "60" },
  { code: "6030", name: "Events & Conferences", level: "L2", parent_code: "60" },

  // L1: Indirect — Marketing & Communications
  { code: "70", name: "Marketing & Communications", level: "L1" },
  { code: "7010", name: "Advertising", level: "L2", parent_code: "70" },
  { code: "7020", name: "Marketing Services", level: "L2", parent_code: "70" },
  { code: "7030", name: "Printing", level: "L2", parent_code: "70" },

  // L1: Indirect — Insurance & Risk
  { code: "80", name: "Insurance & Risk", level: "L1" },
  { code: "8010", name: "Insurance", level: "L2", parent_code: "80" },
  { code: "8020", name: "Workers Compensation", level: "L2", parent_code: "80" },
  { code: "8030", name: "Liability", level: "L2", parent_code: "80" },

  // L1: Indirect — HR & Benefits
  { code: "90", name: "HR & Benefits", level: "L1" },
  { code: "9010", name: "Benefits Administration", level: "L2", parent_code: "90" },
  { code: "9020", name: "Payroll Services", level: "L2", parent_code: "90" },
];

// Map freeform category names to UNSPSC taxonomy codes
const CATEGORY_TO_TAXONOMY: [RegExp, string][] = [
  [/metal|steel|aluminum|copper/i, "101001"],
  [/chemical|solvent|resin/i, "101002"],
  [/plastic|polymer/i, "101003"],
  [/paper|fiber/i, "101004"],
  [/lumber|wood/i, "101005"],
  [/primary.*packag/i, "102001"],
  [/secondary.*packag/i, "102002"],
  [/packag/i, "1020"],
  [/contract.*manufact|co.?pack|toll/i, "1040"],
  [/janitor|cleaning/i, "201001"],
  [/security/i, "201002"],
  [/waste/i, "201003"],
  [/facilit/i, "2010"],
  [/electric/i, "202001"],
  [/natural\s*gas/i, "202002"],
  [/fuel|diesel|gasoline/i, "202003"],
  [/energy|utilit/i, "2020"],
  [/spare.*part/i, "203001"],
  [/safety.*equip/i, "203002"],
  [/mro|maintenance|repair/i, "2030"],
  [/fleet|vehicle/i, "2040"],
  [/office.*suppl/i, "2050"],
  [/warehouse|storage/i, "2060"],
  [/software|licen[cs]/i, "3010"],
  [/cloud|hosting/i, "3020"],
  [/hardware|computer|server/i, "3030"],
  [/it\s*service/i, "3040"],
  [/telecom|phone/i, "3050"],
  [/consult|advisory/i, "4010"],
  [/legal/i, "4020"],
  [/audit|account/i, "4030"],
  [/staff|temp.*labor|contingent/i, "4040"],
  [/recruit|talent/i, "4050"],
  [/training/i, "4060"],
  [/freight|shipping|logistic/i, "5010"],
  [/courier|parcel/i, "5020"],
  [/travel|airfare|t&e/i, "6010"],
  [/lodg|hotel/i, "6020"],
  [/event|conference|trade\s*show/i, "6030"],
  [/advertis/i, "7010"],
  [/market/i, "7020"],
  [/print/i, "7030"],
  [/insur/i, "8010"],
  [/workers.*comp/i, "8020"],
  [/liabil/i, "8030"],
  [/benefit.*admin|paycheck|adp/i, "9010"],
  [/payroll/i, "9020"],
];

export function mapToTaxonomy(categoryName: string): { code: string; l1: string; l2: string; l3: string | null } | null {
  const name = (categoryName || "").trim();
  if (!name) return null;

  for (const [pattern, code] of CATEGORY_TO_TAXONOMY) {
    if (pattern.test(name)) {
      const node = STANDARD_TAXONOMY.find(n => n.code === code);
      if (!node) continue;

      // Resolve hierarchy
      let l1 = "", l2 = "", l3: string | null = null;
      if (node.level === "L3") {
        l3 = node.name;
        const parent = STANDARD_TAXONOMY.find(n => n.code === node.parent_code);
        l2 = parent?.name || "";
        const grandparent = parent ? STANDARD_TAXONOMY.find(n => n.code === parent.parent_code) : null;
        l1 = grandparent?.name || "";
      } else if (node.level === "L2") {
        l2 = node.name;
        const parent = STANDARD_TAXONOMY.find(n => n.code === node.parent_code);
        l1 = parent?.name || "";
      } else {
        l1 = node.name;
      }

      return { code, l1, l2, l3 };
    }
  }
  return null;
}

interface SpendRecord {
  id: number;
  supplier_name: string;
  description: string | null;
  gl_code: string | null;
  gl_description?: string | null;
  l1_category?: string | null;
  l2_category?: string | null;
  l3_category?: string | null;
}

interface CategoryRef {
  id: number;
  name: string;
  level: string;
  parent_id?: number | null;
}

interface UserRule {
  match_field: string | null;
  match_type: string | null;
  match_value: string | null;
  category_id: number | null;
  priority: number | null;
}

// Match details for audit trail
interface MatchDetails {
  strategy: string;
  signals: { source: string; category_name: string; confidence: number }[];
  boosted: boolean;
  boost_reason?: string;
}

// Alternative category suggestion when signals conflict
interface AlternativeCategory {
  category_id: number;
  category_name: string;
  confidence: number;
  source: string;
}

export interface CategorizationResult {
  record_id: number;
  category_id: number;
  category_name: string;
  rule_matched: string;
  match_type_used: string;

  // New: confidence score (0.0 – 1.0)
  confidence: number;

  // New: UNSPSC taxonomy enrichment
  taxonomy_code?: string;
  taxonomy_l1?: string;
  taxonomy_l2?: string;
  taxonomy_l3?: string | null;

  // New: match details audit trail
  match_details?: MatchDetails;

  // New: ambiguity detection
  is_ambiguous?: boolean;
  alternative_categories?: AlternativeCategory[];
}

// Confidence levels for each match strategy
const STRATEGY_CONFIDENCE: Record<string, number> = {
  imported: 0.95,
  user_rule: 0.92,
  learned_gl: 0.80,
  learned_supplier: 0.78,
  supplier_keyword: 0.75,
  description_keyword: 0.65,
  multi_signal_boost: 0.90, // When supplier and description agree
};

// Supplier keyword rules — these are industry-agnostic (based on supplier names, not GL codes)
export const DEFAULT_SUPPLIER_RULES: { match_value: string; category_name: string }[] = [
  // Staffing / temp labor
  { match_value: "aerotek", category_name: "Staffing/Temp Labor" },
  { match_value: "randstad", category_name: "Staffing/Temp Labor" },
  { match_value: "robert half", category_name: "Staffing/Temp Labor" },
  { match_value: "insight global", category_name: "Staffing/Temp Labor" },
  { match_value: "adecco", category_name: "Staffing/Temp Labor" },
  { match_value: "manpower", category_name: "Staffing/Temp Labor" },
  { match_value: "kelly service", category_name: "Staffing/Temp Labor" },
  // Professional services
  { match_value: "deloitte", category_name: "Consulting" },
  { match_value: "mckinsey", category_name: "Consulting" },
  { match_value: "accenture", category_name: "Consulting" },
  { match_value: "gartner", category_name: "Consulting" },
  { match_value: "pwc", category_name: "Audit & Accounting" },
  { match_value: "pricewaterhouse", category_name: "Audit & Accounting" },
  { match_value: "kpmg", category_name: "Audit & Accounting" },
  { match_value: "ernst & young", category_name: "Audit & Accounting" },
  { match_value: "grant thornton", category_name: "Audit & Accounting" },
  { match_value: "kirkland", category_name: "Legal" },
  { match_value: "cooley", category_name: "Legal" },
  { match_value: "skadden", category_name: "Legal" },
  { match_value: "baker mckenzie", category_name: "Legal" },
  { match_value: "latham", category_name: "Legal" },
  // IT / Software
  { match_value: "microsoft", category_name: "Software Licensing" },
  { match_value: "salesforce", category_name: "Software Licensing" },
  { match_value: "oracle", category_name: "Software Licensing" },
  { match_value: "sap", category_name: "Software Licensing" },
  { match_value: "autodesk", category_name: "Software Licensing" },
  { match_value: "adobe", category_name: "Software Licensing" },
  { match_value: "ibm", category_name: "IT Services" },
  { match_value: "dell", category_name: "Hardware" },
  { match_value: "cdw", category_name: "Hardware" },
  { match_value: "amazon web service", category_name: "Cloud/Hosting" },
  { match_value: "aws", category_name: "Cloud/Hosting" },
  // Logistics
  { match_value: "fedex", category_name: "Freight & Shipping" },
  { match_value: "ups", category_name: "Freight & Shipping" },
  { match_value: "dhl", category_name: "Freight & Shipping" },
  { match_value: "xpo", category_name: "Freight & Shipping" },
  // Travel
  { match_value: "american express global", category_name: "Travel" },
  { match_value: "bcd travel", category_name: "Travel" },
  { match_value: "united airline", category_name: "Travel" },
  { match_value: "american airline", category_name: "Travel" },
  { match_value: "delta air", category_name: "Travel" },
  { match_value: "southwest air", category_name: "Travel" },
  { match_value: "marriott", category_name: "Lodging" },
  { match_value: "hilton", category_name: "Lodging" },
  { match_value: "hyatt", category_name: "Lodging" },
  { match_value: "hertz", category_name: "Fleet/Vehicles" },
  { match_value: "enterprise rent", category_name: "Fleet/Vehicles" },
  // Facilities
  { match_value: "cintas", category_name: "Facilities" },
  { match_value: "allied universal", category_name: "Security" },
  { match_value: "securitas", category_name: "Security" },
  { match_value: "waste management", category_name: "Facilities" },
  { match_value: "republic service", category_name: "Facilities" },
  // Office
  { match_value: "iron mountain", category_name: "Office" },
  { match_value: "office depot", category_name: "Office Supplies" },
  { match_value: "staples", category_name: "Office Supplies" },
  // Insurance
  { match_value: "hartford", category_name: "Insurance" },
  { match_value: "travelers", category_name: "Insurance" },
  { match_value: "zurich", category_name: "Insurance" },
  { match_value: "chubb", category_name: "Insurance" },
  // HR
  { match_value: "adp", category_name: "Benefits Administration" },
  { match_value: "paychex", category_name: "Benefits Administration" },
  { match_value: "korn ferry", category_name: "Recruiting" },
  // Energy
  { match_value: "marathon petro", category_name: "Fuel" },
  { match_value: "columbia gas", category_name: "Natural Gas" },
  // Events
  { match_value: "cvent", category_name: "Events" },
];

// Description keyword rules — also industry-agnostic
export const DEFAULT_DESCRIPTION_RULES: { match_value: string; category_name: string }[] = [
  { match_value: "software", category_name: "Software Licensing" },
  { match_value: "license", category_name: "Software Licensing" },
  { match_value: "saas", category_name: "Software Licensing" },
  { match_value: "subscription", category_name: "Software Licensing" },
  { match_value: "consulting", category_name: "Consulting" },
  { match_value: "advisory", category_name: "Consulting" },
  { match_value: "legal", category_name: "Legal" },
  { match_value: "audit", category_name: "Audit & Accounting" },
  { match_value: "tax", category_name: "Audit & Accounting" },
  { match_value: "payroll", category_name: "Benefits Administration" },
  { match_value: "benefit", category_name: "Benefits Administration" },
  { match_value: "recruit", category_name: "Recruiting" },
  { match_value: "travel", category_name: "Travel" },
  { match_value: "airfare", category_name: "Travel" },
  { match_value: "t&e", category_name: "Travel" },
  { match_value: "managed travel", category_name: "Travel" },
  { match_value: "hotel", category_name: "Lodging" },
  { match_value: "lodging", category_name: "Lodging" },
  { match_value: "freight", category_name: "Freight & Shipping" },
  { match_value: "shipping", category_name: "Freight & Shipping" },
  { match_value: "outbound", category_name: "Freight & Shipping" },
  { match_value: "courier", category_name: "Courier/Parcel" },
  { match_value: "maintenance", category_name: "Maintenance & Repair" },
  { match_value: "repair", category_name: "Maintenance & Repair" },
  { match_value: "insurance", category_name: "Insurance" },
  { match_value: "workers comp", category_name: "Workers Comp" },
  { match_value: "liability", category_name: "Liability" },
  { match_value: "training", category_name: "Training" },
  { match_value: "electricity", category_name: "Electricity" },
  { match_value: "natural gas", category_name: "Natural Gas" },
  { match_value: "diesel", category_name: "Fuel" },
  { match_value: "fuel", category_name: "Fuel" },
  { match_value: "subcontract", category_name: "Staffing/Temp Labor" },
  { match_value: "field labor", category_name: "Staffing/Temp Labor" },
  { match_value: "temp labor", category_name: "Staffing/Temp Labor" },
  { match_value: "cogs", category_name: "Contract Manufacturing" },
  { match_value: "contract mfg", category_name: "Contract Manufacturing" },
  { match_value: "manufacturing", category_name: "Contract Manufacturing" },
  { match_value: "cloud", category_name: "Cloud/Hosting" },
  { match_value: "hosting", category_name: "Cloud/Hosting" },
  { match_value: "telecom", category_name: "Telecom" },
  { match_value: "phone", category_name: "Telecom" },
  { match_value: "advertis", category_name: "Advertising" },
  { match_value: "marketing", category_name: "Marketing" },
  { match_value: "trade show", category_name: "Events" },
  { match_value: "conference", category_name: "Events" },
  { match_value: "print", category_name: "Printing" },
  { match_value: "office supply", category_name: "Office Supplies" },
  { match_value: "safety", category_name: "Safety Equipment" },
  { match_value: "spare part", category_name: "Spare Parts" },
  { match_value: "warehouse", category_name: "Warehousing" },
];

function findCategoryByName(categories: CategoryRef[], name: string): CategoryRef | undefined {
  let cat = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (cat) return cat;
  cat = categories.find(c => c.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(c.name.toLowerCase()));
  return cat;
}

// UNSPSC enrichment helper
function enrichWithTaxonomy(categoryName: string): { code?: string; l1?: string; l2?: string; l3?: string | null } {
  const tax = mapToTaxonomy(categoryName);
  if (!tax) return {};
  return { code: tax.code, l1: tax.l1, l2: tax.l2, l3: tax.l3 };
}

// Try to match supplier keyword and return category name (or null)
function trySupplierKeyword(supplierName: string): string | null {
  if (!supplierName) return null;
  const sLower = supplierName.toLowerCase();
  for (const rule of DEFAULT_SUPPLIER_RULES) {
    if (sLower.includes(rule.match_value)) return rule.category_name;
  }
  return null;
}

// Try to match description keyword and return category name (or null)
function tryDescriptionKeyword(desc: string): string | null {
  if (!desc) return null;
  const dLower = desc.toLowerCase();
  for (const rule of DEFAULT_DESCRIPTION_RULES) {
    if (dLower.includes(rule.match_value)) return rule.category_name;
  }
  return null;
}

// Build GL→Category mapping from already-categorized records in the SAME engagement
export function learnGlMappings(
  allRecords: { gl_code: string | null; category_id: number | null }[],
  categories: CategoryRef[]
): Map<string, { category_id: number; category_name: string; confidence: number }> {
  const glCounts: Record<string, Record<number, number>> = {};

  for (const r of allRecords) {
    if (!r.gl_code || !r.category_id) continue;
    if (!glCounts[r.gl_code]) glCounts[r.gl_code] = {};
    glCounts[r.gl_code][r.category_id] = (glCounts[r.gl_code][r.category_id] || 0) + 1;
  }

  const mappings = new Map<string, { category_id: number; category_name: string; confidence: number }>();
  for (const [gl, counts] of Object.entries(glCounts)) {
    const total = Object.values(counts).reduce((s, c) => s + c, 0);
    const [bestCatId, bestCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const confidence = bestCount / total;
    if (confidence >= 0.7 && total >= 2) { // Only learn if consistent (70%+) and seen 2+ times
      const cat = categories.find(c => c.id === Number(bestCatId));
      if (cat) {
        mappings.set(gl, { category_id: cat.id, category_name: cat.name, confidence });
      }
    }
  }
  return mappings;
}

// Build Supplier→Category mapping from already-categorized records
export function learnSupplierMappings(
  allRecords: { supplier_name: string; category_id: number | null }[],
  categories: CategoryRef[]
): Map<string, { category_id: number; category_name: string; confidence: number }> {
  const supplierCounts: Record<string, Record<number, number>> = {};

  for (const r of allRecords) {
    if (!r.supplier_name || !r.category_id) continue;
    const key = r.supplier_name.toLowerCase().trim();
    if (!supplierCounts[key]) supplierCounts[key] = {};
    supplierCounts[key][r.category_id] = (supplierCounts[key][r.category_id] || 0) + 1;
  }

  const mappings = new Map<string, { category_id: number; category_name: string; confidence: number }>();
  for (const [supplier, counts] of Object.entries(supplierCounts)) {
    const total = Object.values(counts).reduce((s, c) => s + c, 0);
    const [bestCatId, bestCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const confidence = bestCount / total;
    if (confidence >= 0.8 && total >= 2) {
      const cat = categories.find(c => c.id === Number(bestCatId));
      if (cat) {
        mappings.set(supplier, { category_id: cat.id, category_name: cat.name, confidence });
      }
    }
  }
  return mappings;
}

export function categorizeRecords(
  uncategorizedRecords: SpendRecord[],
  allRecords: { gl_code: string | null; category_id: number | null; supplier_name: string }[],
  categories: CategoryRef[],
  userRules: UserRule[],
): { categorized: number; by_imported: number; by_learned_gl: number; by_learned_supplier: number; by_supplier_keyword: number; by_description_keyword: number; by_user_rule: number; results: CategorizationResult[] } {

  const results: CategorizationResult[] = [];
  let byImported = 0, byLearnedGl = 0, byLearnedSupplier = 0, bySupplierKeyword = 0, byDescKeyword = 0, byUserRule = 0;

  // Pre-compute learned mappings from existing categorized data
  const glMap = learnGlMappings(allRecords, categories);
  const supplierMap = learnSupplierMappings(allRecords, categories);

  // Sort user rules by priority
  const sortedUserRules = [...userRules].sort((a, b) => (a.priority || 999) - (b.priority || 999));

  for (const record of uncategorizedRecords) {
    let matched = false;

    // Strategy 1: If the record has L1/L2/L3 category data from the file, use it
    const importedCat = record.l3_category || record.l2_category || record.l1_category;
    if (importedCat && importedCat.trim()) {
      const cat = findCategoryByName(categories, importedCat.trim());
      if (cat) {
        byImported++;
        const tax = enrichWithTaxonomy(cat.name);
        results.push({
          record_id: record.id, category_id: cat.id, category_name: cat.name,
          rule_matched: `Imported category: "${importedCat}"`, match_type_used: "imported",
          confidence: STRATEGY_CONFIDENCE.imported,
          taxonomy_code: tax.code, taxonomy_l1: tax.l1, taxonomy_l2: tax.l2, taxonomy_l3: tax.l3,
          match_details: { strategy: "imported", signals: [{ source: "file_import", category_name: cat.name, confidence: STRATEGY_CONFIDENCE.imported }], boosted: false },
        });
        matched = true;
      }
    }
    if (matched) continue;

    // Strategy 2: User-defined rules
    for (const ur of sortedUserRules) {
      if (!ur.match_field || !ur.match_type || !ur.match_value || !ur.category_id) continue;
      const field = ur.match_field === "GL_CODE" ? record.gl_code : ur.match_field === "SUPPLIER" ? record.supplier_name : (record.description || record.gl_description || null);
      if (!field) continue;
      const fLower = field.toLowerCase();
      const vLower = ur.match_value.toLowerCase();
      const match = ur.match_type === "STARTS_WITH" ? fLower.startsWith(vLower) : ur.match_type === "CONTAINS" ? fLower.includes(vLower) : ur.match_type === "EQUALS" ? fLower === vLower : false;
      if (match) {
        const cat = categories.find(c => c.id === ur.category_id);
        if (cat) {
          byUserRule++;
          const tax = enrichWithTaxonomy(cat.name);
          results.push({
            record_id: record.id, category_id: cat.id, category_name: cat.name,
            rule_matched: `User rule: ${ur.match_field} ${ur.match_type} "${ur.match_value}"`, match_type_used: "user_rule",
            confidence: STRATEGY_CONFIDENCE.user_rule,
            taxonomy_code: tax.code, taxonomy_l1: tax.l1, taxonomy_l2: tax.l2, taxonomy_l3: tax.l3,
            match_details: { strategy: "user_rule", signals: [{ source: `user_rule:${ur.match_field}`, category_name: cat.name, confidence: STRATEGY_CONFIDENCE.user_rule }], boosted: false },
          });
          matched = true; break;
        }
      }
    }
    if (matched) continue;

    // Strategy 3: Learned GL→Category mapping (from other records in same engagement)
    if (record.gl_code && glMap.has(record.gl_code)) {
      const m = glMap.get(record.gl_code)!;
      byLearnedGl++;
      const tax = enrichWithTaxonomy(m.category_name);
      results.push({
        record_id: record.id, category_id: m.category_id, category_name: m.category_name,
        rule_matched: `Learned GL mapping: GL ${record.gl_code} → ${m.category_name} (${Math.round(m.confidence * 100)}% confidence)`, match_type_used: "learned_gl",
        confidence: Math.min(m.confidence, STRATEGY_CONFIDENCE.learned_gl),
        taxonomy_code: tax.code, taxonomy_l1: tax.l1, taxonomy_l2: tax.l2, taxonomy_l3: tax.l3,
        match_details: { strategy: "learned_gl", signals: [{ source: `gl:${record.gl_code}`, category_name: m.category_name, confidence: m.confidence }], boosted: false },
      });
      matched = true;
    }
    if (matched) continue;

    // Strategy 4: Learned Supplier→Category mapping
    if (record.supplier_name) {
      const key = record.supplier_name.toLowerCase().trim();
      if (supplierMap.has(key)) {
        const m = supplierMap.get(key)!;
        byLearnedSupplier++;
        const tax = enrichWithTaxonomy(m.category_name);
        results.push({
          record_id: record.id, category_id: m.category_id, category_name: m.category_name,
          rule_matched: `Learned supplier mapping: "${record.supplier_name}" → ${m.category_name} (${Math.round(m.confidence * 100)}% confidence)`, match_type_used: "learned_supplier",
          confidence: Math.min(m.confidence, STRATEGY_CONFIDENCE.learned_supplier),
          taxonomy_code: tax.code, taxonomy_l1: tax.l1, taxonomy_l2: tax.l2, taxonomy_l3: tax.l3,
          match_details: { strategy: "learned_supplier", signals: [{ source: `supplier:${record.supplier_name}`, category_name: m.category_name, confidence: m.confidence }], boosted: false },
        });
        matched = true;
      }
    }
    if (matched) continue;

    // Strategy 5+6: Multi-signal check — try both supplier keyword AND description keyword
    // If they agree, boost confidence. If they disagree, flag ambiguity.
    const supplierMatch = trySupplierKeyword(record.supplier_name);
    const desc = (record.description || record.gl_description || "").trim();
    const descMatch = tryDescriptionKeyword(desc);

    // Case A: Both signals agree → multi-signal boost
    if (supplierMatch && descMatch && supplierMatch.toLowerCase() === descMatch.toLowerCase()) {
      const cat = findCategoryByName(categories, supplierMatch);
      if (cat) {
        bySupplierKeyword++;
        const tax = enrichWithTaxonomy(cat.name);
        results.push({
          record_id: record.id, category_id: cat.id, category_name: cat.name,
          rule_matched: `Multi-signal: supplier="${record.supplier_name}" + description agree → ${cat.name}`,
          match_type_used: "supplier_keyword",
          confidence: STRATEGY_CONFIDENCE.multi_signal_boost,
          taxonomy_code: tax.code, taxonomy_l1: tax.l1, taxonomy_l2: tax.l2, taxonomy_l3: tax.l3,
          match_details: {
            strategy: "multi_signal",
            signals: [
              { source: `supplier:${record.supplier_name}`, category_name: supplierMatch, confidence: STRATEGY_CONFIDENCE.supplier_keyword },
              { source: `description`, category_name: descMatch, confidence: STRATEGY_CONFIDENCE.description_keyword },
            ],
            boosted: true,
            boost_reason: "Supplier and description keywords both point to same category",
          },
        });
        matched = true;
      }
    }

    // Case B: Both signals exist but disagree → use supplier (higher priority), flag ambiguity
    if (!matched && supplierMatch && descMatch && supplierMatch.toLowerCase() !== descMatch.toLowerCase()) {
      const cat = findCategoryByName(categories, supplierMatch);
      const altCat = findCategoryByName(categories, descMatch);
      if (cat) {
        bySupplierKeyword++;
        const tax = enrichWithTaxonomy(cat.name);
        const alternatives: AlternativeCategory[] = [];
        if (altCat) {
          alternatives.push({
            category_id: altCat.id, category_name: altCat.name,
            confidence: STRATEGY_CONFIDENCE.description_keyword,
            source: `description keyword: "${desc.substring(0, 50)}"`,
          });
        }
        results.push({
          record_id: record.id, category_id: cat.id, category_name: cat.name,
          rule_matched: `Supplier keyword: "${record.supplier_name}" → ${cat.name} (ambiguous: description suggests ${descMatch})`,
          match_type_used: "supplier_keyword",
          confidence: STRATEGY_CONFIDENCE.supplier_keyword * 0.9, // Slight penalty for ambiguity
          taxonomy_code: tax.code, taxonomy_l1: tax.l1, taxonomy_l2: tax.l2, taxonomy_l3: tax.l3,
          match_details: {
            strategy: "supplier_keyword",
            signals: [
              { source: `supplier:${record.supplier_name}`, category_name: supplierMatch, confidence: STRATEGY_CONFIDENCE.supplier_keyword },
              { source: `description`, category_name: descMatch, confidence: STRATEGY_CONFIDENCE.description_keyword },
            ],
            boosted: false,
          },
          is_ambiguous: true,
          alternative_categories: alternatives,
        });
        matched = true;
      }
    }

    // Case C: Only supplier match
    if (!matched && supplierMatch) {
      const cat = findCategoryByName(categories, supplierMatch);
      if (cat) {
        bySupplierKeyword++;
        const tax = enrichWithTaxonomy(cat.name);
        results.push({
          record_id: record.id, category_id: cat.id, category_name: cat.name,
          rule_matched: `Supplier keyword: "${record.supplier_name}" → ${supplierMatch}`,
          match_type_used: "supplier_keyword",
          confidence: STRATEGY_CONFIDENCE.supplier_keyword,
          taxonomy_code: tax.code, taxonomy_l1: tax.l1, taxonomy_l2: tax.l2, taxonomy_l3: tax.l3,
          match_details: {
            strategy: "supplier_keyword",
            signals: [{ source: `supplier:${record.supplier_name}`, category_name: supplierMatch, confidence: STRATEGY_CONFIDENCE.supplier_keyword }],
            boosted: false,
          },
        });
        matched = true;
      }
    }

    // Case D: Only description match
    if (!matched && descMatch) {
      const cat = findCategoryByName(categories, descMatch);
      if (cat) {
        byDescKeyword++;
        const tax = enrichWithTaxonomy(cat.name);
        results.push({
          record_id: record.id, category_id: cat.id, category_name: cat.name,
          rule_matched: `Description keyword: "${desc.substring(0, 50)}" → ${descMatch}`,
          match_type_used: "description_keyword",
          confidence: STRATEGY_CONFIDENCE.description_keyword,
          taxonomy_code: tax.code, taxonomy_l1: tax.l1, taxonomy_l2: tax.l2, taxonomy_l3: tax.l3,
          match_details: {
            strategy: "description_keyword",
            signals: [{ source: `description`, category_name: descMatch, confidence: STRATEGY_CONFIDENCE.description_keyword }],
            boosted: false,
          },
        });
        matched = true;
      }
    }
  }

  return {
    categorized: results.length,
    by_imported: byImported,
    by_learned_gl: byLearnedGl,
    by_learned_supplier: byLearnedSupplier,
    by_supplier_keyword: bySupplierKeyword,
    by_description_keyword: byDescKeyword,
    by_user_rule: byUserRule,
    results,
  };
}
