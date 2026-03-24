import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const content = await prisma.content.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    include: { campaign: { select: { name: true } } },
  });
  return NextResponse.json(content);
}
