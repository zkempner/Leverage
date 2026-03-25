import { useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Bell, ShieldAlert, TrendingDown, TrendingUp, FileText, AlertTriangle,
  CheckCircle2, Clock, X, RefreshCw, Loader2, ChevronDown, ChevronRight,
  Zap, Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface WatchlistAlert {
  id: number;
  engagement_id: number;
  alert_type: string;
  severity: string;
  title: string;
  message: string | null;
  related_entity_type: string | null;
  related_entity_id: number | null;
  is_acknowledged: number;
  is_resolved: number;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string | null;
}

interface AlertCounts {
  total: number;
  critical: number;
  high: number;
  unacknowledged: number;
}

interface JobProgress { status: string; progress_pct: number; message: string }

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SEVERITY_CONFIG = {
  critical: { label: "Critical", color: "bg-red-100 text-red-800 border-red-200", dot: "bg-red-500", row: "border-l-4 border-l-red-500" },
  high:     { label: "High",     color: "bg-orange-100 text-orange-800 border-orange-200", dot: "bg-orange-500", row: "border-l-4 border-l-orange-400" },
  medium:   { label: "Medium",   color: "bg-yellow-100 text-yellow-800 border-yellow-200", dot: "bg-yellow-500", row: "border-l-4 border-l-yellow-400" },
  low:      { label: "Low",      color: "bg-blue-100 text-blue-800 border-blue-200", dot: "bg-blue-400", row: "border-l-4 border-l-blue-300" },
} as const;

const TYPE_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  ofac_match:      { label: "OFAC Match",      icon: ShieldAlert,   color: "text-red-600" },
  supplier_distress: { label: "Supplier Risk", icon: TrendingDown,  color: "text-orange-600" },
  commodity_spike: { label: "Commodity",       icon: TrendingUp,    color: "text-amber-600" },
  contract_expiry: { label: "Contract Expiry", icon: FileText,      color: "text-purple-600" },
  savings_at_risk: { label: "Savings At Risk", icon: AlertTriangle, color: "text-orange-600" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 2) return "just now";
  if (diff < 60) return `${Math.round(diff)}m ago`;
  if (diff < 1440) return `${Math.round(diff / 60)}h ago`;
  return `${Math.round(diff / 1440)}d ago`;
}

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
// Alert card
// ---------------------------------------------------------------------------
function AlertCard({
  alert,
  onAcknowledge,
  onResolve,
}: {
  alert: WatchlistAlert;
  onAcknowledge: (id: number) => void;
  onResolve: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEVERITY_CONFIG[alert.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.low;
  const typeConf = TYPE_CONFIG[alert.alert_type] ?? { label: alert.alert_type, icon: Bell, color: "text-muted-foreground" };
  const TypeIcon = typeConf.icon;
  const isAcknowledged = alert.is_acknowledged === 1;

  return (
    <div className={cn(
      "bg-background border rounded-lg overflow-hidden transition-all",
      sev.row,
      isAcknowledged && "opacity-70",
    )}>
      {/* Header row */}
      <div
        className="flex items-start gap-3 p-4 cursor-pointer hover:bg-muted/20"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className={cn("h-2 w-2 rounded-full mt-1.5 shrink-0", sev.dot)} />
        <TypeIcon className={cn("h-4 w-4 mt-0.5 shrink-0", typeConf.color)} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={cn("text-sm font-medium", isAcknowledged && "line-through decoration-muted-foreground/50")}>
              {alert.title}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge className={cn("text-xs border", sev.color)}>
                {sev.label}
              </Badge>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {timeAgo(alert.created_at)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn("text-xs", typeConf.color)}>{typeConf.label}</span>
            {isAcknowledged && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />Acknowledged
              </span>
            )}
          </div>
        </div>

        {expanded
          ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        }
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t bg-muted/10">
          {alert.message && (
            <p className="text-xs text-muted-foreground leading-relaxed mt-3 mb-3">
              {alert.message}
            </p>
          )}
          <div className="flex items-center gap-2">
            {!isAcknowledged && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={(e) => { e.stopPropagation(); onAcknowledge(alert.id); }}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />Acknowledge
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50"
              onClick={(e) => { e.stopPropagation(); onResolve(alert.id); }}
            >
              <X className="h-3 w-3 mr-1" />Resolve
            </Button>
            {alert.acknowledged_at && (
              <span className="text-xs text-muted-foreground ml-auto">
                Ack'd {timeAgo(alert.acknowledged_at)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Type group section
// ---------------------------------------------------------------------------
function AlertTypeGroup({
  type,
  alerts,
  onAcknowledge,
  onResolve,
  onResolveAll,
}: {
  type: string;
  alerts: WatchlistAlert[];
  onAcknowledge: (id: number) => void;
  onResolve: (id: number) => void;
  onResolveAll: (type: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const conf = TYPE_CONFIG[type] ?? { label: type, icon: Bell, color: "text-muted-foreground" };
  const TypeIcon = conf.icon;
  const critCount = alerts.filter((a) => a.severity === "critical").length;
  const highCount = alerts.filter((a) => a.severity === "high").length;

  return (
    <div>
      <div
        className="flex items-center gap-2 mb-2 cursor-pointer group"
        onClick={() => setCollapsed((v) => !v)}
      >
        <TypeIcon className={cn("h-4 w-4 shrink-0", conf.color)} />
        <h3 className="text-sm font-semibold">{conf.label}</h3>
        <span className="text-xs text-muted-foreground">({alerts.length})</span>
        {critCount > 0 && (
          <Badge className="text-xs bg-red-100 text-red-700 border-red-200 ml-1">{critCount} critical</Badge>
        )}
        {highCount > 0 && (
          <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-200">{highCount} high</Badge>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => { e.stopPropagation(); onResolveAll(type); }}
        >
          Resolve all
        </Button>
        {collapsed
          ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        }
      </div>
      {!collapsed && (
        <div className="space-y-2 mb-4">
          {alerts.map((a) => (
            <AlertCard key={a.id} alert={a} onAcknowledge={onAcknowledge} onResolve={onResolve} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
interface Props { engagementId: number }

export default function AlertsPage({ engagementId }: Props) {
  const queryClient = useQueryClient();
  const [scanJobId, setScanJobId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "unacknowledged" | "critical">("all");
  const scanProgress = useJobProgress(scanJobId);

  const { data: alerts = [], isLoading } = useQuery<WatchlistAlert[]>({
    queryKey: [`/api/engagements/${engagementId}/alerts`, { unresolved: true }],
    queryFn: async () => {
      const r = await fetch(`/api/engagements/${engagementId}/alerts?unresolved=true`);
      return r.json();
    },
    refetchInterval: scanJobId ? 3000 : false,
  });

  const { data: counts } = useQuery<AlertCounts>({
    queryKey: [`/api/engagements/${engagementId}/alerts/counts`],
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (scanProgress?.status === "complete" || scanProgress?.status === "failed") {
      setTimeout(() => {
        setScanJobId(null);
        queryClient.invalidateQueries({ queryKey: [`/api/engagements/${engagementId}/alerts`] });
        queryClient.invalidateQueries({ queryKey: [`/api/engagements/${engagementId}/alerts/counts`] });
      }, 800);
    }
  }, [scanProgress?.status]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/engagements/${engagementId}/alerts`] });
    queryClient.invalidateQueries({ queryKey: [`/api/engagements/${engagementId}/alerts/counts`] });
  };

  const handleAcknowledge = async (id: number) => {
    await fetch(`/api/engagements/${engagementId}/alerts/${id}/acknowledge`, { method: "PATCH" });
    invalidate();
  };

  const handleResolve = async (id: number) => {
    await fetch(`/api/engagements/${engagementId}/alerts/${id}/resolve`, { method: "PATCH" });
    invalidate();
  };

  const handleResolveAll = async (alertType?: string) => {
    await fetch(`/api/engagements/${engagementId}/alerts/resolve-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alert_type: alertType }),
    });
    invalidate();
  };

  const handleScan = async () => {
    const resp = await fetch(`/api/engagements/${engagementId}/alerts/scan`, { method: "POST" });
    const d = await resp.json();
    setScanJobId(d.job_id);
  };

  // Filter
  const filtered = alerts.filter((a) => {
    if (filter === "unacknowledged") return a.is_acknowledged === 0;
    if (filter === "critical") return a.severity === "critical" || a.severity === "high";
    return true;
  });

  // Group by type, order: ofac_match → supplier_distress → contract_expiry → savings_at_risk → commodity_spike
  const TYPE_ORDER = ["ofac_match", "supplier_distress", "contract_expiry", "savings_at_risk", "commodity_spike"];
  const grouped: Record<string, WatchlistAlert[]> = {};
  for (const a of filtered) {
    if (!grouped[a.alert_type]) grouped[a.alert_type] = [];
    grouped[a.alert_type].push(a);
  }
  const orderedTypes = [
    ...TYPE_ORDER.filter((t) => grouped[t]?.length > 0),
    ...Object.keys(grouped).filter((t) => !TYPE_ORDER.includes(t)),
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Alert Center
            {(counts?.unacknowledged ?? 0) > 0 && (
              <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-red-500 text-white text-xs font-bold">
                {counts!.unacknowledged > 99 ? "99+" : counts!.unacknowledged}
              </span>
            )}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Contract expiry · OFAC/SAM flags · Commodity spikes · Savings pace
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleScan}
            disabled={Boolean(scanJobId)}
          >
            {scanJobId
              ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              : <Zap className="h-4 w-4 mr-1.5" />
            }
            Run Scan
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleResolveAll()}
            className="text-muted-foreground"
          >
            Resolve all
          </Button>
        </div>
      </div>

      {/* Scan progress */}
      {scanJobId && scanProgress && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-medium">Scanning for alerts…</span>
              <span className="text-xs text-muted-foreground ml-auto">{scanProgress.progress_pct}%</span>
            </div>
            <Progress value={scanProgress.progress_pct} className="h-1.5" />
            <p className="text-xs text-muted-foreground mt-1.5">{scanProgress.message}</p>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {counts && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total", value: counts.total, color: "" },
            { label: "Critical", value: counts.critical, color: counts.critical > 0 ? "text-red-600" : "" },
            { label: "High", value: counts.high, color: counts.high > 0 ? "text-orange-500" : "" },
            { label: "Unread", value: counts.unacknowledged, color: counts.unacknowledged > 0 ? "text-blue-600" : "" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4 text-center">
                <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b">
        {[
          { key: "all", label: `All (${alerts.length})` },
          { key: "unacknowledged", label: `Unread (${alerts.filter((a) => !a.is_acknowledged).length})` },
          { key: "critical", label: `Critical/High (${alerts.filter((a) => a.severity === "critical" || a.severity === "high").length})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as typeof filter)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              filter === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Alert groups */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />Loading alerts…
        </div>
      ) : orderedTypes.length > 0 ? (
        <div className="space-y-4">
          {orderedTypes.map((type) => (
            <AlertTypeGroup
              key={type}
              type={type}
              alerts={grouped[type]}
              onAcknowledge={handleAcknowledge}
              onResolve={handleResolve}
              onResolveAll={handleResolveAll}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-25" />
          <p className="font-medium text-sm">
            {filter !== "all" ? "No alerts match this filter" : "No active alerts"}
          </p>
          <p className="text-xs mt-1">
            {filter === "all" ? "Run a scan to check for commodity spikes and savings pace issues" : "Try the 'All' tab"}
          </p>
        </div>
      )}
    </div>
  );
}
