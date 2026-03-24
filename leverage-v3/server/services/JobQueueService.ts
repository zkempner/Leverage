/**
 * LEVERAGE v3 — JobQueueService (P1-02)
 *
 * BullMQ-based async job queue. Every agent task goes through here.
 * State is persisted in both Redis (BullMQ) and SQLite (agent_jobs table)
 * so the UI can query job status via REST even without an SSE connection.
 *
 * Redis is required. If Redis is unavailable, falls back to in-process
 * execution (development convenience — not for production).
 *
 * Job types (per spec):
 *   data_ingest | market_refresh | deliverable_gen | supplier_risk_scan |
 *   contract_extract | news_scan | commodity_refresh
 */

import { Queue, Worker, Job, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { db } from "../storage";
import { agent_jobs } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import type { AgentJob } from "@shared/schema";

// ---------------------------------------------------------------------------
// Redis connection
// ---------------------------------------------------------------------------
const REDIS_HOST = process.env.REDIS_HOST ?? "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT ?? "6379", 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD ?? undefined;

let redisConnection: IORedis | null = null;
let redisAvailable = false;

function getRedis(): IORedis | null {
  if (redisConnection) return redisConnection;
  try {
    const conn = new IORedis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      maxRetriesPerRequest: null, // required by BullMQ
      lazyConnect: true,
      connectTimeout: 3000,
    });
    conn.on("connect", () => {
      redisAvailable = true;
      console.log("[JobQueueService] Redis connected.");
    });
    conn.on("error", (err) => {
      if (redisAvailable) {
        console.warn("[JobQueueService] Redis error:", err.message);
      }
      redisAvailable = false;
    });
    redisConnection = conn;
    return conn;
  } catch (err) {
    console.warn("[JobQueueService] Redis init failed — running in fallback mode:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Queue + Worker setup
// ---------------------------------------------------------------------------
export const QUEUE_NAME = "leverage-agents";

let queue: Queue | null = null;
let queueEvents: QueueEvents | null = null;
let worker: Worker | null = null;

// SSE clients: Map<jobId, Set<(msg: string) => void>>
const sseClients = new Map<number, Set<(msg: string) => void>>();

export function registerSseClient(jobId: number, send: (msg: string) => void): () => void {
  if (!sseClients.has(jobId)) sseClients.set(jobId, new Set());
  sseClients.get(jobId)!.add(send);
  return () => sseClients.get(jobId)?.delete(send);
}

function emitProgress(jobId: number, pct: number, message: string) {
  const clients = sseClients.get(jobId);
  if (!clients) return;
  const payload = JSON.stringify({ progress_pct: pct, message, timestamp: new Date().toISOString() });
  clients.forEach((send) => send(payload));
}

// ---------------------------------------------------------------------------
// Job handler registry
// Agents register their handlers here at startup.
// ---------------------------------------------------------------------------
type JobHandler = (payload: Record<string, unknown>, progressCb: (pct: number, msg: string) => void) => Promise<unknown>;

const handlers = new Map<string, JobHandler>();

export function registerHandler(jobType: string, handler: JobHandler): void {
  handlers.set(jobType, handler);
  console.log(`[JobQueueService] Handler registered for job type: ${jobType}`);
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------
function createJobRow(params: {
  engagement_id?: number;
  agent_id: string;
  job_type: string;
  input_json?: Record<string, unknown>;
}): number {
  const now = new Date().toISOString();
  const result = db
    .insert(agent_jobs)
    .values({
      engagement_id: params.engagement_id ?? null,
      agent_id: params.agent_id,
      job_type: params.job_type,
      status: "queued",
      progress_pct: 0,
      progress_message: "Queued",
      input_json: params.input_json ? JSON.stringify(params.input_json) : null,
      retry_count: 0,
      created_at: now,
    })
    .returning({ id: agent_jobs.id })
    .get();
  return result.id;
}

function updateJobRow(
  jobId: number,
  fields: Partial<{
    status: string;
    progress_pct: number;
    progress_message: string;
    output_json: string;
    error_message: string;
    retry_count: number;
    started_at: string;
    completed_at: string;
  }>,
) {
  db.update(agent_jobs).set(fields).where(eq(agent_jobs.id, jobId)).run();
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------
export interface EnqueueOptions {
  engagement_id?: number;
  agent_id?: string;
  job_type: string;
  payload?: Record<string, unknown>;
  priority?: number; // 1 = highest
  delay_ms?: number;
}

export interface EnqueueResult {
  job_id: number;
  bull_id: string | null;
  mode: "bullmq" | "inline";
}

export async function enqueue(opts: EnqueueOptions): Promise<EnqueueResult> {
  const agent_id = opts.agent_id ?? `agent_${opts.job_type.split("_")[0]}`;
  const job_id = createJobRow({
    engagement_id: opts.engagement_id,
    agent_id,
    job_type: opts.job_type,
    input_json: opts.payload,
  });

  const redis = getRedis();

  if (!redis || !redisAvailable) {
    // Fallback: run inline asynchronously (dev mode)
    console.warn(`[JobQueueService] Redis unavailable — running job ${job_id} (${opts.job_type}) inline`);
    setImmediate(() => runInline(job_id, opts.job_type, opts.payload ?? {}));
    return { job_id, bull_id: null, mode: "inline" };
  }

  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: redis });
  }

  const bullJob = await queue.add(
    opts.job_type,
    { job_id, job_type: opts.job_type, payload: opts.payload ?? {} },
    {
      priority: opts.priority,
      delay: opts.delay_ms,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    },
  );

  return { job_id, bull_id: bullJob.id ?? null, mode: "bullmq" };
}

// ---------------------------------------------------------------------------
// Inline runner (Redis fallback)
// ---------------------------------------------------------------------------
async function runInline(
  jobId: number,
  jobType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();
  updateJobRow(jobId, { status: "running", started_at: now, progress_pct: 0, progress_message: "Starting…" });
  emitProgress(jobId, 0, "Starting…");

  const handler = handlers.get(jobType);
  if (!handler) {
    const msg = `No handler registered for job type: ${jobType}`;
    updateJobRow(jobId, { status: "failed", error_message: msg, completed_at: new Date().toISOString() });
    emitProgress(jobId, 0, `Failed: ${msg}`);
    return;
  }

  try {
    const result = await handler(payload, (pct, msg) => {
      updateJobRow(jobId, { progress_pct: pct, progress_message: msg });
      emitProgress(jobId, pct, msg);
    });
    updateJobRow(jobId, {
      status: "complete",
      progress_pct: 100,
      progress_message: "Complete",
      output_json: result ? JSON.stringify(result) : null,
      completed_at: new Date().toISOString(),
    });
    emitProgress(jobId, 100, "Complete");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    updateJobRow(jobId, {
      status: "failed",
      error_message: msg,
      completed_at: new Date().toISOString(),
    });
    emitProgress(jobId, 0, `Failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// BullMQ Worker (starts when Redis is available)
// ---------------------------------------------------------------------------
export function startWorker(): void {
  const redis = getRedis();
  if (!redis) {
    console.warn("[JobQueueService] Worker not started — no Redis connection.");
    return;
  }

  worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { job_id, job_type, payload } = job.data as {
        job_id: number;
        job_type: string;
        payload: Record<string, unknown>;
      };

      updateJobRow(job_id, {
        status: "running",
        started_at: new Date().toISOString(),
        progress_pct: 0,
        progress_message: "Starting…",
        retry_count: job.attemptsMade,
      });

      const handler = handlers.get(job_type);
      if (!handler) throw new Error(`No handler for job type: ${job_type}`);

      const result = await handler(payload, (pct, msg) => {
        updateJobRow(job_id, { progress_pct: pct, progress_message: msg });
        emitProgress(job_id, pct, msg);
        job.updateProgress(pct);
      });

      updateJobRow(job_id, {
        status: "complete",
        progress_pct: 100,
        progress_message: "Complete",
        output_json: result ? JSON.stringify(result) : null,
        completed_at: new Date().toISOString(),
      });
      emitProgress(job_id, 100, "Complete");
      return result;
    },
    {
      connection: redis,
      concurrency: 5,
    },
  );

  worker.on("failed", (job, err) => {
    if (!job) return;
    const { job_id } = job.data as { job_id: number };
    updateJobRow(job_id, {
      status: job.attemptsMade < 3 ? "queued" : "failed",
      error_message: err.message,
      retry_count: job.attemptsMade,
      completed_at: job.attemptsMade >= 3 ? new Date().toISOString() : undefined,
    });
  });

  console.log("[JobQueueService] BullMQ worker started.");
}

// ---------------------------------------------------------------------------
// Job status query
// ---------------------------------------------------------------------------
export function getJobStatus(jobId: number): AgentJob | undefined {
  return db.select().from(agent_jobs).where(eq(agent_jobs.id, jobId)).get();
}

export function getJobsForEngagement(engagementId: number, limit = 50): AgentJob[] {
  return db
    .select()
    .from(agent_jobs)
    .where(eq(agent_jobs.engagement_id, engagementId))
    .orderBy(sql`created_at DESC`)
    .limit(limit)
    .all();
}

export function cancelJob(jobId: number): boolean {
  const job = getJobStatus(jobId);
  if (!job || job.status === "complete" || job.status === "failed") return false;
  updateJobRow(jobId, { status: "cancelled", completed_at: new Date().toISOString() });
  return true;
}

export function isRedisAvailable(): boolean {
  return redisAvailable;
}
