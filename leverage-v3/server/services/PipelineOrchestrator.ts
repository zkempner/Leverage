/**
 * LEVERAGE v4 — PipelineOrchestrator
 *
 * DAG-based pipeline orchestrator that chains existing engines/services
 * into configurable engagement workflows. Each pipeline step is dispatched
 * via JobQueueService (BullMQ or inline fallback). The database is the
 * artifact-passing mechanism between steps.
 *
 * Pipeline types: diagnostic | odd | transformation
 */

import { db } from "../storage";
import { pipeline_runs, pipeline_steps } from "@shared/schema";
import type { PipelineRun, PipelineStep } from "@shared/schema";
import { eq, and, sql, asc } from "drizzle-orm";
import { enqueue, registerHandler, getJobStatus } from "./JobQueueService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PipelineType = "diagnostic" | "odd" | "transformation";

export type StepStatus =
  | "pending"
  | "ready"
  | "running"
  | "complete"
  | "failed"
  | "skipped"
  | "awaiting_review"
  | "rejected";

export interface PipelineStepDef {
  step_id: string;
  step_label: string;
  depends_on: string[];
  parallel_group?: string;
  requires_review: boolean;
  timeout_ms?: number;
  config?: Record<string, unknown>;
}

export interface PipelineDefinition {
  pipeline_type: PipelineType;
  steps: PipelineStepDef[];
}

// ---------------------------------------------------------------------------
// Step Executor Registry
// ---------------------------------------------------------------------------

type StepExecutor = (ctx: {
  engagement_id: number;
  pipeline_run_id: number;
  step_id: string;
  config: Record<string, unknown>;
  progressCb: (pct: number, msg: string) => void;
}) => Promise<Record<string, unknown> | void>;

const stepExecutors = new Map<string, StepExecutor>();

export function registerStepExecutor(stepId: string, executor: StepExecutor): void {
  stepExecutors.set(stepId, executor);
  console.log(`[PipelineOrchestrator] Step executor registered: ${stepId}`);
}

// ---------------------------------------------------------------------------
// Pipeline Definitions
// ---------------------------------------------------------------------------

const DIAGNOSTIC_PIPELINE: PipelineStepDef[] = [
  { step_id: "data_intake",        step_label: "Data Intake",             depends_on: [],                                        requires_review: false },
  { step_id: "cleansing",          step_label: "Data Cleansing",          depends_on: ["data_intake"],                            requires_review: false },
  { step_id: "categorization",     step_label: "Categorization",          depends_on: ["cleansing"],         parallel_group: "a", requires_review: false },
  { step_id: "normalization",      step_label: "Supplier Normalization",  depends_on: ["cleansing"],         parallel_group: "a", requires_review: false },
  { step_id: "spend_analysis",     step_label: "Spend Analysis",          depends_on: ["categorization", "normalization"],        requires_review: false },
  { step_id: "opportunity_sizing", step_label: "Opportunity Sizing",      depends_on: ["spend_analysis"],    parallel_group: "b", requires_review: false },
  { step_id: "spend_flags",        step_label: "Spend Flags",             depends_on: ["spend_analysis"],    parallel_group: "b", requires_review: false },
  { step_id: "vendor_analysis",    step_label: "Vendor Analysis",         depends_on: ["spend_analysis"],    parallel_group: "b", requires_review: false },
  { step_id: "kraljic",            step_label: "Kraljic Matrix",          depends_on: ["opportunity_sizing", "spend_flags", "vendor_analysis"], parallel_group: "c", requires_review: false },
  { step_id: "benchmarks",         step_label: "Benchmarks",              depends_on: ["opportunity_sizing", "spend_flags", "vendor_analysis"], parallel_group: "c", requires_review: false },
  { step_id: "financial_model",    step_label: "Financial Model",         depends_on: ["kraljic", "benchmarks"],                  requires_review: true },
  { step_id: "monte_carlo",        step_label: "Monte Carlo Simulation",  depends_on: ["financial_model"],                        requires_review: false },
  { step_id: "deliverable_gen",    step_label: "Deliverable Generation",  depends_on: ["monte_carlo"],                            requires_review: true },
];

