import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Play, Pause, CheckCircle2, XCircle, Clock, Loader2,
  RotateCcw, Ban, ArrowRight, ShieldCheck, ShieldX, Eye
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PipelineStep {
  id: number;
  pipeline_run_id: number;
  step_id: string;
  step_label: string;
  step_order: number;
  status: string;
  depends_on_json: string | null;
  parallel_group: string | null;
  requires_review: number;
  agent_job_id: number | null;
  input_json: string | null;
  output_json: string | null;
  review_notes: string | null;
  reviewed_by: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
}

interface PipelineRun {
  id: number;
  engagement_id: number;
  pipeline_type: string;
  status: string;
  config_json: string | null;
  total_steps: number;
  completed_steps: number;
  current_step: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
}

interface PipelineData {
  pipeline_run: PipelineRun | null;
  steps: PipelineStep[];
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: any; label: string }> = {
  pending:          { color: "text-gray-500",   bg: "bg-gray-100",    icon: Clock,          label: "Pending" },
  ready:            { color: "text-blue-500",   bg: "bg-blue-100",    icon: Clock,          label: "Ready" },
  running:          { color: "text-amber-500",  bg: "bg-amber-100",   icon: Loader2,        label: "Running" },
  complete:         { color: "text-green-600",  bg: "bg-green-100",   icon: CheckCircle2,   label: "Complete" },
  failed:           { color: "text-red-500",    bg: "bg-red-100",     icon: XCircle,        label: "Failed" },
  skipped:          { color: "text-gray-400",   bg: "bg-gray-50",     icon: Ban,            label: "Skipped" },
  awaiting_review:  { color: "text-purple-500", bg: "bg-purple-100",  icon: Eye,            label: "Awaiting Review" },
  rejected:         { color: "text-red-600",    bg: "bg-red-100",     icon: ShieldX,        label: "Rejected" },
  paused:           { color: "text-purple-500", bg: "bg-purple-100",  icon: Pause,          label: "Paused" },
  cancelled:        { color: "text-gray-400",   bg: "bg-gray-100",    icon: Ban,            label: "Cancelled" },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = getStatusConfig(status);
  const Icon = cfg.icon;
  return (
    <Badge variant="secondary" className={`${cfg.bg} ${cfg.color} gap-1`}>
      <Icon className={`h-3 w-3 ${status === "running" ? "animate-spin" : ""}`} />
      {cfg.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Pipeline Step Card
// ---------------------------------------------------------------------------

function StepCard({
  step,
  pipelineRunId,
  onRefresh,
}: {
  step: PipelineStep;
  pipelineRunId: number;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/pipeline-runs/${pipelineRunId}/steps/${step.step_id}/approve`, {
        review_notes: reviewNotes || undefined,
        reviewed_by: "user",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Step approved", description: `${step.step_label} approved. Pipeline advancing.` });
      setReviewOpen(false);
      onRefresh();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/pipeline-runs/${pipelineRunId}/steps/${step.step_id}/reject`, {
        review_notes: reviewNotes || undefined,
        reviewed_by: "user",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Step rejected", description: `${step.step_label} rejected.`, variant: "destructive" });
      setReviewOpen(false);
      onRefresh();
    },
  });

  const retryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/pipeline-runs/${pipelineRunId}/steps/${step.step_id}/retry`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Retrying step", description: `${step.step_label} queued for retry.` });
      onRefresh();
    },
  });

  const cfg = getStatusConfig(step.status);

  return (
    <>
      <Card className={`border-l-4 ${step.status === "running" ? "border-l-amber-500" : step.status === "complete" ? "border-l-green-500" : step.status === "failed" || step.status === "rejected" ? "border-l-red-500" : step.status === "awaiting_review" ? "border-l-purple-500" : "border-l-gray-200"}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${cfg.bg}`}>
                <cfg.icon className={`h-4 w-4 ${cfg.color} ${step.status === "running" ? "animate-spin" : ""}`} />
              </div>
              <div>
                <p className="font-medium text-sm">{step.step_label}</p>
                <p className="text-xs text-muted-foreground">
                  {step.step_id}
                  {step.parallel_group && <span className="ml-2 text-blue-500">(parallel: {step.parallel_group})</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={step.status} />
              {step.requires_review === 1 && step.status !== "awaiting_review" && (
                <Badge variant="outline" className="text-xs">Review Gate</Badge>
              )}
            </div>
          </div>

          {step.error_message && (
            <p className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">{step.error_message}</p>
          )}

          {step.review_notes && (
            <p className="mt-2 text-xs text-purple-700 bg-purple-50 p-2 rounded">
              Review: {step.review_notes} {step.reviewed_by && `— ${step.reviewed_by}`}
            </p>
          )}

          {step.output_json && (
            <details className="mt-2">
              <summary className="text-xs text-muted-foreground cursor-pointer">Output</summary>
              <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto max-h-32">
                {JSON.stringify(JSON.parse(step.output_json), null, 2)}
              </pre>
            </details>
          )}

          <div className="flex gap-2 mt-3">
            {step.status === "awaiting_review" && (
              <Button size="sm" variant="default" onClick={() => setReviewOpen(true)}>
                <Eye className="h-3 w-3 mr-1" /> Review
              </Button>
            )}
            {(step.status === "failed" || step.status === "rejected") && (
              <Button size="sm" variant="outline" onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending}>
                <RotateCcw className="h-3 w-3 mr-1" /> Retry
              </Button>
            )}
          </div>

          {(step.started_at || step.completed_at) && (
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              {step.started_at && <span>Started: {new Date(step.started_at).toLocaleTimeString()}</span>}
              {step.completed_at && <span>Completed: {new Date(step.completed_at).toLocaleTimeString()}</span>}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review: {step.step_label}</DialogTitle>
            <DialogDescription>
              This step has completed and requires your review before the pipeline can continue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {step.output_json && (
              <div>
                <p className="text-sm font-medium mb-1">Step Output</p>
                <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-48">
                  {JSON.stringify(JSON.parse(step.output_json), null, 2)}
                </pre>
              </div>
            )}
            <div>
              <p className="text-sm font-medium mb-1">Review Notes</p>
              <Textarea
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                placeholder="Optional review notes..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="destructive" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}>
              <ShieldX className="h-4 w-4 mr-1" /> Reject
            </Button>
            <Button variant="default" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
              <ShieldCheck className="h-4 w-4 mr-1" /> Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function PipelineDashboardPage({ engagementId }: { engagementId: number }) {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<string>("diagnostic");

  const { data, isLoading, refetch } = useQuery<PipelineData>({
    queryKey: ["/api/engagements", engagementId, "pipeline"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/pipeline`);
      return res.json();
    },
    refetchInterval: (query) => {
      const d = query.state.data as PipelineData | undefined;
      if (d?.pipeline_run?.status === "running") return 3000;
      return false;
    },
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/engagements/${engagementId}/pipeline`, {
        pipeline_type: selectedType,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Pipeline started", description: `${selectedType} pipeline is now running.` });
      refetch();
    },
    onError: (err: any) => {
      toast({ title: "Failed to start pipeline", description: err.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/engagements/${engagementId}/pipeline/cancel`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Pipeline cancelled" });
      refetch();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const run = data?.pipeline_run;
  const steps = data?.steps ?? [];
  const isActive = run && !["complete", "failed", "cancelled"].includes(run.status);
  const progressPct = run && run.total_steps > 0
    ? Math.round((run.completed_steps / run.total_steps) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Orchestrate end-to-end engagement workflows
          </p>
        </div>
      </div>

      {/* Pipeline Status / Launch */}
      {!run || ["complete", "failed", "cancelled"].includes(run.status) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Launch Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Pipeline Type</label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diagnostic">Diagnostic (2-4 weeks)</SelectItem>
                    <SelectItem value="odd">ODD - Due Diligence (1-2 weeks)</SelectItem>
                    <SelectItem value="transformation">Transformation (12+ weeks)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
                <Play className="h-4 w-4 mr-2" />
                {startMutation.isPending ? "Starting..." : "Start Pipeline"}
              </Button>
            </div>

            {run && (
              <div className="mt-4 p-3 rounded bg-muted">
                <p className="text-sm text-muted-foreground">
                  Previous run: <StatusBadge status={run.status} />
                  {run.completed_at && (
                    <span className="ml-2">
                      Completed {new Date(run.completed_at).toLocaleDateString()}
                    </span>
                  )}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                Pipeline: {run.pipeline_type.charAt(0).toUpperCase() + run.pipeline_type.slice(1)}
                <StatusBadge status={run.status} />
              </CardTitle>
              {isActive && (
                <Button variant="outline" size="sm" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
                  <Ban className="h-3 w-3 mr-1" /> Cancel
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{run.current_step}</span>
                <span className="font-medium">{run.completed_steps}/{run.total_steps} steps ({progressPct}%)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all duration-500 ${run.status === "failed" ? "bg-red-500" : run.status === "paused" ? "bg-purple-500" : "bg-green-500"}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {run.error_message && (
              <p className="mt-3 text-sm text-red-600 bg-red-50 p-3 rounded">{run.error_message}</p>
            )}

            {run.started_at && (
              <p className="mt-2 text-xs text-muted-foreground">
                Started: {new Date(run.started_at).toLocaleString()}
                {run.completed_at && ` | Completed: ${new Date(run.completed_at).toLocaleString()}`}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Steps */}
      {steps.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Pipeline Steps</h2>
          <div className="space-y-2">
            {steps.map((step, i) => (
              <div key={step.id}>
                {i > 0 && (
                  <div className="flex justify-center py-1">
                    <ArrowRight className="h-4 w-4 text-muted-foreground rotate-90" />
                  </div>
                )}
                <StepCard step={step} pipelineRunId={run!.id} onRefresh={() => refetch()} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
