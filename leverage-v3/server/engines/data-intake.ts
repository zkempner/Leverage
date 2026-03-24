/**
 * LEVERAGE v4 — Smart Data Intake Engine
 *
 * Pure deterministic engine (no DB, no external calls) for:
 * 1. ERP format detection from column names + sample data
 * 2. ERP-specific column mapping to LEVERAGE standard fields
 * 3. Data quality assessment with confidence-scored auto-fixes
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ERPFormat = "sap" | "oracle" | "netsuite" | "dynamics" | "quickbooks" | "coupa" | "generic";

export interface FormatDetectionResult {
  format: ERPFormat;
  confidence: number;
  matched_signals: string[];
}

export interface ColumnMappingResult {
  mapping: Record<string, string>;               // source_col → target_field
  unmapped: string[];
  mapping_confidence: Record<string, number>;     // target_field → confidence
}

export interface FieldQuality {
  field: string;
  completeness_pct: number;
  distinct_values: number;
  sample_values: string[];
  issues: string[];
}

export interface Fix {
  fix_type: "date_normalize" | "amount_clean" | "supplier_trim" | "currency_infer" | "blank_fill";
  field: string;
  description: string;
  affected_count: number;
  confidence: number;
  before_sample: string;
  after_sample: string;
}

export interface Issue {
  issue_type: string;
  severity: "high" | "medium" | "low";
  field: string;
  description: string;
  affected_count: number;
  sample_values: string[];
}

export interface QualityAssessment {
  overall_score: number;
  field_scores: Record<string, FieldQuality>;
  high_confidence_fixes: Fix[];
  low_confidence_issues: Issue[];
  summary: {
    total_records: number;
    complete_records: number;
    completeness_pct: number;
    date_format_detected: string | null;
    currency_detected: string | null;
    amount_negatives_pct: number;
    blank_supplier_pct: number;
    duplicate_pct: number;
  };
}

// ---------------------------------------------------------------------------
// ERP Column Signatures
// ---------------------------------------------------------------------------

const ERP_SIGNATURES: Record<ERPFormat, { columns: RegExp[]; data_patterns?: RegExp[] }> = {
  sap: {
    columns: [
      /^BUKRS$/i, /^BELNR$/i, /^BUZEI$/i, /^LIFNR$/i, /^WRBTR$/i,
      /^DMBTR$/i, /^WAERS$/i, /^SGTXT$/i, /^KOSTL$/i, /^AUFNR$/i,
      /^MWSKZ$/i, /^HKONT$/i, /^BUDAT$/i, /^BLDAT$/i, /^EBELN$/i,
      /^EBELP$/i, /^GJAHR$/i, /^MONAT$/i, /^BSCHL$/i, /^SAKNR$/i,
      /^BLART$/i, /^XBLNR$/i, /^ZUONR$/i, /^SHKZG$/i,
    ],
  },
  oracle: {
    columns: [
      /^INVOICE_NUM$/i, /^VENDOR_NAME$/i, /^VENDOR_SITE_CODE$/i,
      /^DIST_CODE_COMBINATION$/i, /^ORG_ID$/i, /^SET_OF_BOOKS_ID$/i,
      /^INVOICE_AMOUNT$/i, /^INVOICE_DATE$/i, /^VENDOR_ID$/i,
      /^PAYMENT_METHOD$/i, /^INVOICE_TYPE$/i, /^SOURCE$/i,
      /^GL_DATE$/i, /^OPERATING_UNIT$/i, /^INVOICE_CURRENCY_CODE$/i,
    ],
  },
  netsuite: {
    columns: [
      /^Internal\s*ID$/i, /^Main\s*Line$/i, /^Subsidiary$/i,
      /^Posting\s*Period$/i, /^Account$/i, /^Memo$/i,
      /^Name$/i, /^Amount$/i, /^Type$/i, /^Document\s*Number$/i,
      /^Department$/i, /^Class$/i, /^Location$/i,
    ],
  },
  dynamics: {
    columns: [
      /^VendTrans$/i, /^PurchLine$/i, /^LedgerJournalTrans$/i,
      /^DataAreaId$/i, /^ACCOUNTNUM$/i, /^VOUCHER$/i,
      /^TRANSDATE$/i, /^AMOUNTCUR$/i, /^CURRENCYCODE$/i,
      /^VENDGROUP$/i, /^DIMENSION$/i, /^PAYMMODE$/i,
      /^AccountingDate$/i, /^MainAccount$/i,
    ],
  },
  quickbooks: {
    columns: [
      /^Txn\s*Type$/i, /^Memo$/i, /^Clr$/i, /^Split$/i,
      /^Debit$/i, /^Credit$/i, /^Balance$/i, /^Name$/i,
      /^Num$/i, /^Date$/i, /^Account$/i, /^Class$/i,
      /^Paid$/i, /^Open\s*Balance$/i, /^Terms$/i,
    ],
  },
  coupa: {
    columns: [
      /^Coupa\s*Requisition$/i, /^Approval\s*Status$/i, /^Commodity$/i,
      /^Supplier$/i, /^PO\s*Number$/i, /^Invoice\s*Number$/i,
      /^Account\s*Code$/i, /^Ship\s*To$/i, /^Requested\s*By$/i,
      /^Content\s*Group$/i, /^Contract$/i, /^Unit\s*Price$/i,
    ],
  },
  generic: {
    columns: [], // Fallback, matches anything
  },
};

// ---------------------------------------------------------------------------
// ERP-Specific Column Mappings
// ---------------------------------------------------------------------------

const ERP_COLUMN_MAPS: Record<ERPFormat, [RegExp, string, number][]> = {
  sap: [
    [/^LIFNR$/i, "supplier_name", 0.95],
    [/^WRBTR$/i, "amount", 0.95],
    [/^DMBTR$/i, "amount", 0.85],      // local currency amount (fallback)
    [/^BUDAT$/i, "date", 0.95],
    [/^BLDAT$/i, "date", 0.80],        // document date (fallback)
    [/^HKONT$/i, "gl_code", 0.95],
    [/^SAKNR$/i, "gl_code", 0.85],
    [/^SGTXT$/i, "description", 0.90],
    [/^WAERS$/i, "currency", 0.95],
    [/^KOSTL$/i, "cost_center", 0.95],
    [/^BUKRS$/i, "business_unit", 0.85],
    [/^EBELN$/i, "po_number", 0.95],
    [/^BELNR$/i, "invoice_number", 0.90],
    [/^XBLNR$/i, "invoice_number", 0.85],
    [/^GJAHR$/i, "fiscal_year", 0.90],
    [/^AUFNR$/i, "project_code", 0.85],
  ],
  oracle: [
    [/^VENDOR_NAME$/i, "supplier_name", 0.95],
    [/^VENDOR_ID$/i, "vendor_id", 0.95],
    [/^INVOICE_AMOUNT$/i, "amount", 0.95],
    [/^INVOICE_DATE$/i, "date", 0.95],
    [/^GL_DATE$/i, "date", 0.80],
    [/^INVOICE_NUM$/i, "invoice_number", 0.95],
    [/^DIST_CODE_COMBINATION$/i, "gl_code", 0.90],
    [/^INVOICE_DESCRIPTION$/i, "description", 0.90],
    [/^INVOICE_CURRENCY_CODE$/i, "currency", 0.95],
    [/^OPERATING_UNIT$/i, "business_unit", 0.90],
    [/^VENDOR_SITE_CODE$/i, "location", 0.80],
    [/^PAYMENT_METHOD$/i, "payment_terms", 0.75],
    [/^PO_NUMBER$/i, "po_number", 0.95],
  ],
  netsuite: [
    [/^Name$/i, "supplier_name", 0.85],
    [/^Amount$/i, "amount", 0.90],
    [/^Date$/i, "date", 0.90],
    [/^Document\s*Number$/i, "invoice_number", 0.90],
    [/^Account$/i, "gl_code", 0.85],
    [/^Memo$/i, "description", 0.85],
    [/^Subsidiary$/i, "business_unit", 0.85],
    [/^Department$/i, "cost_center", 0.80],
    [/^Class$/i, "l1_category", 0.70],
    [/^Location$/i, "location", 0.80],
    [/^Currency$/i, "currency", 0.90],
  ],
  dynamics: [
    [/^ACCOUNTNUM$/i, "vendor_id", 0.90],
    [/^AMOUNTCUR$/i, "amount", 0.95],
    [/^TRANSDATE$/i, "date", 0.95],
    [/^AccountingDate$/i, "date", 0.80],
    [/^VOUCHER$/i, "invoice_number", 0.85],
    [/^MainAccount$/i, "gl_code", 0.90],
    [/^CURRENCYCODE$/i, "currency", 0.95],
    [/^DIMENSION$/i, "cost_center", 0.75],
    [/^DataAreaId$/i, "business_unit", 0.80],
    [/^PAYMMODE$/i, "payment_terms", 0.70],
  ],
  quickbooks: [
    [/^Name$/i, "supplier_name", 0.85],
    [/^Debit$/i, "amount", 0.80],
    [/^Date$/i, "date", 0.90],
    [/^Num$/i, "invoice_number", 0.80],
    [/^Account$/i, "gl_code", 0.85],
    [/^Memo$/i, "description", 0.85],
    [/^Class$/i, "l1_category", 0.70],
    [/^Terms$/i, "payment_terms", 0.80],
    [/^Txn\s*Type$/i, "po_type", 0.70],
  ],
  coupa: [
    [/^Supplier$/i, "supplier_name", 0.95],
    [/^(Total|Amount|Unit\s*Price)/i, "amount", 0.85],
    [/^(Created|Invoice\s*Date|Date)/i, "date", 0.85],
    [/^Invoice\s*Number$/i, "invoice_number", 0.95],
    [/^Account\s*Code$/i, "gl_code", 0.90],
    [/^(Description|Line\s*Description)/i, "description", 0.85],
    [/^Commodity$/i, "l1_category", 0.80],
    [/^PO\s*Number$/i, "po_number", 0.95],
    [/^Currency$/i, "currency", 0.90],
    [/^Content\s*Group$/i, "business_unit", 0.75],
    [/^Ship\s*To$/i, "location", 0.75],
  ],
  generic: [], // Handled separately
};

// Generic patterns (reused from client-side autoDetectMapping, now server-side)
const GENERIC_PATTERNS: [RegExp, string, number][] = [
  [/^vendor\s*name|^supplier/i, "supplier_name", 0.85],
  [/^vendor\s*id/i, "vendor_id", 0.85],
  [/^invoice\s*#|^invoice\s*number|^inv\s*#/i, "invoice_number", 0.85],
  [/^invoice\s*date/i, "date", 0.85],
  [/^gl\s*post\s*date|^posting\s*date/i, "date", 0.80],
  [/^payment\s*date/i, "payment_date", 0.85],
  [/^days\s*to\s*pay/i, "days_to_pay", 0.80],
  [/^invoice\s*am(oun)?t/i, "amount", 0.85],
  [/^payment\s*am(oun)?t/i, "amount", 0.80],
  [/^credit\s*memo/i, "credit_memo", 0.80],
  [/^currency/i, "currency", 0.85],
  [/^gl\s*(account|code)/i, "gl_code", 0.85],
  [/^gl\s*desc/i, "gl_description", 0.80],
  [/^cost\s*cent(er|re)/i, "cost_center", 0.80],
  [/^project\s*(code|id)/i, "project_code", 0.80],
  [/^l1\s*category/i, "l1_category", 0.85],
  [/^l2\s*category/i, "l2_category", 0.85],
  [/^l3\s*category/i, "l3_category", 0.85],
  [/^business\s*unit/i, "business_unit", 0.80],
  [/^office|^location/i, "location", 0.75],
  [/^buyer|^requestor/i, "buyer", 0.75],
  [/^po\s*type/i, "po_type", 0.80],
  [/^contract\s*(y|flag)/i, "contract_flag", 0.75],
  [/^contract\s*id/i, "contract_id", 0.80],
  [/^payment\s*term/i, "payment_terms", 0.80],
  [/^fiscal\s*year/i, "fiscal_year", 0.80],
  [/^fiscal\s*quarter/i, "fiscal_quarter", 0.80],
  [/^data\s*source/i, "data_source", 0.75],
  [/^spend\s*flag/i, "spend_flag", 0.80],
  [/^amount$|^total$|^spend$/i, "amount", 0.80],
  [/^description$|^desc$/i, "description", 0.75],
  [/^date$|^trans(action)?\s*date$/i, "date", 0.75],
  [/^po\s*(number|#|num)/i, "po_number", 0.80],
  [/^country/i, "country_of_origin", 0.75],
];

// ---------------------------------------------------------------------------
// Date Format Detection
// ---------------------------------------------------------------------------

const DATE_FORMATS: { pattern: RegExp; format: string; parser: (s: string) => string }[] = [
  {
    pattern: /^\d{4}-\d{2}-\d{2}$/,
    format: "YYYY-MM-DD",
    parser: (s) => s, // Already ISO
  },
  {
    pattern: /^\d{1,2}\/\d{1,2}\/\d{4}$/,
    format: "MM/DD/YYYY",
    parser: (s) => {
      const [m, d, y] = s.split("/");
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    },
  },
  {
    pattern: /^\d{1,2}-\d{1,2}-\d{4}$/,
    format: "DD-MM-YYYY",
    parser: (s) => {
      const [d, m, y] = s.split("-");
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    },
  },
  {
    pattern: /^\d{1,2}\.\d{1,2}\.\d{4}$/,
    format: "DD.MM.YYYY",
    parser: (s) => {
      const [d, m, y] = s.split(".");
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    },
  },
  {
    pattern: /^\d{8}$/,
    format: "YYYYMMDD",
    parser: (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`,
  },
  {
    pattern: /^\d{4}\/\d{2}\/\d{2}$/,
    format: "YYYY/MM/DD",
    parser: (s) => s.replace(/\//g, "-"),
  },
];

function detectDateFormat(values: string[]): { format: string; parser: (s: string) => string } | null {
  const nonEmpty = values.filter(v => v && String(v).trim());
  if (nonEmpty.length === 0) return null;

  // Sample up to 100 values
  const sample = nonEmpty.slice(0, 100);

  for (const fmt of DATE_FORMATS) {
    const matchCount = sample.filter(v => fmt.pattern.test(String(v).trim())).length;
    if (matchCount / sample.length >= 0.7) {
      return fmt;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Detect ERP format from column names and optionally sample data.
 */
