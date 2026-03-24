import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, AlertCircle,
  Zap, Layers, Wheat, BarChart3, Activity, Clock, CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MarketDataPoint {
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
  from_cache?: boolean;
}

interface MarketResponse {
  data: MarketDataPoint[];
  errors: string[];
  stale_tickers?: string[];
  count?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatValue(value: number | null, unit: string | null): string {
  if (value === null || value === undefined) return "—";
  const v = Number(value);
  if (isNaN(v)) return "—";

  const u = unit ?? "";
  if (u.includes("$/oz")) return `$${v.toFixed(2)}/oz`;
  if (u.includes("$/barrel")) return `$${v.toFixed(2)}/bbl`;
  if (u.includes("$/MMBtu")) return `$${v.toFixed(3)}/MMBtu`;
  if (u.includes("cents/bu")) return `${v.toFixed(2)}¢/bu`;
  if (u.includes("cents/lb")) return `${v.toFixed(2)}¢/lb`;
  if (u.includes("$/lb")) return `$${v.toFixed(4)}/lb`;
  if (u.includes("$/short ton")) return `$${v.toFixed(0)}/ton`;
  if (u.includes("1000 board")) return `$${v.toFixed(0)}/mbf`;
  if (u === "%") return `${v.toFixed(2)}%`;
  if (u === "index") return v.toFixed(1);
  return v.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function ChangeChip({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null || pct === undefined) return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
      <Minus className="h-3 w-3" /> —
    </span>
  );
  const positive = pct >= 0;
  const color = positive ? "text-emerald-600" : "text-red-500";
  const Icon = pct > 0.1 ? TrendingUp : pct < -0.1 ? TrendingDown : Minus;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${color}`}>
            <Icon className="h-3 w-3" />
            {positive ? "+" : ""}{pct.toFixed(1)}%
          </span>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return "unknown";
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 2) return "just now";
  if (diff < 60) return `${Math.round(diff)}m ago`;
  if (diff < 1440) return `${Math.round(diff / 60)}h ago`;
  return `${Math.round(diff / 1440)}d ago`;
}

// ---------------------------------------------------------------------------
// Category config
// ---------------------------------------------------------------------------
const CAT_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  commodity_metal: { label: "Metals",   icon: Layers,   color: "bg-slate-100 text-slate-700 border-slate-200" },
  commodity_energy: { label: "Energy",   icon: Zap,      color: "bg-amber-50 text-amber-700 border-amber-200" },
  commodity_ag:     { label: "Ag / Soft",icon: Wheat,    color: "bg-green-50 text-green-700 border-green-200" },
  ppi:              { label: "PPI",      icon: BarChart3, color: "bg-purple-50 text-purple-700 border-purple-200" },
  macro:            { label: "Macro",    icon: Activity,  color: "bg-blue-50 text-blue-700 border-blue-200" },
  labor:            { label: "Labor",    icon: Activity,  color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
};

// ---------------------------------------------------------------------------
// Price Card
// ---------------------------------------------------------------------------
function PriceCard({ point }: { point: MarketDataPoint }) {
  const cat = CAT_CONFIG[point.category_tag ?? ""] ?? { label: "Other", icon: BarChart3, color: "bg-gray-50 text-gray-700 border-gray-200" };
  const CatIcon = cat.icon;
  const isStale = point.from_cache && point.ttl_hours && point.fetched_at
    ? (Date.now() - new Date(point.fetched_at).getTime()) / 3600000 > point.ttl_hours
    : false;

  return (
    <Card className={`border ${isStale ? "opacity-60" : ""} hover:shadow-md transition-shadow`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border font-medium ${cat.color}`}>
              <CatIcon className="h-3 w-3" />
              {cat.label}
            </span>
          </div>
          {isStale && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger><AlertCircle className="h-3.5 w-3.5 text-amber-400" /></TooltipTrigger>
                <TooltipContent>Data may be stale — TTL expired</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <p className="text-xs text-muted-foreground truncate mb-0.5">{point.series_id}</p>
        <p className="text-sm font-semibold leading-snug mb-2 line-clamp-2">{point.series_name}</p>

        <p className="text-2xl font-bold tabular-nums mb-2">
          {formatValue(point.value, point.unit)}
        </p>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">MoM</span>
            <ChangeChip pct={point.mom_change_pct} label="Month-over-month change" />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">YoY</span>
            <ChangeChip pct={point.yoy_change_pct} label="Year-over-year change" />
          </div>
        </div>

        <div className="flex items-center gap-1 mt-3 pt-2 border-t text-xs text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          <span>{timeAgo(point.fetched_at)}</span>
          {point.period && <span className="ml-auto">{point.period}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Category Section
// ---------------------------------------------------------------------------
function CategorySection({ tag, points }: { tag: string; points: MarketDataPoint[] }) {
  const cat = CAT_CONFIG[tag] ?? { label: tag, icon: BarChart3, color: "" };
  const CatIcon = cat.icon;
  if (points.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <CatIcon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{cat.label}</h3>
        <span className="text-xs text-muted-foreground">({points.length})</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {points.map((p) => <PriceCard key={`${p.data_source}-${p.series_id}`} point={p} />)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary Stats Bar
// ---------------------------------------------------------------------------
function SummaryBar({ data }: { data: MarketDataPoint[] }) {
  const withYoY = data.filter((d) => d.yoy_change_pct !== null);
  const rising = withYoY.filter((d) => (d.yoy_change_pct ?? 0) > 1).length;
  const falling = withYoY.filter((d) => (d.yoy_change_pct ?? 0) < -1).length;
  const flat = withYoY.length - rising - falling;
  const avgYoY = withYoY.length > 0
    ? withYoY.reduce((s, d) => s + (d.yoy_change_pct ?? 0), 0) / withYoY.length
    : null;

  return (
    <div className="flex flex-wrap gap-4 p-4 bg-muted/30 rounded-lg border mb-6 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Series tracked:</span>
        <span className="font-semibold">{data.length}</span>
      </div>
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-emerald-600" />
        <span className="text-muted-foreground">Rising YoY:</span>
        <span className="font-semibold text-emerald-600">{rising}</span>
      </div>
      <div className="flex items-center gap-2">
        <TrendingDown className="h-4 w-4 text-red-500" />
        <span className="text-muted-foreground">Falling YoY:</span>
        <span className="font-semibold text-red-500">{falling}</span>
      </div>
      <div className="flex items-center gap-2">
        <Minus className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">Flat:</span>
        <span className="font-semibold">{flat}</span>
      </div>
      {avgYoY !== null && (
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-muted-foreground">Avg YoY:</span>
          <span className={`font-semibold ${avgYoY >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {avgYoY >= 0 ? "+" : ""}{avgYoY.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function MarketIntelPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"all" | "metals" | "energy" | "ag" | "macro">("all");

  // Initial load from cache (instant)
  const cacheQuery = useQuery<MarketResponse>({
    queryKey: ["/api/market/cache"],
    staleTime: 60_000,
  });

  // Live commodity fetch (respects TTL)
  const commodityQuery = useQuery<MarketResponse>({
    queryKey: ["/api/market/commodities"],
    staleTime: 60_000,
    refetchInterval: 5 * 60_000, // re-check every 5 min
  });

  // Force refresh mutation
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const resp = await fetch("/api/market/refresh-all", { method: "POST" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/market/commodities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/market/cache"] });
    },
  });

  // Sidecar health
  const healthQuery = useQuery<{ ok: boolean; detail: string }>({
    queryKey: ["/api/market/health"],
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Merge: prefer live commodityQuery data, fall back to cache
  const allPoints: MarketDataPoint[] = (() => {
    const live = commodityQuery.data?.data ?? [];
    const cached = cacheQuery.data?.data ?? [];
    if (live.length > 0) return live;
    return cached;
  })();

  const errors = [
    ...(commodityQuery.data?.errors ?? []),
    ...(cacheQuery.data ? [] : []),
  ].filter(Boolean);

  const isLoading = commodityQuery.isLoading && cacheQuery.isLoading;

  // Group by category tag
  const grouped: Record<string, MarketDataPoint[]> = {};
  for (const p of allPoints) {
    const tag = p.category_tag ?? "other";
    if (!grouped[tag]) grouped[tag] = [];
    grouped[tag].push(p);
  }

  const CAT_ORDER = ["commodity_metal", "commodity_energy", "commodity_ag", "ppi", "macro", "labor"];

  const filteredPoints = activeTab === "all" ? allPoints
    : activeTab === "metals" ? (grouped["commodity_metal"] ?? [])
    : activeTab === "energy" ? (grouped["commodity_energy"] ?? [])
    : activeTab === "ag" ? (grouped["commodity_ag"] ?? [])
    : [...(grouped["ppi"] ?? []), ...(grouped["macro"] ?? []), ...(grouped["labor"] ?? [])];

  const filteredGrouped: Record<string, MarketDataPoint[]> = {};
  for (const p of filteredPoints) {
    const tag = p.category_tag ?? "other";
    if (!filteredGrouped[tag]) filteredGrouped[tag] = [];
    filteredGrouped[tag].push(p);
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Live Market Intelligence</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time commodity prices, macro indicators, and PPI series for benchmark calibration
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Sidecar health */}
          {healthQuery.data && (
            <div className="flex items-center gap-1.5 text-xs">
              {healthQuery.data.ok
                ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /><span className="text-emerald-600">Sidecar online</span></>
                : <><AlertCircle className="h-3.5 w-3.5 text-red-400" /><span className="text-red-500">Sidecar offline</span></>
              }
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
            {refreshMutation.isPending ? "Refreshing…" : "Refresh All"}
          </Button>
        </div>
      </div>

      {/* Sidecar offline warning */}
      {healthQuery.data && !healthQuery.data.ok && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Python sidecar is offline. Market data is showing cached values.
            Start the sidecar with: <code className="font-mono text-xs">cd python-sidecar && uvicorn main:app --port 5001</code>
          </AlertDescription>
        </Alert>
      )}

      {/* Refresh errors */}
      {errors.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {errors.length} ticker(s) failed to fetch: {errors.slice(0, 3).join(", ")}
            {errors.length > 3 && ` +${errors.length - 3} more`}
          </AlertDescription>
        </Alert>
      )}

      {/* Summary bar */}
      {allPoints.length > 0 && <SummaryBar data={allPoints} />}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="all">All ({allPoints.length})</TabsTrigger>
          <TabsTrigger value="metals">Metals ({grouped["commodity_metal"]?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="energy">Energy ({grouped["commodity_energy"]?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="ag">Ag / Soft ({grouped["commodity_ag"]?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="macro">Macro / PPI ({(grouped["ppi"]?.length ?? 0) + (grouped["macro"]?.length ?? 0) + (grouped["labor"]?.length ?? 0)})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6 space-y-8">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {Array.from({ length: 20 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4 space-y-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-7 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : allPoints.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No market data yet</p>
              <p className="text-sm mt-1">Start the Python sidecar and click Refresh All to load live data.</p>
              <Button className="mt-4" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
                <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
                Load Market Data
              </Button>
            </div>
          ) : (
            CAT_ORDER
              .filter((tag) => filteredGrouped[tag]?.length > 0)
              .map((tag) => (
                <CategorySection key={tag} tag={tag} points={filteredGrouped[tag]} />
              ))
          )}
        </TabsContent>
      </Tabs>

      {/* Data sources footer */}
      <div className="pt-4 border-t text-xs text-muted-foreground flex flex-wrap gap-4">
        <span>Sources:</span>
        <span>yfinance (20 CME/COMEX/NYMEX/ICE futures · TTL 1h)</span>
        <span>·</span>
        <span>FRED API (CPI, PPI series · TTL 24h)</span>
        <span>·</span>
        <span>EIA (WTI, Henry Hub · TTL 12h)</span>
        <span>·</span>
        <span>All data served from local cache</span>
      </div>
    </div>
  );
}
