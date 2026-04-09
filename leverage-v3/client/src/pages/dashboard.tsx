import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell
} from "recharts";
import { DollarSign, TrendingUp, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";

const COLORS = ["#002B49", "#CF7F00", "#0085CA", "#29702A", "#00677F", "#5E8AB4"];

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function MetricCard({ label, value, subtitle, icon: Icon, color, onClick }: {
  label: string; value: string; subtitle?: string; icon: any; color: string; onClick?: () => void;
}) {
  return (
    <Card
      className={onClick ? "cursor-pointer hover:border-am-gold transition-colors" : ""}
      onClick={onClick}
      data-testid={`metric-${label.toLowerCase().replace(/\s/g, "-")}`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color }}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}15` }}>
            <Icon className="h-5 w-5" style={{ color }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const statusColors: Record<string, string> = {
  identified: "bg-blue-100 text-blue-800",
  in_progress: "bg-amber-100 text-amber-800",
  committed: "bg-emerald-100 text-emerald-800",
  realized: "bg-green-100 text-green-800",
  abandoned: "bg-gray-100 text-gray-600",
};

export default function DashboardPage({ engagementId }: { engagementId: number }) {
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/engagements", engagementId, "dashboard"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/dashboard`);
      return res.json();
    },
  });

  const { data: overlapData } = useQuery<any>({
    queryKey: ["/api/engagements", engagementId, "initiatives", "overlap"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/initiatives/overlap`);
      return res.json();
    },
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId, "dashboard"] });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const metrics = data?.metrics;
  const waterfall = data?.waterfall || [];
  const matrix = data?.status_matrix || [];
  const timeline = data?.timeline || [];
  const dq = data?.data_quality;

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      {/* Header with refresh */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-base font-semibold">Executive Dashboard</h2>
          <p className="text-xs text-muted-foreground">Overview of procurement savings engagement</p>
        </div>
        <Button size="sm" variant="outline" onClick={handleRefresh} data-testid="refresh-dashboard-btn">
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* Metric Cards - clickable */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Spend"
          value={formatCurrency(metrics?.total_spend || 0)}
          subtitle="Addressable spend under management"
          icon={DollarSign}
          color="#002B49"
          onClick={() => setLocation("/analysis")}
        />
        <MetricCard
          label="Identified Savings"
          value={formatCurrency(metrics?.identified || 0)}
          subtitle={`${metrics?.identified_pct || 0}% of spend`}
          icon={TrendingUp}
          color="#0085CA"
          onClick={() => setLocation("/modeling")}
        />
        <MetricCard
          label="Committed Savings"
          value={formatCurrency(metrics?.committed || 0)}
          subtitle={`${metrics?.committed_pct || 0}% of spend | ${metrics?.conversion_rate || 0}% conversion`}
          icon={CheckCircle}
          color="#CF7F00"
          onClick={() => setLocation("/tracker")}
        />
        <MetricCard
          label="Realized Savings"
          value={formatCurrency(metrics?.realized || 0)}
          subtitle={`${metrics?.realized_pct || 0}% of spend`}
          icon={DollarSign}
          color="#29702A"
          onClick={() => setLocation("/tracker")}
        />
      </div>

      {/* Pipeline KPIs */}
      {(() => {
        const grossPipeline = (metrics?.identified || 0) + (metrics?.committed || 0) + (metrics?.realized || 0);
        const overlapAdj = overlapData?.overlap_amount || 0;
        const realized = metrics?.realized || 0;
        const committed = metrics?.committed || 0;
        const realizationRate = (committed + realized) > 0 ? Math.round((realized / (committed + realized)) * 100) : 0;
        const atRisk = overlapData?.at_risk_amount || 0;
        const riskAdjNet = grossPipeline - overlapAdj;
        return (
          <Card data-testid="pipeline-kpis">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span className="font-semibold">Pipeline:</span>
                <span>Gross: <strong>{formatCurrency(grossPipeline)}</strong></span>
                <span className="text-muted-foreground">|</span>
                <span>Overlap Adj: <strong className="text-red-600">(-{formatCurrency(overlapAdj)})</strong></span>
                <span className="text-muted-foreground">|</span>
                <span>Risk-Adj Net: <strong className="text-emerald-600">{formatCurrency(riskAdjNet)}</strong></span>
                <span className="text-muted-foreground">|</span>
                <span>Realization Rate: <strong className={realizationRate >= 65 ? "text-emerald-600" : "text-amber-600"}>{realizationRate}%</strong></span>
                {atRisk > 0 && (
                  <>
                    <span className="text-muted-foreground">|</span>
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-red-500" />
                      At Risk: <strong className="text-red-600">{formatCurrency(atRisk)}</strong>
                    </span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Savings Waterfall */}
        <Card data-testid="waterfall-chart">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Savings Waterfall</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={waterfall}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {waterfall.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Initiative Status Matrix - clickable rows */}
        <Card data-testid="status-matrix">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Initiative Status Matrix</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-3 font-semibold">Lever Type</th>
                    <th className="text-center py-2 px-2 font-semibold">Identified</th>
                    <th className="text-center py-2 px-2 font-semibold">In Progress</th>
                    <th className="text-center py-2 px-2 font-semibold">Committed</th>
                    <th className="text-center py-2 px-2 font-semibold">Realized</th>
                    <th className="text-center py-2 px-2 font-semibold">Abandoned</th>
                    <th className="text-right py-2 pl-3 font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row: any, i: number) => (
                    <tr
                      key={i}
                      className="border-b border-border/50 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setLocation("/modeling")}
                      data-testid={`matrix-row-${i}`}
                    >
                      <td className="py-2 pr-3 font-medium capitalize">{(row.lever || "").replace(/_/g, " ")}</td>
                      <td className="text-center py-2 px-2">
                        {row.identified > 0 && <Badge variant="secondary" className="text-xs">{row.identified}</Badge>}
                      </td>
                      <td className="text-center py-2 px-2">
                        {row.in_progress > 0 && <Badge className="bg-amber-100 text-amber-800 text-xs">{row.in_progress}</Badge>}
                      </td>
                      <td className="text-center py-2 px-2">
                        {row.committed > 0 && <Badge className="bg-emerald-100 text-emerald-800 text-xs">{row.committed}</Badge>}
                      </td>
                      <td className="text-center py-2 px-2">
                        {row.realized > 0 && <Badge className="bg-green-100 text-green-800 text-xs">{row.realized}</Badge>}
                      </td>
                      <td className="text-center py-2 px-2">
                        {row.abandoned > 0 && <Badge className="bg-gray-100 text-gray-600 text-xs">{row.abandoned}</Badge>}
                      </td>
                      <td className="text-right py-2 pl-3 font-medium">{formatCurrency(row.total_amount || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline */}
        <Card className="lg:col-span-2" data-testid="timeline-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Timeline to Value</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={timeline} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={160} tick={{ fontSize: 9 }} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="target_amount" fill="#0085CA" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Data Quality */}
        <Card className="cursor-pointer hover:border-am-gold transition-colors" onClick={() => setLocation("/cleansing")} data-testid="data-quality-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Data Quality</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Records</span>
                <span className="font-medium">{dq?.total_records || 0}</span>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Categorized</span>
                <span className="font-medium">{dq?.categorized_pct || 0}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-am-blue rounded-full" style={{ width: `${dq?.categorized_pct || 0}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Normalized</span>
                <span className="font-medium">{dq?.normalized_pct || 0}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-am-teal rounded-full" style={{ width: `${dq?.normalized_pct || 0}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">{dq?.duplicates || 0} potential duplicates</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