const ODD_PIPELINE: PipelineStepDef[] = [
  { step_id: "data_intake",        step_label: "Data Intake",             depends_on: [],                                        requires_review: false },
  { step_id: "cleansing",          step_label: "Data Cleansing",          depends_on: ["data_intake"],                            requires_review: false },
  { step_id: "categorization",     step_label: "Categorization",          depends_on: ["cleansing"],         parallel_group: "a", requires_review: false },
  { step_id: "normalization",      step_label: "Supplier Normalization",  depends_on: ["cleansing"],         parallel_group: "a", requires_review: false },
  { step_id: "spend_analysis",     step_label: "Spend Analysis",          depends_on: ["categorization", "normalization"],        requires_review: false },
  { step_id: "opportunity_sizing", step_label: "Opportunity Sizing",      depends_on: ["spend_analysis"],    parallel_group: "b", requires_review: false },
  { step_id: "benchmarks",         step_label: "Benchmarks",              depends_on: ["spend_analysis"],    parallel_group: "b", requires_review: false },
  { step_id: "vendor_analysis",    step_label: "Vendor Analysis",         depends_on: ["spend_analysis"],    parallel_group: "b", requires_review: false },
  { step_id: "financial_model",    step_label: "Financial Model",         depends_on: ["opportunity_sizing", "benchmarks", "vendor_analysis"], requires_review: false },
  { step_id: "deliverable_gen",    step_label: "ODD Memo Generation",     depends_on: ["financial_model"],                        requires_review: true },
];

const TRANSFORMATION_PIPELINE: PipelineStepDef[] = [
  ...DIAGNOSTIC_PIPELINE.map(s => ({
    ...s,
    // Add review gates after key analysis steps for transformation
    requires_review: ["spend_analysis", "financial_model", "deliverable_gen"].includes(s.step_id) ? true : s.requires_review,
  })),
];

const PIPELINE_DEFINITIONS: Record<PipelineType, PipelineStepDef[]> = {
  diagnostic: DIAGNOSTIC_PIPELINE,
  odd: ODD_PIPELINE,
  transformation: TRANSFORMATION_PIPELINE,
};

export function getPipelineDefinition(type: PipelineType): PipelineStepDef[] {
  return PIPELINE_DEFINITIONS[type] ?? DIAGNOSTIC_PIPELINE;
}

// ---------------------------------------------------------------------------
// Pipeline Creation
// ---------------------------------------------------------------------------

export function createPipeline(
  engagement_id: number,
  pipeline_type: PipelineType,
  config?: Record<string, unknown>,
): PipelineRun {
  const stepDefs = getPipelineDefinition(pipeline_type);
  const now = new Date().toISOString();

  // Create the pipeline run
  const run = db
    .insert(pipeline_runs)
    .values({
      engagement_id,
      pipeline_type,
      status: "pending",
      config_json: config ? JSON.stringify(config) : null,
      total_steps: stepDefs.length,
      completed_steps: 0,
      current_step: "Initializing",
      created_at: now,
    })
    .returning()
    .get();

  // Create all step rows
  for (let i = 0; i < stepDefs.length; i++) {
    const def = stepDefs[i];
    db.insert(pipeline_steps)
      .values({
        pipeline_run_id: run.id,
        step_id: def.step_id,
        step_label: def.step_label,
        step_order: i,
        status: def.depends_on.length === 0 ? "ready" : "pending",
        depends_on_json: JSON.stringify(def.depends_on),
        parallel_group: def.parallel_group ?? null,
        requires_review: def.requires_review ? 1 : 0,
        input_json: def.config ? JSON.stringify(def.config) : null,
        created_at: now,
      })
      .run();
  }

  return run;
}

// ---------------------------------------------------------------------------
// Pipeline Execution
// ---------------------------------------------------------------------------

export async function startPipeline(pipelineRunId: number): Promise<void> {
  const now = new Date().toISOString();
  db.update(pipeline_runs)
    .set({ status: "running", started_at: now, current_step: "Starting pipeline" })
    .where(eq(pipeline_runs.id, pipelineRunId))
    .run();

  await advancePipeline(pipelineRunId);
}

