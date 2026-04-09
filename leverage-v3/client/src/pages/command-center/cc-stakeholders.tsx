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
import { Plus, Loader2, Trash2, Pencil, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Stakeholder {
  id: number;
  engagement_id: number;
  name: string;
  title: string | null;
  company: string | null;
  role_type: string;
  influence_level: string | null;
  support_level: string | null;
  relationship_owner: string | null;
  contact_info: string | null;
  notes: string | null;
  created_at: string;
}

const roleConfig: Record<string, { label: string; accent: string; border: string }> = {
  sponsor: { label: "Sponsors", accent: "bg-emerald-100 text-emerald-800", border: "border-l-emerald-500" },
  champion: { label: "Champions", accent: "bg-blue-100 text-blue-800", border: "border-l-blue-500" },
  influencer: { label: "Influencers", accent: "bg-amber-100 text-amber-800", border: "border-l-amber-500" },
  blocker: { label: "Blockers", accent: "bg-red-100 text-red-800", border: "border-l-red-500" },
  neutral: { label: "Neutral", accent: "bg-gray-100 text-gray-700", border: "border-l-gray-400" },
};

const influenceColors: Record<string, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-blue-100 text-blue-800",
};

const supportColors: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-red-100 text-red-800",
};

const roleOrder = ["sponsor", "champion", "influencer", "blocker", "neutral"];

const emptyForm = {
  name: "", title: "", company: "", role_type: "neutral",
  influence_level: "", support_level: "", relationship_owner: "",
  contact_info: "", notes: "",
};

