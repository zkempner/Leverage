import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2, ShieldAlert, AlertTriangle, ChevronDown, ChevronRight, Pencil, Gavel } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RifEntry {
  id: number;
  employee_id?: string;
  employee_name: string;
  title?: string;
  department?: string;
  business_unit?: string;
  country: string;
  location?: string;
  compensation?: number;
  severance_estimate?: number;
  benefits_cost?: number;
  status: string;
  notification_date?: string;
  last_day?: string;
  replacement_plan?: string;
  rehire_eligibility?: string;
  ai_legal_notes?: string;
  legal_review_flag?: boolean;
  union_flag?: boolean;
  notes?: string;
}

const STATUS_COLORS: Record<string, string> = {
  identified: "bg-gray-100 text-gray-800",
  under_review: "bg-blue-100 text-blue-800",
  approved: "bg-amber-100 text-amber-800",
  communicated: "bg-purple-100 text-purple-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
};
const STATUSES = Object.keys(STATUS_COLORS);

const emptyForm = (): Partial<RifEntry> => ({
  employee_id: "", employee_name: "", title: "", department: "", business_unit: "", country: "", location: "",
  compensation: undefined, severance_estimate: undefined, benefits_cost: undefined, status: "identified",
  notification_date: "", last_day: "", replacement_plan: "", rehire_eligibility: "", notes: "",
});

