import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Calculator, Loader2, AlertTriangle, Shield, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import type { TariffImpact } from "@shared/schema";

const RISK_COLORS: Record<string, string> = {
  Critical: "bg-purple-100 text-purple-800",
  High: "bg-red-100 text-red-800",
  Medium: "bg-amber-100 text-amber-800",
  Low: "bg-green-100 text-green-800",
};

const PIE_COLORS = ["#dc2626", "#f59e0b", "#16a34a"];

function formatCurrency(v: number) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export default function TariffImpactPage({ engagementId }: { engagementId: number }) {
  const { toast } = useToast();

  const { data: tariffs, isLoading } = useQuery<TariffImpact[]>({
    queryKey: ["/api/engagements", engagementId, "tariffs"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/tariffs`);
      return res.json();
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/engagements/${engagementId}/tariffs/analyze`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Tariff Calculation Complete", description: `${data.created} tariff impact scenarios calculated from HTS rate tables` });
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId, "tariffs"] });
    },
    onError: (err: any) => {
      toast({ title: "Calculation Failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-40" />)}</div>;

  const items = tariffs || [];
  const totalImpact = items.reduce((s, t) => s + (t.estimated_impact || 0), 0);
  const totalExposedSpend = items.reduce((s, t) => s + (t.annual_spend || 0), 0);
  const highRisk = items.filter(t => t.risk_level === "High" || t.risk_level === "Critical");
  const medRisk = items.filter(t => t.risk_level === "Medium");
  const lowRisk = items.filter(t => t.risk_level === "Low");

  // Chart data: impact by category
  const byCategory: Record<string, number> = {};
  for (const t of items) {
    const cat = t.category_name || "Other";
    byCategory[cat] = (byCategory[cat] || 0) + (t.estimated_impact || 0);
  }
  const barData = Object.entries(byCategory).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // Pie data: risk distribution
  const pieData = [
    { name: "High Risk", value: highRisk.reduce((s, t) => s + (t.estimated_impact || 0), 0) },
    { name: "Medium Risk", value: medRisk.reduce((s, t) => s + (t.estimated_impact || 0), 0) },
    { name: "Low Risk", value: lowRisk.reduce((s, t) => s + (t.estimated_impact || 0), 0) },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6" data-testid="tariff-impact-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-base font-semibold">Tariff Impact Analysis</h2>
          <p className="text-xs text-muted-foreground">Rule-based tariff impact calculation from HTS rate schedules</p>
        </div>
        <Button
          size="sm"
          onClick={() => analyzeMutation.mutate()}
          disabled={analyzeMutation.isPending}
          data-testid="calculate-tariffs-btn"
        >
          {analyzeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Calculator className="h-3 w-3 mr-1" />}
          Calculate Tariff Impact
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="stat-total-impact">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Total Impact</p>
                <p className="text-2xl font-bold mt-1 text-red-600">{formatCurrency(totalImpact)}</p>
                <p className="text-xs text-muted-foreground mt-1">estimated annual cost increase</p>
              </div>
              <TrendingUp className="h-5 w-5 text-red-400" />
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-exposed-spend">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Exposed Spend</p>
                <p className="text-2xl font-bold mt-1 text-am-blue">{formatCurrency(totalExposedSpend)}</p>
                <p className="text-xs text-muted-foreground mt-1">across {items.length} scenarios</p>
              </div>
              <Shield className="h-5 w-5 text-am-blue" />
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-high-risk">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">High Risk Items</p>
                <p className="text-2xl font-bold mt-1 text-red-600">{highRisk.length}</p>
                <p className="text-xs text-muted-foreground mt-1">{formatCurrency(highRisk.reduce((s, t) => s + (t.estimated_impact || 0), 0))} impact</p>
              </div>
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-avg-tariff-increase">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Avg Tariff Increase</p>
            <p className="text-2xl font-bold mt-1 text-amber-600">
              {items.length > 0
                ? `${(items.reduce((s: number, t: any) => s + (t.effective_tariff_pct || 0), 0) / items.length).toFixed(1)}%`
                : "0%"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">avg effective stacked rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      {items.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card data-testid="impact-by-category-chart">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Impact by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                  <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="value" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card data-testid="risk-distribution-chart">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Risk Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 justify-center mt-2">
                {pieData.map((d, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span>{d.name}: {formatCurrency(d.value)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed Table */}
      <Card data-testid="tariff-details-table">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Tariff Impact Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead className="text-right">Effective Rate</TableHead>
                  <TableHead>Tariff Layers</TableHead>
                  <TableHead className="text-right">Annual Spend</TableHead>
                  <TableHead className="text-right">Est. Impact</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Mitigation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((t) => (
                  <TableRow key={t.id} data-testid={`tariff-row-${t.id}`}>
                    <TableCell className="text-sm font-medium">{t.category_name}</TableCell>
                    <TableCell className="text-sm">{t.supplier_name}</TableCell>
                    <TableCell className="text-sm">{t.country_of_origin}</TableCell>
                    <TableCell className="text-right text-sm font-bold text-red-600">{(t as any).effective_tariff_pct || 0}%</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[220px]">
                      {(() => {
                        try {
                          const layers = typeof (t as any).tariff_layers === 'string' ? JSON.parse((t as any).tariff_layers) : (t as any).tariff_layers;
                          if (Array.isArray(layers)) return layers.map((l: any) => `${l.name}: ${l.rate}%`).join(' + ');
                        } catch {}
                        return '—';
                      })()}
                    </TableCell>
                    <TableCell className="text-right text-sm">{formatCurrency(t.annual_spend || 0)}</TableCell>
                    <TableCell className="text-right text-sm font-bold text-red-600">{formatCurrency(t.estimated_impact || 0)}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${RISK_COLORS[t.risk_level || "Low"]}`}>
                        {t.risk_level}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={t.mitigation_strategy || ""}>
                      {t.mitigation_strategy || "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                      <Calculator className="h-6 w-6 text-am-blue mx-auto mb-2" />
                      No tariff analysis yet. Click "Calculate Tariff Impact" to compute scenarios from HTS rate tables.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