export function detectFormat(
  columns: string[],
  _sampleRows?: Record<string, unknown>[],
): FormatDetectionResult {
  const normalizedCols = columns.map(c => c.trim());
  let bestFormat: ERPFormat = "generic";
  let bestScore = 0;
  let bestSignals: string[] = [];

  for (const [format, sig] of Object.entries(ERP_SIGNATURES)) {
    if (format === "generic") continue;

    const matched: string[] = [];
    for (const pattern of sig.columns) {
      const match = normalizedCols.find(c => pattern.test(c));
      if (match) matched.push(match);
    }

    // Score = matched / total signature columns, weighted by minimum threshold
    const score = sig.columns.length > 0 ? matched.length / sig.columns.length : 0;
    // Require at least 3 matched signals for a non-generic detection
    if (matched.length >= 3 && score > bestScore) {
      bestScore = score;
      bestFormat = format as ERPFormat;
      bestSignals = matched;
    }
  }

  // Confidence: min 3 signals = 0.5, scales up with more matches
  const confidence = bestFormat === "generic"
    ? 0.3
    : Math.min(0.95, 0.5 + bestScore * 0.45);

  return {
    format: bestFormat,
    confidence: Math.round(confidence * 100) / 100,
    matched_signals: bestSignals,
  };
}

