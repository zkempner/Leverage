"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClipboardList, Target, PenTool, Zap, BarChart3, Bot,
  DollarSign, MousePointerClick, TrendingUp, Users,
} from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default function ClientDashboard() {
  const { clientId } = useParams();

  const { data: client } = useQuery({
    queryKey: [`/api/clients/${clientId}`],
    queryFn: () => fetch(`/api/clients/${clientId}`).then((r) => r.json()),
  });

  const { data: perfData } = useQuery({
    queryKey: [`/api/clients/${clientId}/performance`],
    queryFn: () => fetch(`/api/clients/${clientId}/performance`).then((r) => r.json()),
  });

  const summary = perfData?.summary;

  const quickActions = [
    { href: `/clients/${clientId}/onboarding`, label: "Complete Onboarding", icon: ClipboardList, color: "text-yellow-400" },
    { href: `/clients/${clientId}/strategy`, label: "Generate Strategy", icon: Target, color: "text-blue-400" },
    { href: `/clients/${clientId}/content`, label: "Create Content", icon: PenTool, color: "text-purple-400" },
    { href: `/clients/${clientId}/campaigns`, label: "Manage Campaigns", icon: Zap, color: "text-emerald-400" },
    { href: `/clients/${clientId}/performance`, label: "View Performance", icon: BarChart3, color: "text-orange-400" },
    { href: `/clients/${clientId}/copilot`, label: "AI Copilot", icon: Bot, color: "text-pink-400" },
  ];

  return (
    <div>
      <div className="border-b bg-card/50 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{client?.name || "Loading..."}</h1>
            <p className="text-muted-foreground">
              {client?.industry || "Client"} workspace
            </p>
          </div>
          {client && (
            <Badge variant="secondary" className="text-sm">
              {client.status}
            </Badge>
          )}
        </div>
      </div>

      <div className="p-8 space-y-8">
        {/* KPI Summary */}
        {summary && summary.totalSpend > 0 && (
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Spend</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(summary.totalSpend)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Conversions</CardTitle>
                <MousePointerClick className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(summary.totalConversions)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg ROAS</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.avgRoas.toFixed(2)}x</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Leads</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(summary.totalLeads)}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.href} href={action.href}>
                  <Card className="transition-colors hover:border-primary/50 cursor-pointer">
                    <CardContent className="flex items-center gap-4 p-6">
                      <Icon className={`h-8 w-8 ${action.color}`} />
                      <span className="font-medium">{action.label}</span>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Stats */}
        {client?._count && (
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="p-6 text-center">
                <div className="text-3xl font-bold">{client._count.strategies || 0}</div>
                <p className="text-sm text-muted-foreground">Strategies</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <div className="text-3xl font-bold">{client._count.campaigns || 0}</div>
                <p className="text-sm text-muted-foreground">Campaigns</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <div className="text-3xl font-bold">{client._count.content || 0}</div>
                <p className="text-sm text-muted-foreground">Content Pieces</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <div className="text-3xl font-bold">{client._count.metrics || 0}</div>
                <p className="text-sm text-muted-foreground">Data Points</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
