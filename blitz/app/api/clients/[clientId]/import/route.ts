import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";

export async function POST(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const channel = formData.get("channel") as string;
  const campaignId = formData.get("campaignId") as string | null;

  if (!file || !channel) {
    return NextResponse.json({ error: "File and channel are required" }, { status: 400 });
  }

  const text = await file.text();
  let records: Record<string, string>[];

  try {
    records = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  } catch {
    return NextResponse.json({ error: "Failed to parse CSV" }, { status: 400 });
  }

  // Map common column names to our schema
  const columnMap: Record<string, string[]> = {
    date: ["date", "day", "Date", "Day", "report_date"],
    impressions: ["impressions", "Impressions", "impr", "Impr"],
    clicks: ["clicks", "Clicks"],
    spend: ["spend", "cost", "Spend", "Cost", "amount_spent", "Amount Spent"],
    conversions: ["conversions", "Conversions", "results", "Results"],
    ctr: ["ctr", "CTR", "click_through_rate"],
    cpc: ["cpc", "CPC", "cost_per_click", "Cost per Click"],
    cpa: ["cpa", "CPA", "cost_per_result", "Cost per Result"],
    roas: ["roas", "ROAS", "return_on_ad_spend"],
    revenue: ["revenue", "Revenue", "purchase_value", "Purchase Value"],
    leads: ["leads", "Leads"],
  };

  function findColumn(record: Record<string, string>, aliases: string[]): string | undefined {
    for (const alias of aliases) {
      if (record[alias] !== undefined) return record[alias];
    }
    return undefined;
  }

  const metricsToCreate = records.map((row) => {
    const dateStr = findColumn(row, columnMap.date);
    return {
      clientId,
      campaignId: campaignId || null,
      date: dateStr ? new Date(dateStr) : new Date(),
      channel,
      source: "import" as const,
      impressions: parseInt(findColumn(row, columnMap.impressions) || "0") || null,
      clicks: parseInt(findColumn(row, columnMap.clicks) || "0") || null,
      spend: parseFloat(findColumn(row, columnMap.spend) || "0") || null,
      conversions: parseInt(findColumn(row, columnMap.conversions) || "0") || null,
      ctr: parseFloat(findColumn(row, columnMap.ctr) || "0") || null,
      cpc: parseFloat(findColumn(row, columnMap.cpc) || "0") || null,
      cpa: parseFloat(findColumn(row, columnMap.cpa) || "0") || null,
      roas: parseFloat(findColumn(row, columnMap.roas) || "0") || null,
      revenue: parseFloat(findColumn(row, columnMap.revenue) || "0") || null,
      leads: parseInt(findColumn(row, columnMap.leads) || "0") || null,
      conversionRate: null,
      mqls: null,
      sqls: null,
      pipelineValue: null,
      cac: null,
      ltv: null,
    };
  });

  const result = await prisma.performanceMetric.createMany({ data: metricsToCreate });

  return NextResponse.json({ imported: result.count });
}
