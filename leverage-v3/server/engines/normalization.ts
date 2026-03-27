// Deterministic supplier normalization engine — no AI.
// Uses multiple matching strategies: exact stem, contains, token overlap, and Levenshtein.
// Extended with 100+ known aliases (Big 4, tech, carriers, staffing, consulting, Fortune 500),
// industry-specific aliases, 40+ abbreviation expansions, number normalization (1st→First),
// and match_reason audit trail.

export interface NormalizationResult {
  original: string;
  canonical: string;
  similarity: number;
  match_reason: string; // New: explains why this match was made
}

// Levenshtein distance
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function levSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// Legal suffixes to strip
const SUFFIX_RE = /\b(llc|l\.?l\.?c\.?|inc\.?|incorporated|corp\.?|corporation|co\.?|company|ltd\.?|limited|plc|gmbh|ag|s\.?a\.?|n\.?v\.?|b\.?v\.?|pty|lp|l\.?p\.?|llp|group|holdings?|enterprises?|intl\.?|international|industries|services)\b/gi;
const PAREN_RE = /\(.*?\)/g;
const PUNCT_RE = /[.,;:'"!@#$%^&*()\-_+=\[\]{}|\\/<>]/g;
const MULTI_SPACE = /\s+/g;

// Normalize unicode (Körber -> Korber)
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Number normalization: "1st" → "First", "3rd" → "Third", etc.
const ORDINAL_MAP: Record<string, string> = {
  "1ST": "FIRST", "2ND": "SECOND", "3RD": "THIRD", "4TH": "FOURTH", "5TH": "FIFTH",
  "6TH": "SIXTH", "7TH": "SEVENTH", "8TH": "EIGHTH", "9TH": "NINTH", "10TH": "TENTH",
};

function normalizeNumbers(s: string): string {
  // Replace ordinals
  for (const [ordinal, word] of Object.entries(ORDINAL_MAP)) {
    s = s.replace(new RegExp(`\\b${ordinal}\\b`, "g"), word);
  }
  // Normalize common number words
  s = s.replace(/\bONE\b/g, "1");
  return s;
}

function cleanForCompare(name: string): string {
  let c = stripDiacritics(name.trim());
  c = c.replace(SUFFIX_RE, "");
  c = c.replace(PAREN_RE, "");   // strip parenthetical content
  c = c.replace(PUNCT_RE, " ");
  c = c.replace(MULTI_SPACE, " ").trim();
  c = c.toUpperCase();
  c = normalizeNumbers(c);
  return c;
}

// Get significant tokens (for token-overlap matching)
function getTokens(cleaned: string): Set<string> {
  return new Set(cleaned.split(/\s+/).filter(t => t.length > 1));
}

// Token overlap ratio (Jaccard-like)
function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / Math.min(a.size, b.size); // overlap with smaller set
}

// "Contains" check — one name is a prefix/substring of the other
// Only match if the shorter name is at least 60% the length of the longer
function containsMatch(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return false;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (shorter.length / longer.length < 0.5) return false; // too different in length
  return longer.includes(shorter);
}

// Combined similarity score using multiple strategies
function matchScore(cleanA: string, cleanB: string, tokA: Set<string>, tokB: Set<string>): number {
  // Exact match after cleaning
  if (cleanA === cleanB) return 1.0;

  // Contains match (one is a prefix/abbreviation of the other)
  if (containsMatch(cleanA, cleanB)) return 0.92;

  // Token overlap — if all tokens of the shorter name appear in the longer one
  // Require at least 2 shared tokens to avoid false positives on common words
  const overlap = tokenOverlap(tokA, tokB);
  const minTokens = Math.min(tokA.size, tokB.size);
  const sharedCount = [...tokA].filter(t => tokB.has(t)).length;
  if (overlap >= 1.0 && sharedCount >= 2) return 0.90;
  if (overlap >= 1.0 && minTokens === 1 && sharedCount === 1) {
    // Single-token match only if the token is long (not a common word like "United")
    const sharedToken = [...tokA].find(t => tokB.has(t)) || "";
    if (sharedToken.length >= 6) return 0.88;
    return 0.5; // too risky for short tokens
  }
  if (overlap >= 0.75 && sharedCount >= 2) return 0.85;

  // Levenshtein similarity
  const lev = levSimilarity(cleanA, cleanB);

  // Weighted combination
  return Math.max(lev, overlap * 0.9);
}

