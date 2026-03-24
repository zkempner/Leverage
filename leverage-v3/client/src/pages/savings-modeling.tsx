import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Calculator, Star, Loader2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Initiative, Scenario } from "@shared/schema";

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

const leverTypes = [
  "volume_consolidation", "renegotiation", "specification_change", "demand_reduction",
  "process_improvement", "make_vs_buy", "payment_terms", "global_sourcing",
];

const STATUSES = ["identified", "in_progress", "committed", "realized", "abandoned"];

function ScenarioPanel({ initiative }: { initiative: Initiative }) {
  const { toast } = useToast();
  const [newScenario, setNewScenario] = useState({ name: "", assumptions: "{}", estimated_annual_savings: 0 });
  const [showForm, setShowForm] = useState(false);

  const { data: scenariosData } = useQuery<Scenario[]>({
    queryKey: ["/api/initiatives", initiative.id, "scenarios"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/initiatives/${initiative.id}/scenarios`);
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/initiatives/${initiative.id}/scenarios`, newScenario);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Scenario created" });
      setShowForm(false);
      setNewScenario({ name: "", assumptions: "{}", estimated_annual_savings: 0 });
      queryClient.invalidateQueries({ queryKey: ["/api/initiatives", initiative.id, "scenarios"] });
    },
  });

  const selectMutation = useMutation({
    mutationFn: async (sid: number) => {
      const res = await apiRequest("POST", `/api/initiatives/${initiative.id}/scenarios/${sid}/select`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/initiatives", initiative.id, "scenarios"] });
    },
  });

  return (
    <div className="space-y-3 mt-3 pl-4 border-l-2 border-am-gold/30">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Scenarios</p>
        <Button size="sm" variant="ghost" onClick={() => setShowForm(!showForm)} data-testid={`add-scenario-${initiative.id}`}>
          <Plus className="h-3 w-3 mr-1" /> New Scenario
        </Button>
      </div>

      {showForm && (
        <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
          <Input placeholder="Scenario name" value={newScenario.name} onChange={e => setNewScenario(p => ({ ...p, name: e.target.value }))} className="text-sm" data-testid={`scenario-name-${initiative.id}`} />
          <Textarea placeholder='Assumptions (JSON)' value={newScenario.assumptions} onChange={e => setNewScenario(p => ({ ...p, assumptions: e.target.value }))} className="text-sm font-mono" rows={3} data-testid={`scenario-assumptions-${initiative.id}`} />
          <Input type="number" placeholder="Est. annual savings" value={newScenario.estimated_annual_savings || ""} onChange={e => setNewScenario(p => ({ ...p, estimated_annual_savings: Number(e.target.value) }))} className="text-sm" data-testid={`scenario-savings-${initiative.id}`} />
          <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !newScenario.name} data-testid={`save-scenario-${initiative.id}`}>
            {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Save Scenario
          </Button>
        </div>
      )}

      {(scenariosData || []).map(s => {
        let assumptions: any = {};
        try { assumptions = JSON.parse(s.assumptions || "{}"); } catch {}
        return (
          <div key={s.id} className={`p-3 rounded-lg border text-sm ${s.is_selected ? "border-am-gold bg-am-gold/5" : "border-border"}`} data-testid={`scenario-${s.id}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">{s.name}</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-am-green">{formatCurrency(s.estimated_annual_savings || 0)}</span>
                <Button size="sm" variant={s.is_selected ? "default" : "ghost"} onClick={() => selectMutation.mutate(s.id)} data-testid={`select-scenario-${s.id}`}>
                  <Star className={`h-3 w-3 ${s.is_selected ? "fill-current" : ""}`} />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(assumptions).map(([k, v]) => (
                <Badge key={k} variant="secondary" className="text-xs font-mono">
                  {k}: {String(v)}
                </Badge>
              ))}
            </div>
          </div>
        );
      })}

      {(!scenariosData || scenariosData.length === 0) && !showForm && (
        <p className="text-xs text-muted-foreground">No scenarios yet</p>
      )}
    </div>
  );
}

export default function SavingsModelingPage({ engagementId }: { engagementId: number }) {
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editInit, setEditInit] = useState<Initiative | null>(null);
  const [editForm, setEditForm] = useState({ name: "", target_amount: 0, confidence: "Medium", notes: "" });
  const [newInit, setNewInit] = useState({
    name: "", lever_type: "volume_consolidation", confidence: "Medium", status: "identified",
    target_amount: 0, notes: "",
  });

  const { data: initiatives, isLoading } = useQuery<Initiative[]>({
    queryKey: ["/api/engagements", engagementId, "initiatives"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/initiatives`);
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/engagements/${engagementId}/initiatives`, newInit);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Initiative created" });
      setShowNew(false);
      setNewInit({ name: "", lever_type: "volume_consolidation", confidence: "Medium", status: "identified", target_amount: 0, notes: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId, "initiatives"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      const res = await apiRequest("PUT", `/api/engagements/${engagementId}/initiatives/${id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Initiative updated" });
      setEditInit(null);
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId, "initiatives"] });
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId, "dashboard"] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PUT", `/api/engagements/${engagementId}/initiatives/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId, "initiatives"] });
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId, "dashboard"] });
    },
  });

  const sizeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/engagements/${engagementId}/initiatives/size-from-benchmarks`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Savings Sized from Benchmarks",
        description: `${data.created} new initiatives created totaling ${formatCurrency(data.total_new_target)}. Each sized from addressable spend × benchmark rates.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId] });
    },
    onError: (err: any) => {
      toast({ title: "Sizing Failed", description: err.message, variant: "destructive" });
    },
  });

  const openEdit = (init: Initiative) => {
    setEditInit(init);
    setEditForm({ name: init.name, target_amount: init.target_amount || 0, confidence: init.confidence || "Medium", notes: init.notes || "" });
  };

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div>;

  return (
    <div className="space-y-6" data-testid="modeling-page">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-base font-semibold">Savings Initiatives</h2>
          <p className="text-xs text-muted-foreground">{initiatives?.length || 0} initiatives | {formatCurrency((initiatives || []).reduce((s, i) => s + (i.target_amount || 0), 0))} target</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowNew(true)} data-testid="new-initiative-btn">
            <Plus className="h-4 w-4 mr-1" /> New Initiative
          </Button>
          <Button
            size="sm"
            onClick={() => sizeMutation.mutate()}
            disabled={sizeMutation.isPending}
            data-testid="size-from-benchmarks-btn"
          >
            {sizeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Calculator className="h-4 w-4 mr-1" />}
            {sizeMutation.isPending ? "Sizing from benchmarks & spend..." : "Size from Benchmarks"}
          </Button>
        </div>
      </div>

      {/* New Initiative Dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent data-testid="new-initiative-dialog">
          <DialogHeader>
            <DialogTitle className="text-sm">New Savings Initiative</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Initiative name" value={newInit.name} onChange={e => setNewInit(p => ({ ...p, name: e.target.value }))} data-testid="init-name" />
            <Select value={newInit.lever_type} onValueChange={v => setNewInit(p => ({ ...p, lever_type: v }))}>
              <SelectTrigger className="text-sm" data-testid="init-lever"><SelectValue /></SelectTrigger>
              <SelectContent>{leverTypes.map(l => <SelectItem key={l} value={l}>{l.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={newInit.confidence} onValueChange={v => setNewInit(p => ({ ...p, confidence: v }))}>
              <SelectTrigger className="text-sm" data-testid="init-confidence"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Input type="number" placeholder="Target amount ($)" value={newInit.target_amount || ""} onChange={e => setNewInit(p => ({ ...p, target_amount: Number(e.target.value) }))} className="text-sm" data-testid="init-target" />
            <Textarea placeholder="Notes" value={newInit.notes} onChange={e => setNewInit(p => ({ ...p, notes: e.target.value }))} rows={2} data-testid="init-notes" />
            <Button onClick={() => createMutation.mutate()} disabled={!newInit.name || createMutation.isPending} data-testid="save-initiative-btn">
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Calculator className="h-4 w-4 mr-1" />} Save Initiative
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Initiative Dialog */}
      <Dialog open={editInit !== null} onOpenChange={(open) => !open && setEditInit(null)}>
        <DialogContent data-testid="edit-initiative-dialog">
          <DialogHeader>
            <DialogTitle className="text-sm">Edit Initiative</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Name" value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} data-testid="edit-init-name" />
            <Input type="number" placeholder="Target amount ($)" value={editForm.target_amount || ""} onChange={e => setEditForm(p => ({ ...p, target_amount: Number(e.target.value) }))} data-testid="edit-init-target" />
            <Select value={editForm.confidence} onValueChange={v => setEditForm(p => ({ ...p, confidence: v }))}>
              <SelectTrigger className="text-sm" data-testid="edit-init-confidence"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Textarea placeholder="Notes" value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} rows={2} data-testid="edit-init-notes" />
            <Button onClick={() => editInit && updateMutation.mutate({ id: editInit.id, payload: editForm })} disabled={updateMutation.isPending} data-testid="save-edit-btn">
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Initiative List */}
      <div className="space-y-3">
        {(initiatives || []).map(init => (
          <Card key={init.id} data-testid={`initiative-${init.id}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="cursor-pointer flex-1" onClick={() => setExpandedId(expandedId === init.id ? null : init.id)}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold">{init.name}</span>
                    <Badge variant="outline" className="text-xs">{init.confidence}</Badge>
                    {init.is_at_risk ? <Badge className="bg-red-100 text-red-800 text-xs">At Risk</Badge> : null}
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">{(init.lever_type || "").replace(/_/g, " ")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={init.status} onValueChange={v => statusMutation.mutate({ id: init.id, status: v })}>
                    <SelectTrigger className="w-32 h-7 text-xs" data-testid={`status-select-${init.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="text-right mr-2">
                    <p className="text-sm font-bold">{formatCurrency(init.target_amount || 0)}</p>
                    <p className="text-xs text-am-green">{formatCurrency(init.realized_amount || 0)} realized</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(init)} data-testid={`edit-initiative-${init.id}`}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {expandedId === init.id && <ScenarioPanel initiative={init} />}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
