/**
 * LEVERAGE v3 — WebSearchService (P1-15b)
 *
 * 4-tier web search cascade per spec:
 *   1. SearXNG self-hosted  (primary — unlimited, $0, localhost:8888)
 *   2. DDGS via sidecar     (fallback — unlimited soft, no key)
 *   3. Serper.dev           (reserve — Google quality, high_value=true queries)
 *   4. Exa.ai semantic      (semantic — supplier/competitor research, semantic=true)
 *
 * All agents call WebSearchService.search() — never APIs directly.
 *
 * Usage:
 *   import { search, searchNews } from "./services/WebSearchService";
 *   const results = await search("Acme Corp bankruptcy risk", { highValue: true });
 *   const news    = await searchNews("steel prices tariff 2026");
 */

const SIDECAR_URL   = process.env.SIDECAR_URL   ?? "http://localhost:5001";
const SEARXNG_URL   = process.env.SEARXNG_URL   ?? "http://localhost:8888";
const SERPER_KEY    = process.env.SERPER_API_KEY ?? "";
const EXA_KEY       = process.env.EXA_API_KEY   ?? "";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  published?: string;
  source?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  source: string;          // which tier was used
  query: string;
  fetched_at: string;
  error?: string;
}

export interface SearchOptions {
  maxResults?: number;
  highValue?: boolean;     // true → use Serper.dev reserve tier
  semantic?: boolean;      // true → use Exa.ai semantic tier
  language?: string;
}

