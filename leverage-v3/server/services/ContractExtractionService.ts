/**
 * LEVERAGE v3 — ContractExtractionService (P1-18, P1-19)
 *
 * Pipeline:
 *   1. Text extraction  — pdf-parse (PDF) | mammoth (DOCX) | raw (TXT)
 *   2. Claude extraction — supplier, value, dates, payment terms,
 *                          auto-renewal, escalation, SLA, termination,
 *                          liability cap, exclusivity, notice period
 *   3. Auto-create       — if confidence > 0.7, write to contracts table
 *   4. Expiry alerts     — create watchlist_alert for contracts expiring
 *                          within 90 / 60 / 30 days
 *
 * Registered as job handler "contract_extract" on the JobQueueService.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../storage";
import {
  contract_extractions, contracts, watchlist_alerts,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import * as path from "path";
import * as fs from "fs";

// Lazy imports — pdf-parse and mammoth are ESM-unfriendly; load at runtime
async function extractPdfText(buffer: Buffer): Promise<string> {
  // @ts-ignore — pdf-parse has no perfect TS types
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(buffer);
  return result.text ?? "";
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? "";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ExtractionInput {
  extraction_id: number;
  engagement_id: number;
  file_name: string;
  file_path: string;
  buffer?: Buffer; // only available during inline run; disk path used for queue
}

interface ClaudeExtractionResult {
  supplier_name: string | null;
  contract_value_annual: number | null;
  start_date: string | null;
  end_date: string | null;
  payment_terms: string | null;
  auto_renewal: boolean;
  escalation_clause: string | null;
  key_clauses: {
    termination_rights: string | null;
    sla: string | null;
    liability_cap: string | null;
    exclusivity: string | null;
    notice_period: string | null;
  };
  risk_flags: string[];
  confidence_score: number;
  summary: string;
}

// ---------------------------------------------------------------------------
// Anthropic client (shared with CopilotService)
// ---------------------------------------------------------------------------
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

const MODEL = "claude-sonnet-4-20250514";

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------
export async function extractText(
  buffer: Buffer,
  fileName: string,
): Promise<{ text: string; method: string }> {
  const ext = path.extname(fileName).toLowerCase();

  if (ext === ".pdf") {
    try {
      const text = await extractPdfText(buffer);
      return { text, method: "pdf-parse" };
    } catch (err) {
      console.warn("[ContractExtraction] pdf-parse failed, returning empty:", err);
      return { text: "", method: "pdf-parse-failed" };
    }
  }

  if (ext === ".docx" || ext === ".doc") {
    try {
      const text = await extractDocxText(buffer);
      return { text, method: "mammoth" };
    } catch (err) {
      console.warn("[ContractExtraction] mammoth failed:", err);
      return { text: "", method: "mammoth-failed" };
    }
  }

  if (ext === ".txt" || ext === ".md") {
    return { text: buffer.toString("utf-8"), method: "raw-text" };
  }

  // Fallback: try UTF-8 decode
  return { text: buffer.toString("utf-8").slice(0, 50_000), method: "raw-fallback" };
}

// ---------------------------------------------------------------------------
// Claude extraction
// ---------------------------------------------------------------------------
async function runClaudeExtraction(
  rawText: string,
  fileName: string,
): Promise<ClaudeExtractionResult> {
  // Truncate to ~40k chars to stay within token limits
  const truncated = rawText.slice(0, 40_000);
  const wasTruncated = rawText.length > 40_000;

  const prompt = `You are an expert contract analyst. Extract structured information from the following contract document.

File: ${fileName}${wasTruncated ? " [TRUNCATED — first 40,000 chars shown]" : ""}

CONTRACT TEXT:
${truncated}

---

Extract the following fields. Return ONLY valid JSON, no markdown fences, no preamble.

{
  "supplier_name": "<counterparty/vendor name, or null>",
  "contract_value_annual": <annual value as number in USD, or null if not stated>,
  "start_date": "<ISO date YYYY-MM-DD or null>",
  "end_date": "<ISO date YYYY-MM-DD or null>",
  "payment_terms": "<e.g. Net-30, Net-60, 2/10 Net-30, or null>",
  "auto_renewal": <true if auto-renewal clause exists, false otherwise>,
  "escalation_clause": "<verbatim escalation text if found, else null>",
  "key_clauses": {
    "termination_rights": "<brief summary or null>",
    "sla": "<SLA summary or null>",
    "liability_cap": "<liability cap amount/summary or null>",
    "exclusivity": "<exclusivity summary or null>",
    "notice_period": "<notice period e.g. '30 days' or null>"
  },
  "risk_flags": ["<one of: auto_renewal_risk, no_termination_rights, missing_sla, uncapped_liability, evergreen_contract, price_escalation, exclusivity_lock, short_notice_period, missing_end_date, high_value_no_contract>"],
  "confidence_score": <0.0 to 1.0 — how confident you are in the extraction given the document quality>,
  "summary": "<3 sentences: counterparty, key commercial terms, top 1-2 risks>"
}

Rules:
- If a field is not present in the document, use null (not empty string).
- contract_value_annual: annualize if stated as monthly/quarterly. Use null if not specified.
- risk_flags: include only flags that genuinely apply. Empty array [] if none.
- confidence_score: 0.9+ for clear contracts, 0.5-0.8 for partial/ambiguous, <0.5 for poor quality.
- Return ONLY the JSON object.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("")
    .trim();

  // Strip any accidental markdown fences
  const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    return JSON.parse(cleaned) as ClaudeExtractionResult;
  } catch (err) {
    console.error("[ContractExtraction] JSON parse failed:", cleaned.slice(0, 200));
    // Return a low-confidence shell so we don't crash
    return {
      supplier_name: null,
      contract_value_annual: null,
      start_date: null,
      end_date: null,
      payment_terms: null,
      auto_renewal: false,
      escalation_clause: null,
      key_clauses: { termination_rights: null, sla: null, liability_cap: null, exclusivity: null, notice_period: null },
      risk_flags: [],
      confidence_score: 0.1,
      summary: "Extraction failed — could not parse Claude response.",
    };
  }
}

// ---------------------------------------------------------------------------
// Auto-create contract row if confidence >= 0.7
// ---------------------------------------------------------------------------
function autoCreateContract(
  engagementId: number,
  extractionId: number,
  result: ClaudeExtractionResult,
): number | null {
  if (result.confidence_score < 0.7) return null;
  if (!result.supplier_name) return null;

  const now = new Date().toISOString();

  const inserted = db
    .insert(contracts)
    .values({
      engagement_id: engagementId,
      supplier_name: result.supplier_name,
      contract_value_annual: result.contract_value_annual ?? undefined,
      start_date: result.start_date ?? undefined,
      end_date: result.end_date ?? undefined,
      auto_renew: result.auto_renewal ? 1 : 0,
      payment_terms: result.payment_terms ?? undefined,
      has_price_escalation: result.escalation_clause ? 1 : 0,
      escalation_rate: undefined,
      notes: `Auto-created from extraction #${extractionId}. ${result.summary}`,
      created_at: now,
    })
    .returning({ id: contracts.id })
    .get();

  return inserted?.id ?? null;
}

// ---------------------------------------------------------------------------
// Expiry alert creation
// ---------------------------------------------------------------------------
function createExpiryAlerts(engagementId: number, contractId: number, endDate: string, supplierName: string) {
  const end = new Date(endDate);
  const now = new Date();
  const daysUntil = Math.round((end.getTime() - now.getTime()) / 86_400_000);
  const nowIso = now.toISOString();

  if (daysUntil < 0) return; // already expired

  let severity: string | null = null;
  if (daysUntil <= 30) severity = "critical";
  else if (daysUntil <= 60) severity = "high";
  else if (daysUntil <= 90) severity = "medium";

  if (!severity) return;

  db.insert(watchlist_alerts).values({
    engagement_id: engagementId,
    alert_type: "contract_expiry",
    severity,
    title: `Contract expiring: ${supplierName}`,
    message: `Contract with ${supplierName} expires in ${daysUntil} days (${endDate}). Review renewal or renegotiation options.`,
    related_entity_type: "contract",
    related_entity_id: contractId,
    is_acknowledged: 0,
    is_resolved: 0,
    created_at: nowIso,
  }).run();
}

// ---------------------------------------------------------------------------
// Main extraction pipeline
// ---------------------------------------------------------------------------
export async function runExtraction(
  input: ExtractionInput,
  progressCb: (pct: number, msg: string) => void,
): Promise<{ extraction_id: number; contract_id: number | null; confidence: number }> {
  const { extraction_id, engagement_id, file_name, file_path } = input;

  // Update status → processing
  db.update(contract_extractions)
    .set({ extraction_status: "processing" })
    .where(eq(contract_extractions.id, extraction_id))
    .run();

  progressCb(10, "Extracting text from document…");

  // Load buffer from disk (queue path) or use provided buffer
  let buffer: Buffer;
  if (input.buffer) {
    buffer = input.buffer;
  } else {
    if (!fs.existsSync(file_path)) {
      throw new Error(`File not found at path: ${file_path}`);
    }
    buffer = fs.readFileSync(file_path);
  }

  // Step 1: Text extraction
  const { text, method } = await extractText(buffer, file_name);
  progressCb(30, `Text extracted via ${method} (${text.length.toLocaleString()} chars)`);

  if (!text || text.trim().length < 50) {
    db.update(contract_extractions)
      .set({
        extraction_status: "failed",
        raw_text: text,
        extracted_at: new Date().toISOString(),
      })
      .where(eq(contract_extractions.id, extraction_id))
      .run();
    throw new Error(`Insufficient text extracted from ${file_name} (${text.length} chars). File may be image-based PDF or corrupted.`);
  }

  progressCb(40, "Sending to Claude for clause extraction…");

  // Step 2: Claude extraction
  const result = await runClaudeExtraction(text, file_name);
  progressCb(80, `Claude extraction complete (confidence: ${(result.confidence_score * 100).toFixed(0)}%)`);

  // Step 3: Write extraction row
  const now = new Date().toISOString();
  db.update(contract_extractions)
    .set({
      extraction_status: "complete",
      supplier_name_extracted: result.supplier_name ?? undefined,
      contract_value_extracted: result.contract_value_annual ?? undefined,
      start_date_extracted: result.start_date ?? undefined,
      end_date_extracted: result.end_date ?? undefined,
      payment_terms_extracted: result.payment_terms ?? undefined,
      auto_renewal_extracted: result.auto_renewal ? 1 : 0,
      escalation_clause_extracted: result.escalation_clause ?? undefined,
      key_clauses_json: JSON.stringify(result.key_clauses),
      risk_flags_json: JSON.stringify(result.risk_flags),
      confidence_score: result.confidence_score,
      raw_text: text,
      claude_summary: result.summary,
      extracted_at: now,
    })
    .where(eq(contract_extractions.id, extraction_id))
    .run();

  progressCb(85, "Checking confidence threshold…");

  // Step 4: Auto-create contract if confidence >= 0.7
  let contract_id: number | null = null;
  if (result.confidence_score >= 0.7) {
    contract_id = autoCreateContract(engagement_id, extraction_id, result);
    if (contract_id) {
      // Link extraction to contract
      db.update(contract_extractions)
        .set({ contract_id })
        .where(eq(contract_extractions.id, extraction_id))
        .run();

      progressCb(90, `Contract record created (ID: ${contract_id})`);

      // Step 5: Expiry alerts
      if (result.end_date) {
        createExpiryAlerts(engagement_id, contract_id, result.end_date, result.supplier_name ?? file_name);
      }
    }
  } else {
    progressCb(90, `Confidence ${(result.confidence_score * 100).toFixed(0)}% < 70% — manual review required`);
  }

  progressCb(100, "Extraction complete");

  return { extraction_id, contract_id, confidence: result.confidence_score };
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------
export function getExtractions(engagementId: number) {
  return db
    .select()
    .from(contract_extractions)
    .where(eq(contract_extractions.engagement_id, engagementId))
    .all();
}

export function getExtraction(extractionId: number) {
  return db
    .select()
    .from(contract_extractions)
    .where(eq(contract_extractions.id, extractionId))
    .get();
}
