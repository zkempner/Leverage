import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const campaigns = await prisma.campaign.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { content: true, metrics: true } },
    },
  });
  return NextResponse.json(campaigns);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const body = await req.json();
  const campaign = await prisma.campaign.create({
    data: {
      clientId,
      name: body.name,
      channel: body.channel,
      status: body.status || "draft",
      objective: body.objective,
      targetAudience: body.targetAudience ? JSON.stringify(body.targetAudience) : null,
      budget: body.budget,
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      notes: body.notes,
    },
  });
  return NextResponse.json(campaign, { status: 201 });
}
