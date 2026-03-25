import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Legend, ComposedChart,
  ScatterChart, Scatter, ZAxis, ReferenceLine, ReferenceArea,
} from "recharts";

const COLORS = ["#002B49", "#CF7F00", "#0085CA", "#29702A", "#00677F", "#5E8AB4", "#767171", "#8B5CF6"];

function formatCurrency(v: number) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function useAnalysis(engagementId: number, endpoint: string) {
  return useQuery<any>({
    queryKey: ["/api/engagements", engagementId, "analysis", endpoint],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/analysis/${endpoint}`);
      return res.json();
    },
  });
}

function ByCategoryTab({ engagementId }: { engagementId: number }) {
  const { data, isLoading } = useAnalysis(engagementId, "by-category");
  if (isLoading) return <Skeleton className="h-80" />;
  const rows = (data || []).slice(0, 15);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={rows} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
              <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="total_amount" fill="#002B49" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie data={rows.slice(0, 8)} cx="50%" cy="50%" innerRadius={60} outerRadius={120} paddingAngle={2} dataKey="total_amount" nameKey="name">
                {rows.slice(0, 8).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function BySupplierTab({ engagementId }: { engagementId: number }) {
  const { data, isLoading } = useAnalysis(engagementId, "by-supplier");
  if (isLoading) return <Skeleton className="h-80" />;
  const rows = data || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={rows.slice(0, 15)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="supplier" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={80} />
              <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="total_amount" fill="#CF7F00" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Records</TableHead>
                <TableHead className="text-right">Total Spend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any, i: number) => (
                <TableRow key={i} data-testid={`supplier-row-${i}`}>
                  <TableCell className="text-sm">{i + 1}</TableCell>
                  <TableCell className="text-sm font-medium">{r.supplier}</TableCell>
                  <TableCell className="text-sm text-right">{r.record_count}</TableCell>
                  <TableCell className="text-sm text-right font-medium">{formatCurrency(r.total_amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ByBUTab({ engagementId }: { engagementId: number }) {
  const { data, isLoading } = useAnalysis(engagementId, "by-business-unit");
  if (isLoading) return <Skeleton className="h-80" />;
  const rows = data || [];

  return (
    <Card>
      <CardContent className="pt-4">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="business_unit" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <Bar dataKey="total_amount" fill="#0085CA" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function OverTimeTab({ engagementId }: { engagementId: number }) {
  const { data, isLoading } = useAnalysis(engagementId, "over-time");
  if (isLoading) return <Skeleton className="h-80" />;
  const rows = data || [];

  return (
    <Card>
      <CardContent className="pt-4">
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <Area type="monotone" dataKey="total_amount" stroke="#002B49" fill="#002B49" fillOpacity={0.1} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function ParetoTab({ engagementId }: { engagementId: number }) {
  const { data, isLoading } = useAnalysis(engagementId, "pareto");
  if (isLoading) return <Skeleton className="h-80" />;
  const suppliers = (data?.suppliers || []).slice(0, 30);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={suppliers}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="rank" tick={{ fontSize: 11 }} label={{ value: "Supplier Rank", position: "insideBottom", offset: -5, fontSize: 11 }} />
              <YAxis yAxisId="left" tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar yAxisId="left" dataKey="total_amount" fill="#002B49" radius={[2, 2, 0, 0]} name="Spend" />
              <Line yAxisId="right" dataKey="cumulative_pct" stroke="#CF7F00" strokeWidth={2} dot={false} name="Cumulative %" />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <div className="text-sm text-muted-foreground text-center">
        Total spend: {formatCurrency(data?.total_spend || 0)} across {data?.suppliers?.length || 0} suppliers
      </div>
    </div>
  );
}

function ConcentrationTab({ engagementId }: { engagementId: number }) {
  const { data, isLoading } = useAnalysis(engagementId, "concentration");
  if (isLoading) return <Skeleton className="h-80" />;

  const segments = data?.segments || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Concentration Metrics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {["top_5", "top_10", "top_20"].map(key => (
              <div key={key} className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground capitalize">{key.replace("_", " ")} suppliers</span>
                <div className="text-right">
                  <span className="text-sm font-bold">{(data as any)?.[`${key}_pct`]}%</span>
                  <span className="text-xs text-muted-foreground ml-2">{formatCurrency((data as any)?.[`${key}_spend`] || 0)}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={segments} cx="50%" cy="50%" outerRadius={100} dataKey="spend" nameKey="label" paddingAngle={2}>
                {segments.map((_: any, i: number) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function TailSpendTab({ engagementId }: { engagementId: number }) {
  const { data, isLoading } = useAnalysis(engagementId, "tail-spend");
  if (isLoading) return <Skeleton className="h-80" />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="tail-metric-suppliers">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Tail Suppliers</p>
            <p className="text-2xl font-bold mt-1">{data?.tail_suppliers || 0}</p>
            <p className="text-xs text-muted-foreground">{data?.tail_supplier_pct}% of all suppliers</p>
          </CardContent>
        </Card>
        <Card data-testid="tail-metric-spend">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Tail Spend</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(data?.tail_spend || 0)}</p>
            <p className="text-xs text-muted-foreground">{data?.tail_spend_pct}% of total</p>
          </CardContent>
        </Card>
        <Card data-testid="tail-metric-threshold">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Threshold</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(data?.threshold || 0)}</p>
            <p className="text-xs text-muted-foreground">per supplier</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Records</TableHead>
                <TableHead className="text-right">Total Spend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.tail_details || []).map((r: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="text-sm">{r.supplier}</TableCell>
                  <TableCell className="text-sm text-right">{r.record_count}</TableCell>
                  <TableCell className="text-sm text-right font-medium">{formatCurrency(r.total_amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Scoring tab colors ----
function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-700";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

function scoreBadgeColor(score: number): string {
  if (score >= 70) return "bg-emerald-100 text-emerald-800";
  if (score >= 50) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}

const priorityColors: Record<string, string> = {
  "Quick Win": "bg-emerald-100 text-emerald-800",
  "Strategic": "bg-blue-100 text-blue-800",
  "Long-term": "bg-amber-100 text-amber-800",
  "Deprioritize": "bg-gray-100 text-gray-600",
};

function InitiativeScoringTab({ engagementId }: { engagementId: number }) {
  const [sortField, setSortField] = useState<string>("total_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: scores, isLoading } = useQuery<any[]>({
    queryKey: ["/api/engagements", engagementId, "initiatives", "scores"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/initiatives/scores`);
      return res.json();
    },
  });

  if (isLoading) return <Skeleton className="h-80" />;
  if (!scores || scores.length === 0) {
    return (
      <Card data-testid="scoring-empty">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-muted-foreground">No initiatives to score. Create savings initiatives first, then return here to see scores.</p>
        </CardContent>
      </Card>
    );
  }

  const sorted = [...scores].sort((a, b) => {
    const av = a[sortField] ?? 0;
    const bv = b[sortField] ?? 0;
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const avgScore = Math.round(scores.reduce((s, i) => s + i.total_score, 0) / scores.length);
  const quickWins = scores.filter(s => s.priority === "Quick Win").length;
  const totalRiskAdj = scores.reduce((s, i) => s + i.risk_adjusted_target, 0);

  const SortHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <TableHead
      className="cursor-pointer hover:text-foreground select-none"
      onClick={() => handleSort(field)}
      data-testid={`sort-${field}`}
    >
      <span className="flex items-center gap-1">
        {children}
        {sortField === field && <span className="text-xs">{sortDir === "desc" ? "▼" : "▲"}</span>}
      </span>
    </TableHead>
  );

  return (
    <div className="space-y-4" data-testid="scoring-tab">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="scoring-avg">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Average Score</p>
            <p className={`text-2xl font-bold mt-1 ${scoreColor(avgScore)}`}>{avgScore}</p>
            <p className="text-xs text-muted-foreground">across {scores.length} initiatives</p>
          </CardContent>
        </Card>
        <Card data-testid="scoring-quickwins">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Quick Wins</p>
            <p className="text-2xl font-bold mt-1 text-emerald-700">{quickWins}</p>
            <p className="text-xs text-muted-foreground">high score + low complexity</p>
          </CardContent>
        </Card>
        <Card data-testid="scoring-pipeline">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Risk-Adjusted Pipeline</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(totalRiskAdj)}</p>
            <p className="text-xs text-muted-foreground">probability-weighted savings</p>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="scoring-table-card">
        <CardContent className="pt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <SortHeader field="initiative_name">Initiative</SortHeader>
                <TableHead>Lever</TableHead>
                <TableHead>Category</TableHead>
                <SortHeader field="contract_score">Contract</SortHeader>
                <SortHeader field="market_score">Market</SortHeader>
                <SortHeader field="operational_score">Ops</SortHeader>
                <SortHeader field="financial_score">Financial</SortHeader>
                <SortHeader field="total_score">Total</SortHeader>
                <TableHead>Priority</TableHead>
                <SortHeader field="base_target">Target</SortHeader>
                <TableHead className="text-right">Prob.</TableHead>
                <SortHeader field="risk_adjusted_target">Risk-Adj.</SortHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((s: any) => (
                <>
                  <TableRow
                    key={s.initiative_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setExpandedId(expandedId === s.initiative_id ? null : s.initiative_id)}
                    data-testid={`score-row-${s.initiative_id}`}
                  >
                    <TableCell className="w-8">
                      {expandedId === s.initiative_id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </TableCell>
                    <TableCell className="text-sm font-medium max-w-40 truncate">{s.initiative_name}</TableCell>
                    <TableCell className="text-xs capitalize">{(s.lever_type || "").replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-xs max-w-28 truncate">{s.category_name}</TableCell>
                    <TableCell className={`text-sm font-mono ${scoreColor(s.contract_score)}`}>{s.contract_score}</TableCell>
                    <TableCell className={`text-sm font-mono ${scoreColor(s.market_score)}`}>{s.market_score}</TableCell>
                    <TableCell className={`text-sm font-mono ${scoreColor(s.operational_score)}`}>{s.operational_score}</TableCell>
                    <TableCell className={`text-sm font-mono ${scoreColor(s.financial_score)}`}>{s.financial_score}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs font-mono ${scoreBadgeColor(s.total_score)}`}>{s.total_score}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${priorityColors[s.priority] || ""}`}>{s.priority}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-right font-mono">{formatCurrency(s.base_target)}</TableCell>
                    <TableCell className="text-sm text-right font-mono">{Math.round(s.probability * 100)}%</TableCell>
                    <TableCell className="text-sm text-right font-mono font-medium">{formatCurrency(s.risk_adjusted_target)}</TableCell>
                  </TableRow>
                  {expandedId === s.initiative_id && (
                    <TableRow key={`${s.initiative_id}-detail`} data-testid={`score-detail-${s.initiative_id}`}>
                      <TableCell colSpan={13} className="bg-muted/30 p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          {Object.entries(s.factor_scores || {}).map(([key, val]: [string, any]) => (
                            <div key={key} className="text-xs">
                              <div className="flex justify-between items-center mb-0.5">
                                <span className="font-medium capitalize">{key.replace(/_/g, " ")}</span>
                                <span className={`font-mono font-bold ${scoreColor(val.score)}`}>{val.score}</span>
                              </div>
                              <p className="text-muted-foreground leading-tight">{val.rationale}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 pt-2 border-t text-xs text-muted-foreground">
                          Time horizon: {s.time_horizon} | Probability: {Math.round(s.probability * 100)}% | Formula: base_target × probability = {formatCurrency(s.risk_adjusted_target)}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Kraljic colors ----
const QUADRANT_COLORS: Record<string, string> = {
  "Leverage": "#0085CA",
  "Strategic": "#002B49",
  "Bottleneck": "#CF7F00",
  "Non-critical": "#767171",
};

const QUADRANT_BG: Record<string, string> = {
  "Leverage": "bg-blue-50",
  "Strategic": "bg-am-navy/5",
  "Bottleneck": "bg-amber-50",
  "Non-critical": "bg-gray-50",
};

const QUADRANT_BADGE: Record<string, string> = {
  "Leverage": "bg-blue-100 text-blue-800",
  "Strategic": "bg-indigo-100 text-indigo-800",
  "Bottleneck": "bg-amber-100 text-amber-800",
  "Non-critical": "bg-gray-100 text-gray-600",
};

function KraljicMatrixTab({ engagementId }: { engagementId: number }) {
  const { data: positions, isLoading } = useQuery<any[]>({
    queryKey: ["/api/engagements", engagementId, "analysis", "kraljic"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/analysis/kraljic`);
      return res.json();
    },
  });

  if (isLoading) return <Skeleton className="h-80" />;
  if (!positions || positions.length === 0) {
    return (
      <Card data-testid="kraljic-empty">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-muted-foreground">No categorized spend data. Import and categorize spend records first.</p>
        </CardContent>
      </Card>
    );
  }

  // Prepare scatter data with color per quadrant
  const scatterData = positions.map((p: any) => ({
    x: p.supply_risk,
    y: p.profit_impact,
    z: Math.max(p.total_spend / 1000, 50), // min bubble size
    name: p.category_name,
    spend: p.total_spend,
    quadrant: p.quadrant,
    fill: QUADRANT_COLORS[p.quadrant] || "#767171",
  }));

  // Summary by quadrant
  const quadrants = ["Leverage", "Strategic", "Bottleneck", "Non-critical"] as const;
  const quadrantSummary = quadrants.map(q => {
    const items = positions.filter((p: any) => p.quadrant === q);
    return {
      quadrant: q,
      count: items.length,
      total_spend: items.reduce((s: number, p: any) => s + p.total_spend, 0),
    };
  });

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    return (
      <div className="bg-white border rounded-lg shadow-lg p-3 text-xs">
        <p className="font-semibold">{d.name}</p>
        <p className="text-muted-foreground">Spend: {formatCurrency(d.spend)}</p>
        <p className="text-muted-foreground">Supply Risk: {d.x} | Profit Impact: {d.y}</p>
        <Badge className={`text-xs mt-1 ${QUADRANT_BADGE[d.quadrant] || ""}`}>{d.quadrant}</Badge>
      </div>
    );
  };

  return (
    <div className="space-y-4" data-testid="kraljic-tab">
      {/* Quadrant summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {quadrantSummary.map(qs => (
          <Card key={qs.quadrant} className={QUADRANT_BG[qs.quadrant]} data-testid={`kraljic-summary-${qs.quadrant.toLowerCase().replace("-", "")}`}>
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">{qs.quadrant}</p>
              <p className="text-xl font-bold mt-1">{qs.count}</p>
              <p className="text-xs text-muted-foreground">{formatCurrency(qs.total_spend)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Scatter plot */}
      <Card data-testid="kraljic-chart">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Kraljic Matrix — Supply Risk vs. Profit Impact</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={450}>
            <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                type="number"
                dataKey="x"
                domain={[0, 100]}
                name="Supply Risk"
                tick={{ fontSize: 11 }}
                label={{ value: "Supply Risk →", position: "insideBottom", offset: -10, fontSize: 12 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                domain={[0, 100]}
                name="Profit Impact"
                tick={{ fontSize: 11 }}
                label={{ value: "← Profit Impact", angle: -90, position: "insideLeft", offset: 10, fontSize: 12 }}
              />
              <ZAxis type="number" dataKey="z" range={[40, 400]} />
              {/* Quadrant reference lines */}
              <ReferenceLine x={50} stroke="#9ca3af" strokeDasharray="4 4" />
              <ReferenceLine y={50} stroke="#9ca3af" strokeDasharray="4 4" />
              {/* Quadrant labels */}
              <ReferenceArea x1={0} x2={50} y1={50} y2={100} fill="#0085CA" fillOpacity={0.04} />
              <ReferenceArea x1={50} x2={100} y1={50} y2={100} fill="#002B49" fillOpacity={0.04} />
              <ReferenceArea x1={50} x2={100} y1={0} y2={50} fill="#CF7F00" fillOpacity={0.04} />
              <ReferenceArea x1={0} x2={50} y1={0} y2={50} fill="#767171" fillOpacity={0.04} />
              <Tooltip content={<CustomTooltip />} />
              {/* Separate scatter per quadrant for legend coloring */}
              {quadrants.map(q => (
                <Scatter
                  key={q}
                  name={q}
                  data={scatterData.filter((d: any) => d.quadrant === q)}
                  fill={QUADRANT_COLORS[q]}
                  opacity={0.8}
                />
              ))}
              <Legend />
            </ScatterChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 text-xs text-muted-foreground mt-2">
            <span>Top-left: <strong>Leverage</strong></span>
            <span>Top-right: <strong>Strategic</strong></span>
            <span>Bottom-right: <strong>Bottleneck</strong></span>
            <span>Bottom-left: <strong>Non-critical</strong></span>
          </div>
        </CardContent>
      </Card>

      {/* Detail tables grouped by quadrant */}
      {quadrants.map(q => {
        const items = positions.filter((p: any) => p.quadrant === q);
        if (items.length === 0) return null;
        return (
          <Card key={q} data-testid={`kraljic-detail-${q.toLowerCase().replace("-", "")}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Badge className={`${QUADRANT_BADGE[q]}`}>{q}</Badge>
                <CardTitle className="text-sm font-semibold">{items.length} categories | {formatCurrency(items.reduce((s: number, p: any) => s + p.total_spend, 0))}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">Supply Risk</TableHead>
                    <TableHead className="text-right">Profit Impact</TableHead>
                    <TableHead className="text-right">Suppliers</TableHead>
                    <TableHead>Top Supplier</TableHead>
                    <TableHead>Recommended Levers</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((p: any) => (
                    <TableRow key={p.category_id} data-testid={`kraljic-row-${p.category_id}`}>
                      <TableCell className="text-sm font-medium">{p.category_name}</TableCell>
                      <TableCell className="text-sm text-right font-mono">{formatCurrency(p.total_spend)}</TableCell>
                      <TableCell className={`text-sm text-right font-mono ${scoreColor(100 - p.supply_risk)}`}>{p.supply_risk}</TableCell>
                      <TableCell className={`text-sm text-right font-mono ${scoreColor(p.profit_impact)}`}>{p.profit_impact}</TableCell>
                      <TableCell className="text-sm text-right">{p.supplier_count}</TableCell>
                      <TableCell className="text-xs">{p.top_supplier} ({p.top_supplier_pct}%)</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(p.recommended_levers || []).slice(0, 3).map((l: string) => (
                            <Badge key={l} variant="secondary" className="text-xs capitalize">{l.replace(/_/g, " ")}</Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground mt-2 italic">{items[0]?.recommended_strategy}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ---- Vendor opportunity colors ----
const severityBadge: Record<string, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-gray-100 text-gray-600",
};

// Inverted color for opportunity score: higher = more opportunity = red
function oppScoreColor(score: number): string {
  if (score >= 70) return "text-red-600";
  if (score >= 40) return "text-amber-600";
  return "text-emerald-700";
}

function oppScoreBadge(score: number): string {
  if (score >= 70) return "bg-red-100 text-red-800";
  if (score >= 40) return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

const OPP_TYPE_COLORS: Record<string, string> = {
  "Price Variance": "#dc2626",
  "Credit Memo Leakage": "#ea580c",
  "Tail Spend": "#9ca3af",
  "Multi-BU Fragmentation": "#2563eb",
  "Maverick Spend": "#7c3aed",
  "Payment Terms": "#0891b2",
  "Concentration Risk": "#be123c",
  "Spend Acceleration": "#ca8a04",
  "Duplicate Vendor": "#6366f1",
  "Invoice Consolidation": "#64748b",
};

function VendorAnalysisTab({ engagementId }: { engagementId: number }) {
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string>("opportunity_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data: profiles, isLoading: loadingProfiles } = useQuery<any[]>({
    queryKey: ["/api/engagements", engagementId, "analysis", "vendor-profiles"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/analysis/vendor-profiles`);
      return res.json();
    },
  });

  const { data: summary, isLoading: loadingSummary } = useQuery<any>({
    queryKey: ["/api/engagements", engagementId, "analysis", "opportunity-summary"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/analysis/opportunity-summary`);
      return res.json();
    },
  });

  if (loadingProfiles || loadingSummary) return <Skeleton className="h-80" />;

  if (!profiles || profiles.length === 0) {
    return (
      <Card data-testid="vendor-empty">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-muted-foreground">No spend data to analyze. Import spend records first.</p>
        </CardContent>
      </Card>
    );
  }

  const sorted = [...profiles].sort((a: any, b: any) => {
    const av = typeof a[sortField] === "string" ? a[sortField] : (a[sortField] ?? 0);
    const bv = typeof b[sortField] === "string" ? b[sortField] : (b[sortField] ?? 0);
    if (typeof av === "string") return sortDir === "desc" ? bv.localeCompare(av) : av.localeCompare(bv);
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const SortHead = ({ field, children, className }: { field: string; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={`cursor-pointer hover:text-foreground select-none ${className || ""}`}
      onClick={() => handleSort(field)}
      data-testid={`vendor-sort-${field}`}
    >
      <span className="flex items-center gap-1">
        {children}
        {sortField === field && <span className="text-xs">{sortDir === "desc" ? "▼" : "▲"}</span>}
      </span>
    </TableHead>
  );

  // Opportunity savings by type for bar chart
  const oppBarData = (summary?.by_type || []).map((t: any) => ({
    type: t.type,
    total_savings: t.total_savings,
    count: t.count,
    fill: OPP_TYPE_COLORS[t.type] || "#767171",
  }));

  return (
    <div className="space-y-4" data-testid="vendor-analysis-tab">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="vendor-total">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Vendors Analyzed</p>
            <p className="text-2xl font-bold mt-1">{summary?.total_vendors || 0}</p>
          </CardContent>
        </Card>
        <Card data-testid="vendor-with-opps">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">With Opportunities</p>
            <p className="text-2xl font-bold mt-1 text-amber-600">{summary?.vendors_with_opportunities || 0}</p>
            <p className="text-xs text-muted-foreground">
              {summary?.total_vendors > 0 ? Math.round((summary.vendors_with_opportunities / summary.total_vendors) * 100) : 0}% of vendors
            </p>
          </CardContent>
        </Card>
        <Card data-testid="vendor-total-savings">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Total Est. Savings</p>
            <p className="text-2xl font-bold mt-1 text-am-green">{formatCurrency(summary?.total_estimated_savings || 0)}</p>
          </CardContent>
        </Card>
        <Card data-testid="vendor-top-type">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Top Opportunity</p>
            <p className="text-lg font-bold mt-1">{summary?.top_opportunity_type || "None"}</p>
            <p className="text-xs text-muted-foreground">
              {summary?.by_type?.[0] ? formatCurrency(summary.by_type[0].total_savings) : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Opportunity savings by type bar chart */}
      {oppBarData.length > 0 && (
        <Card data-testid="vendor-opp-chart">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Estimated Savings by Opportunity Type</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(200, oppBarData.length * 36)}>
              <BarChart data={oppBarData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                <YAxis dataKey="type" type="category" width={140} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(v: number) => formatCurrency(v)}
                  labelFormatter={(label: string) => {
                    const item = oppBarData.find((d: any) => d.type === label);
                    return `${label} (${item?.count || 0} findings)`;
                  }}
                />
                <Bar dataKey="total_savings" radius={[0, 4, 4, 0]}>
                  {oppBarData.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Vendor table */}
      <Card data-testid="vendor-table-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{profiles.length} Vendors — sorted by opportunity score</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <SortHead field="vendor_name">Vendor</SortHead>
                <SortHead field="total_spend" className="text-right">Total Spend</SortHead>
                <SortHead field="record_count" className="text-right">Records</SortHead>
                <SortHead field="bu_count" className="text-right">BUs</SortHead>
                <SortHead field="opportunity_score" className="text-right">Opp Score</SortHead>
                <TableHead className="text-right"># Opps</TableHead>
                <SortHead field="estimated_savings_total" className="text-right">Est. Savings</SortHead>
                <TableHead>Top Opportunity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.slice(0, 100).map((p: any) => {
                const estSavingsTotal = (p.opportunities || []).reduce((s: number, o: any) => s + o.estimated_savings, 0);
                const topOpp = p.opportunities?.[0];
                const isExpanded = expandedVendor === p.vendor_name;
                return (
                  <>
                    <TableRow
                      key={p.vendor_name}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedVendor(isExpanded ? null : p.vendor_name)}
                      data-testid={`vendor-row-${p.priority_rank}`}
                    >
                      <TableCell className="w-8">
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </TableCell>
                      <TableCell className="text-sm font-medium max-w-48 truncate">{p.vendor_name}</TableCell>
                      <TableCell className="text-sm text-right font-mono">{formatCurrency(p.total_spend)}</TableCell>
                      <TableCell className="text-sm text-right">{p.record_count}</TableCell>
                      <TableCell className="text-sm text-right">{p.bu_count}</TableCell>
                      <TableCell className="text-right">
                        <Badge className={`text-xs font-mono ${oppScoreBadge(p.opportunity_score)}`}>
                          {p.opportunity_score}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-right">{p.opportunities?.length || 0}</TableCell>
                      <TableCell className="text-sm text-right font-mono font-medium">
                        {estSavingsTotal > 0 ? formatCurrency(estSavingsTotal) : "—"}
                      </TableCell>
                      <TableCell className="text-xs max-w-36 truncate">
                        {topOpp ? (
                          <Badge className={`text-xs ${severityBadge[topOpp.severity]}`}>{topOpp.type}</Badge>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${p.vendor_name}-detail`} data-testid={`vendor-detail-${p.priority_rank}`}>
                        <TableCell colSpan={9} className="bg-muted/30 p-4">
                          <div className="space-y-4">
                            {/* Vendor stats */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                              <div>
                                <span className="text-muted-foreground">Avg Invoice:</span>
                                <span className="ml-1 font-mono font-medium">{formatCurrency(p.avg_invoice)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Median Invoice:</span>
                                <span className="ml-1 font-mono font-medium">{formatCurrency(p.median_invoice)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Price Range:</span>
                                <span className="ml-1 font-mono">{formatCurrency(p.min_invoice)} – {formatCurrency(p.max_invoice)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">CV:</span>
                                <span className={`ml-1 font-mono font-medium ${p.coefficient_of_variation > 0.3 ? "text-red-600" : ""}`}>
                                  {(p.coefficient_of_variation * 100).toFixed(0)}%
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Months Active:</span>
                                <span className="ml-1 font-medium">{p.months_active}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Trend:</span>
                                <span className={`ml-1 font-medium capitalize ${p.spend_trend === "increasing" ? "text-red-600" : p.spend_trend === "decreasing" ? "text-emerald-600" : ""}`}>
                                  {p.spend_trend}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Categories:</span>
                                <span className="ml-1 font-medium">{p.categories?.join(", ") || "None"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Business Units:</span>
                                <span className="ml-1 font-medium">{p.business_units?.join(", ") || "None"}</span>
                              </div>
                            </div>

                            {/* Spend by month mini chart */}
                            {p.spend_by_month && p.spend_by_month.length > 1 && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-1">Monthly Spend</p>
                                <ResponsiveContainer width="100%" height={100}>
                                  <BarChart data={p.spend_by_month}>
                                    <XAxis dataKey="month" tick={{ fontSize: 8 }} />
                                    <YAxis tick={false} width={0} />
                                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                                    <Bar dataKey="amount" fill="#002B49" radius={[2, 2, 0, 0]} />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            )}

                            {/* Opportunities */}
                            {p.opportunities && p.opportunities.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-2">Opportunities ({p.opportunities.length})</p>
                                <div className="space-y-2">
                                  {p.opportunities.map((opp: any, oi: number) => (
                                    <div key={oi} className="border rounded-lg p-3 text-xs" data-testid={`opp-${p.priority_rank}-${oi}`}>
                                      <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                          <Badge className={`text-xs ${severityBadge[opp.severity]}`}>{opp.severity}</Badge>
                                          <span className="font-semibold">{opp.type}</span>
                                        </div>
                                        <span className="font-mono font-bold text-am-green">{formatCurrency(opp.estimated_savings)}</span>
                                      </div>
                                      <p className="text-muted-foreground mb-1">{opp.description}</p>
                                      <p className="font-mono text-xs bg-muted/50 rounded px-2 py-1 mb-1">{opp.evidence}</p>
                                      <p className="text-blue-700 italic">{opp.recommended_action}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {p.opportunities?.length === 0 && (
                              <p className="text-xs text-muted-foreground italic">No actionable opportunities identified for this vendor.</p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
          {profiles.length > 100 && (
            <p className="text-xs text-muted-foreground mt-2 text-center">Showing top 100 of {profiles.length} vendors</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SpendAnalysisPage({ engagementId }: { engagementId: number }) {
  return (
    <div data-testid="analysis-page">
      <Tabs defaultValue="category">
        <TabsList className="mb-4 flex-wrap h-auto" data-testid="analysis-tabs">
          <TabsTrigger value="category" data-testid="tab-category">By Category</TabsTrigger>
          <TabsTrigger value="supplier" data-testid="tab-supplier">By Supplier</TabsTrigger>
          <TabsTrigger value="bu" data-testid="tab-bu">By BU</TabsTrigger>
          <TabsTrigger value="time" data-testid="tab-time">Over Time</TabsTrigger>
          <TabsTrigger value="pareto" data-testid="tab-pareto">Pareto</TabsTrigger>
          <TabsTrigger value="concentration" data-testid="tab-concentration">Concentration</TabsTrigger>
          <TabsTrigger value="tail" data-testid="tab-tail">Tail Spend</TabsTrigger>
          <TabsTrigger value="scoring" data-testid="tab-scoring">Initiative Scoring</TabsTrigger>
          <TabsTrigger value="kraljic" data-testid="tab-kraljic">Kraljic Matrix</TabsTrigger>
          <TabsTrigger value="vendor" data-testid="tab-vendor">Vendor Analysis</TabsTrigger>
        </TabsList>
        <TabsContent value="category"><ByCategoryTab engagementId={engagementId} /></TabsContent>
        <TabsContent value="supplier"><BySupplierTab engagementId={engagementId} /></TabsContent>
        <TabsContent value="bu"><ByBUTab engagementId={engagementId} /></TabsContent>
        <TabsContent value="time"><OverTimeTab engagementId={engagementId} /></TabsContent>
        <TabsContent value="pareto"><ParetoTab engagementId={engagementId} /></TabsContent>
        <TabsContent value="concentration"><ConcentrationTab engagementId={engagementId} /></TabsContent>
        <TabsContent value="tail"><TailSpendTab engagementId={engagementId} /></TabsContent>
        <TabsContent value="scoring"><InitiativeScoringTab engagementId={engagementId} /></TabsContent>
        <TabsContent value="kraljic"><KraljicMatrixTab engagementId={engagementId} /></TabsContent>
        <TabsContent value="vendor"><VendorAnalysisTab engagementId={engagementId} /></TabsContent>
      </Tabs>
    </div>
  );
}
