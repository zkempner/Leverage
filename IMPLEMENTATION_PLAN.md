# LEVERAGE v3 — "One-Click" Procurement Automation Platform

## Context

LEVERAGE v3 is an existing procurement analytics platform with strong analytical engines (categorization, benchmarking, financial modeling, Monte Carlo, Kraljic, etc.) but no orchestration layer to chain them into end-to-end engagement workflows. Today, each engine/service runs independently via manual API calls. The goal is to build a **pipeline orchestrator** that automates the full engagement lifecycle — from data intake through deliverable generation — for three engagement types: Diagnostic, ODD (Operational Due Diligence), and Transformation.

The user has indicated willingness to rebuild with the best architecture rather than patch the existing codebase. Business logic validation (e.g., savings calculations, benchmarks) needs scrutiny as some formulas may be placeholder-quality.

---

## Existing Architecture (Key Files)

| Layer | Files | Pattern |
|-------|-------|---------|
| Engines (pure computation) | `server/engines/*.ts` — categorization, benchmarks, financial-model, monte-carlo, kraljic, maturity, vendor-analysis, normalization, sizing | No DB/API calls, typed inputs/outputs |
| Services (stateful orchestration) | `server/services/*.ts` — DeliverableService, ContractExtractionService, MarketDataService, WebSearchService, JobQueueService, PortfolioService | DB + AI + external APIs, BullMQ jobs |
| Routes | `server/routes.ts` (3387 lines, monolithic) | Express, parse → call engine/service → JSON |
| Schema | `shared/schema.ts` — 28 Drizzle ORM tables | Zod insert schemas |
| Storage | `server/storage.ts` — SQLite, `PRAGMA user_version` migrations | Additive DDL blocks |
| Python sidecar | `python-sidecar/main.py` — FastAPI on :5001 | Doc gen (pptx/docx/xlsx), yfinance, Whisper |
| Frontend | `client/src/pages/*.tsx` — React + Wouter + TanStack Query + Recharts + shadcn/ui | |
| Job Queue | BullMQ + Redis (fallback: in-process), `agent_jobs` table, SSE progress | Concurrency 5 |

---

## Implementation Plan

### PHASE 1: Foundation + Diagnostic Pipeline (Weeks 1-6)

#### 1A. Pipeline Orchestrator + Schema (Weeks 1-2)

**New file: `server/services/PipelineOrchestrator.ts`** — the centerpiece

- `PipelineDefinition` with typed steps, dependency DAG, parallel groups, review gates
- Topological sort on dependency graph → dispatches steps via existing `JobQueueService.enqueue()`
- Steps with `requires_review: true` pause at `awaiting_review` for human approval
- Step executors registered per step type, wrapping existing engines/services
- Database is the artifact-passing mechanism (consistent with existing architecture)

**Diagnostic pipeline DAG:**
```
data_intake → cleansing → [categorization, normalization] → spend_analysis →
[opportunity_sizing, spend_flags, vendor_analysis] → [kraljic, benchmarks] →
financial_model → monte_carlo → deliverable_gen
```

**New schema tables** (add to `shared/schema.ts`, migrate in `storage.ts` version 3):
- `pipeline_runs` — engagement_id, pipeline_type, status, progress tracking
- `pipeline_steps` — pipeline_run_id, step_id, status, depends_on, input/output JSON, review fields

**New routes** (new file `server/routes/pipeline.routes.ts`):
- `POST /api/engagements/:id/pipeline` — start pipeline
- `GET /api/engagements/:id/pipeline` — status + steps
- `POST /api/pipeline-steps/:stepId/review` — approve/reject gate
- `POST /api/engagements/:id/pipeline/cancel` — cancel

**New frontend: `client/src/pages/pipeline-dashboard.tsx`**
- Visual pipeline graph (nodes=steps, edges=dependencies, color=status)
- Real-time SSE progress (reuse `registerSseClient`)
- Review queue with approve/reject
- Step detail panel, re-run failed steps

#### 1B. Smart Data Intake (Weeks 2-3)

**New file: `server/engines/data-intake.ts`** — pure engine

- `detectFormat(columns, sampleRows)` → SAP/Oracle/NetSuite/Dynamics/QuickBooks/generic
- `mapColumns(format, columns)` → standard field mapping
- `assessConfidence(records, mapping)` → auto-apply high-confidence fixes (>0.85), queue low-confidence for review

