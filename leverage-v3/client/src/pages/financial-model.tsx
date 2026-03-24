import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, TrendingUp, DollarSign, Clock, BarChart3, Zap, Loader2, RefreshCw } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Legend, Cell, ReferenceLine,
} from "recharts";

const COLORS = ["#002B49", "#CF7F00", "#0085CA", "#29702A", "#00677F", "#5E8AB4", "#767171", "#8B5CF6"];

function fmt(v: number) {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtPct(v: number) {
  return `${v.toFixed(1)}%`;
}

// ---- Portfolio Summary Cards ----
function SummaryCards({ initiatives, engagementId, discountRate }: { initiatives: any[]; engagementId: number; discountRate: number }) {
  // Fetch all initiative financials in parallel via portfolio scurve (which computes them all)
  const { data: ebitda } = useQuery<any>({
    queryKey: ["/api/engagements", engagementId, "financial", "ebitda-bridge"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/financial/ebitda-bridge`);
      return res.json();
    },
  });

  // Compute aggregate stats from initiative-level data
  const initFinancials = useQuery<any[]>({
    queryKey: ["/api/engagements", engagementId, "financial", "all-initiatives", discountRate],
    queryFn: async () => {
      if (!initiatives || initiatives.length === 0) return [];
      const results = await Promise.all(
        initiatives.map(async (init: any) => {
          const res = await apiRequest("GET", `/api/engagements/${engagementId}/financial/initiative/${init.id}?discount_rate=${discountRate}`);
          return res.json();
        })
      );
      return results;
    },
    enabled: initiatives && initiatives.length > 0,
  });

  const allFin = initFinancials.data || [];
  const totalNpv = allFin.reduce((s: number, f: any) => s + (f.npv || 0), 0);
  const weightedIrr = allFin.length > 0
    ? allFin.reduce((s: number, f: any) => s + (f.irr || 0) * (f.target_annual_savings || 0), 0) /
      Math.max(allFin.reduce((s: number, f: any) => s + (f.target_annual_savings || 0), 0), 1)
    : 0;
  const totalCta = ebitda?.total_cta || 0;
  const avgPayback = allFin.length > 0
    ? allFin.reduce((s: number, f: any) => s + (f.payback_months || 0), 0) / allFin.length
    : 0;

  const cards = [
    { label: "Total 3-Year NPV", value: fmt(totalNpv), icon: TrendingUp, color: "text-emerald-600" },
    { label: "Weighted Avg IRR", value: fmtPct(weightedIrr), icon: BarChart3, color: "text-blue-600" },
    { label: "Total Cost to Achieve", value: fmt(totalCta), icon: DollarSign, color: "text-amber-600" },
    { label: "Avg Payback Period", value: `${avgPayback.toFixed(1)} mo`, icon: Clock, color: "text-purple-600" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="financial-summary-cards">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className={`text-xl font-bold mt-1 ${c.color}`}>{initFinancials.isLoading ? "..." : c.value}</p>
              </div>
              <c.icon className={`h-8 w-8 ${c.color} opacity-20`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---- EBITDA Bridge Waterfall ----
function EbitdaBridgeChart({ engagementId }: { engagementId: number }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/engagements", engagementId, "financial", "ebitda-bridge"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/financial/ebitda-bridge`);
      return res.json();
    },
  });

  if (isLoading) return <Skeleton className="h-80" />;
  if (!data) return <p className="text-sm text-muted-foreground">No data available</p>;

  // Build waterfall data
  const steps = data.bridge_steps || [];
  let running = 0;
  const waterfallData = steps.map((step: any) => {
    if (step.type === "total") {
      const item = { name: step.name, value: step.value, bottom: 0, bar: step.value, fill: "#002B49" };
      running = step.value;
      return item;
    }
    const bottom = running;
    running += step.value;
    return {
      name: step.name,
      value: step.value,
      bottom: Math.min(bottom, running),
      bar: Math.abs(step.value),
      fill: step.type === "negative" ? "#DC2626" : "#29702A",
    };
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">EBITDA Bridge</CardTitle>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>Net EBITDA Yr1: <strong className="text-foreground">{fmt(data.net_ebitda_yr1)}</strong></span>
          <span>Yr2: <strong className="text-foreground">{fmt(data.net_ebitda_yr2)}</strong></span>
          <span>Yr3: <strong className="text-foreground">{fmt(data.net_ebitda_yr3)}</strong></span>
          <span>Committed Rate: <strong className="text-foreground">{(data.identified_to_committed_rate * 100).toFixed(0)}%</strong></span>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={waterfallData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
            <YAxis tickFormatter={(v: number) => fmt(v)} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => fmt(v)} />
            <Bar dataKey="bottom" stackId="a" fill="transparent" />
            <Bar dataKey="bar" stackId="a" radius={[3, 3, 0, 0]}>
              {waterfallData.map((entry: any, i: number) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ---- Working Capital Bridge ----
function WorkingCapitalChart({ engagementId }: { engagementId: number }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/engagements", engagementId, "financial", "working-capital"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/financial/working-capital`);
      return res.json();
    },
  });

  if (isLoading) return <Skeleton className="h-64" />;
  if (!data) return <p className="text-sm text-muted-foreground">No data available</p>;

  const chartData = (data.bridge_steps || []).map((s: any) => ({
    name: s.name,
    value: s.value,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Working Capital Impact</CardTitle>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>DPO: {data.current_avg_dpo}d → {data.target_avg_dpo}d (+{data.dpo_improvement_days}d)</span>
          <span>Total WC Release: <strong className="text-emerald-600">{fmt(data.total_wc_release)}</strong></span>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis type="number" tickFormatter={(v: number) => fmt(v)} tick={{ fontSize: 11 }} />
            <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => fmt(v)} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {chartData.map((_: any, i: number) => (
                <Cell key={i} fill={i === chartData.length - 1 ? "#002B49" : "#0085CA"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-3 gap-4 mt-4 text-xs">
          <div className="text-center p-2 bg-muted rounded">
            <p className="text-muted-foreground">DPO Release</p>
            <p className="font-semibold">{fmt(data.wc_release)}</p>
          </div>
          <div className="text-center p-2 bg-muted rounded">
            <p className="text-muted-foreground">Inventory Release</p>
            <p className="font-semibold">{fmt(data.inventory_release)}</p>
          </div>
          <div className="text-center p-2 bg-muted rounded">
            <p className="text-muted-foreground">Est. Inventory Value</p>
            <p className="font-semibold">{fmt(data.estimated_inventory_value)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---- Portfolio S-Curve ----
function PortfolioScurve({ engagementId, discountRate }: { engagementId: number; discountRate: number }) {
  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["/api/engagements", engagementId, "financial", "portfolio-scurve", discountRate],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/financial/portfolio-scurve?discount_rate=${discountRate}`);
      return res.json();
    },
  });

  if (isLoading) return <Skeleton className="h-80" />;
  if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">No data available</p>;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Portfolio S-Curve (36 Months)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Cumulative net savings after cost-to-achieve at {(discountRate * 100).toFixed(0)}% discount rate
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={340}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} label={{ value: "Month", position: "insideBottom", offset: -5, fontSize: 11 }} />
            <YAxis tickFormatter={(v: number) => fmt(v)} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v: number, name: string) => [fmt(v), name]}
              labelFormatter={(l) => `Month ${l}`}
            />
            <Legend />
            <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
            <Area type="monotone" dataKey="gross_savings" name="Gross Savings" stroke="#29702A" fill="#29702A" fillOpacity={0.15} />
            <Area type="monotone" dataKey="cumulative" name="Cumulative Net" stroke="#002B49" fill="#002B49" fillOpacity={0.25} strokeWidth={2} />
            <Area type="monotone" dataKey="costs" name="CTA Costs" stroke="#DC2626" fill="#DC2626" fillOpacity={0.1} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ---- Initiative Detail Table ----
function InitiativeDetailTable({ engagementId, discountRate }: { engagementId: number; discountRate: number }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: initiatives } = useQuery<any[]>({
    queryKey: ["/api/engagements", engagementId, "initiatives"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/initiatives`);
      return res.json();
    },
  });

  const { data: allFinancials, isLoading } = useQuery<any[]>({
    queryKey: ["/api/engagements", engagementId, "financial", "all-initiatives", discountRate],
    queryFn: async () => {
      if (!initiatives || initiatives.length === 0) return [];
      const results = await Promise.all(
        initiatives.map(async (init: any) => {
          const res = await apiRequest("GET", `/api/engagements/${engagementId}/financial/initiative/${init.id}?discount_rate=${discountRate}`);
          return res.json();
        })
      );
      return results;
    },
    enabled: !!initiatives && initiatives.length > 0,
  });

  if (isLoading || !allFinancials) return <Skeleton className="h-64" />;
  if (allFinancials.length === 0) return <p className="text-sm text-muted-foreground">No initiatives found</p>;

  // Sort by NPV descending
  const sorted = [...allFinancials].sort((a, b) => b.npv - a.npv);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Initiative Financial Detail</CardTitle>
        <p className="text-xs text-muted-foreground">{sorted.length} initiatives — click to expand CTA & cashflow detail</p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Initiative</TableHead>
                <TableHead>Lever</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Target</TableHead>
                <TableHead className="text-right">CTA</TableHead>
                <TableHead className="text-right">NPV</TableHead>
                <TableHead className="text-right">IRR</TableHead>
                <TableHead className="text-right">Payback</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((fin: any) => {
                const isExpanded = expandedId === fin.initiative_id;
                return (
                  <TableRowWithDetail
                    key={fin.initiative_id}
                    fin={fin}
                    isExpanded={isExpanded}
                    onToggle={() => setExpandedId(isExpanded ? null : fin.initiative_id)}
                    engagementId={engagementId}
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function SensitivityGrid({ engagementId, initiativeId }: { engagementId: number; initiativeId: number }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/engagements", engagementId, "financial", "initiative", initiativeId, "sensitivity-grid"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/financial/initiative/${initiativeId}/sensitivity-grid`);
      return res.json();
    },
  });

  if (isLoading) return <Skeleton className="h-24" />;
  if (!data?.grid) return null;

  const grid = data.grid;
  const ctaLabels = data.cta_labels || ["Low CTA", "Mid CTA", "High CTA"];
  const savingsLabels = data.savings_labels || ["Low Savings", "Mid Savings", "High Savings"];

  return (
    <div>
      <h4 className="text-xs font-semibold mb-2">NPV Sensitivity Grid (3×3)</h4>
      <table className="text-xs w-full border-collapse" data-testid={`sensitivity-grid-${initiativeId}`}>
        <thead>
          <tr>
            <th className="p-1.5 text-left text-muted-foreground border border-border bg-muted/30">CTA \ Savings</th>
            {savingsLabels.map((l: string, i: number) => (
              <th key={i} className="p-1.5 text-center border border-border bg-muted/30 font-medium">{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row: number[], ri: number) => (
            <tr key={ri}>
              <td className="p-1.5 border border-border bg-muted/30 font-medium">{ctaLabels[ri]}</td>
              {row.map((val: number, ci: number) => {
                const isCenter = ri === 1 && ci === 1;
                return (
                  <td
                    key={ci}
                    className={`p-1.5 text-center border border-border font-mono ${
                      isCenter ? "bg-am-gold/10 font-bold" : val >= 0 ? "text-emerald-700" : "text-red-600"
                    }`}
                  >
                    {fmt(val)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableRowWithDetail({ fin, isExpanded, onToggle, engagementId }: { fin: any; isExpanded: boolean; onToggle: () => void; engagementId: number }) {
  const statusColors: Record<string, string> = {
    identified: "bg-gray-100 text-gray-700",
    committed: "bg-blue-100 text-blue-700",
    realized: "bg-emerald-100 text-emerald-700",
    at_risk: "bg-red-100 text-red-700",
  };

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={onToggle}
        data-testid={`initiative-row-${fin.initiative_id}`}
      >
        <TableCell className="py-2">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </TableCell>
        <TableCell className="py-2 font-medium text-sm max-w-48 truncate">{fin.initiative_name}</TableCell>
        <TableCell className="py-2 text-xs">{fin.lever_type.replace(/_/g, " ")}</TableCell>
        <TableCell className="py-2">
          <Badge variant="secondary" className={`text-xs ${statusColors[fin.status] || ""}`}>{fin.status}</Badge>
        </TableCell>
        <TableCell className="py-2 text-right text-sm">{fmt(fin.target_annual_savings)}</TableCell>
        <TableCell className="py-2 text-right text-sm">{fmt(fin.cta_total)}</TableCell>
        <TableCell className="py-2 text-right text-sm font-medium">{fmt(fin.npv)}</TableCell>
        <TableCell className="py-2 text-right text-sm">{fmtPct(fin.irr)}</TableCell>
        <TableCell className="py-2 text-right text-sm">{fin.payback_months} mo</TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={9} className="bg-muted/30 p-4">
            <div className="space-y-4">
              {/* CTA Breakdown */}
              <div>
                <h4 className="text-xs font-semibold mb-2">Cost to Achieve Breakdown</h4>
                <div className="grid grid-cols-5 gap-2 text-xs">
                  <div className="p-2 bg-background rounded text-center">
                    <p className="text-muted-foreground">Consulting</p>
                    <p className="font-semibold">{fmt(fin.cta_consulting)}</p>
                  </div>
                  <div className="p-2 bg-background rounded text-center">
                    <p className="text-muted-foreground">Technology</p>
                    <p className="font-semibold">{fmt(fin.cta_technology)}</p>
                  </div>
                  <div className="p-2 bg-background rounded text-center">
                    <p className="text-muted-foreground">Transition</p>
                    <p className="font-semibold">{fmt(fin.cta_transition)}</p>
                  </div>
                  <div className="p-2 bg-background rounded text-center">
                    <p className="text-muted-foreground">Training</p>
                    <p className="font-semibold">{fmt(fin.cta_training)}</p>
                  </div>
                  <div className="p-2 bg-background rounded text-center border border-border">
                    <p className="text-muted-foreground">Total ({fin.cta_pct_of_savings}%)</p>
                    <p className="font-bold">{fmt(fin.cta_total)}</p>
                  </div>
                </div>
              </div>

              {/* Year savings */}
              <div>
                <h4 className="text-xs font-semibold mb-2">Projected Savings by Year</h4>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="p-2 bg-background rounded text-center">
                    <p className="text-muted-foreground">Year 1</p>
                    <p className="font-semibold">{fmt(fin.year1_savings)}</p>
                  </div>
                  <div className="p-2 bg-background rounded text-center">
                    <p className="text-muted-foreground">Year 2</p>
                    <p className="font-semibold">{fmt(fin.year2_savings)}</p>
                  </div>
                  <div className="p-2 bg-background rounded text-center">
                    <p className="text-muted-foreground">Year 3</p>
                    <p className="font-semibold">{fmt(fin.year3_savings)}</p>
                  </div>
                </div>
              </div>

              {/* Monthly cashflow mini chart */}
              <div>
                <h4 className="text-xs font-semibold mb-2">Monthly Cash Flow (36 Months)</h4>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={fin.monthly_cashflow}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                    <YAxis tickFormatter={(v: number) => fmt(v)} tick={{ fontSize: 9 }} />
                    <Tooltip formatter={(v: number) => fmt(v)} labelFormatter={(l) => `Month ${l}`} />
                    <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
                    <Area type="monotone" dataKey="savings" name="Savings" stroke="#29702A" fill="#29702A" fillOpacity={0.2} />
                    <Area type="monotone" dataKey="cumulative" name="Cumulative" stroke="#002B49" fill="#002B49" fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Sensitivity Grid */}
              <SensitivityGrid engagementId={engagementId} initiativeId={fin.initiative_id} />
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ---- Live Rate Banner (P2-11) ----
function LiveRateBanner({ engagementId, onApply }: { engagementId: number; onApply: (rate: string) => void }) {
  const queryClient = useQueryClient();
  const { data: liveRates } = useQuery<any>({
    queryKey: [`/api/engagements/${engagementId}/financial/live-rates`],
    staleTime: 3_600_000,
  });
  const applyMutation = useMutation({
    mutationFn: async (rate: number) => {
      const r = await fetch(`/api/engagements/${engagementId}/financial/apply-live-rate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discount_rate: rate }),
      });
      return r.json();
    },
    onSuccess: (_, rate) => {
      onApply(rate.toFixed(2));
      queryClient.invalidateQueries({ queryKey: [`/api/engagements/${engagementId}`] });
    },
  });

  if (!liveRates?.suggested_discount_rate) return null;
  const suggested = liveRates.suggested_discount_rate;
  const currentRate = liveRates.current_discount_rate;
  const deltaBps = liveRates.delta_bps;
  const gs10 = liveRates.gs10?.rate_pct;

  return (
    <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
      <Zap className="h-4 w-4 text-blue-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-medium text-blue-800">Live rate suggestion: </span>
        <span className="text-blue-700">
          GS10 ({gs10?.toFixed(2)}%) + 300bps = <strong>{(suggested * 100).toFixed(1)}%</strong>
        </span>
        {deltaBps !== null && (
          <span className="ml-2 text-xs text-blue-600">
            ({deltaBps > 0 ? "+" : ""}{deltaBps}bps vs. current {(currentRate * 100).toFixed(1)}%)
          </span>
        )}
        <span className="ml-2 text-xs text-muted-foreground">{liveRates.data_source}</span>
      </div>
      <Button
        size="sm" variant="outline"
        className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-100 shrink-0"
        onClick={() => applyMutation.mutate(suggested)}
        disabled={applyMutation.isPending}
      >
        {applyMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Apply"}
      </Button>
    </div>
  );
}

// ---- EBITDA Narrative (P2-12) ----
function EbitdaNarrativePanel({ engagementId }: { engagementId: number }) {
  const [narrative, setNarrative] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    const resp = await fetch(`/api/engagements/${engagementId}/financial/ebitda-narrative`, { method: "POST" });
    const d = await resp.json();
    setNarrative(d.narrative);
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">EBITDA Bridge Narrative</CardTitle>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={generate} disabled={loading}>
          {loading ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Generating…</> : <><Zap className="h-3 w-3 mr-1" />Draft with Claude</>}
        </Button>
      </CardHeader>
      <CardContent>
        {narrative ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{narrative}</p>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Click "Draft with Claude" to generate a 150-word EBITDA bridge narrative for steerco use.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Main Page ----
export default function FinancialModelPage({ engagementId }: { engagementId: number }) {
  const [discountRate, setDiscountRate] = useState("0.10");

  const { data: initiatives } = useQuery<any[]>({
    queryKey: ["/api/engagements", engagementId, "initiatives"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/initiatives`);
      return res.json();
    },
  });

  return (
    <div className="space-y-6" data-testid="financial-model-page">
      {/* Header with discount rate selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Financial Model</h2>
          <p className="text-sm text-muted-foreground">NPV/IRR analysis, EBITDA bridge, working capital impact, and portfolio S-curve</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Discount Rate:</span>
          <Select value={discountRate} onValueChange={setDiscountRate}>
            <SelectTrigger className="w-24 h-8 text-xs" data-testid="discount-rate-selector">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.05">5%</SelectItem>
              <SelectItem value="0.08">8%</SelectItem>
              <SelectItem value="0.10">10%</SelectItem>
              <SelectItem value="0.12">12%</SelectItem>
              <SelectItem value="0.15">15%</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Live rate suggestion banner */}
      <LiveRateBanner engagementId={engagementId} onApply={setDiscountRate} />

      {/* 1. Summary Cards */}
      <SummaryCards initiatives={initiatives || []} engagementId={engagementId} discountRate={Number(discountRate)} />

      {/* 2. EBITDA Bridge + 3. Working Capital (side by side on large screens) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <EbitdaBridgeChart engagementId={engagementId} />
        <WorkingCapitalChart engagementId={engagementId} />
      </div>

      {/* EBITDA Narrative */}
      <EbitdaNarrativePanel engagementId={engagementId} />

      {/* 4. Portfolio S-Curve */}
      <PortfolioScurve engagementId={engagementId} discountRate={Number(discountRate)} />

      {/* 5. Initiative Detail Table */}
      <InitiativeDetailTable engagementId={engagementId} discountRate={Number(discountRate)} />
    </div>
  );
}
