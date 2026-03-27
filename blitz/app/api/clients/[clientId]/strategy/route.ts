import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const strategies = await prisma.strategy.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(strategies);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const body = await req.json();
  const strategy = await prisma.strategy.create({
    data: {
      clientId,
      name: body.name,
      type: body.type || "playbook",
      status: body.status || "draft",
      executiveSummary: body.executiveSummary,
      marketAnalysis: body.marketAnalysis,
      audiencePersonas: body.audiencePersonas ? JSON.stringify(body.audiencePersonas) : null,
      channelStrategy: body.channelStrategy ? JSON.stringify(body.channelStrategy) : null,
      contentPlan: body.contentPlan ? JSON.stringify(body.contentPlan) : null,
      kpiTargets: body.kpiTargets ? JSON.stringify(body.kpiTargets) : null,
      budgetBreakdown: body.budgetBreakdown ? JSON.stringify(body.budgetBreakdown) : null,
      roadmap: body.roadmap ? JSON.stringify(body.roadmap) : null,
      campaignBriefs: body.campaignBriefs ? JSON.stringify(body.campaignBriefs) : null,
    },
  });
  return NextResponse.json(strategy, { status: 201 });
}