**New frontend: `client/src/pages/smart-intake.tsx`** — wizard: upload → detect → map → confirm

#### 1C. Engagement Configurator (Weeks 3-4)

**New file: `server/engines/engagement-configurator.ts`** — pure engine

- Input: engagement_type, industry, company_size, revenue, timeline
- Output: pipeline_definition, milestone_calendar, KPI targets
- Static lookup tables: industry × size × type → recommended config
- 20+ industries (extend existing `INDUSTRIES` from benchmarks.ts)

**New routes:**
- `POST /api/configure-engagement` — returns recommended pipeline
- `POST /api/engagements/quick-start` — create + start in one call

#### 1D. Diagnostic Deliverables (Weeks 4-5)

**Extend: `server/services/DeliverableService.ts`** — add `diagnostic_summary_pptx`, `category_strategy_pptx`

**Extend: `python-sidecar/main.py`** — new `/generate/` endpoints for each type

#### 1E. Integration Testing (Weeks 5-6)

Wire all Phase 1 components end-to-end. Full diagnostic engagement: setup → intake → pipeline → review → deliverables.

---

### PHASE 2: ODD Mode + New Analytical Modules (Weeks 7-12)

#### 2A. Should-Cost Modeling Engine (Weeks 7-8)

**New file: `server/engines/should-cost.ts`** — pure engine

- Cost breakdown templates by category (material/labor/overhead/logistics/margin)
- Labor rate indices by geography (50+ countries)
- `computeShouldCost()`, `computeTCO()`
- New tables: `should_cost_models`, `should_cost_components`
- New page: `client/src/pages/should-cost.tsx`

#### 2B. Working Capital Optimization (Weeks 8-9)

**Extend: `server/engines/financial-model.ts`** (existing `computeWorkingCapital()`)

- DPO benchmarks, early payment discount analysis, cash conversion cycle, working capital bridge
- New page: `client/src/pages/working-capital.tsx`

#### 2C. Tail Spend Automation (Weeks 9-10)

**New file: `server/engines/tail-spend.ts`** — pure engine

- Works on existing `spend_records` with `spend_flag = 'tail'`
- P-card strategy, catalog opportunities, maverick elimination, ROI modeling
- New page: `client/src/pages/tail-spend.tsx`

#### 2D. Contract Analytics + Negotiation Prep (Weeks 10-11)

**Extend: `server/services/ContractExtractionService.ts`**

- Term benchmarking, expiry calendar, negotiation brief generation (Claude for narrative)
- New table: `negotiation_preps`
- New page: `client/src/pages/negotiation-prep.tsx`

#### 2E. ODD Pipeline (Weeks 11-12)

Configure ODD variant in orchestrator:
- Compressed timeline, minimal manual intervention
- Focus: spend analysis, quick-wins, risk, EBITDA bridge
- Skip: detailed category strategy, transformation roadmap
- Add: management assessment, pro-forma savings for PE buyer

---

### PHASE 3: Full Transformation + Advanced Modules (Weeks 13-20)

#### 3A. Sourcing Suite (Weeks 13-15)

**New file: `server/services/SourcingService.ts`** — largest new service

- RFP/RFQ generation (Claude + Python sidecar for docs)
- Supplier discovery (via WebSearchService + Exa.ai)
- Supplier qualification scoring
- Bid analysis with should-cost overlay
- Award recommendation
- New tables: `sourcing_events`, `sourcing_bids`, `supplier_qualifications`
- New page: `client/src/pages/sourcing-suite.tsx` (tabs: RFP Builder | Bid Comparison | Discovery | Qualification | Award)

#### 3B. Interview Synthesis (Weeks 15-16)

**New file: `server/services/InterviewService.ts`**

- Upload notes/audio → transcription (Whisper via Python sidecar) → theme extraction (Claude)
- Cross-interview synthesis: common themes, contradictions, stakeholder alignment
- Feeds maturity engine with interview evidence
- New tables: `interview_records`, `interview_themes`
- New page: `client/src/pages/interview-hub.tsx`

#### 3C. Logistics & Supply Chain (Weeks 16-17)