const MATCH_THRESHOLD = 0.78;

// Known abbreviation expansions (40+)
const ABBREVIATIONS: Record<string, string> = {
  // Original set
  "ASSOC": "ASSOCIATES",
  "TECH": "TECHNOLOGIES",
  "INTL": "INTERNATIONAL",
  "SYS": "SYSTEMS",
  "MFG": "MANUFACTURING",
  "MGMT": "MANAGEMENT",
  "SVCS": "SERVICES",
  "SRVCS": "SERVICES",
  "CONST": "CONSTRUCTION",
  "SOLN": "SOLUTIONS",
  "SOLNS": "SOLUTIONS",
  "BUS": "BUSINESS",
  "GRP": "GROUP",
  "ELEC": "ELECTRIC",
  "NATL": "NATIONAL",
  "GOVT": "GOVERNMENT",
  "ENVIRO": "ENVIRONMENTAL",
  "DIST": "DISTRIBUTION",
  "EQUIP": "EQUIPMENT",
  // New expansions
  "ACCT": "ACCOUNTING",
  "ADMIN": "ADMINISTRATION",
  "ADV": "ADVISORY",
  "AMER": "AMERICAN",
  "ARCHT": "ARCHITECTS",
  "AUTO": "AUTOMOTIVE",
  "BLDG": "BUILDING",
  "CHEM": "CHEMICAL",
  "COMM": "COMMUNICATIONS",
  "COMML": "COMMERCIAL",
  "CONSULT": "CONSULTING",
  "CTR": "CENTER",
  "DEV": "DEVELOPMENT",
  "DIAG": "DIAGNOSTICS",
  "ELECTL": "ELECTRICAL",
  "ENG": "ENGINEERING",
  "ENT": "ENTERPRISES",
  "ENVIRON": "ENVIRONMENTAL",
  "FIN": "FINANCIAL",
  "HLTH": "HEALTH",
  "HOSP": "HOSPITAL",
  "IND": "INDUSTRIES",
  "INFO": "INFORMATION",
  "LOGIS": "LOGISTICS",
  "MAINT": "MAINTENANCE",
  "MATL": "MATERIALS",
  "MATLS": "MATERIALS",
  "MECH": "MECHANICAL",
  "MED": "MEDICAL",
  "MTL": "METAL",
  "NAT": "NATURAL",
  "NETW": "NETWORK",
  "OPER": "OPERATIONS",
  "PETRO": "PETROLEUM",
  "PHARM": "PHARMACEUTICAL",
  "PKG": "PACKAGING",
  "PROF": "PROFESSIONAL",
  "PROP": "PROPERTIES",
  "PROT": "PROTECTION",
  "PUB": "PUBLISHING",
  "RSCH": "RESEARCH",
  "REHAB": "REHABILITATION",
  "SEC": "SECURITY",
  "SPEC": "SPECIALTY",
  "STL": "STEEL",
  "SUPP": "SUPPLY",
  "SURG": "SURGICAL",
  "TEL": "TELEPHONE",
  "TELCO": "TELECOMMUNICATIONS",
  "TRANS": "TRANSPORTATION",
  "UTIL": "UTILITIES",
  "WHSE": "WAREHOUSE",
  "WLDG": "WELDING",
};

