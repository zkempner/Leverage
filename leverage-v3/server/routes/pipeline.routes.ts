/**
 * LEVERAGE v4 — Pipeline Routes
 *
 * REST endpoints for the pipeline orchestrator.
 */

import type { Express } from "express";
import {
  createPipeline,
  startPipeline,
  getPipelineForEngagement,
  getPipelineRun,
  getPipelineSteps,
  getPipelineHistory,
  approveStep,
  rejectStep,
  retryStep,
  cancelPipeline,
  getPipelineDefinition,
} from "../services/PipelineOrchestrator";
import type { PipelineType } from "../services/PipelineOrchestrator";

export function registerPipelineRoutes(app: Express): void {
  // Start a new pipeline for an engagement
  app.post("/api/engagements/:id/pipeline", async (req, res) => {
    try {
      const engagementId = Number(req.params.id);
      const { pipeline_type, config } = req.body as {
        pipeline_type?: PipelineType;
        config?: Record<string, unknown>;
      };

      const type = pipeline_type ?? "diagnostic";

      // Check for existing active pipeline
      const existing = getPipelineForEngagement(engagementId);
      if (existing && !["complete", "failed", "cancelled"].includes(existing.status)) {
        return res.status(409).json({
          error: "An active pipeline already exists for this engagement",
          pipeline_run_id: existing.id,
          status: existing.status,
        });
      }

      const run = createPipeline(engagementId, type, config);
      await startPipeline(run.id);

      // Fetch updated state
      const updated = getPipelineRun(run.id);
      const steps = getPipelineSteps(run.id);

      res.json({ pipeline_run: updated, steps });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // Get current pipeline status for an engagement
  app.get("/api/engagements/:id/pipeline", (req, res) => {
    const engagementId = Number(req.params.id);
    const run = getPipelineForEngagement(engagementId);

    if (!run) {
      return res.json({ pipeline_run: null, steps: [] });
    }

    const steps = getPipelineSteps(run.id);
    res.json({ pipeline_run: run, steps });
  });

  // Get pipeline history for an engagement
  app.get("/api/engagements/:id/pipeline/history", (req, res) => {
    const engagementId = Number(req.params.id);
    const limit = Number(req.query.limit) || 10;
    const runs = getPipelineHistory(engagementId, limit);
    res.json(runs);
  });

  // Get a specific pipeline run with steps
  app.get("/api/pipeline-runs/:runId", (req, res) => {
    const runId = Number(req.params.runId);
    const run = getPipelineRun(runId);
    if (!run) return res.status(404).json({ error: "Pipeline run not found" });

    const steps = getPipelineSteps(runId);
    res.json({ pipeline_run: run, steps });
  });

  // Approve a review gate
  app.post("/api/pipeline-runs/:runId/steps/:stepId/approve", async (req, res) => {
    try {
      const runId = Number(req.params.runId);
      const stepId = req.params.stepId;
      const { review_notes, reviewed_by } = req.body as {
        review_notes?: string;
        reviewed_by?: string;
      };

      const success = await approveStep(runId, stepId, review_notes, reviewed_by);
      if (!success) {
        return res.status(400).json({ error: "Step is not awaiting review" });
      }

      const run = getPipelineRun(runId);
      const steps = getPipelineSteps(runId);
      res.json({ pipeline_run: run, steps });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // Reject a review gate
  app.post("/api/pipeline-runs/:runId/steps/:stepId/reject", async (req, res) => {
    try {
      const runId = Number(req.params.runId);
      const stepId = req.params.stepId;
      const { review_notes, reviewed_by } = req.body as {
        review_notes?: string;
        reviewed_by?: string;
      };

      const success = await rejectStep(runId, stepId, review_notes, reviewed_by);
      if (!success) {
        return res.status(400).json({ error: "Step is not awaiting review" });
      }

      const run = getPipelineRun(runId);
      const steps = getPipelineSteps(runId);
      res.json({ pipeline_run: run, steps });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // Retry a failed step
  app.post("/api/pipeline-runs/:runId/steps/:stepId/retry", async (req, res) => {
    try {
      const runId = Number(req.params.runId);
      const stepId = req.params.stepId;

      const success = await retryStep(runId, stepId);
      if (!success) {
        return res.status(400).json({ error: "Step is not in a retryable state" });
      }

      const run = getPipelineRun(runId);
      const steps = getPipelineSteps(runId);
      res.json({ pipeline_run: run, steps });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // Cancel a running pipeline
  app.post("/api/engagements/:id/pipeline/cancel", (req, res) => {
    const engagementId = Number(req.params.id);
    const run = getPipelineForEngagement(engagementId);

    if (!run) {
      return res.status(404).json({ error: "No pipeline found for this engagement" });
    }

    const success = cancelPipeline(run.id);
    if (!success) {
      return res.status(400).json({ error: "Pipeline cannot be cancelled (already complete or cancelled)" });
    }

    const updated = getPipelineRun(run.id);
    const steps = getPipelineSteps(run.id);
    res.json({ pipeline_run: updated, steps });
  });

  // Get available pipeline definitions (for UI)
  app.get("/api/pipeline-definitions", (_req, res) => {
    const types: PipelineType[] = ["diagnostic", "odd", "transformation"];
    const definitions = types.map(type => ({
      type,
      label: type === "odd" ? "Operational Due Diligence" : type.charAt(0).toUpperCase() + type.slice(1),
      steps: getPipelineDefinition(type).map(s => ({
        step_id: s.step_id,
        step_label: s.step_label,
        depends_on: s.depends_on,
        parallel_group: s.parallel_group,
        requires_review: s.requires_review,
      })),
    }));
    res.json(definitions);
  });
}
