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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, Trash2, Pencil, ChevronDown, ChevronUp, AlertTriangle, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RiskIssue {
  id: number;
  engagement_id: number;
  type: string;
  title: string;
  description: string | null;
  category: string | null;
  severity: string | null;
  likelihood: string | null;
  status: string;
  owner: string | null;
  mitigation_plan: string | null;
  due_date: string | null;
  notes: string | null;
  created_at: string;
}

const typeColors: Record<string, string> = {
  risk: "bg-purple-100 text-purple-800",
  issue: "bg-orange-100 text-orange-800",
};

const severityColors: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-blue-100 text-blue-800",
};

const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  mitigating: "bg-amber-100 text-amber-800",
  resolved: "bg-emerald-100 text-emerald-800",
  accepted: "bg-gray-100 text-gray-600",
};

const categories = ["operational", "financial", "legal", "technical", "people", "timeline"];

function formatDate(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const emptyForm = {
  type: "risk", title: "", description: "", category: "", severity: "",
  likelihood: "", status: "open", owner: "", mitigation_plan: "", due_date: "", notes: "",
};

export default function CCRisksIssuesPage({ engagementId }: { engagementId?: number }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [form, setForm] = useState(emptyForm);
  const base = `/api/cc/engagements/${engagementId}`;

  const { data: items, isLoading } = useQuery<RiskIssue[]>({
    queryKey: [base, "risks-issues", typeFilter],
    queryFn: async () => {
      const url = typeFilter === "all" ? `${base}/risks-issues` : `${base}/risks-issues?type=${typeFilter}`;
      const r = await apiRequest("GET", url);
      return r.json();
    },
    enabled: !!engagementId,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const r = await apiRequest("POST", `${base}/risks-issues`, payload);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Item created" });
      queryClient.invalidateQueries({ queryKey: [base, "risks-issues"] });
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: async ({ id, ...payload }: { id: number; [k: string]: unknown }) => {
      const r = await apiRequest("PATCH", `${base}/risks-issues/${id}`, payload);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Item updated" });
      queryClient.invalidateQueries({ queryKey: [base, "risks-issues"] });
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
    },
    onError: (err: any) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `${base}/risks-issues/${id}`); },
    onSuccess: () => {
      toast({ title: "Item deleted" });
      queryClient.invalidateQueries({ queryKey: [base, "risks-issues"] });
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const openCreate = (type: string) => {
    setForm({ ...emptyForm, type });
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (item: RiskIssue) => {
    setForm({
      type: item.type,
      title: item.title,
      description: item.description || "",
      category: item.category || "",
      severity: item.severity || "",
      likelihood: item.likelihood || "",
      status: item.status,
      owner: item.owner || "",
      mitigation_plan: item.mitigation_plan || "",
      due_date: item.due_date ? item.due_date.slice(0, 10) : "",
      notes: item.notes || "",
    });
    setEditingId(item.id);
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    const payload: Record<string, unknown> = {
      type: form.type,
      title: form.title,
      description: form.description || null,
      category: form.category || null,
      severity: form.severity || null,
      likelihood: form.likelihood || null,
      status: form.status,
      owner: form.owner || null,
      mitigation_plan: form.mitigation_plan || null,
      due_date: form.due_date || null,
      notes: form.notes || null,
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
      <div className="space-y-6" data-testid="cc-risks-issues-page">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="cc-risks-issues-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-am-navy">Risks & Issues</h1>
          <p className="text-sm text-muted-foreground mt-1">Track and mitigate risks and issues</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => openCreate("risk")}>
            <Plus className="h-4 w-4 mr-2" /> Add Risk
          </Button>
          <Button onClick={() => openCreate("issue")}>
            <Plus className="h-4 w-4 mr-2" /> Add Issue
          </Button>
        </div>
      </div>

      <Tabs value={typeFilter} onValueChange={setTypeFilter}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="risk">Risks</TabsTrigger>
          <TabsTrigger value="issue">Issues</TabsTrigger>
        </TabsList>
      </Tabs>

      {(!items || items.length === 0) ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldAlert className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No risks or issues logged</h3>
            <p className="text-sm text-muted-foreground mb-4">Start tracking risks and issues for this engagement</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => openCreate("risk")}><Plus className="h-4 w-4 mr-2" /> Add Risk</Button>
              <Button onClick={() => openCreate("issue")}><Plus className="h-4 w-4 mr-2" /> Add Issue</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Type</TableHead>
                <TableHead className="w-[25%]">Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Likelihood</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(item => {
                const isExpanded = expandedId === item.id;
                return (
                  <>
                    <TableRow key={item.id} className="cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : item.id)}>
                      <TableCell>
                        <Badge className={`text-[10px] ${typeColors[item.type] || "bg-gray-100 text-gray-700"}`}>{item.type}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1">
                          {item.severity === "critical" && <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />}
                          <span className="truncate">{item.title}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm capitalize">{item.category?.replace(/_/g, " ") || "-"}</TableCell>
                      <TableCell>
                        {item.severity && <Badge className={`text-[10px] ${severityColors[item.severity] || "bg-gray-100 text-gray-700"}`}>{item.severity}</Badge>}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm capitalize">{item.likelihood || "-"}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${statusColors[item.status] || statusColors.open}`}>{item.status}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{item.owner || "-"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDate(item.due_date) || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-am-navy" onClick={(e) => { e.stopPropagation(); openEdit(item); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${item.title}"?`)) deleteMutation.mutate(item.id); }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                          {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${item.id}-expanded`}>
                        <TableCell colSpan={9} className="bg-muted/30">
                          <div className="p-3 space-y-3">
                            {item.description && (
                              <div>
                                <h4 className="text-sm font-semibold text-am-navy mb-1">Description</h4>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.description}</p>
                              </div>
                            )}
                            {item.mitigation_plan && (
                              <div>
                                <h4 className="text-sm font-semibold text-am-navy mb-1">Mitigation Plan</h4>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.mitigation_plan}</p>
                              </div>
                            )}
                            {item.notes && (
                              <div>
                                <h4 className="text-sm font-semibold text-am-navy mb-1">Notes</h4>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.notes}</p>
                              </div>
                            )}
                            {!item.description && !item.mitigation_plan && !item.notes && (
                              <p className="text-sm text-muted-foreground italic">No additional details.</p>
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
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit" : "Add"} {form.type === "risk" ? "Risk" : "Issue"}</DialogTitle>
            <DialogDescription>Track and plan mitigation for {form.type === "risk" ? "risks" : "issues"}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="risk">Risk</SelectItem>
                    <SelectItem value="issue">Issue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Brief title" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the risk or issue in detail" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Likelihood</Label>
                <Select value={form.likelihood} onValueChange={v => setForm(f => ({ ...f, likelihood: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
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
                    <SelectItem value="mitigating">Mitigating</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Owner</Label>
                <Input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} placeholder="Responsible person" />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Mitigation Plan</Label>
              <Textarea rows={3} value={form.mitigation_plan} onChange={e => setForm(f => ({ ...f, mitigation_plan: e.target.value }))} placeholder="How will this be mitigated or resolved?" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional context..." />
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
