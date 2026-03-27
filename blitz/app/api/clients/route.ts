import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const clients = await prisma.client.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { campaigns: true, content: true } },
    },
  });
  return NextResponse.json(clients);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const client = await prisma.client.create({
    data: {
      name: body.name,
      industry: body.industry,
      website: body.website,
      monthlyBudget: body.monthlyBudget,
      onboarding: { create: {} },
    },
    include: { onboarding: true },
  });
  return NextResponse.json(client, { status: 201 });
}
