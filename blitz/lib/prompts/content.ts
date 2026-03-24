export const CONTENT_SYSTEM_PROMPT = `You are Blitz, an elite AI content creator for performance marketing. You generate high-converting marketing content tailored to specific audiences and channels.

Your content is:
- Data-driven and conversion-focused
- Tailored to the specific channel's best practices and format requirements
- Written in the client's brand voice
- Includes multiple variants for A/B testing when appropriate

Always return valid JSON matching the requested format.`;

export function buildContentPrompt(params: {
  type: string;
  channel?: string;
  clientName: string;
  industry?: string;
  brandVoice?: string;
  targetAudience?: string;
  campaignObjective?: string;
  additionalContext?: string;
}): string {
  const parts = [`Generate ${params.type} content for ${params.clientName}.`];

  if (params.channel) parts.push(`Channel: ${params.channel}`);
  if (params.industry) parts.push(`Industry: ${params.industry}`);
  if (params.brandVoice) parts.push(`Brand Voice: ${params.brandVoice}`);
  if (params.targetAudience) parts.push(`Target Audience: ${params.targetAudience}`);
  if (params.campaignObjective) parts.push(`Campaign Objective: ${params.campaignObjective}`);
  if (params.additionalContext) parts.push(`Additional Context: ${params.additionalContext}`);

  const formatInstructions: Record<string, string> = {
    ad_copy: `Return JSON: { "variants": [{ "headline": "...", "description": "...", "cta": "...", "displayUrl": "..." }] } — generate 3-5 variants.`,
    headline: `Return JSON: { "headlines": ["headline1", "headline2", ...] } — generate 10 headlines.`,
    email: `Return JSON: { "subject": "...", "preheader": "...", "body": "..." } — include HTML-compatible body.`,
    landing_page: `Return JSON: { "headline": "...", "subheadline": "...", "heroText": "...", "features": [{ "title": "...", "description": "..." }], "cta": "...", "testimonialPlaceholder": "..." }`,
    blog_post: `Return JSON: { "title": "...", "metaDescription": "...", "body": "..." } — write 800-1200 words in markdown.`,
    social_post: `Return JSON: { "posts": [{ "platform": "...", "text": "...", "hashtags": ["..."] }] } — generate 3 posts for different platforms.`,
    sms: `Return JSON: { "messages": [{ "text": "...", "characterCount": 0 }] } — generate 3 variants, max 160 chars each.`,
    whitepaper: `Return JSON: { "title": "...", "abstract": "...", "sections": [{ "heading": "...", "content": "..." }] }`,
    case_study: `Return JSON: { "title": "...", "challenge": "...", "solution": "...", "results": "...", "testimonial": "..." }`,
  };

  parts.push(formatInstructions[params.type] || `Return the content as JSON with a "content" field.`);

  return parts.join("\n");
}