/**
 * Core DAG advancement logic. Called after a step completes or is approved.
 * Finds all "ready" steps (dependencies met) and dispatches them.
 */
export async function advancePipeline(pipelineRunId: number): Promise<void> {
  const run = db.select().from(pipeline_runs).where(eq(pipeline_runs.id, pipelineRunId)).get();
  if (!run || run.status === "cancelled" || run.status === "complete" || run.status === "failed") return;

  const steps = db
    .select()
    .from(pipeline_steps)
    .where(eq(pipeline_steps.pipeline_run_id, pipelineRunId))
    .orderBy(asc(pipeline_steps.step_order))
    .all();

  const stepMap = new Map(steps.map(s => [s.step_id, s]));

  // Check if pipeline is complete
  const allDone = steps.every(s => s.status === "complete" || s.status === "skipped");
  if (allDone) {
    const now = new Date().toISOString();
    db.update(pipeline_runs)
      .set({ status: "complete", completed_steps: steps.length, current_step: "Complete", completed_at: now })
      .where(eq(pipeline_runs.id, pipelineRunId))
      .run();
    return;
  }

  // Check if any step is awaiting review (pipeline paused)
  const awaitingReview = steps.find(s => s.status === "awaiting_review");
  if (awaitingReview) {
    db.update(pipeline_runs)
      .set({ status: "paused", current_step: `Awaiting review: ${awaitingReview.step_label}` })
      .where(eq(pipeline_runs.id, pipelineRunId))
      .run();
    return;
  }

  // Check for failures
  const failed = steps.find(s => s.status === "failed");
  if (failed) {
    db.update(pipeline_runs)
      .set({ status: "failed", error_message: `Step "${failed.step_label}" failed: ${failed.error_message ?? "unknown error"}`, current_step: `Failed: ${failed.step_label}` })
      .where(eq(pipeline_runs.id, pipelineRunId))
      .run();
    return;
  }

  // Find steps that are ready to dispatch (pending with all deps complete)
  const completedIds = new Set(steps.filter(s => s.status === "complete" || s.status === "skipped").map(s => s.step_id));
  const readyToDispatch: PipelineStep[] = [];

  for (const step of steps) {
    if (step.status !== "pending" && step.status !== "ready") continue;
    const deps: string[] = step.depends_on_json ? JSON.parse(step.depends_on_json) : [];
    const allDepsMet = deps.every(d => completedIds.has(d));
    if (allDepsMet) {
      readyToDispatch.push(step);
    }
  }

  if (readyToDispatch.length === 0) return; // Nothing to do yet

  // Update completed count
  const completedCount = steps.filter(s => s.status === "complete").length;
  const currentLabel = readyToDispatch[0].step_label;
  db.update(pipeline_runs)
    .set({ status: "running", completed_steps: completedCount, current_step: currentLabel })
    .where(eq(pipeline_runs.id, pipelineRunId))
    .run();

  // Dispatch ready steps
  for (const step of readyToDispatch) {
    await dispatchStep(run, step);
  }
}

async function dispatchStep(run: PipelineRun, step: PipelineStep): Promise<void> {
  const now = new Date().toISOString();

  // Mark step as running
  db.update(pipeline_steps)
    .set({ status: "running", started_at: now })
    .where(eq(pipeline_steps.id, step.id))
    .run();

  const executor = stepExecutors.get(step.step_id);

  if (!executor) {
    // No executor registered — use job queue fallback with pipeline_step_ prefix
    const result = await enqueue({
      engagement_id: run.engagement_id,
      job_type: `pipeline_step_${step.step_id}`,
      agent_id: `pipeline_${step.step_id}`,
      payload: {
        pipeline_run_id: run.id,
        step_id: step.step_id,
        engagement_id: run.engagement_id,
        config: step.input_json ? JSON.parse(step.input_json) : {},
      },
    });

    db.update(pipeline_steps)
      .set({ agent_job_id: result.job_id })
      .where(eq(pipeline_steps.id, step.id))
      .run();

    // Poll job status (for inline mode) or rely on completion callback
    pollJobCompletion(run.id, step.step_id, result.job_id);
    return;
  }

  // Run executor directly
  try {
    const output = await executor({
      engagement_id: run.engagement_id,
      pipeline_run_id: run.id,
      step_id: step.step_id,
      config: step.input_json ? JSON.parse(step.input_json) : {},
      progressCb: () => {}, // Could wire to SSE later
    });

    await completeStep(run.id, step.step_id, output ?? null);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await failStep(run.id, step.step_id, msg);
  }
}

