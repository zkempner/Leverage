/**
 * COMMAND CENTER — AI Service
 *
 * One-shot Claude AI integrations for Command Center features:
 *   1. AI Kickoff — generates DRL template, work plan, interview guides from scope
 *   2. DRL Gap Analysis — identifies missing documents
 *   3. Meeting Extraction — extracts summary, takeaways, action items from transcripts
 *   4. Email Generation — 7 email types × 3 tones
 *   5. Interview Guide Generation — role × workstream matrix
 *   6. RIF Legal/Union Check — country-aware legal considerations
 *   7. Status Report Generation — 3 format options
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../storage";
import {
  cc_engagements, cc_drl_items, cc_work_plan_phases, cc_work_plan_tasks,
  cc_interview_guides, cc_meetings, cc_action_items, cc_rif_entries,
  cc_key_metrics, cc_risks_issues, cc_milestones, cc_stakeholders,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

const MODEL = "claude-sonnet-4-20250514";

// ---------------------------------------------------------------------------
// Helper: call Claude and return text
// ---------------------------------------------------------------------------
async function askClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock?.text ?? "";
  } catch (err: any) {
    console.error("[CC-AI] Claude call failed:", err.message);
    return "";
  }
}

// ---------------------------------------------------------------------------
// 1. AI Kickoff — generates DRL template, work plan phases + tasks
// ---------------------------------------------------------------------------
export async function runAIKickoff(engagementId: number): Promise<{
  drlCount: number;
  phaseCount: number;
  taskCount: number;
  guideCount: number;
}> {
  const eng = db.select().from(cc_engagements).where(eq(cc_engagements.id, engagementId)).get();
  if (!eng) throw new Error("Engagement not found");

  const workstreams = eng.workstreams_in_scope ? JSON.parse(eng.workstreams_in_scope) : [];
  const now = new Date().toISOString();

  // Generate DRL template
  const drlPrompt = `You are an A&M PEPI consultant preparing a Document Request List (DRL) for a ${eng.engagement_type?.replace(/_/g, " ")} engagement.

Portfolio Company: ${eng.portfolio_company}
Industry: ${eng.industry || "Not specified"}
Scope: ${eng.scope_description || "General"}
Workstreams: ${workstreams.join(", ") || "Not specified"}

Generate a comprehensive DRL with 30-50 document requests. For each, provide:
- item_number (sequential)
- document_name (specific document title)
- category (one of: Financial, Operational, HR, IT, Legal, Commercial, Supply_Chain, Real_Estate, Insurance, Tax, Environmental_Safety)
- priority (critical, high, medium, or low)
- workstream (matching the scope workstreams where relevant)

Respond ONLY with a JSON array. No markdown, no explanation. Example:
[{"item_number":1,"document_name":"3-Year P&L Statement","category":"Financial","priority":"critical","workstream":"Finance / CFO"}]`;

  const drlResponse = await askClaude(
    "You are an expert A&M PEPI consultant. Respond only with valid JSON arrays.",
    drlPrompt
  );

  let drlItems: any[] = [];
  try {
    drlItems = JSON.parse(drlResponse);
  } catch { drlItems = []; }

  for (const item of drlItems) {
    db.insert(cc_drl_items).values({
      engagement_id: engagementId,
      item_number: item.item_number,
      document_name: item.document_name,
      category: item.category,
      priority: item.priority || "medium",
      workstream: item.workstream,
      status: "requested",
      follow_up_count: 0,
      materiality_flag: item.priority === "critical" ? 1 : 0,
      date_requested: now.split("T")[0],
      created_at: now,
      updated_at: now,
    }).run();
  }

  // Generate Work Plan phases and tasks
  const wpPrompt = `You are an A&M PEPI consultant creating a work plan for a ${eng.engagement_type?.replace(/_/g, " ")} engagement.

Portfolio Company: ${eng.portfolio_company}
Industry: ${eng.industry || "Not specified"}
Scope: ${eng.scope_description || "General"}
Workstreams: ${workstreams.join(", ") || "Not specified"}
Start Date: ${eng.start_date || "TBD"}
End Date: ${eng.end_date || "TBD"}

Generate a work plan with 3-5 phases and 4-8 tasks per phase across the workstreams.

Respond ONLY with JSON:
{
  "phases": [{"name":"Phase Name","sort_order":1}],
  "tasks": [{"phase_index":0,"workstream":"Commercial","task_name":"Task description","priority":"high","deliverable":"Output document"}]
}`;

  const wpResponse = await askClaude(
    "You are an expert A&M PEPI consultant. Respond only with valid JSON.",
    wpPrompt
  );

  let workPlan: any = { phases: [], tasks: [] };
  try {
    workPlan = JSON.parse(wpResponse);
  } catch { /* ignore */ }

  const phaseIdMap: Record<number, number> = {};
  for (const phase of workPlan.phases || []) {
    const result = db.insert(cc_work_plan_phases).values({
      engagement_id: engagementId,
      name: phase.name,
      sort_order: phase.sort_order || 0,
      status: "not_started",
    }).run();
    phaseIdMap[phase.sort_order - 1] = Number(result.lastInsertRowid);
  }

  for (const task of workPlan.tasks || []) {
    const phaseId = phaseIdMap[task.phase_index] || phaseIdMap[0];
    if (phaseId) {
      db.insert(cc_work_plan_tasks).values({
        engagement_id: engagementId,
        phase_id: phaseId,
        workstream: task.workstream,
        task_name: task.task_name,
        priority: task.priority || "medium",
        deliverable: task.deliverable,
        status: "not_started",
        created_at: now,
        updated_at: now,
      }).run();
    }
  }

  // Generate Interview Guides for key roles
  const igPrompt = `You are an A&M PEPI consultant preparing interview guides for a ${eng.engagement_type?.replace(/_/g, " ")} engagement.

Portfolio Company: ${eng.portfolio_company}
Industry: ${eng.industry || "Not specified"}
Scope: ${eng.scope_description || "General"}
Workstreams: ${workstreams.join(", ") || "Not specified"}

Generate 3-5 interview guides for key stakeholder roles. For each, provide:
- title (e.g., "CFO Interview Guide — Financial Operations")
- interviewee_role (e.g., "Chief Financial Officer")
- workstream
- guide_content (markdown with 8-12 targeted questions organized by topic, plus opening/closing notes)

Respond ONLY with a JSON array of objects.`;

  const igResponse = await askClaude(
    "You are an expert A&M PEPI consultant. Respond only with valid JSON arrays.",
    igPrompt
  );

  let guides: any[] = [];
  try {
    guides = JSON.parse(igResponse);
  } catch { guides = []; }

  for (const guide of guides) {
    db.insert(cc_interview_guides).values({
      engagement_id: engagementId,
      title: guide.title,
      interviewee_role: guide.interviewee_role,
      workstream: guide.workstream,
      scope_context: eng.scope_description,
      guide_content: guide.guide_content,
      status: "draft",
      created_at: now,
      updated_at: now,
    }).run();
  }

  return {
    drlCount: drlItems.length,
    phaseCount: (workPlan.phases || []).length,
    taskCount: (workPlan.tasks || []).length,
    guideCount: guides.length,
  };
}

