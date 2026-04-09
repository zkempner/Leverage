/**
 * LEVERAGE v3 — Client Portal (P3-05)
 *
 * Read-only PE sponsor view. White-labeled per engagement branding.
 * URL: /portal/:engagementId
 *
 * Shows: KPI summary, initiative pipeline, savings tracker, alerts, market intel.
 * Hides: all edit controls, data import, admin functions.
 * No auth in this prototype — engagement ID acts as access token.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import {
  TrendingUp, DollarSign, AlertTriangle, BarChart3, CheckCircle2,
  ShieldAlert, ChevronDown, ChevronUp, Lock, Building2, Calendar,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Engagement {
  id: number; name: string; portfolio_company: string; pe_sponsor: string | null;
  industry: string | null; status: string; total_addressable_spend: number | null;
  discount_rate: number; report_color_primary: string | null;
  report_color_secondary: string | null; report_header_text: string | null;
  client_logo_url: string | null; start_date: string | null;
}

interface Initiative {
  id: number; name: string; phase: string | null; lever_type: string | null;
  target_amount: number | null; risk_adjusted_target: number | null;
  realized_amount: number | null; probability: number | null;
  confidence: string | null; status: string; is_at_risk: number;
}

interface Alert { id: number; alert_type: string; severity: string; title: string; message: string | null; created_at: string | null }
interface MarketPoint { series_id: string; series_name: string | null; category_tag: string | null; value: number | null; unit: string | null; yoy_change_pct: number | null; mom_change_pct: number | null }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmt(n: number) { return n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n.toFixed(0)}`; }

function phaseLabel(p: string | null) {
  return p === "quick_win" ? "Quick Win" : p === "medium_term" ? "Medium Term" : p === "long_term" ? "Long Term" : p ?? "—";
}

function severityConfig(s: string) {
  return s === "critical" ? "bg-red-100 text-red-800 border-red-200"
    : s === "high" ? "bg-orange-100 text-orange-800 border-orange-200"
    : s === "medium" ? "bg-yellow-100 text-yellow-800 border-yellow-200"
    : "bg-blue-100 text-blue-800 border-blue-200";
}

// ---------------------------------------------------------------------------
// Portal Layout — minimal, white-label
// ---------------------------------------------------------------------------
function PortalLayout({ eng, children }: { eng: Engagement; children: React.ReactNode }) {
  const primary = eng.report_color_primary ?? "#003366";
  const header = eng.report_header_text ?? `${eng.portfolio_company} — Procurement Dashboard`;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header bar */}
      <div style={{ backgroundColor: primary }} className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {eng.client_logo_url && (
            <img src={eng.client_logo_url} alt="logo" className="h-8 w-auto object-contain" />
          )}
          <span className="text-white font-semibold text-lg">{header}</span>
        </div>
        <div className="flex items-center gap-2 text-white/70 text-xs">
          <Lock className="h-3.5 w-3.5" />
          <span>Read-only · PE Sponsor View</span>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {children}
      </div>

      {/* Footer */}
      <div className="border-t mt-12 py-4 px-6 text-center text-xs text-muted-foreground">
        Powered by LEVERAGE v3 · A&M PEPI Procurement Practice · Confidential
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI row
// ---------------------------------------------------------------------------
function KpiRow({ pipeline, riskAdj, realized, atRisk }: { pipeline: number; riskAdj: number; realized: number; atRisk: number }) {
  const realizationPct = pipeline > 0 ? (realized / pipeline) * 100 : 0;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {[
        { label: "Gross Pipeline", value: fmt(pipeline), icon: BarChart3, color: "text-blue-600" },
        { label: "Risk-Adjusted", value: fmt(riskAdj), icon: TrendingUp, color: "text-purple-600" },
        { label: "Realized to Date", value: fmt(realized), icon: DollarSign, color: "text-emerald-600" },
        { label: "At-Risk Initiatives", value: String(atRisk), icon: AlertTriangle, color: atRisk > 0 ? "text-orange-500" : "text-muted-foreground" },
      ].map((k) => (
        <Card key={k.label}>
          <CardContent className="p-4">
            <k.icon className={cn("h-5 w-5 mb-2", k.color)} />
            <p className="text-2xl font-bold">{k.value}</p>
            <p className="text-xs text-muted-foreground">{k.label}</p>
            {k.label === "Realized to Date" && pipeline > 0 && (
              <div className="mt-2">
                <Progress value={realizationPct} className="h-1.5" />
                <p className="text-xs text-muted-foreground mt-0.5">{realizationPct.toFixed(1)}% of pipeline</p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Initiative table (read-only)
// ---------------------------------------------------------------------------
function InitiativeTable({ initiatives }: { initiatives: Initiative[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? initiatives : initiatives.slice(0, 10);

  const phaseColors: Record<string, string> = {
    quick_win: "bg-emerald-100 text-emerald-700 border-emerald-200",
    medium_term: "bg-blue-100 text-blue-700 border-blue-200",
    long_term: "bg-purple-100 text-purple-700 border-purple-200",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Savings Initiative Pipeline ({initiatives.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              {["Initiative", "Lever", "Phase", "Target", "Risk-Adj.", "Probability", "Status"].map((h) => (
                <th key={h} className="text-left py-2.5 px-4 text-xs font-semibold text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((i, idx) => (
              <tr key={i.id} className={cn("border-b", idx % 2 === 0 ? "bg-muted/10" : "", i.is_at_risk ? "bg-orange-50/30" : "")}>
                <td className="py-2.5 pl-4 pr-2">
                  <div className="flex items-center gap-1.5">
                    {i.is_at_risk === 1 && <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0" />}
                    <span className="text-sm truncate max-w-[220px]">{i.name}</span>
                  </div>
                </td>
                <td className="py-2.5 px-2 text-xs text-muted-foreground">{i.lever_type ?? "—"}</td>
                <td className="py-2.5 px-2">
                  <Badge className={cn("text-xs border", phaseColors[i.phase ?? ""] ?? "bg-gray-100 text-gray-600 border-gray-200")}>
                    {phaseLabel(i.phase)}
                  </Badge>
                </td>
                <td className="py-2.5 px-2 text-sm font-medium">{i.target_amount ? fmt(i.target_amount) : "—"}</td>
                <td className="py-2.5 px-2 text-sm">{i.risk_adjusted_target ? fmt(i.risk_adjusted_target) : "—"}</td>
                <td className="py-2.5 px-2 text-xs">{i.probability !== null ? `${Math.round(Number(i.probability) * 100)}%` : "—"}</td>
                <td className="py-2.5 px-2">
                  <span className={cn("text-xs capitalize", i.status === "realized" ? "text-emerald-600 font-medium" : "text-muted-foreground")}>
                    {i.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {initiatives.length > 10 && (
          <div className="p-3 text-center">
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto"
            >
              {showAll ? <><ChevronUp className="h-3.5 w-3.5" />Show less</> : <><ChevronDown className="h-3.5 w-3.5" />Show all {initiatives.length}</>}
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Alert panel (read-only, critical/high only)
// ---------------------------------------------------------------------------
function AlertPanel({ alerts }: { alerts: Alert[] }) {
  const critical = alerts.filter((a) => a.severity === "critical" || a.severity === "high");
  if (critical.length === 0) return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3 text-emerald-600">
        <CheckCircle2 className="h-5 w-5" />
        <span className="text-sm font-medium">No critical or high alerts</span>
      </CardContent>
    </Card>
  );

  return (
    <Card className="border-orange-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-orange-500" />
          Active Alerts ({critical.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {critical.map((a) => (
          <div key={a.id} className={cn("border rounded-lg p-3", severityConfig(a.severity))}>
            <p className="text-sm font-medium">{a.title}</p>
            {a.message && <p className="text-xs mt-1 opacity-80 line-clamp-2">{a.message}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Market intel strip
// ---------------------------------------------------------------------------
function MarketStrip({ market }: { market: MarketPoint[] }) {
  const relevant = market.filter((m) => m.value !== null && m.yoy_change_pct !== null).slice(0, 8);
  if (relevant.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Market Signals</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {relevant.map((m) => {
            const yoy = m.yoy_change_pct ?? 0;
            return (
              <div key={m.series_id} className="border rounded-lg p-3">
                <p className="text-xs text-muted-foreground truncate">{m.series_name ?? m.series_id}</p>
                <p className="text-lg font-bold mt-1">
                  {m.value !== null ? (m.unit?.includes("$/") ? `${m.value.toFixed(2)}` : m.value.toFixed(1)) : "—"}
                  <span className="text-xs text-muted-foreground ml-1">{m.unit}</span>
                </p>
                <span className={cn("text-xs font-medium", yoy >= 0 ? "text-emerald-600" : "text-red-500")}>
                  {yoy >= 0 ? "+" : ""}{yoy.toFixed(1)}% YoY
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Phase waterfall chart
// ---------------------------------------------------------------------------
function PhaseChart({ initiatives }: { initiatives: Initiative[] }) {
  const data = [
    { phase: "Quick Wins\n(0–90d)", value: Math.round(initiatives.filter((i) => i.phase === "quick_win").reduce((s, i) => s + (Number(i.risk_adjusted_target) || 0), 0) / 1000) },
    { phase: "Medium Term\n(90–180d)", value: Math.round(initiatives.filter((i) => i.phase === "medium_term").reduce((s, i) => s + (Number(i.risk_adjusted_target) || 0), 0) / 1000) },
    { phase: "Long Term\n(180d+)", value: Math.round(initiatives.filter((i) => i.phase === "long_term").reduce((s, i) => s + (Number(i.risk_adjusted_target) || 0), 0) / 1000) },
  ];
  const colors = ["#22c55e", "#0066CC", "#7c3aed"];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Risk-Adjusted Pipeline by Phase ($K)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 5, right: 10, bottom: 30, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="phase" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} unit="K" />
            <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}K`, "Risk-Adjusted"]} contentStyle={{ fontSize: 11 }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => <Cell key={i} fill={colors[i]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Portal Page
// ---------------------------------------------------------------------------
export default function PortalPage() {
  const [, params] = useRoute("/portal/:id");
  const engagementId = Number(params?.id ?? 0);

  const { data: eng, isLoading: engLoading } = useQuery<Engagement>({
    queryKey: [`/api/engagements/${engagementId}`],
    enabled: engagementId > 0,
  });

  const { data: initiatives = [] } = useQuery<Initiative[]>({
    queryKey: [`/api/engagements/${engagementId}/initiatives`],
    enabled: engagementId > 0,
  });

  const { data: alerts = [] } = useQuery<Alert[]>({
    queryKey: [`/api/engagements/${engagementId}/alerts`],
    queryFn: async () => {
      const r = await fetch(`/api/engagements/${engagementId}/alerts?unresolved=true`);
      return r.json();
    },
    enabled: engagementId > 0,
  });

  const { data: marketData } = useQuery<{ data: MarketPoint[] }>({
    queryKey: ["/api/market/cache"],
    staleTime: 300_000,
  });

  if (!engagementId) return <div className="p-8 text-center text-muted-foreground">Invalid portal URL</div>;
  if (engLoading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  if (!eng) return <div className="p-8 text-center text-muted-foreground">Engagement not found</div>;

  const pipeline = initiatives.reduce((s, i) => s + (Number(i.target_amount) || 0), 0);
  const riskAdj = initiatives.reduce((s, i) => s + (Number(i.risk_adjusted_target) || 0), 0);
  const realized = initiatives.reduce((s, i) => s + (Number(i.realized_amount) || 0), 0);
  const atRisk = initiatives.filter((i) => i.is_at_risk === 1).length;

  return (
    <PortalLayout eng={eng}>
      {/* Engagement meta */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4" />{eng.portfolio_company}</span>
        {eng.pe_sponsor && <span>· {eng.pe_sponsor}</span>}
        {eng.industry && <span>· {eng.industry}</span>}
        {eng.start_date && <span className="flex items-center gap-1.5 ml-auto"><Calendar className="h-4 w-4" />Started {eng.start_date}</span>}
      </div>

      <KpiRow pipeline={pipeline} riskAdj={riskAdj} realized={realized} atRisk={atRisk} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <PhaseChart initiatives={initiatives} />
        </div>
        <AlertPanel alerts={alerts} />
      </div>

      <InitiativeTable initiatives={[...initiatives].sort((a, b) => (Number(b.risk_adjusted_target) || 0) - (Number(a.risk_adjusted_target) || 0))} />

      {marketData?.data && <MarketStrip market={marketData.data} />}

      <p className="text-xs text-center text-muted-foreground pt-4">
        Last updated: {new Date().toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
      </p>
    </PortalLayout>
  );
}
