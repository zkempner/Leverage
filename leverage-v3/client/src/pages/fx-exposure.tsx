import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, AlertTriangle, DollarSign, Globe, TrendingUp, Loader2,
  ShieldAlert, CheckCircle2, ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CurrencyExposure {
  currency: string;
  total_spend_original: number;
  total_spend_usd: number;
  record_count: number;
  pct_of_total: number;
  rate_to_usd: number | null;
  volatility_flag: boolean;
  rate_source: string | null;
}

interface ExposureAnalysis {
  exposures: CurrencyExposure[];
  total_spend_usd: number;
  total_non_usd_spend: number;
  non_usd_pct: number;
  high_volatility_exposure: number;
  currency_count: number;
}

interface FxRefreshResult {
  updated: number;
  source: string;
  rates: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmt(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function barColor(e: CurrencyExposure): string {
  if (e.volatility_flag) return "#ef4444";
  if (e.currency === "USD") return "#22c55e";
  if (e.pct_of_total > 10) return "#f97316";
  return "#0066CC";
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
interface Props { engagementId: number }

export default function FxExposurePage({ engagementId }: Props) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: exposure, isLoading } = useQuery<ExposureAnalysis>({
    queryKey: [`/api/engagements/${engagementId}/fx/exposure`],
    staleTime: 300_000,
  });

  const { data: fxData } = useQuery<FxRefreshResult>({
    queryKey: [`/api/engagements/${engagementId}/fx/rates`],
    staleTime: 4 * 3600_000, // 4h TTL matches ECB
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetch(`/api/engagements/${engagementId}/fx/refresh`, { method: "POST" });
    await queryClient.invalidateQueries({ queryKey: [`/api/engagements/${engagementId}/fx/rates`] });
    await queryClient.invalidateQueries({ queryKey: [`/api/engagements/${engagementId}/fx/exposure`] });
    setRefreshing(false);
  };

  const chartData = (exposure?.exposures ?? [])
    .filter((e) => e.total_spend_usd > 0)
    .slice(0, 12)
    .map((e) => ({
      currency: e.currency,
      spend: Math.round(e.total_spend_usd / 1000),
      pct: Math.round(e.pct_of_total * 10) / 10,
      volatile: e.volatility_flag,
    }));

  const highVolatility = (exposure?.exposures ?? []).filter((e) => e.volatility_flag);
  const nonUsdExposures = (exposure?.exposures ?? []).filter((e) => e.currency !== "USD");

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">FX Exposure Analysis</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Multi-currency spend exposure · ECB live rates · Volatility flags
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={cn("h-4 w-4 mr-1.5", refreshing && "animate-spin")} />
          {refreshing ? "Refreshing ECB rates…" : "Refresh Rates"}
        </Button>
      </div>

      {/* Rate source badge */}
      {fxData && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span>Rates from: <span className="font-medium">{fxData.source === "ecb" ? "ECB API (live)" : fxData.source}</span></span>
          <span>· {fxData.updated} currencies loaded</span>
        </div>
      )}

      {/* KPI cards */}
      {exposure && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-xl font-bold">{fmt(exposure.total_spend_usd)}</p>
                <p className="text-xs text-muted-foreground">Total Spend (USD)</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Globe className="h-5 w-5 text-blue-600 shrink-0" />
              <div>
                <p className="text-xl font-bold">{exposure.currency_count}</p>
                <p className="text-xs text-muted-foreground">Currencies</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <TrendingUp className={cn("h-5 w-5 shrink-0", exposure.non_usd_pct > 20 ? "text-orange-500" : "text-muted-foreground")} />
              <div>
                <p className={cn("text-xl font-bold", exposure.non_usd_pct > 20 && "text-orange-500")}>
                  {exposure.non_usd_pct.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">Non-USD Spend</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <ShieldAlert className={cn("h-5 w-5 shrink-0", exposure.high_volatility_exposure > 0 ? "text-red-500" : "text-muted-foreground")} />
              <div>
                <p className={cn("text-xl font-bold", exposure.high_volatility_exposure > 0 && "text-red-500")}>
                  {fmt(exposure.high_volatility_exposure)}
                </p>
                <p className="text-xs text-muted-foreground">High-Vol Exposure</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Chart + table */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Bar chart */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Spend by Currency ($K)</CardTitle>
            <p className="text-xs text-muted-foreground">Red = high-volatility · Blue = stable · Green = USD</p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-48 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="currency" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 10 }} unit="K" />
                  <Tooltip
                    formatter={(v: number, _: string, props: any) => [
                      `$${v.toLocaleString()}K (${props.payload.pct}%)`,
                      "Spend",
                    ]}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Bar dataKey="spend" radius={[3, 3, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={barColor(exposure?.exposures?.find((e) => e.currency === entry.currency)!)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                No multi-currency spend data. Import transactions with currency codes.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Exposure table */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Currency Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {(exposure?.exposures ?? []).slice(0, 10).map((e) => (
                <div key={e.currency} className={cn(
                  "flex items-center gap-3 px-4 py-2.5",
                  e.volatility_flag && "bg-red-50/30",
                )}>
                  <div className="flex items-center gap-1.5 w-14 shrink-0">
                    <span className="text-sm font-mono font-medium">{e.currency}</span>
                    {e.volatility_flag && <AlertTriangle className="h-3 w-3 text-red-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{fmt(e.total_spend_usd)}</span>
                      <span className="text-muted-foreground">{e.pct_of_total.toFixed(1)}%</span>
                    </div>
                    <div className="bg-muted rounded-full h-1 mt-1 overflow-hidden">
                      <div
                        className="h-1 rounded-full"
                        style={{ width: `${Math.min(100, e.pct_of_total)}%`, backgroundColor: barColor(e) }}
                      />
                    </div>
                    {e.rate_to_usd !== null && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        1 {e.currency} = ${e.rate_to_usd.toFixed(4)} USD
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* High volatility alert */}
      {highVolatility.length > 0 && (
        <Card className="border-red-200 bg-red-50/30">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-700">High-Volatility Currency Exposure</p>
                <p className="text-xs text-red-600 mt-1">
                  {highVolatility.map((e) => `${e.currency} (${fmt(e.total_spend_usd)})`).join(" · ")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  These currencies carry elevated exchange rate risk. Consider FX hedging strategies or local currency contract clauses.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Non-USD detail table */}
      {nonUsdExposures.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Non-USD Currency Detail</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  {["Currency", "Spend (Original)", "Spend (USD)", "% of Total", "Rate to USD", "Volatility", "Source"].map((h) => (
                    <th key={h} className="text-left py-2.5 px-4 text-xs font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nonUsdExposures.map((e, i) => (
                  <tr key={e.currency} className={cn("border-b", i % 2 === 0 ? "bg-muted/10" : "")}>
                    <td className="py-2.5 pl-4 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-medium text-sm">{e.currency}</span>
                        {e.volatility_flag && <Badge className="text-xs bg-red-100 text-red-700 border-red-200 h-4 px-1">HV</Badge>}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-xs">{fmt(e.total_spend_original)}</td>
                    <td className="py-2.5 px-2 text-xs font-medium">{fmt(e.total_spend_usd)}</td>
                    <td className="py-2.5 px-2 text-xs">{e.pct_of_total.toFixed(2)}%</td>
                    <td className="py-2.5 px-2 text-xs font-mono">
                      {e.rate_to_usd !== null ? e.rate_to_usd.toFixed(5) : "—"}
                    </td>
                    <td className="py-2.5 px-2">
                      {e.volatility_flag
                        ? <span className="text-xs text-red-600 font-medium">High</span>
                        : <span className="text-xs text-emerald-600">Normal</span>
                      }
                    </td>
                    <td className="py-2.5 px-2 text-xs text-muted-foreground capitalize">
                      {e.rate_source ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
