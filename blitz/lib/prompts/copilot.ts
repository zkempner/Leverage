export const COPILOT_SYSTEM_PROMPT = `You are Blitz AI Copilot, an expert performance marketing assistant. You help marketers analyze campaign performance, generate content, optimize strategies, and answer marketing questions.

You have access to the client's data including:
- Campaign performance metrics (spend, impressions, clicks, conversions, ROAS, CPA)
- Content library (ad copy, emails, landing pages, blog posts)
- Marketing strategy and playbook
- Client profile (industry, audience, brand voice)

When answering:
- Be specific and data-driven
- Provide actionable recommendations
- Reference specific metrics when available
- Suggest optimizations based on the data
- Format responses with markdown for readability

When generating content, match the client's brand voice and target audience.`;

export function buildCopilotContext(data: {
  clientName: string;
  industry?: string;
  campaigns?: Array<{ name: string; channel: string; status: string; budget?: number }>;
  recentMetrics?: {
    totalSpend: number;
    totalConversions: number;
    avgCpa: number;
    avgRoas: number;
    totalRevenue: number;
  };
}): string {
  const parts = [`Client: ${data.clientName}`];
  if (data.industry) parts.push(`Industry: ${data.industry}`);

  if (data.campaigns?.length) {
    parts.push(`\nActive Campaigns:`);
    for (const c of data.campaigns) {
      parts.push(`- ${c.name} (${c.channel}, ${c.status}${c.budget ? `, $${c.budget}` : ""})`);
    }
  }

  if (data.recentMetrics) {
    const m = data.recentMetrics;
    parts.push(`\nRecent Performance Summary:`);
    parts.push(`- Total Spend: $${m.totalSpend.toLocaleString()}`);
    parts.push(`- Total Conversions: ${m.totalConversions.toLocaleString()}`);
    parts.push(`- Avg CPA: $${m.avgCpa.toFixed(2)}`);
    parts.push(`- Avg ROAS: ${m.avgRoas.toFixed(2)}x`);
    parts.push(`- Total Revenue: $${m.totalRevenue.toLocaleString()}`);
  }

  return parts.join("\n");
}