// Known company aliases — names that refer to the same entity but are too different for fuzzy matching
// Key = cleaned uppercase alias, Value = cleaned uppercase canonical name
const KNOWN_ALIASES: Record<string, string> = {
  // ---- Big 4 Accounting / Advisory ----
  "EY": "ERNST YOUNG",
  "ERNST YOUNG": "ERNST YOUNG",
  "E Y": "ERNST YOUNG",
  "PWC": "PRICEWATERHOUSECOOPERS",
  "PRICEWATERHOUSE": "PRICEWATERHOUSECOOPERS",
  "PRICEWATERHOUSECOOPERS": "PRICEWATERHOUSECOOPERS",
  "KPMG": "KPMG",
  "KPMG PEAT MARWICK": "KPMG",
  "DTT": "DELOITTE",
  "DELOITTE TOUCHE": "DELOITTE",
  "DELOITTE TOUCHE TOHMATSU": "DELOITTE",
  "DELOITTE CONSULTING": "DELOITTE",

  // ---- Top consulting ----
  "MCKINSEY COMPANY": "MCKINSEY",
  "BCG": "BOSTON CONSULTING",
  "BOSTON CONSULTING": "BOSTON CONSULTING",
  "BAIN COMPANY": "BAIN",
  "BAIN CO": "BAIN",

  // ---- Tech giants ----
  "MSFT": "MICROSOFT",
  "MICROSOFT": "MICROSOFT",
  "MS": "MICROSOFT",
  "AMZN": "AMAZON",
  "AMAZON WEB SERVICES": "AMAZON WEB SERVICES",
  "AMAZON WEB SERVICE": "AMAZON WEB SERVICES",
  "AWS": "AMAZON WEB SERVICES",
  "AAPL": "APPLE",
  "APPLE": "APPLE",
  "GOOGL": "GOOGLE",
  "GOOG": "GOOGLE",
  "GOOGLE": "GOOGLE",
  "ALPHABET": "GOOGLE",
  "META PLATFORMS": "META",
  "META": "META",
  "FACEBOOK": "META",
  "FB": "META",
  "CRM": "SALESFORCE",
  "SALESFORCE": "SALESFORCE",
  "ORCL": "ORACLE",
  "ORACLE": "ORACLE",
  "SAP SE": "SAP",
  "SAP": "SAP",
  "DELL EMC": "DELL TECHNOLOGIES",
  "DELL": "DELL TECHNOLOGIES",
  "DELL TECHNOLOGIES": "DELL TECHNOLOGIES",
  "IBM": "IBM",
  "HPE": "HEWLETT PACKARD ENTERPRISE",
  "HEWLETT PACKARD ENTERPRISE": "HEWLETT PACKARD ENTERPRISE",
  "HP": "HP",
  "HEWLETT PACKARD": "HP",
  "CISCO SYSTEMS": "CISCO",
  "CSCO": "CISCO",
  "CISCO": "CISCO",
  "INTC": "INTEL",
  "INTEL": "INTEL",
  "VMW": "VMWARE",
  "VMWARE": "VMWARE",
  "BROADCOM VMWARE": "VMWARE",
  "ADBE": "ADOBE",
  "ADOBE SYSTEMS": "ADOBE",
  "ADOBE": "ADOBE",
  "INTUIT": "INTUIT",
  "INTU": "INTUIT",
  "NOW": "SERVICENOW",
  "SERVICENOW": "SERVICENOW",
  "SERVICE NOW": "SERVICENOW",
  "SNOW": "SNOWFLAKE",
  "WDAY": "WORKDAY",
  "WORKDAY": "WORKDAY",

  // ---- Carriers / Logistics ----
  "FEDEX": "FEDEX",
  "FEDERAL EXPRESS": "FEDEX",
  "FEDEX FREIGHT": "FEDEX",
  "FEDEX GROUND": "FEDEX",
  "FEDEX EXPRESS": "FEDEX",
  "FDX": "FEDEX",
  "UPS": "UPS",
  "UNITED PARCEL SERVICE": "UPS",
  "UPS SUPPLY CHAIN": "UPS",
  "UPS FREIGHT": "UPS",
  "DHL": "DHL",
  "DHL EXPRESS": "DHL",
  "DHL SUPPLY CHAIN": "DHL",
  "DEUTSCHE POST DHL": "DHL",
  "XPO LOGISTICS": "XPO",
  "XPO": "XPO",
  "CH ROBINSON": "CH ROBINSON",
  "CHRW": "CH ROBINSON",
  "JB HUNT": "JB HUNT",
  "JB HUNT TRANSPORT": "JB HUNT",
  "JBHT": "JB HUNT",
  "RYDER": "RYDER",
  "RYDER SYSTEM": "RYDER",
  "MAERSK": "MAERSK",
  "AP MOLLER MAERSK": "MAERSK",

  // ---- Staffing ----
  "RANDSTAD": "RANDSTAD",
  "RANDSTAD SOURCERIGHT": "RANDSTAD",
  "RANDSTAD STAFFING": "RANDSTAD",
  "ADECCO": "ADECCO",
  "ADECCO STAFFING": "ADECCO",
  "MANPOWER": "MANPOWERGROUP",
  "MANPOWERGROUP": "MANPOWERGROUP",
  "MANPOWER GROUP": "MANPOWERGROUP",
  "RHI": "ROBERT HALF",
  "ROBERT HALF INTERNATIONAL": "ROBERT HALF",
  "ROBERT HALF": "ROBERT HALF",
  "INSIGHT GLOBAL": "INSIGHT GLOBAL",
  "KELLY": "KELLY SERVICES",
  "KELLY SERVICES": "KELLY SERVICES",
  "KELLY SERVICE": "KELLY SERVICES",
  "AEROTEK": "AEROTEK",
  "HAYS": "HAYS",
  "HAYS RECRUITING": "HAYS",
  "TEK SYSTEMS": "TEK SYSTEMS",
  "TEKSYSTEMS": "TEK SYSTEMS",

  // ---- Insurance ----
  "AIG": "AIG",
  "AMERICAN INTERNATIONAL": "AIG",
  "CHUBB": "CHUBB",
  "ACE CHUBB": "CHUBB",
  "ZURICH": "ZURICH",
  "ZURICH INSURANCE": "ZURICH",
  "ZURICH NORTH AMERICA": "ZURICH",
  "TRAVELERS": "TRAVELERS",
  "HARTFORD": "HARTFORD",
  "HARTFORD FINANCIAL": "HARTFORD",
  "MARSH": "MARSH MCLENNAN",
  "MARSH MCLENNAN": "MARSH MCLENNAN",
  "MMC": "MARSH MCLENNAN",
  "AON": "AON",
  "AON HEWITT": "AON",
  "WTW": "WILLIS TOWERS WATSON",
  "WILLIS TOWERS WATSON": "WILLIS TOWERS WATSON",
  "WILLIS T WATSON": "WILLIS TOWERS WATSON",

  // ---- Travel ----
  "AMEX GBT": "AMERICAN EXPRESS GLOBAL BUSINESS TRAVEL",
  "AMERICAN EXPRESS GBT": "AMERICAN EXPRESS GLOBAL BUSINESS TRAVEL",
  "AMEX GLOBAL BUSINESS TRAVEL": "AMERICAN EXPRESS GLOBAL BUSINESS TRAVEL",
  "BCD TRAVEL": "BCD TRAVEL",
  "CWT": "CWT",
  "CARLSON WAGONLIT": "CWT",
  "CARLSON WAGONLIT TRAVEL": "CWT",

  // ---- Airlines ----
  "UNITED AIRLINES": "UNITED AIRLINES",
  "UNITED": "UNITED AIRLINES",
  "UAL": "UNITED AIRLINES",
  "AMERICAN AIRLINES": "AMERICAN AIRLINES",
  "AAL": "AMERICAN AIRLINES",
  "DELTA AIR LINES": "DELTA AIR LINES",
  "DELTA AIR": "DELTA AIR LINES",
  "DAL": "DELTA AIR LINES",
  "SOUTHWEST AIRLINES": "SOUTHWEST AIRLINES",
  "SOUTHWEST AIR": "SOUTHWEST AIRLINES",
  "LUV": "SOUTHWEST AIRLINES",

  // ---- Hotels ----
  "MARRIOTT": "MARRIOTT",
  "MARRIOTT INTERNATIONAL": "MARRIOTT",
  "MAR": "MARRIOTT",
  "HILTON": "HILTON",
  "HILTON HOTELS": "HILTON",
  "HILTON WORLDWIDE": "HILTON",
  "HLT": "HILTON",
  "HYATT": "HYATT",
  "HYATT HOTELS": "HYATT",

  // ---- Facilities / Real estate ----
  "CBRE": "CBRE",
  "CBRE GROUP": "CBRE",
  "JLL": "JONES LANG LASALLE",
  "JONES LANG LASALLE": "JONES LANG LASALLE",
  "CUSHMAN WAKEFIELD": "CUSHMAN WAKEFIELD",
  "CUSHMAN AND WAKEFIELD": "CUSHMAN WAKEFIELD",
  "ISS AS": "ISS",
  "ISS FACILITY": "ISS",
  "ISS": "ISS",
  "ABM": "ABM",
  "ABM INDUSTRIES": "ABM",
  "CINTAS": "CINTAS",
  "ALLIED UNIVERSAL": "ALLIED UNIVERSAL",
  "SECURITAS": "SECURITAS",

  // ---- Telecom ----
  "ATT": "AT T",
  "AT T": "AT T",
  "VERIZON": "VERIZON",
  "VERIZON BUS SOLUTIONS": "VERIZON",
  "VERIZON BUSINESS SOLUTIONS": "VERIZON",
  "VERIZON BUSINESS": "VERIZON",
  "VZ": "VERIZON",
  "T MOBILE": "T MOBILE",
  "TMOBILE": "T MOBILE",
  "TMUS": "T MOBILE",
  "COMCAST": "COMCAST",
  "COMCAST BUSINESS": "COMCAST",
  "XFINITY": "COMCAST",

  // ---- Waste / Environment ----
  "WM": "WASTE MANAGEMENT",
  "WASTE MANAGEMENT": "WASTE MANAGEMENT",
  "REPUBLIC SERVICES": "REPUBLIC SERVICES",
  "REPUBLIC SERVICE": "REPUBLIC SERVICES",
  "RSG": "REPUBLIC SERVICES",
  "STERICYCLE": "STERICYCLE",
  "SRCL": "STERICYCLE",

  // ---- HR / Benefits ----
  "ADP": "ADP",
  "AUTOMATIC DATA PROCESSING": "ADP",
  "PAYCHEX": "PAYCHEX",
  "PAYX": "PAYCHEX",

  // ---- Rental / Fleet ----
  "HERTZ": "HERTZ",
  "HTZ": "HERTZ",
  "ENTERPRISE": "ENTERPRISE",
  "ENTERPRISE RENT A CAR": "ENTERPRISE",
  "ENTERPRISE FLEET": "ENTERPRISE",
  "AVIS": "AVIS BUDGET",
  "AVIS BUDGET": "AVIS BUDGET",
  "BUDGET RENT": "AVIS BUDGET",
  "CAR": "AVIS BUDGET",

  // ---- Office / Supplies ----
  "STAPLES": "STAPLES",
  "OFFICE DEPOT": "OFFICE DEPOT",
  "OFFICE MAX": "OFFICE DEPOT",
  "IRON MOUNTAIN": "IRON MOUNTAIN",
  "IRM": "IRON MOUNTAIN",

  // ---- Industrial / MRO ----
  "GRAINGER": "WW GRAINGER",
  "WW GRAINGER": "WW GRAINGER",
  "GWW": "WW GRAINGER",
  "FASTENAL": "FASTENAL",
  "FAST": "FASTENAL",
  "MSC INDUSTRIAL": "MSC INDUSTRIAL",
  "MSC": "MSC INDUSTRIAL",

  // ---- Energy ----
  "DUKE ENERGY": "DUKE ENERGY",
  "DUK": "DUKE ENERGY",
  "NEXTERA": "NEXTERA ENERGY",
  "NEXTERA ENERGY": "NEXTERA ENERGY",
  "NEE": "NEXTERA ENERGY",
  "MARATHON PETROLEUM": "MARATHON PETROLEUM",
  "MARATHON PETRO": "MARATHON PETROLEUM",
  "MPC": "MARATHON PETROLEUM",

  // ---- Software / SaaS (additional) ----
  "KORBER": "KORBER",
  "KORBER SC": "KORBER",
  "KORBER SUPPLY CHAIN": "KORBER",
  "BLUE YONDER": "BLUE YONDER",
  "BLUE YONDER JDA": "BLUE YONDER",
  "BLUE YONDER GROUP": "BLUE YONDER",
  "JDA SOFTWARE": "BLUE YONDER",
  "PROCORE": "PROCORE",
  "PROCORE TECHNOLOGIES": "PROCORE",
  "PTC": "PTC",
  "WEWORK": "WEWORK",
  "WEWORK COMPANIES": "WEWORK",
  "AUTODESK": "AUTODESK",
  "ADSK": "AUTODESK",
  "ATLASSIAN": "ATLASSIAN",
  "TEAM": "ATLASSIAN",
  "SPLUNK": "SPLUNK",
  "SPLK": "SPLUNK",
  "DATADOG": "DATADOG",
  "DDOG": "DATADOG",
  "PALO ALTO NETWORKS": "PALO ALTO NETWORKS",
  "PANW": "PALO ALTO NETWORKS",
  "CROWDSTRIKE": "CROWDSTRIKE",
  "CRWD": "CROWDSTRIKE",
  "OKTA": "OKTA",
  "ZSCALER": "ZSCALER",
  "ZS": "ZSCALER",

  // ---- Co-working / Real estate tech ----
  "REGUS": "IWG",
  "IWG": "IWG",
  "SPACES": "IWG",

  // ---- CDW / IT resellers ----
  "CDW": "CDW",
  "CDW DIRECT": "CDW",
  "SHI": "SHI INTERNATIONAL",
  "SHI INTERNATIONAL": "SHI INTERNATIONAL",
  "INSIGHT DIRECT": "INSIGHT ENTERPRISES",
  "INSIGHT ENTERPRISES": "INSIGHT ENTERPRISES",

  // ---- Legal (top firms) ----
  "KIRKLAND ELLIS": "KIRKLAND ELLIS",
  "KIRKLAND": "KIRKLAND ELLIS",
  "SKADDEN ARPS": "SKADDEN",
  "SKADDEN": "SKADDEN",
  "LATHAM WATKINS": "LATHAM WATKINS",
  "LATHAM": "LATHAM WATKINS",
  "BAKER MCKENZIE": "BAKER MCKENZIE",
  "JONES DAY": "JONES DAY",
  "DLA PIPER": "DLA PIPER",
  "GIBSON DUNN": "GIBSON DUNN",
  "SULLIVAN CROMWELL": "SULLIVAN CROMWELL",
  "SIMPSON THACHER": "SIMPSON THACHER",
  "WEIL GOTSHAL": "WEIL GOTSHAL",
  "COOLEY": "COOLEY",

  // ---- Recruiting ----
  "KORN FERRY": "KORN FERRY",
  "KFY": "KORN FERRY",
  "SPENCER STUART": "SPENCER STUART",
  "HEIDRICK STRUGGLES": "HEIDRICK STRUGGLES",
  "HSII": "HEIDRICK STRUGGLES",

  // ---- 6RS and misc ----
  "6RS": "6 RIVER SYSTEMS",
  "IEC ELECTRIC": "IEC",
  "IEC INDUSTRIAL ELECTRICAL": "IEC",
  "IEC": "IEC",
};

