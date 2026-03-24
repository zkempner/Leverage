import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST() {
  // Create sample client
  const client = await prisma.client.create({
    data: {
      name: "TechFlow SaaS",
      industry: "SaaS",
      website: "https://techflow.example.com",
      monthlyBudget: 25000,
      status: "active",
      onboarding: {
        create: {
          targetAudience: JSON.stringify({
            description: "B2B SaaS companies, 50-500 employees, VP/Director of Engineering and Product leaders. Located in US/UK/Canada. Interested in workflow automation and developer productivity tools.",
          }),
          goals: JSON.stringify({
            description: "Generate 200 MQLs/month, achieve $500K monthly pipeline, maintain ROAS > 4x, reduce CPA from $120 to $80, grow organic traffic 30% QoQ.",
          }),
          brandVoice: JSON.stringify({
            description: "Professional but approachable. Technical credibility without jargon. Data-driven claims. Confident but not aggressive. Think: smart colleague, not corporate sales pitch.",
          }),
          competitors: JSON.stringify({
            list: "Monday.com, Asana, Notion, ClickUp, Linear",
          }),
          existingChannels: JSON.stringify({
            description: "Running Google Search ads (performing well), testing LinkedIn Ads (high CPA), active blog (2x/week), email newsletter (15K subscribers), occasional webinars.",
          }),
          budgetBreakdown: JSON.stringify({
            notes: "Prefer weighted allocation toward channels with proven ROAS. Willing to test new channels with 10-15% of budget. Want to scale Google Ads and figure out LinkedIn.",
          }),
          completedAt: new Date(),
        },
      },
    },
  });

  // Create sample campaigns
  const campaigns = await Promise.all([
    prisma.campaign.create({
      data: {
        clientId: client.id,
        name: "Google Search - Brand + Category",
        channel: "google_ads",
        status: "active",
        objective: "conversion",
        budget: 8000,
        startDate: new Date("2026-01-01"),
        notes: "Core search campaign targeting branded and category terms",
      },
    }),
    prisma.campaign.create({
      data: {
        clientId: client.id,
        name: "LinkedIn - Decision Maker Targeting",
        channel: "linkedin_ads",
        status: "active",
        objective: "consideration",
        budget: 5000,
        startDate: new Date("2026-01-15"),
        notes: "Targeting VP/Director titles at mid-market tech companies",
      },
    }),
    prisma.campaign.create({
      data: {
        clientId: client.id,
        name: "Meta - Retargeting Funnel",
        channel: "meta_ads",
        status: "active",
        objective: "conversion",
        budget: 4000,
        startDate: new Date("2026-02-01"),
        notes: "Retargeting website visitors and free trial users",
      },
    }),
    prisma.campaign.create({
      data: {
        clientId: client.id,
        name: "Email - Nurture Sequence",
        channel: "email",
        status: "active",
        objective: "conversion",
        budget: 500,
        startDate: new Date("2026-01-01"),
        notes: "5-email drip sequence for trial signups",
      },
    }),
    prisma.campaign.create({
      data: {
        clientId: client.id,
        name: "HubSpot - Lead Scoring & Automation",
        channel: "hubspot",
        status: "active",
        objective: "conversion",
        budget: 2000,
        startDate: new Date("2026-01-01"),
        notes: "Automated lead scoring and sales handoff workflows",
      },
    }),
  ]);

  // Create sample content
  await prisma.content.createMany({
    data: [
      {
        clientId: client.id,
        campaignId: campaigns[0].id,
        type: "ad_copy",
        channel: "google_ads",
        name: "Google Ads - Brand Campaign Copy",
        body: JSON.stringify({
          variants: [
            { headline: "TechFlow - Automate Your Workflow", description: "Join 5,000+ teams using TechFlow to ship faster. Free 14-day trial.", cta: "Start Free Trial" },
            { headline: "Developer Workflow Automation", description: "Cut deployment time by 60%. Built for engineering teams that move fast.", cta: "See How It Works" },
            { headline: "Stop Wasting Time on Manual Tasks", description: "TechFlow automates CI/CD, testing, and deployment. Setup in 5 minutes.", cta: "Try Free" },
          ],
        }),
        status: "approved",
        aiGenerated: true,
      },
      {
        clientId: client.id,
        campaignId: campaigns[1].id,
        type: "ad_copy",
        channel: "linkedin_ads",
        name: "LinkedIn - Thought Leadership Ads",
        body: JSON.stringify({
          variants: [
            { headline: "Why Top Engineering Teams Choose TechFlow", description: "See how companies like Stripe and Notion automate their deployment pipeline.", cta: "Read the Case Study" },
            { headline: "Your Engineering Team Deserves Better Tools", description: "60% faster deployments. 40% fewer incidents. Zero vendor lock-in.", cta: "Book a Demo" },
          ],
        }),
        status: "approved",
        aiGenerated: true,
      },
      {
        clientId: client.id,
        type: "email",
        channel: "email",
        name: "Welcome Email - Trial Onboarding",
        body: JSON.stringify({
          subject: "Welcome to TechFlow - Let's get you set up",
          preheader: "Your 14-day free trial starts now",
          body: "Hi {{first_name}},\n\nWelcome to TechFlow! You've just taken the first step toward automating your development workflow.\n\nHere's what to do next:\n1. Connect your repository (takes 30 seconds)\n2. Set up your first workflow template\n3. Invite your team members\n\nMost teams see results within the first hour.\n\nNeed help? Reply to this email or book a 15-minute setup call.\n\nBest,\nThe TechFlow Team",
        }),
        status: "draft",
        aiGenerated: true,
      },
      {
        clientId: client.id,
        type: "blog_post",
        channel: "blog",
        name: "5 Ways to Automate Your CI/CD Pipeline",
        body: JSON.stringify({
          title: "5 Ways to Automate Your CI/CD Pipeline in 2026",
          metaDescription: "Learn how top engineering teams are automating their CI/CD pipelines to ship 60% faster with fewer errors.",
          body: "# 5 Ways to Automate Your CI/CD Pipeline in 2026\n\nIn today's fast-paced development landscape, manual deployment processes are the bottleneck holding your team back. Here are five proven strategies to automate your pipeline...\n\n## 1. Automated Testing Gates\nSet up automated test suites that run on every pull request...\n\n## 2. Infrastructure as Code\nDefine your infrastructure in version-controlled templates...\n\n## 3. Feature Flags for Safe Rollouts\nDecouple deployment from release with feature flags...\n\n## 4. Automated Rollback Triggers\nConfigure automatic rollbacks based on error rate thresholds...\n\n## 5. Pipeline Analytics and Optimization\nTrack build times, failure rates, and deployment frequency...",
        }),
        status: "published",
        aiGenerated: true,
      },
    ],
  });

  // Generate 90 days of performance metrics
  const startDate = new Date("2026-01-01");
  const metricsData = [];

  for (let day = 0; day < 83; day++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + day);

    // Google Ads - best performer
    const gSpend = 200 + Math.random() * 100;
    const gClicks = Math.floor(80 + Math.random() * 40);
    const gImpr = Math.floor(gClicks / (0.03 + Math.random() * 0.02));
    const gConv = Math.floor(gClicks * (0.08 + Math.random() * 0.04));
    const gRev = gConv * (180 + Math.random() * 60);
    metricsData.push({
      clientId: client.id,
      campaignId: campaigns[0].id,
      date,
      channel: "google_ads",
      source: "import",
      impressions: gImpr,
      clicks: gClicks,
      ctr: gClicks / gImpr,
      cpc: gSpend / gClicks,
      spend: Math.round(gSpend * 100) / 100,
      conversions: gConv,
      conversionRate: gConv / gClicks,
      cpa: gConv > 0 ? gSpend / gConv : null,
      roas: gSpend > 0 ? gRev / gSpend : null,
      leads: Math.floor(gConv * 0.7),
      mqls: Math.floor(gConv * 0.4),
      sqls: Math.floor(gConv * 0.15),
      pipelineValue: Math.round(gConv * 0.15 * 8000),
      revenue: Math.round(gRev * 100) / 100,
      cac: null,
      ltv: null,
    });

    // LinkedIn Ads - higher CPA, good pipeline
    if (day >= 14) {
      const lSpend = 120 + Math.random() * 80;
      const lClicks = Math.floor(20 + Math.random() * 15);
      const lImpr = Math.floor(lClicks / (0.008 + Math.random() * 0.004));
      const lConv = Math.floor(lClicks * (0.03 + Math.random() * 0.02));
      const lRev = lConv * (250 + Math.random() * 100);
      metricsData.push({
        clientId: client.id,
        campaignId: campaigns[1].id,
        date,
        channel: "linkedin_ads",
        source: "import",
        impressions: lImpr,
        clicks: lClicks,
        ctr: lClicks / lImpr,
        cpc: lSpend / lClicks,
        spend: Math.round(lSpend * 100) / 100,
        conversions: lConv,
        conversionRate: lConv > 0 ? lConv / lClicks : 0,
        cpa: lConv > 0 ? lSpend / lConv : null,
        roas: lSpend > 0 ? lRev / lSpend : null,
        leads: Math.floor(lConv * 0.8),
        mqls: Math.floor(lConv * 0.5),
        sqls: Math.floor(lConv * 0.2),
        pipelineValue: Math.round(lConv * 0.2 * 12000),
        revenue: Math.round(lRev * 100) / 100,
        cac: null,
        ltv: null,
      });
    }

    // Meta Ads - retargeting, good conversion
    if (day >= 30) {
      const mSpend = 80 + Math.random() * 60;
      const mClicks = Math.floor(40 + Math.random() * 25);
      const mImpr = Math.floor(mClicks / (0.015 + Math.random() * 0.01));
      const mConv = Math.floor(mClicks * (0.06 + Math.random() * 0.03));
      const mRev = mConv * (150 + Math.random() * 50);
      metricsData.push({
        clientId: client.id,
        campaignId: campaigns[2].id,
        date,
        channel: "meta_ads",
        source: "import",
        impressions: mImpr,
        clicks: mClicks,
        ctr: mClicks / mImpr,
        cpc: mSpend / mClicks,
        spend: Math.round(mSpend * 100) / 100,
        conversions: mConv,
        conversionRate: mConv > 0 ? mConv / mClicks : 0,
        cpa: mConv > 0 ? mSpend / mConv : null,
        roas: mSpend > 0 ? mRev / mSpend : null,
        leads: Math.floor(mConv * 0.6),
        mqls: Math.floor(mConv * 0.3),
        sqls: Math.floor(mConv * 0.1),
        pipelineValue: Math.round(mConv * 0.1 * 6000),
        revenue: Math.round(mRev * 100) / 100,
        cac: null,
        ltv: null,
      });
    }

    // Email - low cost, steady conversions
    const eConv = Math.floor(2 + Math.random() * 4);
    metricsData.push({
      clientId: client.id,
      campaignId: campaigns[3].id,
      date,
      channel: "email",
      source: "import",
      impressions: Math.floor(800 + Math.random() * 400),
      clicks: Math.floor(40 + Math.random() * 30),
      ctr: 0.05 + Math.random() * 0.03,
      cpc: 0,
      spend: Math.round((5 + Math.random() * 5) * 100) / 100,
      conversions: eConv,
      conversionRate: 0.04 + Math.random() * 0.02,
      cpa: eConv > 0 ? 2.5 : null,
      roas: eConv > 0 ? 15 + Math.random() * 10 : null,
      leads: eConv,
      mqls: Math.floor(eConv * 0.6),
      sqls: Math.floor(eConv * 0.3),
      pipelineValue: Math.round(eConv * 0.3 * 5000),
      revenue: Math.round(eConv * (200 + Math.random() * 100) * 100) / 100,
      cac: null,
      ltv: null,
    });
  }

  await prisma.performanceMetric.createMany({ data: metricsData });

  return NextResponse.json({
    message: "Sample data seeded successfully",
    clientId: client.id,
    campaigns: campaigns.length,
    metrics: metricsData.length,
  });
}
