import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { ArrowLeft, Sparkles, Loader2, X } from "lucide-react";

const preAcqTypes = [
  { value: "ODD", label: "Operational DD" },
  { value: "Commercial_DD", label: "Commercial DD" },
  { value: "IT_DD", label: "IT DD" },
  { value: "HR_DD", label: "HR DD" },
  { value: "Software_Tech_DD", label: "Software & Tech DD" },
];

const postAcqTypes = [
  { value: "Rapid_Results", label: "Rapid Results" },
  { value: "CFO_Services", label: "CFO Services" },
  { value: "Commercial_Excellence", label: "Commercial Excellence" },
  { value: "Cost_Optimization", label: "Cost Optimization" },
  { value: "Merger_Integration", label: "Merger Integration" },
  { value: "Carve_Out", label: "Carve-Out" },
  { value: "Ops_Management", label: "Operations Management" },
  { value: "Supply_Chain", label: "Supply Chain & Procurement" },
  { value: "Interim_Mgmt", label: "Interim Management" },
  { value: "Tech_Services", label: "Technology Services" },
];

const standardWorkstreams = [
  "Commercial",
  "Operations",
  "IT",
  "HR / Human Capital",
  "Finance / CFO",
  "Supply Chain / Procurement",
  "Legal",
];

export default function CCNewEngagementPage({ engagementId }: { engagementId?: number }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [form, setForm] = useState({
    name: "",
    portfolio_company: "",
    pe_sponsor: "",
    industry: "",
    engagement_type: "",
    scope: "",
    workstreams: [] as string[],
    start_date: "",
    end_date: "",
    budget: "",
    fee_structure: "",
    ai_kickoff: true,
  });

  const [customWorkstream, setCustomWorkstream] = useState("");

  const set = (field: string, value: any) => setForm((prev) => ({ ...prev, [field]: value }));

  const toggleWorkstream = (ws: string) => {
    setForm((prev) => ({
      ...prev,
      workstreams: prev.workstreams.includes(ws)
        ? prev.workstreams.filter((w) => w !== ws)
        : [...prev.workstreams, ws],
    }));
  };

  const addCustomWorkstream = () => {
    const trimmed = customWorkstream.trim();
    if (trimmed && !form.workstreams.includes(trimmed)) {
      setForm((prev) => ({ ...prev, workstreams: [...prev.workstreams, trimmed] }));
      setCustomWorkstream("");
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: form.name,
        portfolio_company: form.portfolio_company,
        engagement_type: form.engagement_type,
        pe_sponsor: form.pe_sponsor || undefined,
        industry: form.industry || undefined,
        scope: form.scope || undefined,
        workstreams: form.workstreams.length > 0 ? form.workstreams : undefined,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        budget: form.budget ? parseFloat(form.budget) : undefined,
        fee_structure: form.fee_structure || undefined,
        ai_kickoff: form.ai_kickoff,
      };
      const res = await apiRequest("POST", "/api/cc/engagements", payload);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Engagement created", description: `"${data.name}" has been created successfully.` });
      queryClient.invalidateQueries({ queryKey: ["/api/cc/engagements"] });
      navigate(data.id ? `/command-center/${data.id}` : "/command-center");
    },
    onError: (err: any) => {
      toast({ title: "Creation failed", description: err.message, variant: "destructive" });
    },
  });

  const canSubmit = form.name.trim() && form.portfolio_company.trim() && form.engagement_type;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6" data-testid="cc-new-engagement-page">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/command-center")} data-testid="back-cc-btn">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-am-navy">New Engagement</h1>
          <p className="text-sm text-muted-foreground mt-1">Create a new PEPI engagement</p>
        </div>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Engagement Name *</label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g., Project Atlas ODD"
                className="mt-1"
                data-testid="input-name"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Portfolio Company *</label>
              <Input
                value={form.portfolio_company}
                onChange={(e) => set("portfolio_company", e.target.value)}
                placeholder="e.g., Acme Corp"
                className="mt-1"
                data-testid="input-portfolio-company"
              />
            </div>
            <div>
              <label className="text-sm font-medium">PE Sponsor</label>
              <Input
                value={form.pe_sponsor}
                onChange={(e) => set("pe_sponsor", e.target.value)}
                placeholder="e.g., Blackstone"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Industry</label>
              <Input
                value={form.industry}
                onChange={(e) => set("industry", e.target.value)}
                placeholder="e.g., Manufacturing"
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Engagement Type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Engagement Type *</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Pre-Acquisition</p>
            <div className="flex flex-wrap gap-2">
              {preAcqTypes.map((t) => (
                <Badge
                  key={t.value}
                  variant={form.engagement_type === t.value ? "default" : "outline"}
                  className={`cursor-pointer text-sm py-1.5 px-3 transition-colors ${
                    form.engagement_type === t.value
                      ? "bg-blue-600 hover:bg-blue-700 text-white"
                      : "hover:bg-blue-50 hover:border-blue-300"
                  }`}
                  onClick={() => set("engagement_type", t.value)}
                  data-testid={`type-${t.value}`}
                >
                  {t.label}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Post-Acquisition</p>
            <div className="flex flex-wrap gap-2">
              {postAcqTypes.map((t) => (
                <Badge
                  key={t.value}
                  variant={form.engagement_type === t.value ? "default" : "outline"}
                  className={`cursor-pointer text-sm py-1.5 px-3 transition-colors ${
                    form.engagement_type === t.value
                      ? "bg-purple-600 hover:bg-purple-700 text-white"
                      : "hover:bg-purple-50 hover:border-purple-300"
                  }`}
                  onClick={() => set("engagement_type", t.value)}
                  data-testid={`type-${t.value}`}
                >
                  {t.label}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scope & Workstreams */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scope & Workstreams</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Scope Description</label>
            <Textarea
              value={form.scope}
              onChange={(e) => set("scope", e.target.value)}
              placeholder="Describe the engagement scope, objectives, and key deliverables..."
              className="mt-1 min-h-[100px]"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Workstreams</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {standardWorkstreams.map((ws) => (
                <Badge
                  key={ws}
                  variant={form.workstreams.includes(ws) ? "default" : "outline"}
                  className={`cursor-pointer text-sm py-1.5 px-3 transition-colors ${
                    form.workstreams.includes(ws)
                      ? "bg-am-navy hover:bg-am-navy/90 text-white"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => toggleWorkstream(ws)}
                >
                  {ws}
                </Badge>
              ))}
              {form.workstreams
                .filter((ws) => !standardWorkstreams.includes(ws))
                .map((ws) => (
                  <Badge
                    key={ws}
                    className="bg-am-navy text-white text-sm py-1.5 px-3 cursor-pointer"
                    onClick={() => toggleWorkstream(ws)}
                  >
                    {ws} <X className="h-3 w-3 ml-1" />
                  </Badge>
                ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={customWorkstream}
                onChange={(e) => setCustomWorkstream(e.target.value)}
                placeholder="Add custom workstream..."
                className="max-w-xs"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomWorkstream())}
              />
              <Button variant="outline" size="sm" onClick={addCustomWorkstream} disabled={!customWorkstream.trim()}>
                Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline & Budget */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline & Budget</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium">Start Date</label>
              <Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">End Date</label>
              <Input type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Budget ($)</label>
              <Input
                type="number"
                value={form.budget}
                onChange={(e) => set("budget", e.target.value)}
                placeholder="e.g., 500000"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Fee Structure</label>
              <Select value={form.fee_structure} onValueChange={(v) => set("fee_structure", v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed Fee</SelectItem>
                  <SelectItem value="time_materials">Time & Materials</SelectItem>
                  <SelectItem value="success_fee">Success Fee</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Kickoff */}
      <Card className="border-am-gold/40">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-am-gold/10">
                <Sparkles className="h-5 w-5 text-am-gold" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-am-navy">AI-Powered Kickoff</h3>
                <p className="text-xs text-muted-foreground">
                  Auto-generate DRL templates, work plan phases, and interview guides based on engagement type
                </p>
              </div>
            </div>
            <Switch checked={form.ai_kickoff} onCheckedChange={(v) => set("ai_kickoff", v)} data-testid="ai-kickoff-toggle" />
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate("/command-center")}>
          Cancel
        </Button>
        <Button
          onClick={() => createMutation.mutate()}
          disabled={!canSubmit || createMutation.isPending}
          data-testid="create-engagement-btn"
        >
          {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create Engagement
        </Button>
      </div>
    </div>
  );
}
