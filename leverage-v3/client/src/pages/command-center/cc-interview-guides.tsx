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
import { Sparkles, Loader2, Trash2, Pencil, CheckCircle2, ChevronDown, ChevronRight, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface InterviewGuide {
  id: number;
  title: string;
  interviewee_name: string;
  interviewee_role?: string;
  workstream?: string;
  guide_content: string;
  status: string;
  additional_context?: string;
  created_at: string;
}

const WORKSTREAMS = [
  "Finance", "Operations", "IT/Technology", "HR/People", "Sales & Marketing",
  "Supply Chain", "Legal", "Procurement", "Strategy", "General",
];

const statusColors: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800",
  finalized: "bg-emerald-100 text-emerald-800",
};

function formatDate(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CCInterviewGuidesPage({ engagementId }: { engagementId?: number }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [form, setForm] = useState({ interviewee_name: "", interviewee_role: "", workstream: "", additional_context: "" });

  const base = `/api/cc/engagements/${engagementId}`;
  const qk = [base, "interview-guides"];

  const { data: guides, isLoading } = useQuery<InterviewGuide[]>({
    queryKey: qk,
    queryFn: async () => { const r = await apiRequest("GET", `${base}/interview-guides`); return r.json(); },
    enabled: !!engagementId,
  });

  const generateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await apiRequest("POST", `${base}/interview-guides`, { ...payload, generate: true });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk });
      setDialogOpen(false);
      setForm({ interviewee_name: "", interviewee_role: "", workstream: "", additional_context: "" });
      toast({ title: "Interview guide generated" });
    },
    onError: (e: any) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; [k: string]: any }) => {
      const r = await apiRequest("PATCH", `${base}/interview-guides/${id}`, data);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk });
      setEditingId(null);
      toast({ title: "Guide updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `${base}/interview-guides/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: qk }); toast({ title: "Guide deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleGenerate = () => {
    if (!form.interviewee_name.trim()) return;
    generateMutation.mutate({
      interviewee_name: form.interviewee_name,
      interviewee_role: form.interviewee_role || null,
      workstream: form.workstream || null,
      additional_context: form.additional_context || null,
    });
  };

  const startEdit = (guide: InterviewGuide) => {
    setEditingId(guide.id);
    setEditContent(guide.guide_content);
    setExpandedId(guide.id);
  };

  const saveEdit = (id: number) => {
    updateMutation.mutate({ id, guide_content: editContent });
  };

  const finalize = (id: number) => {
    updateMutation.mutate({ id, status: "finalized" });
  };

  if (!engagementId) return <div className="p-6 text-muted-foreground">No engagement selected</div>;
  if (isLoading) return <div className="space-y-4 p-6">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>;

  const all = guides || [];

  return (
    <div className="space-y-6" data-testid="cc-interview-guides-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-am-navy">Interview Guides</h1>
          <p className="text-sm text-muted-foreground mt-1">AI-generated interview guides for stakeholder conversations</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Sparkles className="h-4 w-4 mr-2" /> Generate Guide
        </Button>
      </div>

      {all.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No interview guides yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Generate your first AI-powered interview guide</p>
            <Button onClick={() => setDialogOpen(true)}>
              <Sparkles className="h-4 w-4 mr-2" /> Generate Guide
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {all.map(guide => (
            <Card key={guide.id} className="hover:border-am-gold/30 transition-colors">
              <CardContent className="p-4">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedId(expandedId === guide.id ? null : guide.id)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {expandedId === guide.id ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <div className="min-w-0">
                      <p className="font-medium truncate">{guide.title || `Guide for ${guide.interviewee_name}`}</p>
                      <p className="text-xs text-muted-foreground">{guide.interviewee_name}{guide.interviewee_role ? ` - ${guide.interviewee_role}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    {guide.workstream && <Badge variant="outline" className="text-[10px]">{guide.workstream}</Badge>}
                    <Badge className={`text-[10px] ${statusColors[guide.status] || statusColors.draft}`}>{guide.status}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(guide.created_at)}</span>
                  </div>
                </div>
                {expandedId === guide.id && (
                  <div className="mt-4 pt-4 border-t">
                    {editingId === guide.id ? (
                      <div className="space-y-3">
                        <Textarea
                          value={editContent}
                          onChange={e => setEditContent(e.target.value)}
                          rows={15}
                          className="font-mono text-sm"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => saveEdit(guide.id)} disabled={updateMutation.isPending}>
                            {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                            Save Changes
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="bg-muted/30 rounded-lg p-4 whitespace-pre-wrap text-sm">{guide.guide_content}</div>
                        <div className="flex gap-2 mt-3" onClick={e => e.stopPropagation()}>
                          <Button size="sm" variant="outline" onClick={() => startEdit(guide)}>
                            <Pencil className="h-3 w-3 mr-1" /> Edit
                          </Button>
                          {guide.status === "draft" && (
                            <Button size="sm" variant="outline" onClick={() => finalize(guide.id)}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Finalize
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => { if (confirm("Delete this guide?")) deleteMutation.mutate(guide.id); }}>
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
          <DialogHeader><DialogTitle>Generate Interview Guide</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Interviewee Name *</Label>
              <Input
                value={form.interviewee_name}
                onChange={e => setForm(f => ({ ...f, interviewee_name: e.target.value }))}
                placeholder="Full name"
              />
            </div>
            <div>
              <Label>Role / Title</Label>
              <Input
                value={form.interviewee_role}
                onChange={e => setForm(f => ({ ...f, interviewee_role: e.target.value }))}
                placeholder="e.g., CFO, VP of Operations"
              />
            </div>
            <div>
              <Label>Workstream</Label>
              <Select value={form.workstream} onValueChange={v => setForm(f => ({ ...f, workstream: v }))}>
                <SelectTrigger><SelectValue placeholder="Select workstream" /></SelectTrigger>
                <SelectContent>
                  {WORKSTREAMS.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Additional Context</Label>
              <Textarea
                value={form.additional_context}
                onChange={e => setForm(f => ({ ...f, additional_context: e.target.value }))}
                placeholder="Key topics, areas of focus, specific questions..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleGenerate} disabled={!form.interviewee_name.trim() || generateMutation.isPending} className="bg-am-navy hover:bg-am-navy/90">
              {generateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Generate with AI
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
