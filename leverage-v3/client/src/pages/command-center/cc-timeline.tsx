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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Trash2, Pencil, Milestone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MilestoneItem {
  id: number;
  title: string;
  description?: string;
  target_date: string;
  completed_date?: string;
  status: string;
  sort_order?: number;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  upcoming: "bg-blue-100 text-blue-800",
  in_progress: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  missed: "bg-red-100 text-red-800",
};

const DOT_COLORS: Record<string, string> = {
  upcoming: "bg-blue-500",
  in_progress: "bg-amber-500",
  completed: "bg-emerald-500",
  missed: "bg-red-500",
};

const STATUSES = ["upcoming", "in_progress", "completed", "missed"];

function formatDate(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const emptyForm = (): Partial<MilestoneItem> => ({
  title: "", description: "", target_date: "", completed_date: "", status: "upcoming", sort_order: undefined,
});

export default function CCTimelinePage({ engagementId }: { engagementId?: number }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<MilestoneItem>>(emptyForm());

  const base = `/api/cc/engagements/${engagementId}`;
  const qk = [base, "milestones"];

  const { data: milestones, isLoading } = useQuery<MilestoneItem[]>({
    queryKey: qk,
    queryFn: async () => { const r = await apiRequest("GET", `${base}/milestones`); return r.json(); },
    enabled: !!engagementId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<MilestoneItem>) => {
      if (editingId) {
        const r = await apiRequest("PATCH", `${base}/milestones/${editingId}`, data);
        return r.json();
      }
      const r = await apiRequest("POST", `${base}/milestones`, data);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk });
      setDialogOpen(false);
      toast({ title: editingId ? "Milestone updated" : "Milestone added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `${base}/milestones/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: qk }); toast({ title: "Milestone deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openAdd = () => { setEditingId(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (m: MilestoneItem) => { setEditingId(m.id); setForm({ ...m }); setDialogOpen(true); };
  const setField = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    saveMutation.mutate({
      title: form.title,
      description: form.description || undefined,
      target_date: form.target_date || undefined,
      completed_date: form.completed_date || undefined,
      status: form.status || "upcoming",
      sort_order: form.sort_order != null ? Number(form.sort_order) : undefined,
    });
  };

  if (!engagementId) return <div className="p-6 text-muted-foreground">No engagement selected</div>;
  if (isLoading) return <div className="space-y-4 p-6">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>;

  const all = [...(milestones || [])].sort((a, b) => {
    if (a.sort_order != null && b.sort_order != null) return a.sort_order - b.sort_order;
    if (a.sort_order != null) return -1;
    if (b.sort_order != null) return 1;
    return new Date(a.target_date).getTime() - new Date(b.target_date).getTime();
  });

  const stats = {
    upcoming: all.filter(m => m.status === "upcoming").length,
    in_progress: all.filter(m => m.status === "in_progress").length,
    completed: all.filter(m => m.status === "completed").length,
    missed: all.filter(m => m.status === "missed").length,
  };

  return (
    <div className="space-y-6" data-testid="cc-timeline-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-am-navy">Timeline</h1>
          <p className="text-sm text-muted-foreground mt-1">Engagement milestones and key dates</p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" /> Add Milestone</Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Upcoming</p><p className="text-xl font-bold text-blue-600">{stats.upcoming}</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">In Progress</p><p className="text-xl font-bold text-amber-600">{stats.in_progress}</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Completed</p><p className="text-xl font-bold text-emerald-600">{stats.completed}</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Missed</p><p className="text-xl font-bold text-red-600">{stats.missed}</p></CardContent></Card>
      </div>

      {all.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Milestone className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No milestones yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Add milestones to track your engagement timeline</p>
            <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" /> Add Milestone</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="relative ml-6">
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gray-200" />
          {all.map((milestone, idx) => (
            <div key={milestone.id} className="relative pl-8 pb-8 last:pb-0">
              <div className={`absolute left-0 top-1 w-3 h-3 rounded-full -translate-x-[5px] ring-4 ring-white ${DOT_COLORS[milestone.status] || DOT_COLORS.upcoming}`} />
              <Card className="hover:border-am-gold/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{milestone.title}</h3>
                        <Badge className={`text-[10px] ${STATUS_COLORS[milestone.status] || STATUS_COLORS.upcoming}`}>
                          {milestone.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      {milestone.description && (
                        <p className="text-sm text-muted-foreground mb-2">{milestone.description}</p>
                      )}
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>Target: {formatDate(milestone.target_date)}</span>
                        {milestone.completed_date && (
                          <span className="text-emerald-600">Completed: {formatDate(milestone.completed_date)}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 ml-2 shrink-0">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(milestone)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => { if (confirm("Delete this milestone?")) deleteMutation.mutate(milestone.id); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit Milestone" : "Add Milestone"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={form.title || ""} onChange={e => setField("title", e.target.value)} placeholder="Milestone title" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description || ""} onChange={e => setField("description", e.target.value)} placeholder="Optional description" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Target Date</Label>
                <Input type="date" value={form.target_date || ""} onChange={e => setField("target_date", e.target.value)} />
              </div>
              <div>
                <Label>Completed Date</Label>
                <Input type="date" value={form.completed_date || ""} onChange={e => setField("completed_date", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <Select value={form.status || "upcoming"} onValueChange={v => setField("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sort Order</Label>
                <Input type="number" value={form.sort_order ?? ""} onChange={e => setField("sort_order", e.target.value ? parseInt(e.target.value) : undefined)} placeholder="Optional" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.title?.trim() || saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editingId ? "Update" : "Add Milestone"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