/**
 * Map source columns to LEVERAGE standard fields using ERP-specific or generic rules.
 */
export function mapColumns(format: ERPFormat, columns: string[]): ColumnMappingResult {
  const patterns = format !== "generic" && ERP_COLUMN_MAPS[format]?.length > 0
    ? ERP_COLUMN_MAPS[format]
    : GENERIC_PATTERNS;

  const mapping: Record<string, string> = {};
  const mappingConfidence: Record<string, number> = {};
  const usedTargets = new Set<string>();

  // First pass: ERP-specific mappings
  for (const col of columns) {
    const trimmed = col.trim();
    for (const [pattern, target, conf] of patterns) {
      if (pattern.test(trimmed) && !usedTargets.has(target)) {
        mapping[col] = target;
        mappingConfidence[target] = conf;
        usedTargets.add(target);
        break;
      }
    }
  }

  // Second pass: generic patterns for unmapped columns
  if (format !== "generic") {
    for (const col of columns) {
      if (mapping[col]) continue;
      const trimmed = col.trim();
      for (const [pattern, target, conf] of GENERIC_PATTERNS) {
        if (pattern.test(trimmed) && !usedTargets.has(target)) {
          mapping[col] = target;
          mappingConfidence[target] = conf;
          usedTargets.add(target);
          break;
        }
      }
    }
  }

  // Amount fallback: if no primary amount mapped, try invoice_amount or payment_amount
  if (!usedTargets.has("amount")) {
    for (const col of columns) {
      if (mapping[col] === "invoice_amount" || mapping[col] === "payment_amount") {
        mappingConfidence["amount"] = mappingConfidence[mapping[col]] ?? 0.75;
        delete mappingConfidence[mapping[col]];
        mapping[col] = "amount";
        usedTargets.add("amount");
        break;
      }
    }
  }

  // Mark unmapped
  const unmapped: string[] = [];
  for (const col of columns) {
    if (!mapping[col]) {
      mapping[col] = "skip";
      unmapped.push(col);
    }
  }

  return { mapping, unmapped, mapping_confidence: mappingConfidence };
}

