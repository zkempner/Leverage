"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Sparkles, Target, Users, DollarSign, Calendar, Zap } from "lucide-react";
import { CHANNELS, formatCurrency } from "@/lib/utils";

function safeParseJson(str: string | null | undefined) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

export default function StrategyPage() {
  const { clientId } = useParams();
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);

  const { data: strategies = [] } = useQuery<any[]>({
    queryKey: [`/api/clients/${clientId}/strategy`],
    queryFn: () => fetch(`/api/clients/${clientId}/strategy`).then((r) => r.json()),
  });

  const generateStrategy = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/strategy/generate`, { method: "POST" });
      await res.json();
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/strategy`] });
    } catch (err) {
      console.error("Strategy generation failed:", err);
    } finally {
      setGenerating(false);
    }
  };

  const latest = strategies[0];
  const personas = safeParseJson(latest?.audiencePersonas) || [];
  const channelStrategy = safeParseJson(latest?.channelStrategy) || [];
  const contentPlan = safeParseJson(latest?.contentPlan);
  const kpiTargets = safeParseJson(latest?.kpiTargets);
  const budgetBreakdown = safeParseJson(latest?.budgetBreakdown);
  const roadmap = safeParseJson(latest?.roadmap) || [];
  const campaignBriefs = safeParseJson(latest?.campaignBriefs) || [];

  const channelLabel = (val: string) => CHANNELS.find((c) => c.value === val)?.label || val;

  return (
    <div>
      <div className="border-b bg-card/50 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Marketing Strategy</h1>
            <p className="text-muted-foreground">AI-generated marketing playbook and campaign briefs</p>
          </div>
          <Button onClick={generateStrategy} disabled={generating}>
            {generating ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" /> Generate Strategy</>
            )}
          </Button>
        </div>
      </div>

      <div className="p-8">
        {!latest ? (
          <Card className="mx-auto max-w-md text-center">
            <CardHeader>
              <CardTitle>No strategy yet</CardTitle>
              <CardDescription>Generate an AI-powered marketing playbook for this client</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={generateStrategy} disabled={generating}>
                <Sparkles className="mr-2 h-4 w-4" /> Generate Strategy
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="channels">Channels</TabsTrigger>
              <TabsTrigger value="personas">Personas</TabsTrigger>
              <TabsTrigger value="roadmap">Roadmap</TabsTrigger>
              <TabsTrigger value="briefs">Campaign Briefs</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              {latest.executiveSummary && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Target className="h-4 w-4" /> Executive Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{latest.executiveSummary}</p>
                  </CardContent>
                </Card>
              )}

              {latest.marketAnalysis && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Market Analysis</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{latest.marketAnalysis}</p>
                  </CardContent>
                </Card>
              )}

              {kpiTargets && (
                <Card>
                  <CardHeader><CardTitle className="text-base">KPI Targets</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-3">
                      {Object.entries(kpiTargets).map(([key, value]) => (
                        <div key={key} className="rounded-lg bg-muted p-4">
                          <p className="text-xs text-muted-foreground uppercase">{key.replace(/([A-Z])/g, " $1")}</p>
                          <p className="text-lg font-bold mt-1">{String(value)}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {budgetBreakdown && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <DollarSign className="h-4 w-4" /> Budget Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {budgetBreakdown.total && (
                      <p className="text-lg font-bold">Total: {formatCurrency(budgetBreakdown.total)}/month</p>
                    )}
                    {budgetBreakdown.channels?.map((ch: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                        <span className="text-sm">{channelLabel(ch.channel)}</span>
                        <div className="text-right">
                          <span className="font-medium">{formatCurrency(ch.amount)}</span>
                          <span className="text-muted-foreground ml-2">({ch.percent}%)</span>
                        </div>
                      </div>
                    ))}
                    {budgetBreakdown.notes && (
                      <p className="text-sm text-muted-foreground">{budgetBreakdown.notes}</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="channels" className="space-y-4">
              {channelStrategy.map((ch: any, i: number) => (
                <Card key={i}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{channelLabel(ch.channel)}</CardTitle>
                      <Badge variant="secondary">{ch.budgetPercent}% of budget</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm">{ch.role}</p>
                    {ch.tactics?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Tactics</p>
                        <ul className="text-sm space-y-1">
                          {ch.tactics.map((t: string, j: number) => (
                            <li key={j} className="flex items-start gap-2">
                              <span className="text-primary mt-1">-</span> {t}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {ch.kpis?.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {ch.kpis.map((kpi: string, j: number) => (
                          <Badge key={j} variant="outline" className="text-xs">{kpi}</Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="personas" className="grid gap-4 md:grid-cols-2">
              {personas.map((p: any, i: number) => (
                <Card key={i}>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4" /> {p.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {p.demographics && <div><span className="font-medium text-muted-foreground">Demographics:</span> {p.demographics}</div>}
                    {p.psychographics && <div><span className="font-medium text-muted-foreground">Psychographics:</span> {p.psychographics}</div>}
                    {p.channels && <div><span className="font-medium text-muted-foreground">Channels:</span> {p.channels.join(", ")}</div>}
                    {p.messaging && <div><span className="font-medium text-muted-foreground">Messaging:</span> {p.messaging}</div>}
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="roadmap" className="space-y-4">
              {roadmap.map((phase: any, i: number) => (
                <Card key={i}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Calendar className="h-4 w-4" /> {phase.phase}
                      </CardTitle>
                      <Badge variant="outline">{phase.weeks}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {phase.actions?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Actions</p>
                        <ul className="text-sm space-y-1">
                          {phase.actions.map((a: string, j: number) => (
                            <li key={j}>- {a}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {phase.milestones?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Milestones</p>
                        <ul className="text-sm space-y-1">
                          {phase.milestones.map((m: string, j: number) => (
                            <li key={j} className="text-emerald-400">&#10003; {m}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="briefs" className="space-y-4">
              {campaignBriefs.map((brief: any, i: number) => (
                <Card key={i}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Zap className="h-4 w-4" /> {brief.name}
                      </CardTitle>
                      <div className="flex gap-2">
                        <Badge variant="secondary">{channelLabel(brief.channel)}</Badge>
                        <Badge variant="outline">{brief.objective}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {brief.audience && <div><span className="font-medium text-muted-foreground">Audience:</span> {brief.audience}</div>}
                    {brief.messaging && <div><span className="font-medium text-muted-foreground">Messaging:</span> {brief.messaging}</div>}
                    {brief.creativeSpecs && <div><span className="font-medium text-muted-foreground">Creative:</span> {brief.creativeSpecs}</div>}
                    {brief.budget && <div><span className="font-medium text-muted-foreground">Budget:</span> {formatCurrency(brief.budget)}</div>}
                    {brief.duration && <div><span className="font-medium text-muted-foreground">Duration:</span> {brief.duration}</div>}
                    {brief.successMetrics?.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {brief.successMetrics.map((m: string, j: number) => (
                          <Badge key={j} variant="outline" className="text-xs">{m}</Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
