import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShieldAlert, ShieldCheck, AlertTriangle, AlertCircle, CheckCircle2,
  Loader2, RefreshCw, Newspaper, BarChart3, TrendingDown, TrendingUp,
  Minus, ExternalLink, Zap, Lock, Clock, FileSearch, ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface RiskProfile {
  id: number;
  supplier_name: string;
  sec_cik: string | null;
  altman_z_score: number | null;
  revenue_trend: string | null;
  leverage_ratio: number | null;
  financial_risk_level: string | null;
  news_sentiment_score: number | null;
  news_risk_flags: string | null;
  latest_news_headline: string | null;
  latest_news_url: string | null;
  article_confidence: string | null;
  ofac_match: number;
  sam_exclusion: number;
  overall_risk_score: number | null;
  risk_narrative: string | null;
  last_refreshed_at: string | null;
}

interface HHIRow {
  category: string;
  hhi: number;
  concentration: string;
}

interface JobProgress {
  status: string;
  progress_pct: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function riskColor(score: number | null): string {
  if (score === null) return "#94a3b8";
  if (score >= 70) return "#ef4444";
  if (score >= 45) return "#f97316";
  if (score >= 20) return "#eab308";
  return "#22c55e";
}

function riskLabel(score: number | null): string {
  if (score === null) return "Unknown";
  if (score >= 70) return "Critical";
  if (score >= 45) return "High";
  if (score >= 20) return "Medium";
  return "Low";
}

function riskBadgeClass(score: number | null): string {
  if (score === null) return "bg-gray-100 text-gray-600 border-gray-200";
  if (score >= 70) return "bg-red-100 text-red-700 border-red-200";
  if (score >= 45) return "bg-orange-100 text-orange-700 border-orange-200";
  if (score >= 20) return "bg-yellow-100 text-yellow-700 border-yellow-200";
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
}

function parseFlags(json: string | null): string[] {
  try { return JSON.parse(json ?? "[]"); } catch { return []; }
}

function sentimentIcon(score: number | null) {
  if (score === null) return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  if (score > 0.1) return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
  if (score < -0.1) return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 2) return "just now";
  if (diff < 60) return `${Math.round(diff)}m ago`;
  if (diff < 1440) return `${Math.round(diff / 60)}h ago`;
  return `${Math.round(diff / 1440)}d ago`;
}

// ---------------------------------------------------------------------------
// Job progress hook
// ---------------------------------------------------------------------------
function useJobProgress(jobId: number | null) {
  const [progress, setProgress] = useState<JobProgress | null>(null);
  useEffect(() => {
    if (!jobId) return;
    setProgress({ status: "queued", progress_pct: 0, message: "Queued…" });
    const es = new EventSource(`/api/jobs/${jobId}/stream`);
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data) as JobProgress;
        setProgress(d);
        if (d.status === "complete" || d.status === "failed") es.close();
      } catch {}
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [jobId]);
  return progress;
}

// ---------------------------------------------------------------------------
// Risk Matrix scatter chart
// ---------------------------------------------------------------------------
function RiskMatrix({ profiles }: { profiles: RiskProfile[] }) {
  const data = profiles
    .filter((p) => p.overall_risk_score !== null)
    .map((p) => ({
      x: Math.abs(p.news_sentiment_score ?? 0) * 100,
      y: p.overall_risk_score ?? 0,
      name: p.supplier_name,
      score: p.overall_risk_score ?? 0,
      ofac: p.ofac_match === 1,
      sam: p.sam_exclusion === 1,
    }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-background border rounded-lg shadow-lg p-3 text-xs max-w-[200px]">
        <p className="font-semibold truncate">{d.name}</p>
        <p className="text-muted-foreground">Risk score: <span className="font-medium" style={{ color: riskColor(d.score) }}>{d.score}</span></p>
        {d.ofac && <p className="text-red-600 font-medium">⚠ OFAC match</p>}
        {d.sam && <p className="text-orange-600 font-medium">⚠ SAM exclusion</p>}
      </div>
    );
  };

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
        No risk profiles yet — run a scan to populate
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          type="number" dataKey="x" domain={[0, 100]}
          label={{ value: "News Volatility", position: "bottom", offset: 0, fontSize: 11 }}
          tick={{ fontSize: 10 }}
        />
        <YAxis
          type="number" dataKey="y" domain={[0, 100]}
          label={{ value: "Risk Score", angle: -90, position: "insideLeft", fontSize: 11 }}
          tick={{ fontSize: 10 }}
        />
        <ReferenceLine y={45} stroke="#f97316" strokeDasharray="4 4" strokeWidth={1} />
        <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1} />
        <Tooltip content={<CustomTooltip />} />
        <Scatter data={data} name="Suppliers">
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={riskColor(entry.score)}
              opacity={0.85}
              r={entry.ofac || entry.sam ? 9 : 6}
            />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Supplier row in risk table
