import { prisma } from "@/lib/db";
import { anthropic, MODEL } from "@/lib/ai";
import { CONTENT_SYSTEM_PROMPT, buildContentPrompt } from "@/lib/prompts/content";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const body = await req.json();

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { onboarding: true },
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const userPrompt = buildContentPrompt({
    type: body.type,
    channel: body.channel,
    clientName: client.name,
    industry: client.industry || undefined,
    brandVoice: client.onboarding?.brandVoice || undefined,
    targetAudience: client.onboarding?.targetAudience || undefined,
    campaignObjective: body.objective,
    additionalContext: body.context,
  });

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: CONTENT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      parsed = null;
    }

    // Save to database
    const content = await prisma.content.create({
      data: {
        clientId,
        campaignId: body.campaignId || null,
        type: body.type,
        channel: body.channel || null,
        name: body.name || `${body.type} - ${new Date().toLocaleDateString()}`,
        body: parsed ? JSON.stringify(parsed) : text,
        metadata: JSON.stringify({ prompt: body.context, objective: body.objective }),
        status: "draft",
        aiGenerated: true,
      },
    });

    return NextResponse.json({ content, parsed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
