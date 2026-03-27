import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const channel = url.searchParams.get("channel");

  const where: Record<string, unknown> = { clientId };
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, unknown>).gte = new Date(from);
    if (to) (where.date as Record<string, unknown>).lte = new Date(to);
  }
  if (channel) where.channel = channel;

  const metrics = await prisma.performanceMetric.findMany({
    where,
    orderBy: { date: "asc" },
  });

  // Compute summary
  const summary = {
    totalSpend: 0,
    totalImpressions: 0,
    totalClicks: 0,
    totalConversions: 0,
    totalLeads: 0,
    totalMqls: 0,
    totalSqls: 0,
    totalRevenue: 0,
    totalPipelineValue: 0,
    avgCpa: 0,
    avgRoas: 0,
    avgCtr: 0,
    avgConversionRate: 0,
  };

  let cpaCount = 0, roasCount = 0, ctrCount = 0, crCount = 0;
  for (const m of metrics) {
    summary.totalSpend += m.spend || 0;
    summary.totalImpressions += m.impressions || 0;
    summary.totalClicks += m.clicks || 0;
    summary.totalConversions += m.conversions || 0;
    summary.totalLeads += m.leads || 0;
    summary.totalMqls += m.mqls || 0;
    summary.totalSqls += m.sqls || 0;
    summary.totalRevenue += m.revenue || 0;
    summary.totalPipelineValue += m.pipelineValue || 0;
    if (m.cpa) { summary.avgCpa += m.cpa; cpaCount++; }
    if (m.roas) { summary.avgRoas += m.roas; roasCount++; }
    if (m.ctr) { summary.avgCtr += m.ctr; ctrCount++; }
    if (m.conversionRate) { summary.avgConversionRate += m.conversionRate; crCount++; }
  }
  if (cpaCount) summary.avgCpa /= cpaCount;
  if (roasCount) summary.avgRoas /= roasCount;
  if (ctrCount) summary.avgCtr /= ctrCount;
  if (crCount) summary.avgConversionRate /= crCount;

  // Group by channel
  const byChannel: Record<string, { spend: number; conversions: number; clicks: number; impressions: number; revenue: number }> = {};
  for (const m of metrics) {
    if (!byChannel[m.channel]) byChannel[m.channel] = { spend: 0, conversions: 0, clicks: 0, impressions: 0, revenue: 0 };
    byChannel[m.channel].spend += m.spend || 0;
    byChannel[m.channel].conversions += m.conversions || 0;
    byChannel[m.channel].clicks += m.clicks || 0;
    byChannel[m.channel].impressions += m.impressions || 0;
    byChannel[m.channel].revenue += m.revenue || 0;
  }

  return NextResponse.json({ metrics, summary, byChannel });
}
