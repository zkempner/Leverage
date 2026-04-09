import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload, FileText, CheckCircle2, XCircle, Loader2, AlertTriangle,
  RefreshCw, Eye, ChevronDown, ChevronUp, RotateCcw, Clock,
  ShieldAlert, Zap, Calendar, DollarSign, CreditCard,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Extraction {
  id: number;
  engagement_id: number;
  contract_id: number | null;
  file_name: string;
  extraction_status: "pending" | "processing" | "complete" | "failed";
  supplier_name_extracted: string | null;
  contract_value_extracted: number | null;
  start_date_extracted: string | null;
  end_date_extracted: string | null;
  payment_terms_extracted: string | null;
  auto_renewal_extracted: number;
  escalation_clause_extracted: string | null;
  key_clauses_json: string | null;
  risk_flags_json: string | null;
  confidence_score: number | null;
  claude_summary: string | null;
  extracted_at: string | null;
}

interface UploadResult {
  extraction_id: number;
  job_id: number;
  file_name: string;
  message: string;
}

interface JobProgress {
  status: string;
  progress_pct: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function confidenceBadge(score: number | null) {
  if (score === null) return null;
  const pct = Math.round(score * 100);
  if (pct >= 70) return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">{pct}% confidence</Badge>;
  if (pct >= 50) return <Badge className="bg-amber-100 text-amber-700 border-amber-200">{pct}% confidence</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-red-200">{pct}% — review needed</Badge>;
}

function statusIcon(status: Extraction["extraction_status"]) {
  switch (status) {
    case "complete": return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "failed": return <XCircle className="h-4 w-4 text-red-500" />;
    case "processing": return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    default: return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function formatCurrency(val: number | null) {
  if (!val) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);
}

// ---------------------------------------------------------------------------
// Job progress tracker (SSE)
// ---------------------------------------------------------------------------
function useJobProgress(jobId: number | null): JobProgress | null {
  const [progress, setProgress] = useState<JobProgress | null>(null);

  useEffect(() => {
    if (!jobId) return;
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
// Active upload card (shows while job is running)
// ---------------------------------------------------------------------------
function ActiveUpload({
  fileName,
  jobId,
  extractionId,
  onDone,
}: {
  fileName: string;
  jobId: number;
  extractionId: number;
  onDone: () => void;
}) {
  const progress = useJobProgress(jobId);

  useEffect(() => {
    if (progress?.status === "complete" || progress?.status === "failed") {
      setTimeout(onDone, 800);
    }
  }, [progress?.status, onDone]);

  const pct = progress?.progress_pct ?? 0;
  const isDone = progress?.status === "complete";
  const isFailed = progress?.status === "failed";

  return (
    <Card className={cn("border-2", isDone && "border-emerald-300", isFailed && "border-red-300")}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <FileText className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{fileName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {progress?.message ?? "Queued…"}
            </p>
            <div className="mt-2">
              <Progress value={pct} className="h-1.5" />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-muted-foreground">{pct}%</span>
              {isDone && <span className="text-xs text-emerald-600 font-medium">Complete</span>}
              {isFailed && <span className="text-xs text-red-500 font-medium">Failed</span>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Extraction result card
// ---------------------------------------------------------------------------
function ExtractionCard({
  extraction,
  engagementId,
  onRetry,
}: {
  extraction: Extraction;
  engagementId: number;
  onRetry: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const riskFlags: string[] = (() => {
    try { return JSON.parse(extraction.risk_flags_json ?? "[]"); } catch { return []; }
  })();
  const keyClauses: Record<string, string | null> = (() => {
    try { return JSON.parse(extraction.key_clauses_json ?? "{}"); } catch { return {}; }
  })();

  const isComplete = extraction.extraction_status === "complete";
  const isFailed = extraction.extraction_status === "failed";
  const isProcessing = extraction.extraction_status === "processing" || extraction.extraction_status === "pending";

  return (
    <Card className={cn(
      "transition-all",
      isFailed && "border-red-200 bg-red-50/30",
      isComplete && extraction.contract_id && "border-emerald-200",
    )}>
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {statusIcon(extraction.extraction_status)}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{extraction.file_name}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {isComplete && confidenceBadge(extraction.confidence_score)}
                {extraction.contract_id && (
                  <Badge variant="outline" className="text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-500" />
                    Contract created #{extraction.contract_id}
                  </Badge>
                )}
                {isComplete && !extraction.contract_id && (
                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Manual review needed
                  </Badge>
                )}
                {isProcessing && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />Processing…
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isFailed && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onRetry(extraction.id)}>
                <RotateCcw className="h-3 w-3 mr-1" />Retry
              </Button>
            )}
            {isComplete && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded((v) => !v)}>
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>

        {/* Claude summary */}
        {isComplete && extraction.claude_summary && (
          <p className="text-xs text-muted-foreground mt-3 leading-relaxed border-t pt-2">
            {extraction.claude_summary}
          </p>
        )}

        {/* Extracted fields (expanded) */}
        {isComplete && expanded && (
          <div className="mt-3 pt-3 border-t space-y-3">
            {/* Key fields grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <div>
                <p className="text-muted-foreground">Counterparty</p>
                <p className="font-medium">{extraction.supplier_name_extracted ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Annual Value</p>
                <p className="font-medium">{formatCurrency(extraction.contract_value_extracted)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Start Date</p>
                <p className="font-medium">{extraction.start_date_extracted ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">End Date</p>
                <p className={cn("font-medium", extraction.end_date_extracted && new Date(extraction.end_date_extracted) < new Date(Date.now() + 90 * 86400000) && "text-amber-600")}>
                  {extraction.end_date_extracted ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Payment Terms</p>
                <p className="font-medium">{extraction.payment_terms_extracted ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Auto-Renewal</p>
                <p className={cn("font-medium", extraction.auto_renewal_extracted ? "text-amber-600" : "text-muted-foreground")}>
                  {extraction.auto_renewal_extracted ? "⚠ Yes" : "No"}
                </p>
              </div>
            </div>

            {/* Escalation clause */}
            {extraction.escalation_clause_extracted && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Escalation Clause</p>
                <p className="text-xs bg-muted rounded p-2 italic">"{extraction.escalation_clause_extracted.slice(0, 200)}{extraction.escalation_clause_extracted.length > 200 ? "…" : ""}"</p>
              </div>
            )}

            {/* Key clauses */}
            {Object.entries(keyClauses).some(([, v]) => v) && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Key Clauses</p>
                <div className="space-y-1">
                  {Object.entries(keyClauses).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-xs">
                      <span className="text-muted-foreground capitalize shrink-0 w-28">{k.replace(/_/g, " ")}</span>
                      <span>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risk flags */}
            {riskFlags.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Risk Flags</p>
                <div className="flex flex-wrap gap-1.5">
                  {riskFlags.map((f) => (
                    <Badge key={f} variant="outline" className="text-xs text-red-600 border-red-200 bg-red-50">
                      <ShieldAlert className="h-3 w-3 mr-1" />
                      {f.replace(/_/g, " ")}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Drop zone
// ---------------------------------------------------------------------------
function DropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(pdf|docx?|txt)$/i.test(f.name)
    );
    if (files.length) onFiles(files);
  }, [onFiles]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.doc,.txt"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
      <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
      <p className="text-sm font-medium">Drop contracts here or click to browse</p>
      <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, TXT — Claude extracts all key fields automatically</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
interface Props { engagementId: number }

export default function ContractUploadPage({ engagementId }: Props) {
  const queryClient = useQueryClient();
  const [activeUploads, setActiveUploads] = useState<UploadResult[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: extractions = [], isLoading } = useQuery<Extraction[]>({
    queryKey: [`/api/engagements/${engagementId}/contracts/extractions`],
    refetchInterval: activeUploads.length > 0 ? 3000 : false,
  });

  const handleFiles = async (files: File[]) => {
    setUploadError(null);
    setUploading(true);

    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);

      try {
        const resp = await fetch(`/api/engagements/${engagementId}/contracts/upload`, {
          method: "POST",
          body: formData,
        });

        if (!resp.ok) {
          const err = await resp.json();
          setUploadError(err.error ?? "Upload failed");
          continue;
        }

        const result = await resp.json() as UploadResult;
        setActiveUploads((prev) => [...prev, result]);
      } catch (err: unknown) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      }
    }

    setUploading(false);
  };

  const handleUploadDone = (jobId: number) => {
    setActiveUploads((prev) => prev.filter((u) => u.job_id !== jobId));
    queryClient.invalidateQueries({ queryKey: [`/api/engagements/${engagementId}/contracts/extractions`] });
    queryClient.invalidateQueries({ queryKey: [`/api/engagements/${engagementId}/contracts`] });
  };

  const handleRetry = async (extractionId: number) => {
    await fetch(`/api/engagements/${engagementId}/contracts/extractions/${extractionId}/retry`, {
      method: "POST",
    });
    queryClient.invalidateQueries({ queryKey: [`/api/engagements/${engagementId}/contracts/extractions`] });
  };

  // Stats
  const complete = extractions.filter((e) => e.extraction_status === "complete");
  const autoCreated = extractions.filter((e) => e.contract_id !== null).length;
  const needsReview = complete.filter((e) => !e.contract_id).length;
  const failed = extractions.filter((e) => e.extraction_status === "failed").length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Contract Intelligence</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Upload contracts — Claude extracts key fields, flags risks, and auto-populates your contract register
        </p>
      </div>

      {/* Stats */}
      {extractions.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total uploaded", value: extractions.length, icon: FileText, color: "" },
            { label: "Auto-created", value: autoCreated, icon: CheckCircle2, color: "text-emerald-600" },
            { label: "Needs review", value: needsReview, icon: AlertTriangle, color: "text-amber-600" },
            { label: "Failed", value: failed, icon: XCircle, color: "text-red-500" },
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
      )}

      {/* Drop zone */}
      <DropZone onFiles={handleFiles} />

      {uploading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Uploading…
        </div>
      )}

      {uploadError && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{uploadError}</AlertDescription>
        </Alert>
      )}

      {/* Active uploads with SSE progress */}
      {activeUploads.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Processing</h2>
          {activeUploads.map((u) => (
            <ActiveUpload
              key={u.job_id}
              fileName={u.file_name}
              jobId={u.job_id}
              extractionId={u.extraction_id}
              onDone={() => handleUploadDone(u.job_id)}
            />
          ))}
        </div>
      )}

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading extractions…
        </div>
      ) : extractions.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Extraction Results ({extractions.length})
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: [`/api/engagements/${engagementId}/contracts/extractions`] })}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh
            </Button>
          </div>
          {[...extractions].reverse().map((e) => (
            <ExtractionCard
              key={e.id}
              extraction={e}
              engagementId={engagementId}
              onRetry={handleRetry}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No contracts uploaded yet</p>
          <p className="text-xs mt-1">Drop a PDF or DOCX above to get started</p>
        </div>
      )}
    </div>
  );
}
