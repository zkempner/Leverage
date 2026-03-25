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
import { Sparkles, Loader2, Trash2, Copy, Pencil, Send, ChevronDown, ChevronRight, FileBarChart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StatusReport {
  id: number;
  report_date: string;
  period_start: string;
  period_end: string;
  format: string;
  status: string;
  ai_generated_content: string;
  created_at: string;
}

const FORMATS = [
  { key: "bullet", label: "Bullet", desc: "Concise bullet-point summary" },
  { key: "structured", label: "Structured", desc: "Organized sections with headers" },
  { key: "metrics_narrative", label: "Metrics + Narrative", desc: "Data-driven with context" },
];

const statusColors: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800",
  sent: "bg-emerald-100 text-emerald-800",
};

const formatColors: Record<string, string> = {
  bullet: "bg-blue-100 text-blue-800",
  structured: "bg-purple-100 text-purple-800",
  metrics_narrative: "bg-indigo-100 text-indigo-800",
};

function formatDate(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export default function CCStatusReportsPage({ engagementId }: { engagementId?: number }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [form, setForm] = useState({ report_date: todayStr(), period_start: "", period_end: "", format: "structured" });

  const base = `/api/cc/engagements/${engagementId}`;
  const qk = [base, "status-reports"];

  const { data: reports, isLoading } = useQuery<StatusReport[]>({
    queryKey: qk,
    queryFn: async () => { const r = await apiRequest("GET", `${base}/status-reports`); return r.json(); },
    enabled: !!engagementId,
  });

  const generateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await apiRequest("POST", `${base}/status-reports/generate`, payload);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk });
      setDialogOpen(false);
      setForm({ report_date: todayStr(), period_start: "", period_end: "", format: "structured" });
      toast({ title: "Status report generated" });
    },
    onError: (e: any) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; [k: string]: any }) => {
      const r = await apiRequest("PATCH", `${base}/status-reports/${id}`, data);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk });
      setEditingId(null);
      toast({ title: "Report updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `${base}/status-reports/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: qk }); toast({ title: "Report deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleGenerate = () => {
    generateMutation.mutate({
      report_date: form.report_date,
      period_start: form.period_start || null,
      period_end: form.period_end || null,
      format: form.format,
    });
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const markAsSent = (id: number) => {
    updateMutation.mutate({ id, status: "sent" });
  };

  const startEdit = (report: StatusReport) => {
    setEditingId(report.id);
    setEditContent(report.ai_generated_content);
    setExpandedId(report.id);
  };

  const saveEdit = (id: number) => {
    updateMutation.mutate({ id, ai_generated_content: editContent });
  };

  if (!engagementId) return <div className="p-6 text-muted-foreground">No engagement selected</div>;
  if (isLoading) return <div className="space-y-4 p-6">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>;

  const all = reports || [];

  return (
    <div className="space-y-6" data-testid="cc-status-reports-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-am-navy">Status Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">AI-generated status reports for engagement stakeholders</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Sparkles className="h-4 w-4 mr-2" /> Generate Report
        </Button>
      </div>

      {all.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileBarChart className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No status reports yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Generate your first AI-powered status report</p>
            <Button onClick={() => setDialogOpen(true)}>
              <Sparkles className="h-4 w-4 mr-2" /> Generate Report
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {all.map(report => (
            <Card key={report.id} className="hover:border-am-gold/30 transition-colors">
              <CardContent className="p-4">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {expandedId === report.id ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <div className="min-w-0">
                      <p className="font-medium">Report - {formatDate(report.report_date)}</p>
                      <p className="text-xs text-muted-foreground">
                        Period: {formatDate(report.period_start)} - {formatDate(report.period_end)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    <Badge className={`text-[10px] ${formatColors[report.format] || "bg-gray-100 text-gray-800"}`}>
                      {report.format.replace(/_/g, " ")}
                    </Badge>
                    <Badge className={`text-[10px] ${statusColors[report.status] || statusColors.draft}`}>
                      {report.status}
                    </Badge>
                  </div>
                </div>
                {expandedId === report.id && (
                  <div className="mt-4 pt-4 border-t">
                    {editingId === report.id ? (
                      <div className="space-y-3">
                        <Textarea
                          value={editContent}
                          onChange={e => setEditContent(e.target.value)}
                          rows={15}
                          className="font-mono text-sm"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => saveEdit(report.id)} disabled={updateMutation.isPending}>
                            {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                            Save Changes
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="bg-muted/30 rounded-lg p-4 whitespace-pre-wrap text-sm">
                          {report.ai_generated_content}
                        </div>
                        <div className="flex gap-2 mt-3" onClick={e => e.stopPropagation()}>
                          <Button size="sm" variant="outline" onClick={() => handleCopy(report.ai_generated_content)}>
                            <Copy className="h-3 w-3 mr-1" /> Copy to Clipboard
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => startEdit(report)}>
                            <Pencil className="h-3 w-3 mr-1" /> Edit
                          </Button>
                          {report.status === "draft" && (
                            <Button size="sm" variant="outline" onClick={() => markAsSent(report.id)}>
                              <Send className="h-3 w-3 mr-1" /> Mark as Sent
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => { if (confirm("Delete this report?")) deleteMutation.mutate(report.id); }}>
                            <Trash2 className="h-3 w-3 mr-1" /> Delete
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generate Status Report</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Report Date</Label>
              <Input
                type="date"
                value={form.report_date}
                onChange={e => setForm(f => ({ ...f, report_date: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Period Start</Label>
                <Input
                  type="date"
                  value={form.period_start}
                  onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))}
                />
              </div>
              <div>
                <Label>Period End</Label>
                <Input
                  type="date"
                  value={form.period_end}
                  onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Format</Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {FORMATS.map(f => (
                  <div
                    key={f.key}
                    className={`border rounded-lg p-3 cursor-pointer transition-colors text-center ${
                      form.format === f.key
                        ? "border-am-navy bg-am-navy/5 ring-1 ring-am-navy"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => setForm(prev => ({ ...prev, format: f.key }))}
                  >
                    <p className="text-sm font-medium">{f.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleGenerate} disabled={!form.report_date || generateMutation.isPending} className="bg-am-navy hover:bg-am-navy/90">
              {generateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Generate with AI
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