async function pollJobCompletion(pipelineRunId: number, stepId: string, jobId: number): Promise<void> {
  const check = () => {
    const job = getJobStatus(jobId);
    if (!job) return;

    if (job.status === "complete") {
      const output = job.output_json ? JSON.parse(job.output_json) : null;
      completeStep(pipelineRunId, stepId, output);
    } else if (job.status === "failed") {
      failStep(pipelineRunId, stepId, job.error_message ?? "Job failed");
    } else {
      // Still running, check again
      setTimeout(check, 2000);
    }
  };
  setTimeout(check, 1000);
}

// ---------------------------------------------------------------------------
// Step Completion / Failure
// ---------------------------------------------------------------------------

export async function completeStep(
  pipelineRunId: number,
  stepId: string,
  output: Record<string, unknown> | null,
): Promise<void> {
  const now = new Date().toISOString();
  const step = db
    .select()
    .from(pipeline_steps)
    .where(and(eq(pipeline_steps.pipeline_run_id, pipelineRunId), eq(pipeline_steps.step_id, stepId)))
    .get();

  if (!step) return;

  const newStatus: StepStatus = step.requires_review ? "awaiting_review" : "complete";

  db.update(pipeline_steps)
    .set({
      status: newStatus,
      output_json: output ? JSON.stringify(output) : null,
      completed_at: newStatus === "complete" ? now : null,
    })
    .where(eq(pipeline_steps.id, step.id))
    .run();

  await advancePipeline(pipelineRunId);
}

export async function failStep(pipelineRunId: number, stepId: string, errorMessage: string): Promise<void> {
  const now = new Date().toISOString();
  db.update(pipeline_steps)
    .set({ status: "failed", error_message: errorMessage, completed_at: now })
    .where(and(eq(pipeline_steps.pipeline_run_id, pipelineRunId), eq(pipeline_steps.step_id, stepId)))
    .run();

  await advancePipeline(pipelineRunId);
}

// ---------------------------------------------------------------------------
// Review Actions
// ---------------------------------------------------------------------------

export async function approveStep(
  pipelineRunId: number,
  stepId: string,
  reviewNotes?: string,
  reviewedBy?: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const step = db
    .select()
    .from(pipeline_steps)
    .where(and(eq(pipeline_steps.pipeline_run_id, pipelineRunId), eq(pipeline_steps.step_id, stepId)))
    .get();

  if (!step || step.status !== "awaiting_review") return false;

  db.update(pipeline_steps)
    .set({
      status: "complete",
      review_notes: reviewNotes ?? null,
      reviewed_by: reviewedBy ?? null,
      completed_at: now,
    })
    .where(eq(pipeline_steps.id, step.id))
    .run();

  // Resume the pipeline after approval
  db.update(pipeline_runs)
    .set({ status: "running" })
    .where(eq(pipeline_runs.id, pipelineRunId))
    .run();

  await advancePipeline(pipelineRunId);
  return true;
}

export async function rejectStep(
  pipelineRunId: number,
  stepId: string,
  reviewNotes?: string,
  reviewedBy?: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const step = db
    .select()
    .from(pipeline_steps)
    .where(and(eq(pipeline_steps.pipeline_run_id, pipelineRunId), eq(pipeline_steps.step_id, stepId)))
    .get();

  if (!step || step.status !== "awaiting_review") return false;

  db.update(pipeline_steps)
    .set({
      status: "rejected",
      review_notes: reviewNotes ?? null,
      reviewed_by: reviewedBy ?? null,
      completed_at: now,
    })
    .where(eq(pipeline_steps.id, step.id))
    .run();

  // Mark pipeline as failed on rejection
  db.update(pipeline_runs)
    .set({ status: "failed", error_message: `Step "${step.step_label}" was rejected`, current_step: `Rejected: ${step.step_label}` })
    .where(eq(pipeline_runs.id, pipelineRunId))
    .run();

  return true;
}