**New file: `server/engines/logistics.ts`** — pure engine

- Freight analysis, EOQ, ABC-XYZ classification, safety stock, S&OP maturity
- New tables: `freight_records`, `inventory_items`
- New page: `client/src/pages/logistics-dashboard.tsx`

#### 3D. ESG / Sustainability (Weeks 17-18)

**New file: `server/services/ESGService.ts`**

- Scope 3 emissions estimation (EPA EEIO factors), supplier ESG scoring (web search + Claude)
- New table: `esg_scores`
- New page: `client/src/pages/esg-dashboard.tsx`

#### 3E. Demand Management (Weeks 18-19)

**New file: `server/engines/demand-management.ts`** — pure engine

- Spec rationalization, standardization, demand levers (5-15% beyond sourcing)
- New table: `demand_management_opportunities`
- New page: `client/src/pages/demand-management.tsx`

#### 3F. Enhanced Maturity + Change Management (Week 19)

**Extend: `server/engines/maturity.ts`**

- Add 3 dimensions: org_effectiveness, talent_skills, governance
- Transformation roadmap, stakeholder map, change readiness, RACI matrix

#### 3G. Cross-Engagement Intelligence (Weeks 19-20)

**Extend: `server/services/PortfolioService.ts`**

- Anonymized benchmarks across engagements, learnings database, PE portfolio analytics
- New tables: `engagement_benchmarks`, `engagement_learnings`
- New page: `client/src/pages/cross-engagement.tsx`

#### 3H. Full Deliverable Suite (Week 20)

Extend Python sidecar with `/generate/` endpoints for all new document types (category strategy, negotiation playbook, RFP package, working capital memo, ESG report, interview synthesis, logistics report, award memo).

---

## New Files Summary

**Engines (6):** data-intake, should-cost, tail-spend, logistics, demand-management, engagement-configurator

**Services (4):** PipelineOrchestrator, SourcingService, InterviewService, ESGService

**Route modules (5):** pipeline, sourcing, interview, esg, logistics

**Frontend pages (12):** pipeline-dashboard, smart-intake, should-cost, sourcing-suite, interview-hub, logistics-dashboard, working-capital, tail-spend, esg-dashboard, negotiation-prep, cross-engagement, demand-management

**New schema tables (16):** pipeline_runs, pipeline_steps, should_cost_models, should_cost_components, sourcing_events, sourcing_bids, supplier_qualifications, interview_records, interview_themes, freight_records, inventory_items, esg_scores, demand_management_opportunities, engagement_benchmarks, engagement_learnings, negotiation_preps

---

## Key Architectural Decisions

1. **Database as artifact bus** — steps pass data through SQLite tables, not in-memory. Crash recovery: pipeline resumes from last completed step.
2. **Orchestrator wraps JobQueueService** — each step dispatched as BullMQ job via existing `enqueue()`. Orchestrator manages DAG; job queue manages execution/retries/SSE.
3. **Schema migration** — bump `PRAGMA user_version` to 3. Additive `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE`. No DROP/recreate.
4. **Routes decomposition** — split monolithic `routes.ts` into `server/routes/*.routes.ts` modules.
5. **Engine vs Service** — pure computation = engine; external APIs/AI/complex DB = service.
6. **Python sidecar** — only for Python-specific needs (doc gen, Whisper, yfinance). All other logic in TypeScript.

---

## Verification Plan

1. **Unit tests** — each new engine gets deterministic tests with fixture data
2. **Integration test** — full diagnostic pipeline: create engagement → upload CSV → run pipeline → verify all steps complete → generate deliverable
3. **Pipeline dashboard** — visual verification of step progression, SSE updates, review gates
4. **ODD variant** — compressed pipeline with ODD-specific output
5. **Error recovery** — kill a step mid-run, verify pipeline resumes from last checkpoint
6. **Review queue** — verify approval gates pause pipeline and resume on approval

---

## Implementation Starting Point

Begin with **Phase 1A** — the PipelineOrchestrator is the foundation everything else builds on. First PR should include:
1. Schema tables (`pipeline_runs`, `pipeline_steps`) + migration
2. `PipelineOrchestrator.ts` with step executor registration pattern
3. Diagnostic pipeline definition
4. Pipeline routes
5. Basic pipeline dashboard page
