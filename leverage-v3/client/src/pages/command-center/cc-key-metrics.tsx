import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Camera, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Metric {
  id: number;
  metric_category: string;
  metric_name: string;
  period_type: string;
  period_label: string;
  value: number | null;
  unit: string;
}

const METRIC_NAMES: Record<string, string[]> = {
  pnl: ["Revenue", "COGS", "Gross Profit", "Gross Margin %", "SG&A", "EBITDA", "EBITDA Margin %", "Net Income", "CapEx", "D&A"],
  balance_sheet: ["Total Assets", "Total Liabilities", "Cash & Equivalents", "Working Capital", "AR", "AP", "Inventory", "Total Debt", "Equity"],
  cash_flow: ["Operating Cash Flow", "Free Cash Flow", "Cash Conversion Cycle", "DSO", "DPO", "DIO"],
  people: ["Total Headcount", "Headcount by Department", "Fully Loaded Cost per Head", "Revenue per Employee", "Turnover Rate %", "Open Positions"],
};

const TAB_LABELS: Record<string, string> = { pnl: "P&L", balance_sheet: "Balance Sheet", cash_flow: "Cash Flow", people: "People/HC" };
const PERIOD_TYPES = ["actual", "budget", "prior_year", "ltm", "projected"];

function formatValue(val: number | null | undefined, unit?: string) {
  if (val == null) return "-";
  if (unit === "%") return `${val.toFixed(1)}%`;
  if (unit === "$" || unit === "USD") return `$${val.toLocaleString()}`;
  return val.toLocaleString();
}

function buildMetricRows(metrics: Metric[], category: string) {
  const names = METRIC_NAMES[category] || [];
  const byName: Record<string, Record<string, number | null>> = {};
  names.forEach(n => { byName[n] = {}; });
  metrics.filter(m => m.metric_category === category).forEach(m => {
    if (!byName[m.metric_name]) byName[m.metric_name] = {};
    byName[m.metric_name][m.period_type] = m.value;
  });
  return names.map(name => {
    const vals = byName[name] || {};
    const actual = vals.actual ?? null;
    const budget = vals.budget ?? null;
    const variance = actual != null && budget != null && budget !== 0 ? ((actual - budget) / Math.abs(budget)) * 100 : null;
    return { name, actual, budget, prior_year: vals.prior_year ?? null, ltm: vals.ltm ?? null, projected: vals.projected ?? null, variance };
  });
}

export default function CCKeyMetricsPage({ engagementId }: { engagementId?: number }) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("pnl");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ metric_category: "pnl", metric_name: "", period_type: "actual", period_label: "", value: "", unit: "$" });

  const base = `/api/cc/engagements/${engagementId}`;
  const { data: metrics, isLoading } = useQuery<Metric[]>({
    queryKey: [base, "metrics"],
    queryFn: async () => { const r = await apiRequest("GET", `${base}/metrics`); return r.json(); },
    enabled: !!engagementId,
  });

  const addMutation = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("POST", `${base}/metrics`, data); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [base, "metrics"] }); setDialogOpen(false); toast({ title: "Metric added" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `${base}/metrics/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [base, "metrics"] }); toast({ title: "Metric deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const snapshotMutation = useMutation({
    mutationFn: async () => { const r = await apiRequest("POST", `${base}/metrics/snapshots`); return r.json(); },
    onSuccess: () => toast({ title: "Snapshot captured", description: "All current metrics have been saved as a snapshot" }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleAdd = () => {
    addMutation.mutate({ ...form, value: form.value ? parseFloat(form.value) : null });
  };

  if (!engagementId) return <div className="p-6 text-muted-foreground">No engagement selected</div>;

  if (isLoading) return <div className="space-y-4 p-6">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>;

  const allMetrics = metrics || [];

  return (
    <div className="space-y-6" data-testid="cc-key-metrics-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-am-navy">Key Metrics</h1>
          <p className="text-sm text-muted-foreground mt-1">Financial & operational KPIs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => snapshotMutation.mutate()} disabled={snapshotMutation.isPending}>
            {snapshotMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
            Take Snapshot
          </Button>
          <Button onClick={() => { setForm({ metric_category: activeTab, metric_name: "", period_type: "actual", period_label: "", value: "", unit: "$" }); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Add Metric
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {Object.entries(TAB_LABELS).map(([key, label]) => (
            <TabsTrigger key={key} value={key}>{label}</TabsTrigger>
          ))}
        </TabsList>
        {Object.keys(TAB_LABELS).map(cat => {
          const rows = buildMetricRows(allMetrics, cat);
          return (
            <TabsContent key={cat} value={cat}>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-semibold">Metric Name</TableHead>
                        <TableHead className="text-right">Actual</TableHead>
                        <TableHead className="text-right">Budget</TableHead>
                        <TableHead className="text-right">Prior Year</TableHead>
                        <TableHead className="text-right">LTM</TableHead>
                        <TableHead className="text-right">Projected</TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map(row => (
                        <TableRow key={row.name}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell className="text-right">{formatValue(row.actual)}</TableCell>
                          <TableCell className="text-right">{formatValue(row.budget)}</TableCell>
                          <TableCell className="text-right">{formatValue(row.prior_year)}</TableCell>
                          <TableCell className="text-right">{formatValue(row.ltm)}</TableCell>
                          <TableCell className="text-right">{formatValue(row.projected)}</TableCell>
                          <TableCell className="text-right">
                            {row.variance != null ? (
                              <span className={row.variance >= 0 ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>
                                {row.variance >= 0 ? "+" : ""}{row.variance.toFixed(1)}%
                              </span>
                            ) : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>

      {allMetrics.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Raw Metric Entries</h3>
            <div className="space-y-1">
              {allMetrics.map(m => (
                <div key={m.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <span>{m.metric_name} <Badge variant="outline" className="text-[10px] ml-1">{m.period_type}</Badge></span>
                  <div className="flex items-center gap-2">
                    <span>{formatValue(m.value, m.unit)}</span>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => deleteMutation.mutate(m.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Metric</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category</Label>
              <Select value={form.metric_category} onValueChange={v => setForm(f => ({ ...f, metric_category: v, metric_name: "" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TAB_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Metric Name</Label>
              <Select value={form.metric_name} onValueChange={v => setForm(f => ({ ...f, metric_name: v }))}>
                <SelectTrigger><SelectValue placeholder="Select metric" /></SelectTrigger>
                <SelectContent>
                  {(METRIC_NAMES[form.metric_category] || []).map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Period Type</Label>
              <Select value={form.period_type} onValueChange={v => setForm(f => ({ ...f, period_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIOD_TYPES.map(p => <SelectItem key={p} value={p}>{p.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Period Label</Label>
              <Input value={form.period_label} onChange={e => setForm(f => ({ ...f, period_label: e.target.value }))} placeholder="e.g., Q1 2026" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Value</Label>
                <Input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <Label>Unit</Label>
                <Select value={form.unit} onValueChange={v => setForm(f => ({ ...f, unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="$">$</SelectItem>
                    <SelectItem value="%">%</SelectItem>
                    <SelectItem value="#">#</SelectItem>
                    <SelectItem value="ratio">Ratio</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!form.metric_name || addMutation.isPending}>
              {addMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Add Metric
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
