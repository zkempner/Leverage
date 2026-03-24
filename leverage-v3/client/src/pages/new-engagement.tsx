import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

const INDUSTRIES = [
  "chemicals", "manufacturing", "technology", "healthcare", "retail",
  "financial_services", "energy", "consumer_products", "industrial", "logistics",
];

const COMPANY_SIZES = [
  { value: "small", label: "Small (<$100M revenue)" },
  { value: "mid-market", label: "Mid-Market ($200M–$1B revenue)" },
  { value: "large", label: "Large (>$1B revenue)" },
];

const BUSINESS_TYPES = ["manufacturer", "distributor", "services", "retail", "mixed"];

const GEOGRAPHIES = [
  { value: "north_america", label: "North America" },
  { value: "western_europe", label: "Western Europe" },
  { value: "eastern_europe", label: "Eastern Europe" },
  { value: "asia_pacific", label: "Asia Pacific" },
  { value: "latin_america", label: "Latin America" },
  { value: "middle_east_africa", label: "Middle East & Africa" },
];

const MATURITY_LEVELS = [
  { value: "nascent", label: "Nascent" },
  { value: "developing", label: "Developing" },
  { value: "established", label: "Established" },
  { value: "advanced", label: "Advanced" },
  { value: "world_class", label: "World Class" },
];

const ENGAGEMENT_MODES = [
  { value: "pe_100_day", label: "PE 100-Day Plan" },
  { value: "operational_improvement", label: "Operational Improvement" },
];

export default function NewEngagementPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [form, setForm] = useState({
    name: "",
    portfolio_company: "",
    pe_sponsor: "",
    industry: "",
    company_size: "",
    business_type: "",
    location: "",
    start_date: "",
    engagement_mode: "pe_100_day",
    geography: "",
    annual_revenue: "",
    ebitda_margin_pct: "",
    procurement_maturity: "",
    discount_rate: "10",
    target_close_date: "",
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/engagements", {
        ...form,
        annual_revenue: form.annual_revenue ? Number(form.annual_revenue) : null,
        ebitda_margin_pct: form.ebitda_margin_pct ? Number(form.ebitda_margin_pct) : null,
        discount_rate: form.discount_rate ? Number(form.discount_rate) / 100 : 0.10,
        status: "active",
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Engagement created", description: `"${data.name}" is ready` });
      queryClient.invalidateQueries({ queryKey: ["/api/engagements"] });
      navigate(`/engagements/${data.id}`);
    },
    onError: (err: any) => {
      toast({ title: "Creation failed", description: err.message, variant: "destructive" });
    },
  });

  const set = (field: string, value: string) => setForm(p => ({ ...p, [field]: value }));
  const canSubmit = form.name.trim() && form.portfolio_company.trim();

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6" data-testid="new-engagement-page">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} data-testid="back-to-list-btn">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h1 className="text-xl font-bold text-am-navy">New Engagement</h1>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold">Engagement Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Engagement Name *</label>
              <Input
                value={form.name}
                onChange={e => set("name", e.target.value)}
                placeholder="e.g. Acme Manufacturing Procurement Assessment"
                data-testid="engagement-name-input"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Portfolio Company *</label>
              <Input
                value={form.portfolio_company}
                onChange={e => set("portfolio_company", e.target.value)}
                placeholder="e.g. Acme Manufacturing Co."
                data-testid="portfolio-company-input"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">PE Sponsor</label>
              <Input
                value={form.pe_sponsor}
                onChange={e => set("pe_sponsor", e.target.value)}
                placeholder="e.g. Summit Partners"
                data-testid="pe-sponsor-input"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Industry</label>
              <Select value={form.industry} onValueChange={v => set("industry", v)}>
                <SelectTrigger data-testid="industry-select">
                  <SelectValue placeholder="Select industry..." />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map(i => (
                    <SelectItem key={i} value={i}>{i.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Company Size</label>
              <Select value={form.company_size} onValueChange={v => set("company_size", v)}>
                <SelectTrigger data-testid="company-size-select">
                  <SelectValue placeholder="Select size..." />
                </SelectTrigger>
                <SelectContent>
                  {COMPANY_SIZES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Business Type</label>
              <Select value={form.business_type} onValueChange={v => set("business_type", v)}>
                <SelectTrigger data-testid="business-type-select">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPES.map(b => (
                    <SelectItem key={b} value={b}>{b.charAt(0).toUpperCase() + b.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Location</label>
              <Input
                value={form.location}
                onChange={e => set("location", e.target.value)}
                placeholder="e.g. Midwest US"
                data-testid="location-input"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Start Date</label>
              <Input
                type="date"
                value={form.start_date}
                onChange={e => set("start_date", e.target.value)}
                data-testid="start-date-input"
              />
            </div>
          </div>

          <div className="border-t pt-4 mt-2">
            <h3 className="text-sm font-semibold mb-3">V2 Engagement Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Engagement Mode</label>
                <Select value={form.engagement_mode} onValueChange={v => set("engagement_mode", v)}>
                  <SelectTrigger data-testid="engagement-mode-select">
                    <SelectValue placeholder="Select mode..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ENGAGEMENT_MODES.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Geography</label>
                <Select value={form.geography} onValueChange={v => set("geography", v)}>
                  <SelectTrigger data-testid="geography-select">
                    <SelectValue placeholder="Select geography..." />
                  </SelectTrigger>
                  <SelectContent>
                    {GEOGRAPHIES.map(g => (
                      <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Annual Revenue ($)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                  <Input
                    type="number"
                    value={form.annual_revenue}
                    onChange={e => set("annual_revenue", e.target.value)}
                    placeholder="500000000"
                    className="pl-6"
                    data-testid="annual-revenue-input"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">EBITDA Margin (%)</label>
                <div className="relative">
                  <Input
                    type="number"
                    value={form.ebitda_margin_pct}
                    onChange={e => set("ebitda_margin_pct", e.target.value)}
                    placeholder="15"
                    className="pr-8"
                    data-testid="ebitda-margin-input"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Procurement Maturity</label>
                <Select value={form.procurement_maturity} onValueChange={v => set("procurement_maturity", v)}>
                  <SelectTrigger data-testid="procurement-maturity-select">
                    <SelectValue placeholder="Select maturity..." />
                  </SelectTrigger>
                  <SelectContent>
                    {MATURITY_LEVELS.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Discount Rate (%)</label>
                <div className="relative">
                  <Input
                    type="number"
                    value={form.discount_rate}
                    onChange={e => set("discount_rate", e.target.value)}
                    placeholder="10"
                    className="pr-8"
                    data-testid="discount-rate-input"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
              </div>

              {form.engagement_mode === "pe_100_day" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Target Close Date</label>
                  <Input
                    type="date"
                    value={form.target_close_date}
                    onChange={e => set("target_close_date", e.target.value)}
                    data-testid="target-close-date-input"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!canSubmit || createMutation.isPending}
              data-testid="create-engagement-btn"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Create Engagement
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