export default function CCStakeholdersPage({ engagementId }: { engagementId?: number }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const base = `/api/cc/engagements/${engagementId}`;

  const { data: stakeholders, isLoading } = useQuery<Stakeholder[]>({
    queryKey: [base, "stakeholders"],
    queryFn: async () => { const r = await apiRequest("GET", `${base}/stakeholders`); return r.json(); },
    enabled: !!engagementId,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const r = await apiRequest("POST", `${base}/stakeholders`, payload);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Stakeholder added" });
      queryClient.invalidateQueries({ queryKey: [base, "stakeholders"] });
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: async ({ id, ...payload }: { id: number; [k: string]: unknown }) => {
      const r = await apiRequest("PATCH", `${base}/stakeholders/${id}`, payload);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Stakeholder updated" });
      queryClient.invalidateQueries({ queryKey: [base, "stakeholders"] });
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
    },
    onError: (err: any) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `${base}/stakeholders/${id}`); },
    onSuccess: () => {
      toast({ title: "Stakeholder removed" });
      queryClient.invalidateQueries({ queryKey: [base, "stakeholders"] });
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (s: Stakeholder) => {
    setForm({
      name: s.name,
      title: s.title || "",
      company: s.company || "",
      role_type: s.role_type,
      influence_level: s.influence_level || "",
      support_level: s.support_level || "",
      relationship_owner: s.relationship_owner || "",
      contact_info: s.contact_info || "",
      notes: s.notes || "",
    });
    setEditingId(s.id);
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    const payload: Record<string, unknown> = {
      name: form.name,
      title: form.title || null,
      company: form.company || null,
      role_type: form.role_type,
      influence_level: form.influence_level || null,
      support_level: form.support_level || null,
      relationship_owner: form.relationship_owner || null,
      contact_info: form.contact_info || null,
      notes: form.notes || null,
    };
    if (editingId) {
      patchMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isSaving = createMutation.isPending || patchMutation.isPending;

  const grouped = roleOrder.reduce<Record<string, Stakeholder[]>>((acc, role) => {
    const items = (stakeholders || []).filter(s => s.role_type === role);
    if (items.length > 0) acc[role] = items;
    return acc;
  }, {});

  // Influence x Support matrix counts
  const matrixCounts = { hh: 0, hm: 0, hl: 0, mh: 0, mm: 0, ml: 0, lh: 0, lm: 0, ll: 0 };
  (stakeholders || []).forEach(s => {
    const inf = s.influence_level || "medium";
    const sup = s.support_level || "medium";
    const key = `${inf[0]}${sup[0]}` as keyof typeof matrixCounts;
    if (key in matrixCounts) matrixCounts[key]++;
  });

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="cc-stakeholders-page">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="cc-stakeholders-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-am-navy">Stakeholders</h1>
          <p className="text-sm text-muted-foreground mt-1">Map key stakeholders and their influence</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Add Stakeholder
        </Button>
      </div>

      {(!stakeholders || stakeholders.length === 0) ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No stakeholders mapped yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Add stakeholders to track relationships and influence</p>
            <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Add Stakeholder</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Influence x Support Matrix */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-am-navy mb-3">Influence x Support Matrix</h3>
              <div className="grid grid-cols-4 gap-1 text-center text-xs max-w-xs">
                <div />
                <div className="font-medium text-muted-foreground py-1">High Sup.</div>
                <div className="font-medium text-muted-foreground py-1">Med Sup.</div>
                <div className="font-medium text-muted-foreground py-1">Low Sup.</div>
                <div className="font-medium text-muted-foreground py-1 text-right pr-2">High Inf.</div>
                <div className="bg-emerald-50 border rounded p-2 font-semibold">{matrixCounts.hh || "-"}</div>
                <div className="bg-amber-50 border rounded p-2 font-semibold">{matrixCounts.hm || "-"}</div>
                <div className="bg-red-50 border rounded p-2 font-semibold">{matrixCounts.hl || "-"}</div>
                <div className="font-medium text-muted-foreground py-1 text-right pr-2">Med Inf.</div>
                <div className="bg-blue-50 border rounded p-2 font-semibold">{matrixCounts.mh || "-"}</div>
                <div className="bg-gray-50 border rounded p-2 font-semibold">{matrixCounts.mm || "-"}</div>
                <div className="bg-orange-50 border rounded p-2 font-semibold">{matrixCounts.ml || "-"}</div>
                <div className="font-medium text-muted-foreground py-1 text-right pr-2">Low Inf.</div>
                <div className="bg-gray-50 border rounded p-2 font-semibold">{matrixCounts.lh || "-"}</div>
                <div className="bg-gray-50 border rounded p-2 font-semibold">{matrixCounts.lm || "-"}</div>
                <div className="bg-gray-50 border rounded p-2 font-semibold">{matrixCounts.ll || "-"}</div>
              </div>
            </CardContent>
          </Card>

          {/* Grouped stakeholder cards */}
          {Object.entries(grouped).map(([role, items]) => {
            const config = roleConfig[role] || roleConfig.neutral;
            return (
              <div key={role}>
                <div className="flex items-center gap-2 mb-3">
                  <Badge className={`text-xs ${config.accent}`}>{config.label}</Badge>
                  <span className="text-xs text-muted-foreground">{items.length} stakeholder{items.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map(s => (
                    <Card key={s.id} className={`border-l-4 ${config.border} hover:border-am-gold/50 transition-all`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold truncate">{s.name}</h4>
                            {(s.title || s.company) && (
                              <p className="text-xs text-muted-foreground truncate">
                                {[s.title, s.company].filter(Boolean).join(" at ")}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-am-navy" onClick={() => openEdit(s)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600" onClick={() => { if (confirm(`Remove "${s.name}"?`)) deleteMutation.mutate(s.id); }}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {s.influence_level && (
                            <Badge className={`text-[10px] ${influenceColors[s.influence_level] || "bg-gray-100 text-gray-700"}`}>
                              Influence: {s.influence_level}
                            </Badge>
                          )}
                          {s.support_level && (
                            <Badge className={`text-[10px] ${supportColors[s.support_level] || "bg-gray-100 text-gray-700"}`}>
                              Support: {s.support_level}
                            </Badge>
                          )}
                        </div>
                        {s.relationship_owner && (
                          <p className="text-xs text-muted-foreground">Owner: {s.relationship_owner}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Stakeholder" : "Add Stakeholder"}</DialogTitle>
            <DialogDescription>Map a stakeholder and their influence level.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Title</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="VP of Operations" />
              </div>
              <div>
                <Label>Company</Label>
                <Input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Acme Corp" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Role Type</Label>
                <Select value={form.role_type} onValueChange={v => setForm(f => ({ ...f, role_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sponsor">Sponsor</SelectItem>
                    <SelectItem value="champion">Champion</SelectItem>
                    <SelectItem value="influencer">Influencer</SelectItem>
                    <SelectItem value="blocker">Blocker</SelectItem>
                    <SelectItem value="neutral">Neutral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Influence Level</Label>
                <Select value={form.influence_level} onValueChange={v => setForm(f => ({ ...f, influence_level: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Support Level</Label>
                <Select value={form.support_level} onValueChange={v => setForm(f => ({ ...f, support_level: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Relationship Owner</Label>
                <Input value={form.relationship_owner} onChange={e => setForm(f => ({ ...f, relationship_owner: e.target.value }))} placeholder="Team member name" />
              </div>
              <div>
                <Label>Contact Info</Label>
                <Input value={form.contact_info} onChange={e => setForm(f => ({ ...f, contact_info: e.target.value }))} placeholder="Email or phone" />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional context..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.name.trim() || isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