function expandAbbreviations(cleaned: string): string {
  let expanded = cleaned;
  for (const [abbr, full] of Object.entries(ABBREVIATIONS)) {
    expanded = expanded.replace(new RegExp(`\\b${abbr}\\b`, "g"), full);
  }
  return expanded;
}

// Resolve known aliases to a canonical form before fuzzy matching
function resolveAlias(cleaned: string): string | null {
  // Check exact match in known aliases
  if (cleaned in KNOWN_ALIASES) return KNOWN_ALIASES[cleaned];
  // Check after abbreviation expansion
  const expanded = expandAbbreviations(cleaned);
  if (expanded in KNOWN_ALIASES) return KNOWN_ALIASES[expanded];
  return null;
}

export function normalizeSuppliers(suppliers: string[]): NormalizationResult[] {
  // 1. Clean and prepare all names, resolving known aliases
  const entries = suppliers.map(s => {
    const cleaned = cleanForCompare(s);
    const alias = resolveAlias(cleaned);
    const expanded = alias || expandAbbreviations(cleaned);
    return { original: s, cleaned, expanded, tokens: getTokens(expanded), aliasResolved: !!alias, aliasTarget: alias };
  });

  // 2. Group using union-find with multi-strategy matching
  const parent: number[] = entries.map((_, i) => i);
  const matchReasons: Map<number, string> = new Map(); // Track why each entry was matched

  function find(i: number): number {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  }
  function union(i: number, j: number) {
    const ri = find(i), rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  }

  // Phase A: Force-merge entries that resolved to the same alias
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].aliasResolved && !matchReasons.has(i)) {
      matchReasons.set(i, `Known alias → "${entries[i].aliasTarget}"`);
    }
    for (let j = i + 1; j < entries.length; j++) {
      if (find(i) === find(j)) continue;
      if (entries[i].expanded === entries[j].expanded) {
        union(i, j); // Same expanded/alias form = definite match
        if (!matchReasons.has(j)) {
          matchReasons.set(j, entries[j].aliasResolved
            ? `Known alias → "${entries[j].aliasTarget}"`
            : `Exact match after cleaning/expansion`);
        }
      }
    }
  }

  // Phase B: Fuzzy matching for the rest
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (find(i) === find(j)) continue;
      const score = matchScore(entries[i].expanded, entries[j].expanded, entries[i].tokens, entries[j].tokens);
      if (score >= MATCH_THRESHOLD) {
        union(i, j);
        if (!matchReasons.has(j)) {
          if (score >= 1.0) matchReasons.set(j, "Exact match after normalization");
          else if (score >= 0.92) matchReasons.set(j, `Contains match (similarity: ${score.toFixed(2)})`);
          else if (score >= 0.85) matchReasons.set(j, `Token overlap match (similarity: ${score.toFixed(2)})`);
          else matchReasons.set(j, `Fuzzy match (Levenshtein similarity: ${score.toFixed(2)})`);
        }
      }
    }
  }

  // 3. Collect groups
  const groups: Map<number, number[]> = new Map();
  for (let i = 0; i < entries.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  }

  // 4. Pick canonical name for each group
  const results: NormalizationResult[] = [];
  for (const [, members] of groups) {
    const canonical = pickCanonical(members.map(i => entries[i].original));
    for (const idx of members) {
      const sim = matchScore(entries[idx].expanded, cleanForCompare(canonical),
        entries[idx].tokens, getTokens(expandAbbreviations(cleanForCompare(canonical))));

      // Build match reason
      let reason: string;
      if (members.length === 1) {
        reason = "Unique — no matches found";
      } else if (entries[idx].original === canonical) {
        reason = "Canonical name (selected as group representative)";
      } else {
        reason = matchReasons.get(idx) || `Grouped with "${canonical}" (similarity: ${sim.toFixed(2)})`;
      }

      results.push({
        original: entries[idx].original,
        canonical,
        similarity: Math.round(sim * 100) / 100,
        match_reason: reason,
      });
    }
  }

  return results;
}

