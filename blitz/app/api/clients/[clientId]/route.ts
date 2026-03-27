import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      onboarding: true,
      _count: { select: { campaigns: true, content: true, strategies: true, metrics: true } },
    },
  });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(client);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const body = await req.json();
  const client = await prisma.client.update({ where: { id: clientId }, data: body });
  return NextResponse.json(client);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  await prisma.client.delete({ where: { id: clientId } });
  return NextResponse.json({ ok: true });
}
