import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  BarChart3, TrendingUp, AlertTriangle, Building2, DollarSign,
  RefreshCw, Loader2, ChevronRight, CheckCircle2, ShieldAlert,
  ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line, Legend,
} from "recharts";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface EngagementKPI {
  id: number;
  name: string;
  portfolio_company: string;
  pe_sponsor: string | null;
  industry: string | null;
  status: string;
  total_addressable_spend: number | null;
  pipeline_total: number;
  risk_adjusted_total: number;
  realized_total: number;
  savings_rate_pct: number | null;
  initiative_count: number;
  at_risk_count: number;
  critical_alert_count: number;
  start_date: string | null;
}

interface PortfolioSummary {
  active_engagements: number;
  total_pipeline: number;
  total_risk_adjusted: number;
  total_realized: number;
  avg_savings_rate_pct: number | null;
  at_risk_initiatives: number;
  critical_alerts: number;
  engagements: EngagementKPI[];
  snapshot_date: string;
}

interface SnapshotRow {
  snapshot_date: string;
  total_pipeline_usd: number | null;
  total_realized_usd: number | null;
  avg_savings_rate_pct: number | null;
  at_risk_initiative_count: number | null;
  active_engagement_count: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmt(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function healthColor(e: EngagementKPI): string {
  if (e.critical_alert_count > 0) return "text-red-600";
  if (e.at_risk_count > 2) return "text-orange-500";
  if ((e.savings_rate_pct ?? 0) > 30) return "text-emerald-600";
  return "text-muted-foreground";
}

function healthIcon(e: EngagementKPI) {
  if (e.critical_alert_count > 0) return <ShieldAlert className="h-4 w-4 text-red-500" />;
  if (e.at_risk_count > 2) return <AlertTriangle className="h-4 w-4 text-orange-500" />;
  return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------
function KpiCard({
  label, value, sub, icon: Icon, color, trend,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  trend?: "up" | "down" | "flat";
}) {
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const trendColor = trend === "up" ? "text-emerald-500" : trend === "down" ? "text-red-500" : "text-muted-foreground";

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", color)}>
            <Icon className="h-5 w-5" />
          </div>
          {trend && <TrendIcon className={cn("h-4 w-4 mt-1", trendColor)} />}
        </div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1 font-medium">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Engagement row
// ---------------------------------------------------------------------------
function EngagementRow({
  eng,
  onClick,
}: {
  eng: EngagementKPI;
  onClick: () => void;
}) {
  const realizationPct = eng.pipeline_total > 0
    ? Math.min(100, (eng.realized_total / eng.pipeline_total) * 100)
    : 0;

  return (
    <tr
      className="border-b hover:bg-muted/20 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <td className="py-3.5 pl-4 pr-2">
        <div className="flex items-center gap-2">
          {healthIcon(eng)}
          <div>
            <p className="text-sm font-medium">{eng.portfolio_company}</p>
            <p className="text-xs text-muted-foreground">{eng.pe_sponsor ?? "—"}</p>
          </div>
        </div>
      </td>
      <td className="py-3.5 px-2">
        <span className="text-xs text-muted-foreground">{eng.industry ?? "—"}</span>
      </td>
      <td className="py-3.5 px-2 text-sm font-medium">
        {fmt(eng.risk_adjusted_total)}
      </td>
      <td className="py-3.5 px-2 text-sm">
        {fmt(eng.realized_total)}
      </td>
      <td className="py-3.5 px-2">
        <div className="flex items-center gap-2 min-w-[100px]">
          <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
            <div
              className={cn("h-1.5 rounded-full", realizationPct > 50 ? "bg-emerald-500" : realizationPct > 20 ? "bg-amber-500" : "bg-muted-foreground/40")}
              style={{ width: `${realizationPct}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-10 text-right">
            {realizationPct.toFixed(0)}%
          </span>
        </div>
      </td>
      <td className="py-3.5 px-2 text-center">
        <span className="text-sm">{eng.initiative_count}</span>
        {eng.at_risk_count > 0 && (
          <span className="ml-1 text-xs text-orange-500">({eng.at_risk_count} at risk)</span>
        )}
      </td>
      <td className="py-3.5 px-2 text-center">
        {eng.critical_alert_count > 0
          ? <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">{eng.critical_alert_count}</Badge>
          : <span className="text-xs text-muted-foreground">—</span>
        }
      </td>
      <td className="py-3.5 pr-4 pl-2 text-right">
        <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Pipeline chart
// ---------------------------------------------------------------------------
function PipelineChart({ engagements }: { engagements: EngagementKPI[] }) {
  const data = engagements
    .filter((e) => e.risk_adjusted_total > 0)
    .slice(0, 10)
    .map((e) => ({
      name: e.portfolio_company.length > 14 ? e.portfolio_company.slice(0, 14) + "…" : e.portfolio_company,
      pipeline: Math.round(e.risk_adjusted_total / 1000),
      realized: Math.round(e.realized_total / 1000),
    }));

  if (data.length === 0) return <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No pipeline data</div>;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 10, bottom: 30, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
        <YAxis tick={{ fontSize: 10 }} unit="K" />
        <Tooltip
          formatter={(v: number, name: string) => [`$${v.toLocaleString()}K`, name === "pipeline" ? "Risk-Adj Pipeline" : "Realized"]}
          labelStyle={{ fontSize: 11 }}
          contentStyle={{ fontSize: 11 }}
        />
        <Bar dataKey="pipeline" fill="#0066CC" radius={[3, 3, 0, 0]} name="pipeline" />
        <Bar dataKey="realized" fill="#22c55e" radius={[3, 3, 0, 0]} name="realized" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Trend chart (from snapshots)
// ---------------------------------------------------------------------------
function TrendChart({ history }: { history: SnapshotRow[] }) {
  const data = [...history].reverse().slice(-14).map((s) => ({
    date: s.snapshot_date?.slice(5) ?? "",
    pipeline: s.total_pipeline_usd ? Math.round(s.total_pipeline_usd / 1e6 * 10) / 10 : null,
    realized: s.total_realized_usd ? Math.round(s.total_realized_usd / 1e6 * 10) / 10 : null,
  }));

  if (data.length < 2) return (
    <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
      Not enough snapshot history yet
    </div>
  );

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 10, bottom: 10, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} unit="M" />
        <Tooltip formatter={(v: number) => [`$${v}M`]} contentStyle={{ fontSize: 11 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="pipeline" stroke="#0066CC" dot={false} name="Pipeline ($M)" strokeWidth={2} />
        <Line type="monotone" dataKey="realized" stroke="#22c55e" dot={false} name="Realized ($M)" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function PortfolioPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: summary, isLoading } = useQuery<PortfolioSummary>({
    queryKey: ["/api/portfolio/summary"],
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const { data: history = [] } = useQuery<SnapshotRow[]>({
    queryKey: ["/api/portfolio/history"],
    staleTime: 3_600_000,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetch("/api/portfolio/snapshot", { method: "POST" });
    await queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/portfolio/history"] });
    setRefreshing(false);
  };

  const navigateToEngagement = (engId: number) => {
    navigate(`/engagements/${engId}/dashboard`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />Loading portfolio…
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Portfolio Command Center</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Cross-engagement view · {summary.active_engagements} active engagement{summary.active_engagements !== 1 ? "s" : ""}
            {" "}· Updated {new Date(summary.snapshot_date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={cn("h-4 w-4 mr-1.5", refreshing && "animate-spin")} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Active Engagements"
          value={String(summary.active_engagements)}
          icon={Building2}
          color="bg-blue-50 text-blue-600"
        />
        <KpiCard
          label="Total Pipeline"
          value={fmt(summary.total_pipeline)}
          icon={BarChart3}
          color="bg-indigo-50 text-indigo-600"
        />
        <KpiCard
          label="Risk-Adjusted"
          value={fmt(summary.total_risk_adjusted)}
          icon={TrendingUp}
          color="bg-purple-50 text-purple-600"
        />
        <KpiCard
          label="Total Realized"
          value={fmt(summary.total_realized)}
          icon={DollarSign}
          color="bg-emerald-50 text-emerald-600"
          trend={summary.total_realized > 0 ? "up" : "flat"}
        />
        <KpiCard
          label="At-Risk Initiatives"
          value={String(summary.at_risk_initiatives)}
          icon={AlertTriangle}
          color={summary.at_risk_initiatives > 0 ? "bg-orange-50 text-orange-600" : "bg-muted text-muted-foreground"}
          trend={summary.at_risk_initiatives > 3 ? "down" : undefined}
        />
        <KpiCard
          label="Critical Alerts"
          value={String(summary.critical_alerts)}
          icon={ShieldAlert}
          color={summary.critical_alerts > 0 ? "bg-red-50 text-red-600" : "bg-muted text-muted-foreground"}
          trend={summary.critical_alerts > 0 ? "down" : undefined}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Pipeline by Engagement</CardTitle>
            <p className="text-xs text-muted-foreground">Risk-adjusted vs. realized ($K)</p>
          </CardHeader>
          <CardContent>
            <PipelineChart engagements={summary.engagements} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Portfolio Trend</CardTitle>
            <p className="text-xs text-muted-foreground">14-day pipeline and realization history</p>
          </CardHeader>
          <CardContent>
            <TrendChart history={history} />
          </CardContent>
        </Card>
      </div>

      {/* Engagement table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Engagement Leaderboard ({summary.engagements.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {summary.engagements.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No active engagements. Create one to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-2.5 pl-4 pr-2 text-xs font-semibold text-muted-foreground">Company</th>
                    <th className="text-left py-2.5 px-2 text-xs font-semibold text-muted-foreground">Industry</th>
                    <th className="text-left py-2.5 px-2 text-xs font-semibold text-muted-foreground">Risk-Adj Pipeline</th>
                    <th className="text-left py-2.5 px-2 text-xs font-semibold text-muted-foreground">Realized</th>
                    <th className="text-left py-2.5 px-2 text-xs font-semibold text-muted-foreground">Realization</th>
                    <th className="text-center py-2.5 px-2 text-xs font-semibold text-muted-foreground">Initiatives</th>
                    <th className="text-center py-2.5 px-2 text-xs font-semibold text-muted-foreground">Alerts</th>
                    <th className="py-2.5 pr-4 pl-2" />
                  </tr>
                </thead>
                <tbody>
                  {summary.engagements.map((eng) => (
                    <EngagementRow
                      key={eng.id}
                      eng={eng}
                      onClick={() => navigateToEngagement(eng.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Avg savings rate footnote */}
      {summary.avg_savings_rate_pct !== null && (
        <p className="text-xs text-muted-foreground text-center">
          Portfolio avg. savings rate: <span className="font-medium">{summary.avg_savings_rate_pct.toFixed(1)}%</span>
          {" "}· Benchmarks require ≥2 engagements with realization data
        </p>
      )}
    </div>
  );
}
