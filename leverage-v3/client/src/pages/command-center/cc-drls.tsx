import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Pencil, Loader2, FileText, Flag, AlertTriangle } from "lucide-react";

interface DrlItem {
  id: number;
  document_name: string;
  category?: string;
  workstream?: string;
  status: string;
  priority?: string;
  owner?: string;
  source_contact?: string;
  source_email?: string;
  due_date?: string;
  materiality_flag?: boolean;
  follow_up_count?: number;
  notes?: string;
}

const categories = [
  "Financial", "Legal", "Tax", "HR", "IT", "Operations",
  "Commercial", "Environmental", "Insurance", "Real_Estate", "Corporate",
];

const statuses = ["requested", "received", "outstanding", "partial", "na"];
const priorities = ["critical", "high", "medium", "low"];

const statusColors: Record<string, string> = {
  requested: "bg-blue-100 text-blue-800",
  received: "bg-emerald-100 text-emerald-800",
  outstanding: "bg-red-100 text-red-800",
  partial: "bg-amber-100 text-amber-800",
  na: "bg-gray-100 text-gray-600",
};

const priorityColors: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-blue-100 text-blue-800",
  low: "bg-gray-100 text-gray-600",
};

const emptyForm = {
  document_name: "", category: "", workstream: "", status: "requested",
  priority: "medium", owner: "", source_contact: "", source_email: "",
  due_date: "", materiality_flag: false, notes: "",
};

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CCDrlsPage({ engagementId }: { engagementId?: number }) {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");

  const qk = ["/api/cc/engagements", engagementId, "drls"];

  const { data: drls = [], isLoading } = useQuery<DrlItem[]>({
    queryKey: qk,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/cc/engagements/${engagementId}/drls`);
      return res.json();
    },
    enabled: !!engagementId,
  });

  const addMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", `/api/cc/engagements/${engagementId}/drls`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "DRL item added" });
      queryClient.invalidateQueries({ queryKey: qk });
      setAddOpen(false);
      setForm({ ...emptyForm });
    },
    onError: (err: any) => toast({ title: "Failed to add DRL", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      const res = await apiRequest("PATCH", `/api/cc/engagements/${engagementId}/drls/${id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "DRL updated" });
      queryClient.invalidateQueries({ queryKey: qk });
      setEditOpen(false);
      setEditId(null);
    },
    onError: (err: any) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/cc/engagements/${engagementId}/drls/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "DRL item deleted" });
      queryClient.invalidateQueries({ queryKey: qk });
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const set = (field: string, value: any) => setForm((prev) => ({ ...prev, [field]: value }));

  const openAdd = () => { setForm({ ...emptyForm }); setAddOpen(true); };
  const openEdit = (item: DrlItem) => {
    setForm({
      document_name: item.document_name || "", category: item.category || "",
      workstream: item.workstream || "", status: item.status || "requested",
      priority: item.priority || "medium", owner: item.owner || "",
      source_contact: item.source_contact || "", source_email: item.source_email || "",
      due_date: item.due_date ? item.due_date.split("T")[0] : "",
      materiality_flag: item.materiality_flag || false, notes: item.notes || "",
    });
    setEditId(item.id);
    setEditOpen(true);
  };

  const handleSubmit = (isEdit: boolean) => {
    const payload: any = { ...form };
    if (payload.due_date === "") delete payload.due_date;
    if (!payload.category) delete payload.category;
    if (!payload.workstream) delete payload.workstream;
    if (!payload.owner) delete payload.owner;
    if (!payload.source_contact) delete payload.source_contact;
    if (!payload.source_email) delete payload.source_email;
    if (!payload.notes) delete payload.notes;
    if (isEdit && editId != null) {
      updateMutation.mutate({ id: editId, payload });
    } else {
      addMutation.mutate(payload);
    }
  };

  const handleInlineStatusUpdate = (item: DrlItem, newStatus: string) => {
    updateMutation.mutate({ id: item.id, payload: { status: newStatus } });
  };

  // Filter
  const filtered = (drls || []).filter((d) => {
    if (filterCategory !== "all" && d.category !== filterCategory) return false;
    if (filterStatus !== "all" && d.status !== filterStatus) return false;
    if (filterPriority !== "all" && d.priority !== filterPriority) return false;
    return true;
  });

  // Summary counts
  const total = (drls || []).length;
  const received = (drls || []).filter((d) => d.status === "received").length;
  const outstanding = (drls || []).filter((d) => d.status === "outstanding").length;
  const overdue = (drls || []).filter((d) => {
    if (!d.due_date || d.status === "received" || d.status === "na") return false;
    return new Date(d.due_date) < new Date();
  }).length;

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="cc-drls-page">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-16" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const formDialog = (isEdit: boolean, open: boolean, onOpenChange: (o: boolean) => void) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit DRL Item" : "Add DRL Item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Document Name *</label>
            <Input value={form.document_name} onChange={(e) => set("document_name", e.target.value)} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Category</label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Workstream</label>
              <Input value={form.workstream} onChange={(e) => set("workstream", e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Status</label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Priority</label>
              <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {priorities.map((p) => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Owner</label>
              <Input value={form.owner} onChange={(e) => set("owner", e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Source Contact</label>
              <Input value={form.source_contact} onChange={(e) => set("source_contact", e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Source Email</label>
              <Input value={form.source_email} onChange={(e) => set("source_email", e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Due Date</label>
              <Input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} className="mt-1" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.materiality_flag}
              onChange={(e) => set("materiality_flag", e.target.checked)}
              className="rounded border-gray-300"
            />
            <label className="text-sm font-medium">Materiality Flag</label>
          </div>
          <div>
            <label className="text-sm font-medium">Notes</label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className="mt-1" rows={3} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={() => handleSubmit(isEdit)}
              disabled={!form.document_name.trim() || (isEdit ? updateMutation.isPending : addMutation.isPending)}
            >
              {(isEdit ? updateMutation.isPending : addMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? "Save Changes" : "Add Item"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-6" data-testid="cc-drls-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-am-navy">Document Request List</h1>
          <p className="text-sm text-muted-foreground mt-1">Track and manage document requests</p>
        </div>
        <Button onClick={openAdd} data-testid="add-drl-btn">
          <Plus className="h-4 w-4 mr-2" /> Add DRL Item
        </Button>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Total</p>
            <p className="text-xl font-bold text-am-navy">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Received</p>
            <p className="text-xl font-bold text-emerald-600">{received}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Outstanding</p>
            <p className="text-xl font-bold text-red-600">{outstanding}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Overdue</p>
            <p className="text-xl font-bold text-red-600">{overdue}</p>
            {overdue > 0 && <AlertTriangle className="h-4 w-4 text-red-500 mx-auto mt-1" />}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {statuses.map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            {priorities.map((p) => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No DRL items found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {total > 0 ? "Try adjusting your filters" : "Add your first document request"}
            </p>
            {total === 0 && (
              <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" /> Add DRL Item</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="w-20">Follow-ups</TableHead>
                    <TableHead className="w-16">Material</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item, idx) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-muted-foreground font-mono text-xs">{idx + 1}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">{item.document_name}</TableCell>
                      <TableCell className="text-sm">{(item.category || "-").replace(/_/g, " ")}</TableCell>
                      <TableCell>
                        <Select
                          value={item.status}
                          onValueChange={(v) => handleInlineStatusUpdate(item, v)}
                        >
                          <SelectTrigger className="h-7 w-28 border-0 p-0">
                            <Badge className={`text-xs ${statusColors[item.status] || statusColors.requested}`}>
                              {item.status}
                            </Badge>
                          </SelectTrigger>
                          <SelectContent>
                            {statuses.map((s) => (
                              <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${priorityColors[item.priority || "medium"]}`}>
                          {item.priority || "medium"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{item.owner || "-"}</TableCell>
                      <TableCell className="text-sm">
                        {item.due_date ? (
                          <span className={new Date(item.due_date) < new Date() && item.status !== "received" && item.status !== "na" ? "text-red-600 font-medium" : ""}>
                            {formatDate(item.due_date)}
                          </span>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-center text-sm">{item.follow_up_count || 0}</TableCell>
                      <TableCell className="text-center">
                        {item.materiality_flag && <Flag className="h-4 w-4 text-am-gold mx-auto" />}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(item)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                            disabled={deleteMutation.isPending}
                            onClick={() => { if (confirm(`Delete "${item.document_name}"?`)) deleteMutation.mutate(item.id); }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {formDialog(false, addOpen, setAddOpen)}
      {formDialog(true, editOpen, setEditOpen)}
    </div>
  );
}