// ---------------------------------------------------------------------------
// Retry Failed Step
// ---------------------------------------------------------------------------

export async function retryStep(pipelineRunId: number, stepId: string): Promise<boolean> {
  const step = db
    .select()
    .from(pipeline_steps)
    .where(and(eq(pipeline_steps.pipeline_run_id, pipelineRunId), eq(pipeline_steps.step_id, stepId)))
    .get();

  if (!step || (step.status !== "failed" && step.status !== "rejected")) return false;

  db.update(pipeline_steps)
    .set({ status: "ready", error_message: null, output_json: null, started_at: null, completed_at: null })
    .where(eq(pipeline_steps.id, step.id))
    .run();

  // Reset pipeline status to running
  db.update(pipeline_runs)
    .set({ status: "running", error_message: null })
    .where(eq(pipeline_runs.id, pipelineRunId))
    .run();

  await advancePipeline(pipelineRunId);
  return true;
}

// ---------------------------------------------------------------------------
// Cancel Pipeline
// ---------------------------------------------------------------------------

export function cancelPipeline(pipelineRunId: number): boolean {
  const run = db.select().from(pipeline_runs).where(eq(pipeline_runs.id, pipelineRunId)).get();
  if (!run || run.status === "complete" || run.status === "cancelled") return false;

  const now = new Date().toISOString();
  db.update(pipeline_runs)
    .set({ status: "cancelled", completed_at: now, current_step: "Cancelled" })
    .where(eq(pipeline_runs.id, pipelineRunId))
    .run();

  // Cancel all pending/ready/running steps
  db.update(pipeline_steps)
    .set({ status: "skipped" })
    .where(
      and(
        eq(pipeline_steps.pipeline_run_id, pipelineRunId),
        sql`${pipeline_steps.status} IN ('pending', 'ready', 'running')`,
      ),
    )
    .run();

  return true;
}

// ---------------------------------------------------------------------------
// Query Helpers
// ---------------------------------------------------------------------------

export function getPipelineRun(pipelineRunId: number): PipelineRun | undefined {
  return db.select().from(pipeline_runs).where(eq(pipeline_runs.id, pipelineRunId)).get();
}

export function getPipelineForEngagement(engagementId: number): PipelineRun | undefined {
  return db
    .select()
    .from(pipeline_runs)
    .where(eq(pipeline_runs.engagement_id, engagementId))
    .orderBy(sql`created_at DESC`)
    .limit(1)
    .get();
}

export function getPipelineSteps(pipelineRunId: number): PipelineStep[] {
  return db
    .select()
    .from(pipeline_steps)
    .where(eq(pipeline_steps.pipeline_run_id, pipelineRunId))
    .orderBy(asc(pipeline_steps.step_order))
    .all();
}

export function getPipelineHistory(engagementId: number, limit = 10): PipelineRun[] {
  return db
    .select()
    .from(pipeline_runs)
    .where(eq(pipeline_runs.engagement_id, engagementId))
    .orderBy(sql`created_at DESC`)
    .limit(limit)
    .all();
}

// ---------------------------------------------------------------------------
// Register the pipeline step handler with JobQueueService
// This allows pipeline steps to be executed via the job queue
// ---------------------------------------------------------------------------

registerHandler("pipeline_step", async (payload, progressCb) => {
  const { pipeline_run_id, step_id, engagement_id, config } = payload as {
    pipeline_run_id: number;
    step_id: string;
    engagement_id: number;
    config: Record<string, unknown>;
  };

  const executor = stepExecutors.get(step_id);
  if (!executor) {
    throw new Error(`No step executor registered for: ${step_id}`);
  }

  return executor({
    engagement_id,
    pipeline_run_id,
    step_id,
    config: config ?? {},
    progressCb,
  });
});
