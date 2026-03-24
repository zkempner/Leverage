import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const onboarding = await prisma.clientOnboarding.findUnique({
    where: { clientId },
    include: { documents: true },
  });
  if (!onboarding) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(onboarding);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const body = await req.json();
  const onboarding = await prisma.clientOnboarding.update({
    where: { clientId },
    data: {
      targetAudience: body.targetAudience ? JSON.stringify(body.targetAudience) : undefined,
      goals: body.goals ? JSON.stringify(body.goals) : undefined,
      brandVoice: body.brandVoice ? JSON.stringify(body.brandVoice) : undefined,
      competitors: body.competitors ? JSON.stringify(body.competitors) : undefined,
      existingChannels: body.existingChannels ? JSON.stringify(body.existingChannels) : undefined,
      budgetBreakdown: body.budgetBreakdown ? JSON.stringify(body.budgetBreakdown) : undefined,
      interviewTranscript: body.interviewTranscript,
      interviewInsights: body.interviewInsights ? JSON.stringify(body.interviewInsights) : undefined,
      completedAt: body.completed ? new Date() : undefined,
    },
  });

  if (body.completed) {
    await prisma.client.update({ where: { id: clientId }, data: { status: "active" } });
  }

  return NextResponse.json(onboarding);
}
