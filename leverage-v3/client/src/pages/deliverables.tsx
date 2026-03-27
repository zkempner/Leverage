import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Presentation, TableProperties, Download, Loader2,
  CheckCircle2, XCircle, Clock, Zap, RefreshCw, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Deliverable {
  id: number;
  engagement_id: number;
  deliverable_type: string;
  file_name: string;
  file_path: string;
  file_size_bytes: number | null;
  claude_model_version: string | null;
  generated_at: string;
}

interface GenerateResult {
  job_id: number;
  mode: string;
  type: string;
}

interface JobProgress {
  status: string;
  progress_pct: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Deliverable type config
// ---------------------------------------------------------------------------
const DELIVERABLE_CONFIG = {
  steerco_pptx: {
    label: "Steerco Deck",
    description: "8-slide PE steerco: situation, spend waterfall, initiative pipeline, Kraljic matrix, EBITDA bridge, 100-day roadmap, risks, next steps",
    icon: Presentation,
    ext: "pptx",
    color: "bg-blue-50 border-blue-200",
    iconColor: "text-blue-600",
    generateRoute: "steerco",
  },
  odd_memo_docx: {
    label: "ODD Memo",
    description: "Full procurement operational due diligence Word document: exec summary, methodology, spend findings, initiative pipeline, risk matrix, implementation roadmap",
    icon: FileText,
    ext: "docx",
    color: "bg-purple-50 border-purple-200",
    iconColor: "text-purple-600",
    generateRoute: "odd-memo",
  },
  excel_model: {
    label: "Excel Model",
    description: "Multi-tab workbook: Summary KPIs, Initiative Pipeline, Spend Analysis, Assumptions & Market Data",
    icon: TableProperties,
    ext: "xlsx",
    color: "bg-green-50 border-green-200",
    iconColor: "text-green-600",
    generateRoute: "excel",
  },
} as const;

type DeliverableType = keyof typeof DELIVERABLE_CONFIG;

// ---------------------------------------------------------------------------
// Job progress hook
// ---------------------------------------------------------------------------
function useJobProgress(jobId: number | null): JobProgress | null {
  const [progress, setProgress] = useState<JobProgress | null>(null);

  useEffect(() => {
    if (!jobId) return;
    setProgress({ status: "queued", progress_pct: 0, message: "Queued…" });
    const es = new EventSource(`/api/jobs/${jobId}/stream`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as JobProgress;
        setProgress(data);
        if (data.status === "complete" || data.status === "failed") {
          es.close();
        }
      } catch {}
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [jobId]);

  return progress;
}

// ---------------------------------------------------------------------------
// Active generation card
// ---------------------------------------------------------------------------
function ActiveGenCard({
  type,
  jobId,
  onDone,
}: {
  type: DeliverableType;
  jobId: number;
  onDone: () => void;
}) {
  const config = DELIVERABLE_CONFIG[type];
  const progress = useJobProgress(jobId);
  const Icon = config.icon;

  useEffect(() => {
    if (progress?.status === "complete" || progress?.status === "failed") {
      setTimeout(onDone, 1000);
    }
  }, [progress?.status, onDone]);

  const pct = progress?.progress_pct ?? 0;
  const isFailed = progress?.status === "failed";

  return (
    <div className={cn("border-2 rounded-xl p-4", isFailed ? "border-red-200 bg-red-50/30" : "border-primary/30 bg-primary/5")}>
      <div className="flex items-center gap-3 mb-3">
        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", isFailed ? "bg-red-100" : "bg-primary/10")}>
          <Icon className={cn("h-4 w-4", isFailed ? "text-red-500" : "text-primary")} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{config.label}</p>
          <p className="text-xs text-muted-foreground truncate">{progress?.message ?? "Starting…"}</p>
        </div>
        {isFailed && <XCircle className="h-5 w-5 text-red-500 shrink-0" />}
        {!isFailed && pct === 100 && <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />}
        {!isFailed && pct < 100 && <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />}
      </div>
      <Progress value={pct} className={cn("h-2", isFailed && "opacity-50")} />
      <p className="text-xs text-right mt-1 text-muted-foreground">{pct}%</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deliverable card (existing file)
// ---------------------------------------------------------------------------
function DeliverableCard({ deliverable }: { deliverable: Deliverable }) {
  const type = deliverable.deliverable_type as DeliverableType;
  const config = DELIVERABLE_CONFIG[type] ?? {
    label: deliverable.deliverable_type,
    icon: FileText,
    color: "bg-gray-50 border-gray-200",
    iconColor: "text-gray-500",
    ext: "bin",
  };
  const Icon = config.icon;

  const sizeStr = deliverable.file_size_bytes
    ? deliverable.file_size_bytes > 1_000_000
      ? `${(deliverable.file_size_bytes / 1_000_000).toFixed(1)} MB`
      : `${Math.round(deliverable.file_size_bytes / 1_000)} KB`
    : null;

  const generatedDate = new Date(deliverable.generated_at).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });

  return (
    <div className={cn("border rounded-xl p-4 flex items-center gap-4", config.color)}>
      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center bg-white/60 border shrink-0")}>
        <Icon className={cn("h-5 w-5", config.iconColor)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{deliverable.file_name}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-muted-foreground">{generatedDate}</span>
          {sizeStr && <span className="text-xs text-muted-foreground">· {sizeStr}</span>}
          {deliverable.claude_model_version && (
            <Badge variant="outline" className="text-xs h-4 px-1.5">
              <Zap className="h-2.5 w-2.5 mr-0.5" />{deliverable.claude_model_version.replace("claude-", "").replace("-20250514", "")}
            </Badge>
          )}
        </div>
      </div>
      <Button variant="outline" size="sm" asChild>
        <a href={`/api/deliverables/${deliverable.id}/download`} download={deliverable.file_name}>
          <Download className="h-4 w-4 mr-1.5" />Download
        </a>
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generate button card
// ---------------------------------------------------------------------------
function GenerateCard({
  type,
  onGenerate,
  generating,
}: {
  type: DeliverableType;
  onGenerate: (type: DeliverableType) => void;
  generating: boolean;
}) {
  const config = DELIVERABLE_CONFIG[type];
  const Icon = config.icon;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border", config.color)}>
            <Icon className={cn("h-5 w-5", config.iconColor)} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold">{config.label}</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{config.description}</p>
          </div>
        </div>
        <Button
          className="w-full mt-4"
          variant="outline"
          onClick={() => onGenerate(type)}
          disabled={generating}
        >
          {generating
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</>
            : <><Zap className="h-4 w-4 mr-2" />Generate {config.label}</>
          }
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
interface Props { engagementId: number }

export default function DeliverablesPage({ engagementId }: Props) {
  const queryClient = useQueryClient();
  const [activeJobs, setActiveJobs] = useState<Record<DeliverableType, number | null>>({
    steerco_pptx: null, odd_memo_docx: null, excel_model: null,
  });
  const [error, setError] = useState<string | null>(null);

  const { data: deliverables = [], isLoading } = useQuery<Deliverable[]>({
    queryKey: [`/api/engagements/${engagementId}/deliverables`],
    refetchInterval: Object.values(activeJobs).some(Boolean) ? 4000 : false,
  });

  const handleGenerate = async (type: DeliverableType) => {
    setError(null);
    const config = DELIVERABLE_CONFIG[type];
    try {
      const resp = await fetch(`/api/engagements/${engagementId}/generate/${config.generateRoute}`, {
        method: "POST",
      });
      if (!resp.ok) {
        const err = await resp.json();
        setError(err.error ?? "Generation failed");
        return;
      }
      const result = await resp.json() as GenerateResult;
      setActiveJobs((prev) => ({ ...prev, [type]: result.job_id }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Generation failed");
    }
  };

  const handleDone = (type: DeliverableType) => {
    setActiveJobs((prev) => ({ ...prev, [type]: null }));
    queryClient.invalidateQueries({ queryKey: [`/api/engagements/${engagementId}/deliverables`] });
  };

  // Group deliverables by type, newest first
  const byType: Record<string, Deliverable[]> = {};
  for (const d of [...deliverables].reverse()) {
    if (!byType[d.deliverable_type]) byType[d.deliverable_type] = [];
    byType[d.deliverable_type].push(d);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Deliverable Generation</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Claude authors all narrative. Python renders the files. One click to client-ready output.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Active jobs */}
      {Object.entries(activeJobs).some(([, v]) => v !== null) && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Generating</h2>
          {(Object.entries(activeJobs) as [DeliverableType, number | null][])
            .filter(([, jobId]) => jobId !== null)
            .map(([type, jobId]) => (
              <ActiveGenCard
                key={type}
                type={type}
                jobId={jobId!}
                onDone={() => handleDone(type)}
              />
            ))}
        </div>
      )}

      {/* Generate buttons */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Generate</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(Object.keys(DELIVERABLE_CONFIG) as DeliverableType[]).map((type) => (
            <GenerateCard
              key={type}
              type={type}
              onGenerate={handleGenerate}
              generating={activeJobs[type] !== null}
            />
          ))}
        </div>
      </div>

      {/* Previous deliverables */}
      {deliverables.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Generated Files ({deliverables.length})
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: [`/api/engagements/${engagementId}/deliverables`] })}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh
            </Button>
          </div>

          {/* Group by type */}
          {(Object.keys(DELIVERABLE_CONFIG) as DeliverableType[])
            .filter((type) => byType[type]?.length > 0)
            .map((type) => (
              <div key={type} className="mb-4">
                <h3 className="text-xs text-muted-foreground font-medium mb-2 pl-1">
                  {DELIVERABLE_CONFIG[type].label} ({byType[type].length})
                </h3>
                <div className="space-y-2">
                  {byType[type].map((d) => (
                    <DeliverableCard key={d.id} deliverable={d} />
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {!isLoading && deliverables.length === 0 && Object.values(activeJobs).every((v) => v === null) && (
        <div className="text-center py-14 text-muted-foreground">
          <Zap className="h-10 w-10 mx-auto mb-3 opacity-25" />
          <p className="font-medium text-sm">No files generated yet</p>
          <p className="text-xs mt-1">Click any Generate button above to create your first deliverable</p>
        </div>
      )}
    </div>
  );
}
