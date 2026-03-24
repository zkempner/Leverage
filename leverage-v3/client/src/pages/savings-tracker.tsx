import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, TrendingUp, Target, DollarSign, Plus, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, Legend, AreaChart, Area
} from "recharts";

const COLORS = ["#002B49", "#CF7F00", "#0085CA", "#29702A", "#00677F"];
const STATUSES = ["identified", "in_progress", "committed", "realized", "abandoned"];

function formatCurrency(v: number) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

const statusColors: Record<string, string> = {
  identified: "bg-blue-100 text-blue-800",
  in_progress: "bg-amber-100 text-amber-800",
  committed: "bg-emerald-100 text-emerald-800",
  realized: "bg-green-100 text-green-800",
  abandoned: "bg-gray-100 text-gray-600",
};

function RealizationHistory({ initiativeId }: { initiativeId: number }) {
  const { data: entries, isLoading } = useQuery<any[]>({
    queryKey: ["/api/initiatives", initiativeId, "realization"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/initiatives/${initiativeId}/realization`);
      return res.json();
    },
  });

  if (isLoading) return <Skeleton className="h-16 mt-2" />;
  if (!entries || entries.length === 0) return <p className="text-xs text-muted-foreground mt-2 pl-4">No realization entries yet</p>;

  return (
    <div className="mt-2 pl-4 border-l-2 border-am-green/30">
      <p className="text-xs font-semibold text-muted-foreground mb-1">Realization History</p>
      <div className="space-y-1">
        {entries.map((e: any) => (
          <div key={e.id} className="flex items-center justify-between text-xs p-1.5 bg-muted/30 rounded" data-testid={`realization-entry-${e.id}`}>
            <span className="text-muted-foreground">{e.date}</span>
            <span className="font-medium text-am-green">{formatCurrency(e.amount || 0)}</span>
            {e.notes && <span className="text-muted-foreground truncate max-w-40">{e.notes}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SavingsTrackerPage({ engagementId }: { engagementId: number }) {
  const { toast } = useToast();
  const [addRealizationFor, setAddRealizationFor] = useState<number | null>(null);
  const [realForm, setRealForm] = useState({ date: "", amount: 0, notes: "" });
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: summary, isLoading } = useQuery<any>({
    queryKey: ["/api/engagements", engagementId, "tracker", "summary"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/tracker/summary`);
      return res.json();
    },
  });

  const { data: pipeline } = useQuery<any>({
    queryKey: ["/api/engagements", engagementId, "tracker", "pipeline"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/tracker/pipeline`);
      return res.json();
    },
  });

  const { data: curve } = useQuery<any[]>({
    queryKey: ["/api/engagements", engagementId, "tracker", "realization-curve"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/tracker/realization-curve`);
      return res.json();
    },
  });

  const { data: riskView } = useQuery<any[]>({
    queryKey: ["/api/engagements", engagementId, "tracker", "risk-view"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/tracker/risk-view`);
      return res.json();
    },
  });

  const addRealizationMutation = useMutation({
    mutationFn: async () => {
      if (!addRealizationFor) return;
      const res = await apiRequest("POST", `/api/initiatives/${addRealizationFor}/realization`, realForm);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Realization entry added" });
      setAddRealizationFor(null);
      setRealForm({ date: "", amount: 0, notes: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId, "tracker"] });
      queryClient.invalidateQueries({ queryKey: ["/api/initiatives"] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PUT", `/api/engagements/${engagementId}/initiatives/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId, "tracker"] });
    },
  });

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-32" />)}</div>;

  const statusData = Object.entries(summary?.by_status || {}).map(([status, val]: [string, any]) => ({
    status, count: val.count, amount: val.amount,
  }));

  const allInits = Object.entries(pipeline || {}).flatMap(([, inits]: [string, any]) => inits as any[]);

  return (
    <div className="space-y-6" data-testid="tracker-page">
      {/* Summary metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="tracker-total">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-am-navy" />
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Total Pipeline</p>
                <p className="text-xl font-bold">{formatCurrency(summary?.total_target || 0)}</p>
                <p className="text-xs text-muted-foreground">{summary?.total_initiatives || 0} initiatives</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="tracker-realized">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-am-green" />
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Realized</p>
                <p className="text-xl font-bold text-am-green">{formatCurrency(summary?.total_realized || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="tracker-at-risk">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">At Risk</p>
                <p className="text-xl font-bold text-amber-600">{formatCurrency(summary?.at_risk_amount || 0)}</p>
                <p className="text-xs text-muted-foreground">{summary?.at_risk_count || 0} initiatives</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="tracker-conversion">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-am-blue" />
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Conversion</p>
                <p className="text-xl font-bold">
                  {summary?.total_target > 0 ? ((summary?.total_realized / summary?.total_target) * 100).toFixed(0) : 0}%
                </p>
                <p className="text-xs text-muted-foreground">realized / target</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline by status + Realization curve */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="pipeline-chart">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Pipeline by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card data-testid="realization-curve">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Realization Curve</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={curve || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Area type="monotone" dataKey="cumulative" stroke="#29702A" fill="#29702A" fillOpacity={0.1} name="Cumulative" />
                <Area type="monotone" dataKey="monthly" stroke="#CF7F00" fill="#CF7F00" fillOpacity={0.1} name="Monthly" />
                <Legend />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline table */}
      <Card data-testid="pipeline-table">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Initiative Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-6"></TableHead>
                  <TableHead>Initiative</TableHead>
                  <TableHead>Lever</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Realized</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allInits.map((init: any) => (
                  <>
                    <TableRow
                      key={init.id}
                      className={init.is_at_risk ? "border-l-2 border-l-amber-400 bg-amber-50/50" : ""}
                      data-testid={`pipeline-row-${init.id}`}
                    >
                      <TableCell className="w-6 cursor-pointer" onClick={() => setExpandedId(expandedId === init.id ? null : init.id)}>
                        {expandedId === init.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        <span className="cursor-pointer hover:underline" onClick={() => setExpandedId(expandedId === init.id ? null : init.id)}>
                          {init.name}
                        </span>
                        {init.is_at_risk ? (
                          <Badge className="ml-2 bg-amber-100 text-amber-800 border border-amber-300 text-xs" data-testid={`risk-badge-${init.id}`}>
                            <AlertTriangle className="h-3 w-3 mr-1" /> At Risk
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs capitalize">{(init.lever_type || "").replace(/_/g, " ")}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{init.confidence}</Badge>
                      </TableCell>
                      <TableCell>
                        <Select value={init.status} onValueChange={v => statusMutation.mutate({ id: init.id, status: v })}>
                          <SelectTrigger className="w-28 h-7 text-xs" data-testid={`tracker-status-${init.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatCurrency(init.target_amount || 0)}</TableCell>
                      <TableCell className="text-right text-sm text-am-green">{formatCurrency(init.realized_amount || 0)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => { setAddRealizationFor(init.id); setRealForm({ date: "", amount: 0, notes: "" }); }} data-testid={`add-realization-${init.id}`}>
                          <Plus className="h-3 w-3 mr-1" /> Log
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expandedId === init.id && (
                      <TableRow key={`${init.id}-exp`}>
                        <TableCell colSpan={8} className="p-2">
                          <RealizationHistory initiativeId={init.id} />
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add realization dialog */}
      <Dialog open={addRealizationFor !== null} onOpenChange={(open) => !open && setAddRealizationFor(null)}>
        <DialogContent data-testid="realization-dialog">
          <DialogHeader>
            <DialogTitle className="text-sm">Log Realization Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input type="date" value={realForm.date} onChange={e => setRealForm(p => ({ ...p, date: e.target.value }))} data-testid="real-date" />
            <Input type="number" placeholder="Amount ($)" value={realForm.amount || ""} onChange={e => setRealForm(p => ({ ...p, amount: Number(e.target.value) }))} data-testid="real-amount" />
            <Input placeholder="Notes" value={realForm.notes} onChange={e => setRealForm(p => ({ ...p, notes: e.target.value }))} data-testid="real-notes" />
            <Button onClick={() => addRealizationMutation.mutate()} disabled={addRealizationMutation.isPending || !realForm.date} data-testid="save-realization-btn">
              {addRealizationMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save Entry
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Risk View */}
      {(riskView || []).length > 0 && (
        <Card data-testid="risk-view">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              At-Risk Initiatives
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(riskView || []).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border-2 border-amber-300" data-testid={`risk-item-${r.id}`}>
                  <div>
                    <p className="text-sm font-medium flex items-center gap-2">
                      {r.name}
                      <Badge className="bg-amber-100 text-amber-800 border border-amber-300 text-xs">
                        <AlertTriangle className="h-3 w-3 mr-1" /> At Risk
                      </Badge>
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{(r.lever_type || "").replace(/_/g, " ")} | {r.confidence}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-amber-700">{formatCurrency(r.target_amount || 0)}</p>
                    <p className="text-xs text-muted-foreground">{r.notes}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
