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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, CheckCircle2, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ActionItem {
  id: number;
  engagement_id: number;
  description: string;
  owner_name: string | null;
  due_date: string | null;
  priority: string | null;
  status: string;
  notes: string | null;
  meeting_id: number | null;
  meeting_title: string | null;
  created_at: string;
}

const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  in_progress: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-gray-100 text-gray-600",
};

const priorityColors: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-blue-100 text-blue-800",
};

const statusCycle = ["open", "in_progress", "completed", "cancelled"];

function formatDate(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === "completed" || status === "cancelled") return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

const emptyForm = { description: "", owner_name: "", due_date: "", priority: "", status: "open", notes: "" };

export default function CCActionItemsPage({ engagementId }: { engagementId?: number }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const base = `/api/cc/engagements/${engagementId}`;

  const { data: items, isLoading } = useQuery<ActionItem[]>({
    queryKey: [base, "action-items"],
    queryFn: async () => { const r = await apiRequest("GET", `${base}/action-items`); return r.json(); },
    enabled: !!engagementId,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const r = await apiRequest("POST", `${base}/action-items`, payload);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Action item created" });
      queryClient.invalidateQueries({ queryKey: [base, "action-items"] });
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: async ({ id, ...payload }: { id: number;[k: string]: unknown }) => {
      await apiRequest("PATCH", `${base}/action-items/${id}`, payload);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [base, "action-items"] }),
    onError: (err: any) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!form.description.trim()) return;
    createMutation.mutate({
      description: form.description,
      owner_name: form.owner_name || null,
      due_date: form.due_date || null,
      priority: form.priority || null,
      status: form.status,
      notes: form.notes || null,
    });
  };

  const cycleStatus = (item: ActionItem) => {
    const idx = statusCycle.indexOf(item.status);
    const next = statusCycle[(idx + 1) % statusCycle.length];
    patchMutation.mutate({ id: item.id, status: next });
  };

  const filtered = (items || []).filter(i => {
    if (statusFilter !== "all" && i.status !== statusFilter) return false;
    if (priorityFilter !== "all" && i.priority !== priorityFilter) return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="cc-action-items-page">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="cc-action-items-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-am-navy">Action Items</h1>
          <p className="text-sm text-muted-foreground mt-1">Track action items across all meetings</p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add Action Item
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        {(statusFilter !== "all" || priorityFilter !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setStatusFilter("all"); setPriorityFilter("all"); }}>Clear filters</Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardList className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-1">{items?.length ? "No matching items" : "No action items yet"}</h3>
            <p className="text-sm text-muted-foreground mb-4">Create action items to track follow-ups</p>
            {!items?.length && (
              <Button onClick={() => { setForm(emptyForm); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" /> Add Action Item</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[35%]">Description</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(item => (
                <TableRow key={item.id} className={isOverdue(item.due_date, item.status) ? "bg-red-50" : ""}>
                  <TableCell className="font-medium">{item.description}</TableCell>
                  <TableCell className="text-muted-foreground">{item.owner_name || "-"}</TableCell>
                  <TableCell className={`text-muted-foreground ${isOverdue(item.due_date, item.status) ? "text-red-600 font-medium" : ""}`}>
                    {formatDate(item.due_date) || "-"}
                  </TableCell>
                  <TableCell>
                    {item.priority && <Badge className={`text-[10px] ${priorityColors[item.priority] || "bg-gray-100 text-gray-700"}`}>{item.priority}</Badge>}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`text-[10px] cursor-pointer hover:opacity-80 ${statusColors[item.status] || statusColors.open}`}
                      onClick={() => cycleStatus(item)}
                    >
                      {item.status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{item.meeting_title || "Standalone"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Action Item</DialogTitle>
            <DialogDescription>Create a new action item to track.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Description *</Label>
              <Textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What needs to be done?" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Owner</Label>
                <Input value={form.owner_name} onChange={e => setForm(f => ({ ...f, owner_name: e.target.value }))} placeholder="Name" />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional context..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.description.trim() || createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
