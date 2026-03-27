"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber, CHANNELS } from "@/lib/utils";
import {
  DollarSign, MousePointerClick, TrendingUp, Users, Eye, Target,
  ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = ["#7c3aed", "#3b82f6", "#0891b2", "#f97316", "#10b981", "#8b5cf6", "#f59e0b"];

export default function PerformancePage() {
  const { clientId } = useParams();

  const { data } = useQuery<any>({
    queryKey: [`/api/clients/${clientId}/performance`],
    queryFn: () => fetch(`/api/clients/${clientId}/performance`).then((r) => r.json()),
  });

  const summary = data?.summary;
  const byChannel = data?.byChannel || {};
  const metrics = data?.metrics || [];

  // Aggregate daily for trend chart
  const dailyMap: Record<string, { date: string; spend: number; conversions: number; revenue: number; clicks: number }> = {};
  for (const m of metrics) {
    const d = new Date(m.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (!dailyMap[d]) dailyMap[d] = { date: d, spend: 0, conversions: 0, revenue: 0, clicks: 0 };
    dailyMap[d].spend += m.spend || 0;
    dailyMap[d].conversions += m.conversions || 0;
    dailyMap[d].revenue += m.revenue || 0;
    dailyMap[d].clicks += m.clicks || 0;
  }
  const dailyData = Object.values(dailyMap);

  // Channel breakdown for pie chart
  const channelData = Object.entries(byChannel).map(([key, val]: [string, any]) => ({
    name: CHANNELS.find((c) => c.value === key)?.label || key,
    value: val.spend,
  }));

  // Funnel data
  const funnel = summary
    ? [
        { name: "Impressions", value: summary.totalImpressions },
        { name: "Clicks", value: summary.totalClicks },
        { name: "Leads", value: summary.totalLeads },
        { name: "MQLs", value: summary.totalMqls },
        { name: "SQLs", value: summary.totalSqls },
        { name: "Conversions", value: summary.totalConversions },
      ].filter((f) => f.value > 0)
    : [];

  if (!summary || summary.totalSpend === 0) {
    return (
      <div>
        <div className="border-b bg-card/50 px-8 py-6">
          <h1 className="text-3xl font-bold tracking-tight">Performance</h1>
          <p className="text-muted-foreground">Full-funnel performance dashboard</p>
        </div>
        <div className="p-8">
          <Card className="mx-auto max-w-md text-center">
            <CardHeader><CardTitle>No performance data yet</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Import campaign data from the Campaigns page or seed sample data to see your dashboard.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="border-b bg-card/50 px-8 py-6">
        <h1 className="text-3xl font-bold tracking-tight">Performance</h1>
        <p className="text-muted-foreground">Full-funnel performance dashboard</p>
      </div>

      <div className="p-8 space-y-8">
        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Spend</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.totalSpend)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conversions</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(summary.totalConversions)}</div>
              <p className="text-xs text-muted-foreground">CPA: {formatCurrency(summary.avgCpa)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">ROAS</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.avgRoas.toFixed(2)}x</div>
              <p className="text-xs text-muted-foreground">Revenue: {formatCurrency(summary.totalRevenue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pipeline</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(summary.totalMqls)} MQLs</div>
              <p className="text-xs text-muted-foreground">{formatNumber(summary.totalSqls)} SQLs | {formatCurrency(summary.totalPipelineValue)} pipeline</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Spend & Revenue Trend */}
          {dailyData.length > 1 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Spend & Revenue Trend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                      }}
                    />
                    <Line type="monotone" dataKey="spend" stroke="#7c3aed" strokeWidth={2} name="Spend" />
                    <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} name="Revenue" />
                    <Legend />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Channel Spend Distribution */}
          {channelData.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Spend by Channel</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={channelData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {channelData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Funnel */}
          {funnel.length > 1 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Conversion Funnel</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={funnel} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" width={100} />
                    <Tooltip formatter={(value: number) => formatNumber(value)} />
                    <Bar dataKey="value" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Channel Performance Table */}
          <Card>
            <CardHeader><CardTitle className="text-base">Channel Performance</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(byChannel).map(([key, val]: [string, any]) => {
                  const label = CHANNELS.find((c) => c.value === key)?.label || key;
                  const cpa = val.conversions > 0 ? val.spend / val.conversions : 0;
                  const roas = val.spend > 0 ? val.revenue / val.spend : 0;
                  return (
                    <div key={key} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="font-medium text-sm">{label}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatNumber(val.clicks)} clicks | {formatNumber(val.conversions)} conv
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-sm">{formatCurrency(val.spend)}</p>
                        <p className="text-xs text-muted-foreground">
                          CPA: {formatCurrency(cpa)} | ROAS: {roas.toFixed(2)}x
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
