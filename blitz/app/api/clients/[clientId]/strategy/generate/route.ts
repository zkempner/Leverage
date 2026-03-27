import { prisma } from "@/lib/db";
import { anthropic, MODEL } from "@/lib/ai";
import { STRATEGY_SYSTEM_PROMPT, buildStrategyPrompt } from "@/lib/prompts/strategy";
import { NextRequest, NextResponse } from "next/server";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { onboarding: true },
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const userPrompt = buildStrategyPrompt({
    name: client.name,
    industry: client.industry || undefined,
    website: client.website || undefined,
    monthlyBudget: client.monthlyBudget || undefined,
    onboarding: client.onboarding
      ? {
          targetAudience: client.onboarding.targetAudience || undefined,
          goals: client.onboarding.goals || undefined,
          brandVoice: client.onboarding.brandVoice || undefined,
          competitors: client.onboarding.competitors || undefined,
          existingChannels: client.onboarding.existingChannels || undefined,
          budgetBreakdown: client.onboarding.budgetBreakdown || undefined,
          interviewInsights: client.onboarding.interviewInsights || undefined,
        }
      : undefined,
  });

  // Stream the response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 8192,
          system: STRATEGY_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
        });

        const text = response.content[0].type === "text" ? response.content[0].text : "";

        // Try to parse the JSON from the response
        let parsed;
        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch {
          parsed = null;
        }

        if (parsed) {
          // Save to database
          const strategy = await prisma.strategy.create({
            data: {
              clientId,
              name: `Marketing Playbook - ${new Date().toLocaleDateString()}`,
              type: "playbook",
              status: "draft",
              executiveSummary: parsed.executiveSummary || null,
              marketAnalysis: parsed.marketAnalysis || null,
              audiencePersonas: parsed.audiencePersonas ? JSON.stringify(parsed.audiencePersonas) : null,
              channelStrategy: parsed.channelStrategy ? JSON.stringify(parsed.channelStrategy) : null,
              contentPlan: parsed.contentPlan ? JSON.stringify(parsed.contentPlan) : null,
              kpiTargets: parsed.kpiTargets ? JSON.stringify(parsed.kpiTargets) : null,
              budgetBreakdown: parsed.budgetBreakdown ? JSON.stringify(parsed.budgetBreakdown) : null,
              roadmap: parsed.roadmap ? JSON.stringify(parsed.roadmap) : null,
              campaignBriefs: parsed.campaignBriefs ? JSON.stringify(parsed.campaignBriefs) : null,
            },
          });

          controller.enqueue(encoder.encode(JSON.stringify({ strategy, raw: parsed })));
        } else {
          controller.enqueue(encoder.encode(JSON.stringify({ error: "Failed to parse strategy", raw: text })));
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(encoder.encode(JSON.stringify({ error: message })));
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: { "Content-Type": "application/json" },
  });
}
