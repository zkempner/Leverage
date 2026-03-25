import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ChevronDown, ChevronUp, Loader2, Trash2, Scale, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Decision {
  id: number;
  engagement_id: number;
  title: string;
  description: string | null;
  decision_date: string | null;
  decided_by: string | null;
  rationale: string | null;
  impact: string | null;
  alternatives_considered: string | null;
  status: string;
  meeting_id: number | null;
  meeting_title: string | null;
  created_at: string;
}

interface Meeting {
  id: number;
  title: string;
}

const statusColors: Record<string, string> = {
  proposed: "bg-blue-100 text-blue-800",
  approved: "bg-emerald-100 text-emerald-800",
  reversed: "bg-red-100 text-red-800",
};

function formatDate(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const emptyForm = {
  title: "", description: "", decision_date: "", decided_by: "",
  rationale: "", impact: "", alternatives_considered: "", status: "proposed", meeting_id: "",
};

export default function CCDecisionsPage({ engagementId }: { engagementId?: number }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const base = `/api/cc/engagements/${engagementId}`;

  const { data: decisions, isLoading } = useQuery<Decision[]>({
    queryKey: [base, "decisions"],
    queryFn: async () => { const r = await apiRequest("GET", `${base}/decisions`); return r.json(); },
    enabled: !!engagementId,
  });

  const { data: meetings } = useQuery<Meeting[]>({
    queryKey: [base, "meetings"],
    queryFn: async () => { const r = await apiRequest("GET", `${base}/meetings`); return r.json(); },
    enabled: !!engagementId,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const r = await apiRequest("POST", `${base}/decisions`, payload);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Decision created" });
      queryClient.invalidateQueries({ queryKey: [base, "decisions"] });
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: async ({ id, ...payload }: { id: number; [k: string]: unknown }) => {
      const r = await apiRequest("PATCH", `${base}/decisions/${id}`, payload);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Decision updated" });
      queryClient.invalidateQueries({ queryKey: [base, "decisions"] });
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
    },
    onError: (err: any) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `${base}/decisions/${id}`); },
    onSuccess: () => {
      toast({ title: "Decision deleted" });
      queryClient.invalidateQueries({ queryKey: [base, "decisions"] });
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (d: Decision) => {
    setForm({
      title: d.title,
      description: d.description || "",
      decision_date: d.decision_date ? d.decision_date.slice(0, 10) : "",
      decided_by: d.decided_by || "",
      rationale: d.rationale || "",
      impact: d.impact || "",
      alternatives_considered: d.alternatives_considered || "",
      status: d.status,
      meeting_id: d.meeting_id ? String(d.meeting_id) : "",
    });
    setEditingId(d.id);
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    const payload: Record<string, unknown> = {
      title: form.title,
      description: form.description || null,
      decision_date: form.decision_date || null,
      decided_by: form.decided_by || null,
      rationale: form.rationale || null,
      impact: form.impact || null,
      alternatives_considered: form.alternatives_considered || null,
      status: form.status,
      meeting_id: form.meeting_id ? Number(form.meeting_id) : null,
    };
    if (editingId) {
      patchMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isSaving = createMutation.isPending || patchMutation.isPending;

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="cc-decisions-page">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="cc-decisions-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-am-navy">Decisions</h1>
          <p className="text-sm text-muted-foreground mt-1">Decision log for key engagement decisions</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Add Decision
        </Button>
      </div>

      {(!decisions || decisions.length === 0) ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Scale className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No decisions logged yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Record key decisions and their rationale</p>
            <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Add Decision</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {decisions.map(d => {
            const isExpanded = expandedId === d.id;
            return (
              <Card key={d.id} className="hover:border-am-gold/50 transition-all">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : d.id)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold truncate">{d.title}</h3>
                        <Badge className={`text-[10px] ${statusColors[d.status] || "bg-gray-100 text-gray-700"}`}>{d.status}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {d.decision_date && <span>{formatDate(d.decision_date)}</span>}
                        {d.decided_by && <span>by {d.decided_by}</span>}
                        {d.meeting_title && <span>Meeting: {d.meeting_title}</span>}
                      </div>
                      {!isExpanded && d.impact && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{d.impact}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-3">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-am-navy" onClick={(e) => { e.stopPropagation(); openEdit(d); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${d.title}"?`)) deleteMutation.mutate(d.id); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t space-y-3">
                      {d.description && (
                        <div>
                          <h4 className="text-sm font-semibold text-am-navy mb-1">Description</h4>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{d.description}</p>
                        </div>
                      )}
                      {d.rationale && (
                        <div>
                          <h4 className="text-sm font-semibold text-am-navy mb-1">Rationale</h4>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{d.rationale}</p>
                        </div>
                      )}
                      {d.alternatives_considered && (
                        <div>
                          <h4 className="text-sm font-semibold text-am-navy mb-1">Alternatives Considered</h4>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{d.alternatives_considered}</p>
                        </div>
                      )}
                      {d.impact && (
                        <div>
                          <h4 className="text-sm font-semibold text-am-navy mb-1">Impact</h4>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{d.impact}</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Decision" : "Add Decision"}</DialogTitle>
            <DialogDescription>Record a key decision and its rationale.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Decision title" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What was decided?" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Decision Date</Label>
                <Input type="date" value={form.decision_date} onChange={e => setForm(f => ({ ...f, decision_date: e.target.value }))} />
              </div>
              <div>
                <Label>Decided By</Label>
                <Input value={form.decided_by} onChange={e => setForm(f => ({ ...f, decided_by: e.target.value }))} placeholder="Person or group" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="proposed">Proposed</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="reversed">Reversed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Linked Meeting</Label>
                <Select value={form.meeting_id} onValueChange={v => setForm(f => ({ ...f, meeting_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {(meetings || []).map(m => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Rationale</Label>
              <Textarea rows={2} value={form.rationale} onChange={e => setForm(f => ({ ...f, rationale: e.target.value }))} placeholder="Why was this decision made?" />
            </div>
            <div>
              <Label>Impact</Label>
              <Textarea rows={2} value={form.impact} onChange={e => setForm(f => ({ ...f, impact: e.target.value }))} placeholder="Expected impact of this decision" />
            </div>
            <div>
              <Label>Alternatives Considered</Label>
              <Textarea rows={2} value={form.alternatives_considered} onChange={e => setForm(f => ({ ...f, alternatives_considered: e.target.value }))} placeholder="What other options were evaluated?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.title.trim() || isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