/**
 * Assess data quality of staged records using the column mapping.
 */
export function assessQuality(
  records: Record<string, unknown>[],
  mapping: Record<string, string>,
): QualityAssessment {
  const total = records.length;
  if (total === 0) {
    return {
      overall_score: 0,
      field_scores: {},
      high_confidence_fixes: [],
      low_confidence_issues: [],
      summary: {
        total_records: 0, complete_records: 0, completeness_pct: 0,
        date_format_detected: null, currency_detected: null,
        amount_negatives_pct: 0, blank_supplier_pct: 0, duplicate_pct: 0,
      },
    };
  }

  // Invert mapping: target → source column
  const targetToSource: Record<string, string> = {};
  for (const [src, tgt] of Object.entries(mapping)) {
    if (tgt !== "skip") targetToSource[tgt] = src;
  }

  // Helper: get field values
  const getValues = (target: string): string[] => {
    const src = targetToSource[target];
    if (!src) return [];
    return records.map(r => String(r[src] ?? "").trim());
  };

  // --- Field quality ---
  const fieldScores: Record<string, FieldQuality> = {};
  const keyFields = ["supplier_name", "amount", "date", "gl_code", "description"];

  for (const field of keyFields) {
    const values = getValues(field);
    const nonBlank = values.filter(v => v && v !== "undefined" && v !== "null");
    const distinct = new Set(nonBlank);

    fieldScores[field] = {
      field,
      completeness_pct: total > 0 ? Math.round((nonBlank.length / total) * 100) : 0,
      distinct_values: distinct.size,
      sample_values: [...distinct].slice(0, 5),
      issues: [],
    };
  }

  // --- Supplier analysis ---
  const supplierValues = getValues("supplier_name");
  const blankSuppliers = supplierValues.filter(v => !v || v === "undefined" || v === "null").length;
  const blankSupplierPct = total > 0 ? (blankSuppliers / total) * 100 : 0;

  // --- Amount analysis ---
  const amountValues = getValues("amount");
  const parsedAmounts = amountValues.map(v => {
    const cleaned = String(v).replace(/[$,\s]/g, "").replace(/\((.+)\)/, "-$1");
    return parseFloat(cleaned);
  });
  const validAmounts = parsedAmounts.filter(a => !isNaN(a));
  const negativeAmounts = validAmounts.filter(a => a < 0);
  const zeroAmounts = validAmounts.filter(a => a === 0);
  const amountNegPct = validAmounts.length > 0 ? (negativeAmounts.length / validAmounts.length) * 100 : 0;

  // --- Date analysis ---
  const dateValues = getValues("date");
  const dateFormat = detectDateFormat(dateValues);

  // --- Currency detection ---
  const currencyValues = getValues("currency");
  const nonBlankCurrencies = currencyValues.filter(v => v && v.length <= 5 && v !== "undefined");
  const currencySet = new Set(nonBlankCurrencies);
  const detectedCurrency = currencySet.size === 1 ? [...currencySet][0] : null;

  // --- Duplicate detection ---
  const dupeKeys = new Set<string>();
  let duplicateCount = 0;
  for (const r of records) {
    const supplier = String(r[targetToSource["supplier_name"] ?? ""] ?? "").trim();
    const amount = String(r[targetToSource["amount"] ?? ""] ?? "").trim();
    const date = String(r[targetToSource["date"] ?? ""] ?? "").trim();
    const gl = String(r[targetToSource["gl_code"] ?? ""] ?? "").trim();
    const key = `${supplier}|${amount}|${date}|${gl}`;
    if (dupeKeys.has(key)) {
      duplicateCount++;
    } else {
      dupeKeys.add(key);
    }
  }
  const dupePct = total > 0 ? (duplicateCount / total) * 100 : 0;

  // --- Completeness (supplier + amount + date) ---
  let completeRecords = 0;
  for (const r of records) {
    const hasSupplier = Boolean(String(r[targetToSource["supplier_name"] ?? ""] ?? "").trim());
    const hasAmount = !isNaN(parseFloat(String(r[targetToSource["amount"] ?? ""] ?? "").replace(/[$,\s]/g, "")));
    const hasDate = Boolean(String(r[targetToSource["date"] ?? ""] ?? "").trim());
    if (hasSupplier && hasAmount && hasDate) completeRecords++;
  }
  const completenessPct = total > 0 ? Math.round((completeRecords / total) * 100) : 0;

  // --- Build fixes and issues ---
  const fixes: Fix[] = [];
  const issues: Issue[] = [];

  // Fix: date normalization
  if (dateFormat && dateFormat.format !== "YYYY-MM-DD") {
    const needsNormalization = dateValues.filter(v => v && dateFormat.pattern.test(v.trim())).length;
    if (needsNormalization > 0) {
      const sampleBefore = dateValues.find(v => v && dateFormat.pattern.test(v.trim())) ?? "";
      fixes.push({
        fix_type: "date_normalize",
        field: "date",
        description: `Normalize ${dateFormat.format} → YYYY-MM-DD`,
        affected_count: needsNormalization,
        confidence: 0.95,
        before_sample: sampleBefore,
        after_sample: dateFormat.parser(sampleBefore),
      });
    }
  }

  // Fix: amount cleaning (currency symbols, parentheses)
  const dirtyAmounts = amountValues.filter(v => /[$€£¥,\(\)]/.test(v));
  if (dirtyAmounts.length > 0) {
    fixes.push({
      fix_type: "amount_clean",
      field: "amount",
      description: "Remove currency symbols, commas, and convert parenthetical negatives",
      affected_count: dirtyAmounts.length,
      confidence: 0.92,
      before_sample: dirtyAmounts[0],
      after_sample: String(parseFloat(dirtyAmounts[0].replace(/[$€£¥,\s]/g, "").replace(/\((.+)\)/, "-$1"))),
    });
  }

  // Fix: supplier trimming
  const needsTrim = supplierValues.filter(v => v !== v.trim() || /\s{2,}/.test(v));
  if (needsTrim.length > 0) {
    fixes.push({
      fix_type: "supplier_trim",
      field: "supplier_name",
      description: "Trim whitespace and collapse multiple spaces",
      affected_count: needsTrim.length,
      confidence: 0.98,
      before_sample: needsTrim[0],
      after_sample: needsTrim[0].trim().replace(/\s{2,}/g, " "),
    });
  }

  // Fix: currency inference
  if (detectedCurrency && currencyValues.some(v => !v || v === "undefined" || v === "null")) {
    const blankCurrencies = currencyValues.filter(v => !v || v === "undefined" || v === "null").length;
    fixes.push({
      fix_type: "currency_infer",
      field: "currency",
      description: `Set blank currency to ${detectedCurrency} (only currency detected)`,
      affected_count: blankCurrencies,
      confidence: 0.88,
      before_sample: "",
      after_sample: detectedCurrency,
    });
  }

  // Issue: blank suppliers
  if (blankSupplierPct > 1) {
    issues.push({
      issue_type: "blank_field",
      severity: blankSupplierPct > 10 ? "high" : "medium",
      field: "supplier_name",
      description: `${blankSuppliers} records (${blankSupplierPct.toFixed(1)}%) have blank supplier name`,
      affected_count: blankSuppliers,
      sample_values: [],
    });
  }

  // Issue: zero amounts
  if (zeroAmounts.length > 0) {
    issues.push({
      issue_type: "zero_amount",
      severity: zeroAmounts.length / total > 0.05 ? "medium" : "low",
      field: "amount",
      description: `${zeroAmounts.length} records with zero amount`,
      affected_count: zeroAmounts.length,
      sample_values: [],
    });
  }

  // Issue: high negative %
  if (amountNegPct > 20) {
    issues.push({
      issue_type: "high_negatives",
      severity: "medium",
      field: "amount",
      description: `${amountNegPct.toFixed(1)}% of amounts are negative (credit memos or data issue?)`,
      affected_count: negativeAmounts.length,
      sample_values: negativeAmounts.slice(0, 3).map(String),
    });
  }

  // Issue: high duplicate rate
  if (dupePct > 5) {
    issues.push({
      issue_type: "duplicates",
      severity: dupePct > 15 ? "high" : "medium",
      field: "multiple",
      description: `${duplicateCount} potential duplicate records (${dupePct.toFixed(1)}%)`,
      affected_count: duplicateCount,
      sample_values: [],
    });
  }

  // Issue: unparseable amounts
  const unparseableAmounts = parsedAmounts.filter(a => isNaN(a)).length;
  if (unparseableAmounts > 0) {
    const badSamples = amountValues.filter((v, i) => isNaN(parsedAmounts[i])).slice(0, 3);
    issues.push({
      issue_type: "unparseable_amount",
      severity: unparseableAmounts / total > 0.05 ? "high" : "medium",
      field: "amount",
      description: `${unparseableAmounts} amounts could not be parsed as numbers`,
      affected_count: unparseableAmounts,
      sample_values: badSamples,
    });
  }

  // --- Overall score ---
  // Weighted: completeness 40%, amount quality 25%, supplier quality 20%, duplicates 15%
  const amountQuality = validAmounts.length > 0 ? (validAmounts.length / total) * 100 : 0;
  const supplierQuality = 100 - blankSupplierPct;
  const dupeQuality = 100 - Math.min(dupePct * 3, 100);

  const overallScore = Math.round(
    completenessPct * 0.4 +
    amountQuality * 0.25 +
    supplierQuality * 0.2 +
    dupeQuality * 0.15,
  );

  // Split fixes by confidence
  const highConfFixes = fixes.filter(f => f.confidence >= 0.85);
  const lowConfIssues = [
    ...issues,
    ...fixes.filter(f => f.confidence < 0.85).map(f => ({
      issue_type: f.fix_type,
      severity: "low" as const,
      field: f.field,
      description: f.description,
      affected_count: f.affected_count,
      sample_values: [f.before_sample],
    })),
  ];

  return {
    overall_score: overallScore,
    field_scores: fieldScores,
    high_confidence_fixes: highConfFixes,
    low_confidence_issues: lowConfIssues,
    summary: {
      total_records: total,
      complete_records: completeRecords,
      completeness_pct: completenessPct,
      date_format_detected: dateFormat?.format ?? null,
      currency_detected: detectedCurrency,
      amount_negatives_pct: Math.round(amountNegPct * 10) / 10,
      blank_supplier_pct: Math.round(blankSupplierPct * 10) / 10,
      duplicate_pct: Math.round(dupePct * 10) / 10,
    },
  };
}

