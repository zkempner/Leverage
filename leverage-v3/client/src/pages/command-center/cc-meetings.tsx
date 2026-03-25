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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, ChevronDown, ChevronUp, Users, Calendar, Loader2, Trash2, FileText, Upload, PenLine } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Meeting {
  id: number;
  engagement_id: number;
  title: string;
  meeting_date: string | null;
  meeting_type: string | null;
  attendees: string[] | null;
  input_type: string | null;
  content: string | null;
  file_name: string | null;
  ai_summary: string | null;
  key_takeaways: string[] | null;
  action_items: string[] | null;
  location: string | null;
  created_at: string;
}

const typeColors: Record<string, string> = {
  internal: "bg-blue-100 text-blue-800",
  client: "bg-emerald-100 text-emerald-800",
  steerco: "bg-purple-100 text-purple-800",
  interview: "bg-amber-100 text-amber-800",
};

function formatDate(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const emptyForm = { title: "", meeting_date: "", meeting_type: "", attendees: "", location: "", content: "", file_name: "", input_type: "transcript" as string };

export default function CCMeetingsPage({ engagementId }: { engagementId?: number }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [inputTab, setInputTab] = useState("paste");
  const base = `/api/cc/engagements/${engagementId}`;

  const { data: meetings, isLoading } = useQuery<Meeting[]>({
    queryKey: [base, "meetings"],
    queryFn: async () => { const r = await apiRequest("GET", `${base}/meetings`); return r.json(); },
    enabled: !!engagementId,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const r = await apiRequest("POST", `${base}/meetings`, payload);
      return r.json();
    },
    onSuccess: (data: Meeting) => {
      toast({ title: "Meeting created", description: data.ai_summary ? "AI summary generated" : `"${data.title}" saved` });
      queryClient.invalidateQueries({ queryKey: [base, "meetings"] });
      setDialogOpen(false);
      setForm(emptyForm);
      if (data.ai_summary) setExpandedId(data.id);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `${base}/meetings/${id}`); },
    onSuccess: () => {
      toast({ title: "Meeting deleted" });
      queryClient.invalidateQueries({ queryKey: [base, "meetings"] });
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    const attendeesArr = form.attendees.trim() ? form.attendees.split(",").map(s => s.trim()).filter(Boolean) : [];
    const inputType = inputTab === "paste" ? "transcript" : inputTab === "upload" ? "upload" : "manual";
    createMutation.mutate({
      title: form.title,
      meeting_date: form.meeting_date || null,
      meeting_type: form.meeting_type || null,
      attendees: attendeesArr.length ? attendeesArr : null,
      location: form.location || null,
      content: form.content || null,
      file_name: inputTab === "upload" ? (form.file_name || null) : null,
      input_type: inputType,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="cc-meetings-page">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="cc-meetings-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-am-navy">Meetings</h1>
          <p className="text-sm text-muted-foreground mt-1">Meeting notes, transcripts, and AI-generated summaries</p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setInputTab("paste"); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add Meeting
        </Button>
      </div>

      {(!meetings || meetings.length === 0) ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No meetings yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Add your first meeting notes or transcript</p>
            <Button onClick={() => { setForm(emptyForm); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" /> Add Meeting</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {meetings.map(m => {
            const isExpanded = expandedId === m.id;
            return (
              <Card key={m.id} className="hover:border-am-gold/50 transition-all">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : m.id)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold truncate">{m.title}</h3>
                        {m.meeting_type && <Badge className={`text-[10px] ${typeColors[m.meeting_type] || "bg-gray-100 text-gray-700"}`}>{m.meeting_type}</Badge>}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {m.meeting_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(m.meeting_date)}</span>}
                        {m.attendees && m.attendees.length > 0 && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{m.attendees.length} attendees</span>}
                      </div>
                      {!isExpanded && m.ai_summary && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{m.ai_summary}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${m.title}"?`)) deleteMutation.mutate(m.id); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      {m.ai_summary && (
                        <div>
                          <h4 className="text-sm font-semibold text-am-navy mb-1">AI Summary</h4>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{m.ai_summary}</p>
                        </div>
                      )}
                      {m.key_takeaways && m.key_takeaways.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-am-navy mb-1">Key Takeaways</h4>
                          <ul className="list-disc list-inside space-y-1">
                            {m.key_takeaways.map((t, i) => <li key={i} className="text-sm text-muted-foreground">{t}</li>)}
                          </ul>
                        </div>
                      )}
                      {m.action_items && m.action_items.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-am-navy mb-1">Action Items</h4>
                          <ul className="list-disc list-inside space-y-1">
                            {m.action_items.map((a, i) => <li key={i} className="text-sm text-muted-foreground">{a}</li>)}
                          </ul>
                        </div>
                      )}
                      {!m.ai_summary && !m.key_takeaways?.length && !m.action_items?.length && m.content && (
                        <div>
                          <h4 className="text-sm font-semibold text-am-navy mb-1">Notes</h4>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{m.content}</p>
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
            <DialogTitle>Add Meeting</DialogTitle>
            <DialogDescription>Paste a transcript, upload a file, or write notes manually.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Weekly SteerCo" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.meeting_date} onChange={e => setForm(f => ({ ...f, meeting_date: e.target.value }))} />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.meeting_type} onValueChange={v => setForm(f => ({ ...f, meeting_type: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Internal</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                    <SelectItem value="steerco">SteerCo</SelectItem>
                    <SelectItem value="interview">Interview</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Attendees</Label>
                <Input value={form.attendees} onChange={e => setForm(f => ({ ...f, attendees: e.target.value }))} placeholder="John, Jane, Bob" />
              </div>
              <div>
                <Label>Location</Label>
                <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Zoom / Room 3A" />
              </div>
            </div>

            <Tabs value={inputTab} onValueChange={setInputTab}>
              <TabsList className="w-full">
                <TabsTrigger value="paste" className="flex-1"><FileText className="h-3 w-3 mr-1" />Paste</TabsTrigger>
                <TabsTrigger value="upload" className="flex-1"><Upload className="h-3 w-3 mr-1" />Upload</TabsTrigger>
                <TabsTrigger value="manual" className="flex-1"><PenLine className="h-3 w-3 mr-1" />Manual</TabsTrigger>
              </TabsList>
              <TabsContent value="paste">
                <Textarea rows={6} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} placeholder="Paste meeting transcript or notes here..." />
              </TabsContent>
              <TabsContent value="upload">
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground mb-2">Upload .txt, .docx, or .pdf</p>
                  <Input value={form.file_name} onChange={e => setForm(f => ({ ...f, file_name: e.target.value }))} placeholder="Enter file name (upload coming soon)" />
                </div>
              </TabsContent>
              <TabsContent value="manual">
                <Textarea rows={6} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} placeholder="Write your meeting notes..." />
              </TabsContent>
            </Tabs>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.title.trim() || createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Meeting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
