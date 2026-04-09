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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Copy, Save, Loader2, Trash2, ChevronDown, ChevronRight, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GeneratedEmail {
  id: number;
  email_type: string;
  tone: string;
  subject: string;
  body: string;
  recipients?: string;
  context?: string;
  created_at: string;
}

const EMAIL_TYPES = [
  "DRL Follow-up",
  "Status Update",
  "Meeting Recap",
  "Introduction",
  "Interview Scheduling",
  "Escalation",
  "Kickoff",
];

const TONES = ["Formal", "Professional", "Friendly"] as const;

const toneBadgeColors: Record<string, string> = {
  Formal: "bg-slate-100 text-slate-800",
  Professional: "bg-blue-100 text-blue-800",
  Friendly: "bg-emerald-100 text-emerald-800",
};

const typeBadgeColors: Record<string, string> = {
  "DRL Follow-up": "bg-purple-100 text-purple-800",
  "Status Update": "bg-blue-100 text-blue-800",
  "Meeting Recap": "bg-amber-100 text-amber-800",
  Introduction: "bg-emerald-100 text-emerald-800",
  "Interview Scheduling": "bg-cyan-100 text-cyan-800",
  Escalation: "bg-red-100 text-red-800",
  Kickoff: "bg-indigo-100 text-indigo-800",
};

function formatDate(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CCEmailsPage({ engagementId }: { engagementId?: number }) {
  const { toast } = useToast();
  const [emailType, setEmailType] = useState("");
  const [tone, setTone] = useState<string>("Professional");
  const [context, setContext] = useState("");
  const [recipients, setRecipients] = useState("");
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const base = `/api/cc/engagements/${engagementId}`;

  const { data: emails, isLoading } = useQuery<GeneratedEmail[]>({
    queryKey: [base, "emails"],
    queryFn: async () => { const r = await apiRequest("GET", `${base}/emails`); return r.json(); },
    enabled: !!engagementId,
  });

  const generateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await apiRequest("POST", `${base}/emails/generate`, payload);
      return r.json();
    },
    onSuccess: (data: any) => {
      setPreview({ subject: data.subject || "Generated Email", body: data.body || data.content || "" });
      toast({ title: "Email generated" });
    },
    onError: (e: any) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await apiRequest("POST", `${base}/emails`, payload);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [base, "emails"] });
      setPreview(null);
      setEmailType("");
      setContext("");
      setRecipients("");
      toast({ title: "Email saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `${base}/emails/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [base, "emails"] }); toast({ title: "Email deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleGenerate = () => {
    generateMutation.mutate({ email_type: emailType, tone, context, recipients });
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const handleSave = () => {
    if (!preview) return;
    saveMutation.mutate({
      email_type: emailType,
      tone,
      subject: preview.subject,
      body: preview.body,
      recipients,
      context,
    });
  };

  if (!engagementId) return <div className="p-6 text-muted-foreground">No engagement selected</div>;
  if (isLoading) return <div className="space-y-4 p-6">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>;

  return (
    <div className="space-y-6" data-testid="cc-emails-page">
      <div>
        <h1 className="text-2xl font-bold text-am-navy">Email Generator</h1>
        <p className="text-sm text-muted-foreground mt-1">AI-powered email drafting for engagement communications</p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-lg font-semibold text-am-navy">Generate Email</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Email Type</Label>
              <Select value={emailType} onValueChange={setEmailType}>
                <SelectTrigger><SelectValue placeholder="Select email type" /></SelectTrigger>
                <SelectContent>
                  {EMAIL_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tone</Label>
              <div className="flex gap-2 mt-1.5">
                {TONES.map(t => (
                  <Badge
                    key={t}
                    className={`cursor-pointer text-sm px-3 py-1 ${tone === t ? "bg-am-navy text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                    onClick={() => setTone(t)}
                  >
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <div>
            <Label>Context</Label>
            <Textarea
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="Describe the situation or key points to include..."
              rows={3}
            />
          </div>
          <div>
            <Label>Recipients</Label>
            <Input
              value={recipients}
              onChange={e => setRecipients(e.target.value)}
              placeholder="Comma-separated email addresses"
            />
          </div>
          <Button
            onClick={handleGenerate}
            disabled={!emailType || !context.trim() || generateMutation.isPending}
            className="bg-am-navy hover:bg-am-navy/90"
          >
            {generateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Generate Email
          </Button>
        </CardContent>
      </Card>

      {preview && (
        <Card className="border-am-gold/30">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-am-navy">Email Preview</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleCopy(`Subject: ${preview.subject}\n\n${preview.body}`)}>
                  <Copy className="h-4 w-4 mr-2" /> Copy to Clipboard
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save
                </Button>
              </div>
            </div>
            <div className="border rounded-lg p-4 bg-muted/20">
              <p className="text-sm font-semibold mb-2">Subject: {preview.subject}</p>
              <div className="border-t pt-3">
                <p className="text-sm whitespace-pre-wrap">{preview.body}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-semibold text-am-navy mb-3">Generated Emails</h2>
        {(!emails || emails.length === 0) ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Mail className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No saved emails yet. Generate and save your first email above.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {emails.map(email => (
              <Card key={email.id} className="hover:border-am-gold/30 transition-colors">
                <CardContent className="p-4">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedId(expandedId === email.id ? null : email.id)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {expandedId === email.id ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      <span className="font-medium truncate">{email.subject}</span>
                      <Badge className={`text-[10px] shrink-0 ${typeBadgeColors[email.email_type] || "bg-gray-100 text-gray-800"}`}>{email.email_type}</Badge>
                      <Badge className={`text-[10px] shrink-0 ${toneBadgeColors[email.tone] || "bg-gray-100 text-gray-800"}`}>{email.tone}</Badge>
                      <span className="text-xs text-muted-foreground shrink-0">{formatDate(email.created_at)}</span>
                    </div>
                    <div className="flex gap-1 ml-2" onClick={e => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleCopy(`Subject: ${email.subject}\n\n${email.body}`)}>
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => { if (confirm("Delete this email?")) deleteMutation.mutate(email.id); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {expandedId === email.id && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">{email.body}</p>
                      {email.recipients && <p className="text-xs text-muted-foreground mt-2">Recipients: {email.recipients}</p>}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