/**
 * Apply high-confidence fixes to raw records in place.
 * Returns the number of fixes applied.
 */
export function applyFixes(
  records: Record<string, unknown>[],
  mapping: Record<string, string>,
  fixes: Fix[],
): number {
  let applied = 0;

  // Invert mapping
  const targetToSource: Record<string, string> = {};
  for (const [src, tgt] of Object.entries(mapping)) {
    if (tgt !== "skip") targetToSource[tgt] = src;
  }

  for (const fix of fixes) {
    const srcCol = targetToSource[fix.field];
    if (!srcCol) continue;

    for (const record of records) {
      const val = String(record[srcCol] ?? "");

      switch (fix.fix_type) {
        case "date_normalize": {
          const fmt = detectDateFormat([val]);
          if (fmt) {
            record[srcCol] = fmt.parser(val.trim());
            applied++;
          }
          break;
        }
        case "amount_clean": {
          if (/[$€£¥,\(\)]/.test(val)) {
            const cleaned = val.replace(/[$€£¥,\s]/g, "").replace(/\((.+)\)/, "-$1");
            const num = parseFloat(cleaned);
            if (!isNaN(num)) {
              record[srcCol] = num;
              applied++;
            }
          }
          break;
        }
        case "supplier_trim": {
          const trimmed = val.trim().replace(/\s{2,}/g, " ");
          if (trimmed !== val) {
            record[srcCol] = trimmed;
            applied++;
          }
          break;
        }
        case "currency_infer": {
          if (!val || val === "undefined" || val === "null") {
            record[srcCol] = fix.after_sample;
            applied++;
          }
          break;
        }
      }
    }
  }

  return applied;
}