// ---------------------------------------------------------------------------
// 2. DRL Gap Analysis
// ---------------------------------------------------------------------------
export async function runDRLGapAnalysis(engagementId: number): Promise<any[]> {
  const eng = db.select().from(cc_engagements).where(eq(cc_engagements.id, engagementId)).get();
  if (!eng) throw new Error("Engagement not found");

  const existingDrls = db.select().from(cc_drl_items).where(eq(cc_drl_items.engagement_id, engagementId)).all();
  const existingNames = existingDrls.map(d => d.document_name).join(", ");
  const workstreams = eng.workstreams_in_scope ? JSON.parse(eng.workstreams_in_scope) : [];

  const prompt = `You are an A&M PEPI consultant reviewing a Document Request List for completeness.

Engagement Type: ${eng.engagement_type?.replace(/_/g, " ")}
Industry: ${eng.industry || "Not specified"}
Workstreams: ${workstreams.join(", ") || "Not specified"}
Scope: ${eng.scope_description || "General"}

Current DRL items (${existingDrls.length} total): ${existingNames}

Identify 10-20 MISSING documents that should be requested but aren't on the list. Consider industry-specific requirements and the engagement type.

Respond ONLY with a JSON array:
[{"category":"Financial","document_name":"Missing Doc Name","rationale":"Why this is needed","priority":"high"}]`;

  const response = await askClaude(
    "You are an expert A&M PEPI consultant specializing in due diligence. Respond only with valid JSON arrays.",
    prompt
  );

  try {
    return JSON.parse(response);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// 3. Meeting Notes Extraction
// ---------------------------------------------------------------------------
export async function extractMeetingNotes(rawInput: string, meetingType: string): Promise<{
  ai_summary: string;
  key_takeaways: string[];
  action_items: Array<{ description: string; owner_name: string; due_date: string; priority: string }>;
}> {
  const prompt = `Analyze the following ${meetingType || "meeting"} transcript/notes and extract:

1. A concise 2-3 paragraph summary
2. 5-10 key takeaways (bullet points)
3. All action items with owner, due date (if mentioned), and priority

Meeting content:
${rawInput}

Respond ONLY with JSON:
{
  "ai_summary": "...",
  "key_takeaways": ["..."],
  "action_items": [{"description":"...","owner_name":"...","due_date":"...","priority":"medium"}]
}`;

  const response = await askClaude(
    "You are an expert meeting note analyst. Extract structured information from meeting transcripts. Respond only with valid JSON.",
    prompt
  );

  try {
    return JSON.parse(response);
  } catch {
    return { ai_summary: "", key_takeaways: [], action_items: [] };
  }
}

// ---------------------------------------------------------------------------
// 4. Email Generation
// ---------------------------------------------------------------------------
export async function generateEmail(
  engagementId: number,
  emailType: string,
  tone: string,
  context: string,
  recipients: string[]
): Promise<{ subject: string; body: string }> {
  const eng = db.select().from(cc_engagements).where(eq(cc_engagements.id, engagementId)).get();

  const toneDescriptions: Record<string, string> = {
    formal: "formal, polished, and corporate — appropriate for PE sponsors and C-suite",
    professional: "professional but conversational — direct and efficient",
    friendly: "warm and approachable while remaining professional",
  };

  const typeDescriptions: Record<string, string> = {
    drl_followup: "a follow-up email requesting outstanding documents from the DRL",
    status_update: "a weekly/bi-weekly status update to PE sponsors or steering committee",
    meeting_recap: "a meeting recap summarizing key discussion points, decisions, and action items",
    introduction: "an introduction email for a new team member or stakeholder",
    interview_scheduling: "scheduling an interview with a portfolio company stakeholder",
    escalation: "an escalation notice about a critical issue or blocker",
    kickoff: "a kickoff communication for the engagement",
  };

  const prompt = `Generate a ${typeDescriptions[emailType] || emailType} email.

Engagement: ${eng?.name || ""}
Portfolio Company: ${eng?.portfolio_company || ""}
PE Sponsor: ${eng?.pe_sponsor || ""}
Tone: ${toneDescriptions[tone] || tone}
Recipients: ${recipients.join(", ")}
Context: ${context}

Generate a complete email with subject line and body. The body should be professional, clear, and actionable.

Respond ONLY with JSON:
{"subject": "...", "body": "..."}`;

  const response = await askClaude(
    "You are an expert A&M PEPI consultant writing professional emails. Respond only with valid JSON.",
    prompt
  );

  try {
    return JSON.parse(response);
  } catch {
    return { subject: "", body: "" };
  }
}

// ---------------------------------------------------------------------------
// 5. Interview Guide Generation
// ---------------------------------------------------------------------------
export async function generateInterviewGuide(
  engagementId: number,
  intervieweeName: string,
  intervieweeRole: string,
  workstream: string,
  additionalContext: string
): Promise<{ title: string; guide_content: string }> {
  const eng = db.select().from(cc_engagements).where(eq(cc_engagements.id, engagementId)).get();
  const workstreams = eng?.workstreams_in_scope ? JSON.parse(eng.workstreams_in_scope) : [];

  const prompt = `Generate an interview guide for a ${eng?.engagement_type?.replace(/_/g, " ")} engagement.

Portfolio Company: ${eng?.portfolio_company || ""}
Industry: ${eng?.industry || "Not specified"}
Engagement Scope: ${eng?.scope_description || "General"}
Workstreams: ${workstreams.join(", ")}

Interviewee: ${intervieweeName || "TBD"} — ${intervieweeRole}
Focus Workstream: ${workstream}
Additional Context: ${additionalContext}

Create a comprehensive interview guide using a role × workstream matrix approach. Include:
1. Opening (2-3 introductory questions)
2. Role-specific questions (5-8 questions tailored to the interviewee's responsibilities)
3. Workstream-specific questions (5-8 questions focused on the engagement workstream)
4. Cross-functional questions (3-4 questions about interdependencies)
5. Forward-looking questions (2-3 questions about improvements and priorities)
6. Closing

Format as clean markdown with headers and numbered questions.`;

  const response = await askClaude(
    "You are an expert A&M PEPI consultant preparing interview guides for due diligence and performance improvement engagements.",
    prompt
  );

  return {
    title: `${intervieweeRole} Interview Guide — ${workstream}`,
    guide_content: response,
  };
}

// ---------------------------------------------------------------------------
// 6. RIF Legal/Union Check
// ---------------------------------------------------------------------------
export async function runRIFLegalCheck(engagementId: number, entryId: number): Promise<{
  ai_legal_notes: string;
  legal_review_flag: boolean;
  union_flag: boolean;
}> {
  const entry = db.select().from(cc_rif_entries).where(eq(cc_rif_entries.id, entryId)).get();
  if (!entry) throw new Error("RIF entry not found");

  const prompt = `Analyze the legal and labor considerations for a Reduction in Force (RIF) action.

Country: ${entry.country || "United States"}
Location: ${entry.location || "Not specified"}
Employee Title: ${entry.title || "Not specified"}
Department: ${entry.department || "Not specified"}
Business Unit: ${entry.business_unit || "Not specified"}

Provide:
1. Key labor law considerations for this country/jurisdiction
2. Whether union/works council involvement is likely (true/false)
3. Whether a legal review is recommended (true/false)
4. Specific risks and requirements (notice periods, severance requirements, protected classes, WARN Act applicability, etc.)

Respond ONLY with JSON:
{
  "ai_legal_notes": "Detailed analysis...",
  "legal_review_flag": true,
  "union_flag": false
}`;

  const response = await askClaude(
    "You are an expert employment law consultant advising on RIF compliance across global jurisdictions. Respond only with valid JSON.",
    prompt
  );

  try {
    return JSON.parse(response);
  } catch {
    return { ai_legal_notes: "Unable to generate analysis", legal_review_flag: true, union_flag: false };
  }
}

// ---------------------------------------------------------------------------
// 7. Status Report Generation
// ---------------------------------------------------------------------------
export async function generateStatusReport(
  engagementId: number,
  format: string,
  periodStart: string,
  periodEnd: string
): Promise<string> {
  const eng = db.select().from(cc_engagements).where(eq(cc_engagements.id, engagementId)).get();
  if (!eng) throw new Error("Engagement not found");

  // Gather data from all modules
  const drlsTotal = db.select({ count: sql<number>`count(*)` }).from(cc_drl_items).where(eq(cc_drl_items.engagement_id, engagementId)).get();
  const drlsReceived = db.select({ count: sql<number>`count(*)` }).from(cc_drl_items).where(sql`engagement_id = ${engagementId} AND status = 'received'`).get();
  const actionsOpen = db.select({ count: sql<number>`count(*)` }).from(cc_action_items).where(sql`engagement_id = ${engagementId} AND status IN ('open','in_progress')`).get();
  const risks = db.select().from(cc_risks_issues).where(sql`engagement_id = ${engagementId} AND status = 'open'`).all();
  const milestones = db.select().from(cc_milestones).where(eq(cc_milestones.engagement_id, engagementId)).all();

  const formatInstructions: Record<string, string> = {
    bullet: "Simple bullet-point format: Accomplishments, Next Steps, Risks/Escalations. Clean and scannable.",
    structured: "Structured sections: Executive Summary, Workstream Updates, Key Metrics/KPIs, Risks & Issues, Action Items, Next Week's Priorities.",
    metrics_narrative: "Dashboard-style with key metrics prominently displayed, followed by narrative sections. Numbers-heavy for PE sponsors.",
  };

  const prompt = `Generate a weekly status report for an A&M PEPI engagement.

Engagement: ${eng.name}
Portfolio Company: ${eng.portfolio_company}
PE Sponsor: ${eng.pe_sponsor || "N/A"}
Period: ${periodStart} to ${periodEnd}
Format: ${formatInstructions[format] || formatInstructions.structured}

Current Status:
- DRL Progress: ${drlsReceived?.count || 0} of ${drlsTotal?.count || 0} documents received
- Open Action Items: ${actionsOpen?.count || 0}
- Open Risks/Issues: ${risks.length}
- Milestones: ${milestones.filter(m => m.status === "completed").length} completed, ${milestones.filter(m => m.status === "upcoming" || m.status === "in_progress").length} remaining

Generate a professional status report in the specified format. Use markdown formatting.`;

  return await askClaude(
    "You are an expert A&M PEPI consultant writing executive status reports. Write clear, concise, and actionable reports.",
    prompt
  );
}