// ---------------------------------------------------------------------------
// Tier 1: SearXNG (self-hosted, localhost:8888)
// ---------------------------------------------------------------------------
async function searchSearXNG(query: string, maxResults: number): Promise<SearchResult[] | null> {
  try {
    const url = new URL(`${SEARXNG_URL}/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("engines", "google,bing,duckduckgo,brave");

    const resp = await fetch(url.toString(), {
      signal: AbortSignal.timeout(8_000),
      headers: { "Accept": "application/json" },
    });

    if (!resp.ok) return null;

    const data = await resp.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
    const raw = data.results ?? [];

    return raw.slice(0, maxResults).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: r.content ?? "",
    }));
  } catch {
    // SearXNG not running — silent fallback
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tier 2: DDGS via Python sidecar
// ---------------------------------------------------------------------------
async function searchDDGS(query: string, maxResults: number): Promise<SearchResult[] | null> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/api/search/ddgs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, max_results: maxResults, search_type: "web" }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) return null;

    const data = await resp.json() as { results?: SearchResult[] };
    return data.results ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tier 3: Serper.dev (Google SERP API — high-value queries)
// ---------------------------------------------------------------------------
async function searchSerper(query: string, maxResults: number): Promise<SearchResult[] | null> {
  if (!SERPER_KEY) return null;

  try {
    const resp = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": SERPER_KEY,
      },
      body: JSON.stringify({ q: query, num: maxResults }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) return null;

    const data = await resp.json() as {
      organic?: Array<{ title?: string; link?: string; snippet?: string }>;
    };

    return (data.organic ?? []).slice(0, maxResults).map((r) => ({
      title: r.title ?? "",
      url: r.link ?? "",
      snippet: r.snippet ?? "",
    }));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tier 4: Exa.ai (semantic search — supplier/competitor research)
// ---------------------------------------------------------------------------
async function searchExa(query: string, maxResults: number): Promise<SearchResult[] | null> {
  if (!EXA_KEY) return null;

  try {
    const resp = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": EXA_KEY,
      },
      body: JSON.stringify({
        query,
        numResults: maxResults,
        useAutoprompt: true,
        type: "neural",
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!resp.ok) return null;

    const data = await resp.json() as {
      results?: Array<{ title?: string; url?: string; text?: string; publishedDate?: string; author?: string }>;
    };

    return (data.results ?? []).slice(0, maxResults).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: r.text?.slice(0, 400) ?? "",
      published: r.publishedDate,
      source: r.author,
    }));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Primary search entry point
// ---------------------------------------------------------------------------
export async function search(
  query: string,
  opts: SearchOptions = {},
): Promise<SearchResponse> {
  const maxResults = opts.maxResults ?? 10;
  const fetched_at = new Date().toISOString();

  // Semantic mode → go straight to Exa.ai
  if (opts.semantic && EXA_KEY) {
    const results = await searchExa(query, maxResults);
    if (results && results.length > 0) {
      return { results, source: "exa", query, fetched_at };
    }
  }

  // High-value mode → go straight to Serper.dev (Google quality)
  if (opts.highValue && SERPER_KEY) {
    const results = await searchSerper(query, maxResults);
    if (results && results.length > 0) {
      return { results, source: "serper", query, fetched_at };
    }
  }

  // Tier 1: SearXNG
  const searxResults = await searchSearXNG(query, maxResults);
  if (searxResults && searxResults.length > 0) {
    return { results: searxResults, source: "searxng", query, fetched_at };
  }

  // Tier 2: DDGS
  const ddgsResults = await searchDDGS(query, maxResults);
  if (ddgsResults && ddgsResults.length > 0) {
    return { results: ddgsResults, source: "ddgs", query, fetched_at };
  }

  // Tier 3: Serper (even for non-high-value, if nothing else worked)
  if (SERPER_KEY) {
    const serperResults = await searchSerper(query, maxResults);
    if (serperResults && serperResults.length > 0) {
      return { results: serperResults, source: "serper_fallback", query, fetched_at };
    }
  }

  // Tier 4: Exa (even for non-semantic queries as last resort)
  if (EXA_KEY) {
    const exaResults = await searchExa(query, maxResults);
    if (exaResults && exaResults.length > 0) {
      return { results: exaResults, source: "exa_fallback", query, fetched_at };
    }
  }

  // All tiers failed
  console.warn(`[WebSearchService] All search tiers failed for query: "${query}"`);
  return {
    results: [],
    source: "none",
    query,
    fetched_at,
    error: "All search tiers unavailable. Start SearXNG or configure SERPER_API_KEY / EXA_API_KEY.",
  };
}

// ---------------------------------------------------------------------------
// News search (DDGS news via sidecar → NewsData.io in NewsService)
// ---------------------------------------------------------------------------
export async function searchNews(
  query: string,
  opts: { maxResults?: number; language?: string } = {},
): Promise<SearchResponse> {
  const maxResults = opts.maxResults ?? 20;
  const fetched_at = new Date().toISOString();

  try {
    const resp = await fetch(`${SIDECAR_URL}/api/search/news`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, max_results: maxResults, language: opts.language ?? "en" }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!resp.ok) {
      throw new Error(`Sidecar news endpoint returned ${resp.status}`);
    }

    const data = await resp.json() as { results?: SearchResult[]; source?: string };
    return {
      results: data.results ?? [],
      source: data.source ?? "unknown",
      query,
      fetched_at,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[WebSearchService] News search failed: ${msg}`);
    return { results: [], source: "none", query, fetched_at, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Supplier-specific web lookup (Tier 1→2 cascade, used by Agent 1C/2/5)
// ---------------------------------------------------------------------------
export async function lookupSupplier(
  supplierName: string,
  context?: string,
): Promise<SearchResponse> {
  const query = context
    ? `${supplierName} ${context}`
    : `${supplierName} company procurement supplier`;
  return search(query, { maxResults: 5 });
}

// ---------------------------------------------------------------------------
// Semantic supplier search (Exa.ai — Agent 10 category intel)
// ---------------------------------------------------------------------------
export async function findSimilarSuppliers(
  description: string,
): Promise<SearchResponse> {
  return search(description, { semantic: true, maxResults: 8 });
}

// ---------------------------------------------------------------------------
// Health check — report which tiers are available
// ---------------------------------------------------------------------------
export async function getSearchHealth(): Promise<Record<string, boolean | string>> {
  const health: Record<string, boolean | string> = {
    searxng: false,
    ddgs_sidecar: false,
    serper: Boolean(SERPER_KEY),
    exa: Boolean(EXA_KEY),
    serper_key_configured: Boolean(SERPER_KEY),
    exa_key_configured: Boolean(EXA_KEY),
  };

  // Test SearXNG
  try {
    const resp = await fetch(`${SEARXNG_URL}/search?q=test&format=json`, {
      signal: AbortSignal.timeout(3_000),
    });
    health.searxng = resp.ok;
  } catch {
    health.searxng = false;
  }

  // Test sidecar
  try {
    const resp = await fetch(`${SIDECAR_URL}/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    health.ddgs_sidecar = resp.ok;
  } catch {
    health.ddgs_sidecar = false;
  }

  return health;
}