// ---------------------------------------------------------------------------
function SupplierRiskRow({
  profile,
  engagementId,
  onScanSingle,
}: {
  profile: RiskProfile;
  engagementId: number;
  onScanSingle: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const flags = parseFlags(profile.news_risk_flags);
  const isCritical = profile.ofac_match === 1 || profile.sam_exclusion === 1;

  return (
    <>
      <tr
        className={cn(
          "border-b hover:bg-muted/30 transition-colors cursor-pointer",
          isCritical && "bg-red-50/40",
        )}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="py-3 pl-4 pr-2">
          <div className="flex items-center gap-2">
            {isCritical && <ShieldAlert className="h-4 w-4 text-red-500 shrink-0" />}
            <span className="text-sm font-medium truncate max-w-[200px]">{profile.supplier_name}</span>
          </div>
        </td>
        <td className="py-3 px-2">
          <Badge className={cn("text-xs border", riskBadgeClass(profile.overall_risk_score))}>
            {profile.overall_risk_score !== null ? Math.round(profile.overall_risk_score) : "—"}
            {" "}{riskLabel(profile.overall_risk_score)}
          </Badge>
        </td>
        <td className="py-3 px-2 text-center">
          {profile.ofac_match === 1
            ? <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">⚠ MATCH</Badge>
            : <span className="text-xs text-muted-foreground">—</span>
          }
        </td>
        <td className="py-3 px-2 text-center">
          {profile.sam_exclusion === 1
            ? <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">EXCLUDED</Badge>
            : <span className="text-xs text-muted-foreground">—</span>
          }
        </td>
        <td className="py-3 px-2">
          <div className="flex items-center gap-1">
            {sentimentIcon(profile.news_sentiment_score)}
            <span className="text-xs">
              {profile.news_sentiment_score !== null
                ? `${profile.news_sentiment_score > 0 ? "+" : ""}${profile.news_sentiment_score.toFixed(2)}`
                : "—"}
            </span>
          </div>
        </td>
        <td className="py-3 px-2">
          {profile.altman_z_score !== null ? (
            <span className={cn(
              "text-xs font-medium",
              profile.altman_z_score < 1.81 ? "text-red-600" :
              profile.altman_z_score < 2.99 ? "text-amber-600" : "text-emerald-600"
            )}>
              Z={profile.altman_z_score.toFixed(2)}
            </span>
          ) : <span className="text-xs text-muted-foreground">—</span>}
        </td>
        <td className="py-3 px-2">
          <span className={cn(
            "text-xs",
            profile.article_confidence === "high" ? "text-emerald-600" :
            profile.article_confidence === "medium" ? "text-amber-600" : "text-muted-foreground"
          )}>
            {profile.article_confidence ?? "—"}
          </span>
        </td>
        <td className="py-3 px-2 text-xs text-muted-foreground">
          {timeAgo(profile.last_refreshed_at)}
        </td>
        <td className="py-3 pr-4 pl-2">
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-muted/20 border-b">
          <td colSpan={9} className="px-4 py-3">
            <div className="space-y-2.5 text-xs">
              {/* Risk narrative */}
              {profile.risk_narrative && (
                <p className="text-muted-foreground leading-relaxed">{profile.risk_narrative}</p>
              )}

              {/* Latest news */}
              {profile.latest_news_headline && (
                <div className="flex items-start gap-2">
                  <Newspaper className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium">Latest: </span>
                    {profile.latest_news_url
                      ? <a href={profile.latest_news_url} target="_blank" rel="noopener noreferrer"
                           className="text-blue-600 hover:underline inline-flex items-center gap-1"
                           onClick={(e) => e.stopPropagation()}>
                          {profile.latest_news_headline}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      : <span>{profile.latest_news_headline}</span>
                    }
                  </div>
                </div>
              )}

              {/* Risk flags */}
              {flags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {flags.map((f) => (
                    <Badge key={f} variant="outline" className="text-xs text-red-600 border-red-200">
                      {f.replace(/_/g, " ")}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={(e) => { e.stopPropagation(); onScanSingle(profile.supplier_name); }}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />Re-scan news
                </Button>
                {profile.sec_cik && (
                  <a
                    href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${profile.sec_cik}&type=10-K`}
                    target="_blank" rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button variant="ghost" size="sm" className="h-7 text-xs">
                      <FileSearch className="h-3 w-3 mr-1" />SEC EDGAR
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// HHI Table
// ---------------------------------------------------------------------------
function HHITable({ rows }: { rows: HHIRow[] }) {
  const concentrationConfig = {
    highly_concentrated: { label: "Highly Concentrated", color: "bg-red-100 text-red-700 border-red-200" },
    concentrated: { label: "Concentrated", color: "bg-amber-100 text-amber-700 border-amber-200" },
    competitive: { label: "Competitive", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  };

  return (
    <div className="space-y-2">
      {rows.slice(0, 8).map((row) => {
        const cfg = concentrationConfig[row.concentration as keyof typeof concentrationConfig]
          ?? { label: row.concentration, color: "bg-gray-100 text-gray-600 border-gray-200" };
        const barPct = Math.min(100, (row.hhi / 10000) * 100);
        return (
          <div key={row.category} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground truncate w-36 shrink-0">{row.category || "—"}</span>
            <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${barPct}%`,
                  backgroundColor: row.hhi > 5000 ? "#ef4444" : row.hhi > 2500 ? "#f97316" : "#22c55e",
                }}
              />
            </div>
            <span className="text-xs font-mono text-muted-foreground w-14 text-right shrink-0">
              {row.hhi.toLocaleString()}
            </span>
            <Badge className={cn("text-xs border w-28 justify-center shrink-0", cfg.color)}>
              {cfg.label}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
interface Props { engagementId: number }

export default function SupplierRiskPage({ engagementId }: Props) {
  const queryClient = useQueryClient();
  const [newsJobId, setNewsJobId] = useState<number | null>(null);
  const [sanctionsJobId, setSanctionsJobId] = useState<number | null>(null);
  const [singleScanSupplier, setSingleScanSupplier] = useState<string | null>(null);
  const [singleScanLoading, setSingleScanLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newsProgress = useJobProgress(newsJobId);
  const sanctionsProgress = useJobProgress(sanctionsJobId);

  const { data: profiles = [], isLoading } = useQuery<RiskProfile[]>({
    queryKey: [`/api/engagements/${engagementId}/supplier-risk`],
    refetchInterval: (newsJobId || sanctionsJobId) ? 3000 : false,
  });

  const { data: hhi = [] } = useQuery<HHIRow[]>({
    queryKey: [`/api/engagements/${engagementId}/supplier-risk/hhi`],
  });

  // Invalidate when jobs complete
  useEffect(() => {
    if (newsProgress?.status === "complete" || newsProgress?.status === "failed") {
      setTimeout(() => {
        setNewsJobId(null);
        queryClient.invalidateQueries({ queryKey: [`/api/engagements/${engagementId}/supplier-risk`] });
      }, 1000);
    }
  }, [newsProgress?.status]);

  useEffect(() => {
    if (sanctionsProgress?.status === "complete" || sanctionsProgress?.status === "failed") {
      setTimeout(() => {
        setSanctionsJobId(null);
        queryClient.invalidateQueries({ queryKey: [`/api/engagements/${engagementId}/supplier-risk`] });
      }, 1000);
    }
  }, [sanctionsProgress?.status]);

  const handleNewsScan = async () => {
    setError(null);
    const resp = await fetch(`/api/engagements/${engagementId}/supplier-risk/scan`, { method: "POST" });
    if (!resp.ok) { setError((await resp.json()).error); return; }
    const d = await resp.json();
    setNewsJobId(d.job_id);
  };

  const handleSanctionsScan = async () => {
    setError(null);
    const resp = await fetch(`/api/engagements/${engagementId}/supplier-risk/sanctions-scan`, { method: "POST" });
    if (!resp.ok) { setError((await resp.json()).error); return; }
    const d = await resp.json();
    setSanctionsJobId(d.job_id);
  };

  const handleSingleScan = async (supplierName: string) => {
    setSingleScanSupplier(supplierName);
    setSingleScanLoading(true);
    const resp = await fetch(`/api/engagements/${engagementId}/supplier-risk/scan/${encodeURIComponent(supplierName)}`, { method: "POST" });
    setSingleScanLoading(false);
    setSingleScanSupplier(null);
    if (resp.ok) queryClient.invalidateQueries({ queryKey: [`/api/engagements/${engagementId}/supplier-risk`] });
  };

  // Sort: critical/high first, then by score desc
  const sorted = [...profiles].sort((a, b) => {
    const aCrit = (a.ofac_match || a.sam_exclusion) ? 200 : 0;
    const bCrit = (b.ofac_match || b.sam_exclusion) ? 200 : 0;
    return (bCrit + (b.overall_risk_score ?? 0)) - (aCrit + (a.overall_risk_score ?? 0));
  });

  const ofacCount = profiles.filter((p) => p.ofac_match === 1).length;
  const samCount = profiles.filter((p) => p.sam_exclusion === 1).length;
  const highRiskCount = profiles.filter((p) => (p.overall_risk_score ?? 0) >= 45).length;
  const activeJob = newsJobId || sanctionsJobId;
  const activeProgress = newsJobId ? newsProgress : sanctionsProgress;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Supplier Risk Monitor</h1>
          <p className="text-muted-foreground text-sm mt-1">
            OFAC/SAM screening · News sentiment · Altman Z-score · Concentration risk
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleNewsScan}
            disabled={Boolean(activeJob)}
          >
            {newsJobId ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Newspaper className="h-4 w-4 mr-1.5" />}
            News Scan
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSanctionsScan}
            disabled={Boolean(activeJob)}
          >
            {sanctionsJobId ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ShieldAlert className="h-4 w-4 mr-1.5" />}
            OFAC/SAM Scan
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Active job progress */}
      {activeJob && activeProgress && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              <span className="text-sm font-medium">
                {newsJobId ? "News & sentiment scan" : "OFAC/SAM screening"} in progress
              </span>
              <span className="text-xs text-muted-foreground ml-auto">{activeProgress.progress_pct}%</span>
            </div>
            <Progress value={activeProgress.progress_pct} className="h-1.5" />
            <p className="text-xs text-muted-foreground mt-1.5">{activeProgress.message}</p>
          </CardContent>
        </Card>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Profiles", value: profiles.length, icon: BarChart3, color: "" },
          { label: "High/Critical", value: highRiskCount, icon: AlertTriangle, color: "text-orange-500" },
          { label: "OFAC Matches", value: ofacCount, icon: ShieldAlert, color: ofacCount > 0 ? "text-red-600" : "text-muted-foreground" },
          { label: "SAM Excluded", value: samCount, icon: Lock, color: samCount > 0 ? "text-red-600" : "text-muted-foreground" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={cn("h-5 w-5 shrink-0", s.color || "text-muted-foreground")} />
              <div>
                <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main content: matrix + HHI */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Risk Matrix</CardTitle>
            <p className="text-xs text-muted-foreground">
              X = news volatility · Y = composite risk score · Red line = high threshold
            </p>
          </CardHeader>
          <CardContent>
            <RiskMatrix profiles={profiles} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Category Concentration (HHI)</CardTitle>
            <p className="text-xs text-muted-foreground">
              HHI &gt;2500 = concentrated · HHI &gt;5000 = highly concentrated
            </p>
          </CardHeader>
          <CardContent>
            {hhi.length > 0
              ? <HHITable rows={hhi} />
              : <p className="text-xs text-muted-foreground py-4 text-center">Import spend data to compute HHI</p>
            }
          </CardContent>
        </Card>
      </div>

      {/* Supplier risk table */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
          <Loader2 className="h-4 w-4 animate-spin" />Loading profiles…
        </div>
      ) : sorted.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Supplier Risk Profiles ({sorted.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-2.5 pl-4 pr-2 text-xs font-semibold text-muted-foreground">Supplier</th>
                    <th className="text-left py-2.5 px-2 text-xs font-semibold text-muted-foreground">Risk</th>
                    <th className="text-center py-2.5 px-2 text-xs font-semibold text-muted-foreground">OFAC</th>
                    <th className="text-center py-2.5 px-2 text-xs font-semibold text-muted-foreground">SAM</th>
                    <th className="text-left py-2.5 px-2 text-xs font-semibold text-muted-foreground">Sentiment</th>
                    <th className="text-left py-2.5 px-2 text-xs font-semibold text-muted-foreground">Altman Z</th>
                    <th className="text-left py-2.5 px-2 text-xs font-semibold text-muted-foreground">Confidence</th>
                    <th className="text-left py-2.5 px-2 text-xs font-semibold text-muted-foreground">Updated</th>
                    <th className="py-2.5 pr-4 pl-2" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p) => (
                    <SupplierRiskRow
                      key={p.id}
                      profile={p}
                      engagementId={engagementId}
                      onScanSingle={handleSingleScan}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-25" />
          <p className="font-medium text-sm">No risk profiles yet</p>
          <p className="text-xs mt-1 mb-4">Run a news scan or OFAC/SAM screening to populate this dashboard</p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" onClick={handleNewsScan} disabled={Boolean(activeJob)}>
              <Newspaper className="h-4 w-4 mr-1.5" />Run News Scan
            </Button>
            <Button variant="outline" size="sm" onClick={handleSanctionsScan} disabled={Boolean(activeJob)}>
              <ShieldAlert className="h-4 w-4 mr-1.5" />Run OFAC/SAM Scan
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
