import { prisma } from "@/lib/db";
import { anthropic, MODEL } from "@/lib/ai";
import { COPILOT_SYSTEM_PROMPT, buildCopilotContext } from "@/lib/prompts/copilot";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const body = await req.json();
  const { message, sessionId } = body;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { campaigns: true },
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // Get recent metrics for context
  const recentMetrics = await prisma.performanceMetric.findMany({
    where: { clientId },
    orderBy: { date: "desc" },
    take: 100,
  });

  const summary = {
    totalSpend: recentMetrics.reduce((s, m) => s + (m.spend || 0), 0),
    totalConversions: recentMetrics.reduce((s, m) => s + (m.conversions || 0), 0),
    avgCpa: 0,
    avgRoas: 0,
    totalRevenue: recentMetrics.reduce((s, m) => s + (m.revenue || 0), 0),
  };
  const cpas = recentMetrics.filter((m) => m.cpa).map((m) => m.cpa!);
  const roases = recentMetrics.filter((m) => m.roas).map((m) => m.roas!);
  if (cpas.length) summary.avgCpa = cpas.reduce((a, b) => a + b, 0) / cpas.length;
  if (roases.length) summary.avgRoas = roases.reduce((a, b) => a + b, 0) / roases.length;

  const contextStr = buildCopilotContext({
    clientName: client.name,
    industry: client.industry || undefined,
    campaigns: client.campaigns.map((c) => ({
      name: c.name,
      channel: c.channel,
      status: c.status,
      budget: c.budget || undefined,
    })),
    recentMetrics: summary,
  });

  // Load or create session
  let session = sessionId
    ? await prisma.copilotSession.findUnique({ where: { id: sessionId } })
    : null;

  const previousMessages: Array<{ role: "user" | "assistant"; content: string }> =
    session ? JSON.parse(session.messages) : [];

  previousMessages.push({ role: "user", content: message });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const aiStream = anthropic.messages.stream({
          model: MODEL,
          max_tokens: 2048,
          system: `${COPILOT_SYSTEM_PROMPT}\n\nClient Context:\n${contextStr}`,
          messages: previousMessages,
        });

        let fullResponse = "";
        for await (const event of aiStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            fullResponse += event.delta.text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
          }
        }

        previousMessages.push({ role: "assistant", content: fullResponse });

        // Save session
        if (session) {
          await prisma.copilotSession.update({
            where: { id: session.id },
            data: { messages: JSON.stringify(previousMessages) },
          });
        } else {
          session = await prisma.copilotSession.create({
            data: {
              clientId,
              name: message.substring(0, 50),
              messages: JSON.stringify(previousMessages),
            },
          });
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, sessionId: session.id })}\n\n`)
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