function fmtMoney(v?: number | null) { return v != null ? `$${v.toLocaleString()}` : "-"; }
function fmtDate(d?: string | null) { return d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-"; }

export default function CCRifPage({ engagementId }: { engagementId?: number }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<RifEntry>>(emptyForm());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [legalLoadingId, setLegalLoadingId] = useState<number | null>(null);

  const base = `/api/cc/engagements/${engagementId}`;
  const qk = [base, "rif"];

  const { data: entries, isLoading } = useQuery<RifEntry[]>({
    queryKey: qk,
    queryFn: async () => { const r = await apiRequest("GET", `${base}/rif`); return r.json(); },
    enabled: !!engagementId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<RifEntry>) => {
      if (editingId) { const r = await apiRequest("PATCH", `${base}/rif/${editingId}`, data); return r.json(); }
      const r = await apiRequest("POST", `${base}/rif`, data); return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: qk }); setDialogOpen(false); toast({ title: editingId ? "Entry updated" : "Entry added" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `${base}/rif/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: qk }); toast({ title: "Entry deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const runLegalCheck = async (entryId: number) => {
    setLegalLoadingId(entryId);
    try {
      await apiRequest("POST", `${base}/rif/${entryId}/legal-check`);
      queryClient.invalidateQueries({ queryKey: qk });
      toast({ title: "Legal check complete" });
    } catch (e: any) {
      toast({ title: "Legal check failed", description: e.message, variant: "destructive" });
    } finally { setLegalLoadingId(null); }
  };

  const openAdd = () => { setEditingId(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (entry: RifEntry) => { setEditingId(entry.id); setForm({ ...entry }); setDialogOpen(true); };
  const setField = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  if (!engagementId) return <div className="p-6 text-muted-foreground">No engagement selected</div>;
  if (isLoading) return <div className="space-y-4 p-6">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>;

  const all = entries || [];
  const totalHC = all.filter(e => e.status !== "cancelled").length;
  const totalComp = all.reduce((s, e) => s + (e.compensation || 0), 0);
  const totalSev = all.reduce((s, e) => s + (e.severance_estimate || 0), 0);

  return (
    <div className="space-y-6" data-testid="cc-rif-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-am-navy">RIF Tracker</h1>
          <p className="text-sm text-muted-foreground mt-1">Reduction in Force tracker with AI legal flags</p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" /> Add Entry</Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Total Headcount Affected</p><p className="text-2xl font-bold text-am-navy">{totalHC}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Total Comp Savings</p><p className="text-2xl font-bold text-emerald-600">{fmtMoney(totalComp)}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Total Severance</p><p className="text-2xl font-bold text-amber-600">{fmtMoney(totalSev)}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Employee ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Country</TableHead>
                <TableHead className="text-right">Comp</TableHead>
                <TableHead className="text-right">Severance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notify Date</TableHead>
                <TableHead>Last Day</TableHead>
                <TableHead className="w-8"></TableHead>
                <TableHead className="w-8"></TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {all.length === 0 && (
                <TableRow><TableCell colSpan={14} className="text-center py-8 text-muted-foreground">No RIF entries yet</TableCell></TableRow>
              )}
              {all.map(entry => (
                <>
                  <TableRow key={entry.id} className="cursor-pointer" onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}>
                    <TableCell>{expandedId === entry.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                    <TableCell className="text-xs">{entry.employee_id || "-"}</TableCell>
                    <TableCell className="font-medium">{entry.employee_name}</TableCell>
                    <TableCell className="text-sm">{entry.title || "-"}</TableCell>
                    <TableCell className="text-sm">{entry.department || "-"}</TableCell>
                    <TableCell className="text-sm">{entry.country || "-"}</TableCell>
                    <TableCell className="text-right text-sm">{fmtMoney(entry.compensation)}</TableCell>
                    <TableCell className="text-right text-sm">{fmtMoney(entry.severance_estimate)}</TableCell>
                    <TableCell><Badge className={`text-xs ${STATUS_COLORS[entry.status] || STATUS_COLORS.identified}`}>{entry.status.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell className="text-xs">{fmtDate(entry.notification_date)}</TableCell>
                    <TableCell className="text-xs">{fmtDate(entry.last_day)}</TableCell>
                    <TableCell>{entry.legal_review_flag && <ShieldAlert className="h-4 w-4 text-red-500" />}</TableCell>
                    <TableCell>{entry.union_flag && <AlertTriangle className="h-4 w-4 text-amber-500" />}</TableCell>
                    <TableCell>
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => runLegalCheck(entry.id)} disabled={legalLoadingId === entry.id}>
                          {legalLoadingId === entry.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gavel className="h-3 w-3" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(entry)}><Pencil className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => { if (confirm("Delete this entry?")) deleteMutation.mutate(entry.id); }}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedId === entry.id && (
                    <TableRow key={`${entry.id}-exp`}>
                      <TableCell colSpan={14} className="bg-muted/30 p-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div><span className="font-semibold">AI Legal Notes:</span><p className="mt-1 text-muted-foreground whitespace-pre-wrap">{entry.ai_legal_notes || "No legal check run yet"}</p></div>
                          <div><span className="font-semibold">Replacement Plan:</span><p className="mt-1 text-muted-foreground">{entry.replacement_plan || "-"}</p></div>
                          <div><span className="font-semibold">Rehire Eligibility:</span><p className="mt-1 text-muted-foreground">{entry.rehire_eligibility || "-"}</p></div>
                          <div><span className="font-semibold">Notes:</span><p className="mt-1 text-muted-foreground">{entry.notes || "-"}</p></div>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Edit RIF Entry" : "Add RIF Entry"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Employee ID</Label><Input value={form.employee_id || ""} onChange={e => setField("employee_id", e.target.value)} /></div>
            <div><Label>Employee Name *</Label><Input value={form.employee_name || ""} onChange={e => setField("employee_name", e.target.value)} /></div>
            <div><Label>Title</Label><Input value={form.title || ""} onChange={e => setField("title", e.target.value)} /></div>
            <div><Label>Department</Label><Input value={form.department || ""} onChange={e => setField("department", e.target.value)} /></div>
            <div><Label>Business Unit</Label><Input value={form.business_unit || ""} onChange={e => setField("business_unit", e.target.value)} /></div>
            <div><Label>Country *</Label><Input value={form.country || ""} onChange={e => setField("country", e.target.value)} /></div>
            <div><Label>Location</Label><Input value={form.location || ""} onChange={e => setField("location", e.target.value)} /></div>
            <div><Label>Status</Label>
              <Select value={form.status || "identified"} onValueChange={v => setField("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Compensation ($)</Label><Input type="number" value={form.compensation ?? ""} onChange={e => setField("compensation", e.target.value ? parseFloat(e.target.value) : undefined)} /></div>
            <div><Label>Severance Estimate ($)</Label><Input type="number" value={form.severance_estimate ?? ""} onChange={e => setField("severance_estimate", e.target.value ? parseFloat(e.target.value) : undefined)} /></div>
            <div><Label>Benefits Cost ($)</Label><Input type="number" value={form.benefits_cost ?? ""} onChange={e => setField("benefits_cost", e.target.value ? parseFloat(e.target.value) : undefined)} /></div>
            <div><Label>Notification Date</Label><Input type="date" value={form.notification_date || ""} onChange={e => setField("notification_date", e.target.value)} /></div>
            <div><Label>Last Day</Label><Input type="date" value={form.last_day || ""} onChange={e => setField("last_day", e.target.value)} /></div>
            <div><Label>Rehire Eligibility</Label><Input value={form.rehire_eligibility || ""} onChange={e => setField("rehire_eligibility", e.target.value)} /></div>
            <div className="col-span-2"><Label>Replacement Plan</Label><Textarea value={form.replacement_plan || ""} onChange={e => setField("replacement_plan", e.target.value)} rows={2} /></div>
            <div className="col-span-2"><Label>Notes</Label><Textarea value={form.notes || ""} onChange={e => setField("notes", e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={!form.employee_name || saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editingId ? "Update" : "Add Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