function pickCanonical(group: string[]): string {
  if (group.length === 1) return formatCanonical(group[0]);

  // Prefer the longest cleaned name (most complete), then most common
  const scored = group.map(name => {
    const cleaned = cleanForCompare(name);
    return { name, cleaned, len: cleaned.length };
  });

  // Sort: longest cleaned name first, then prefer mixed case original
  scored.sort((a, b) => {
    if (b.len !== a.len) return b.len - a.len;
    // Prefer mixed case over all-upper
    const aMixed = a.name !== a.name.toUpperCase() ? 1 : 0;
    const bMixed = b.name !== b.name.toUpperCase() ? 1 : 0;
    return bMixed - aMixed;
  });

  return formatCanonical(scored[0].name);
}

function formatCanonical(name: string): string {
  let cleaned = name.trim();
  // Remove legal suffixes
  cleaned = cleaned.replace(SUFFIX_RE, "");
  cleaned = cleaned.replace(PAREN_RE, "");
  cleaned = cleaned.replace(PUNCT_RE, " ");
  cleaned = cleaned.replace(MULTI_SPACE, " ").trim();

  // Smart casing: if original was ALL CAPS, title-case it. Otherwise preserve original casing.
  if (cleaned === cleaned.toUpperCase() && cleaned.length > 3) {
    // Check if it looks like an acronym (3 chars or less) — keep uppercase
    const words = cleaned.split(/\s+/);
    cleaned = words.map(w => {
      if (w.length <= 3) return w; // Keep short words as-is (IEC, 6RS, etc.)
      return w.charAt(0) + w.slice(1).toLowerCase();
    }).join(" ");
  }

  return cleaned;
}
