import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  FileCheck, AlertCircle, CalendarClock, Users, AlertTriangle,
  CheckCircle2, RefreshCw, ClipboardList, UserMinus,
} from "lucide-react";

function MetricCard({
  label, value, subtitle, icon: Icon, color, progress,
}: {
  label: string; value: string; subtitle?: string; icon: any; color: string; progress?: number;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color }}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
            {progress !== undefined && (
              <Progress value={progress} className="mt-2 h-2" />
            )}
          </div>
          <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}15` }}>
            <Icon className="h-5 w-5" style={{ color }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CCDashboardPage({ engagementId }: { engagementId?: number }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/cc/engagements", engagementId, "dashboard"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/cc/engagements/${engagementId}/dashboard`);
      return res.json();
    },
    enabled: !!engagementId,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/cc/engagements", engagementId, "dashboard"] });
  };

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="cc-dashboard-page">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-28" />
      </div>
    );
  }

  const drl = data?.drl_completion ?? { total: 0, received: 0, pct: 0 };
  const openActions = data?.open_action_items ?? 0;
  const upcomingMilestones = data?.upcoming_milestones ?? 0;
  const teamSize = data?.team_size ?? 0;
  const overdueDrls = data?.overdue_drls ?? 0;
  const overdueActions = data?.overdue_actions ?? 0;
  const rif = data?.rif_progress ?? { completed: 0, total: 0 };
  const tasks = data?.task_completion ?? { completed: 0, total: 0 };
  const taskPct = tasks.total > 0 ? Math.round((tasks.completed / tasks.total) * 100) : 0;

  return (
    <div className="space-y-6" data-testid="cc-dashboard-page">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-am-navy">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Engagement overview and key metrics</p>
        </div>
        <Button size="sm" variant="outline" onClick={handleRefresh} data-testid="refresh-dashboard-btn">
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* Primary Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="DRL Completion"
          value={`${drl.pct}%`}
          subtitle={`${drl.received} of ${drl.total} received`}
          icon={FileCheck}
          color="#002B49"
          progress={drl.pct}
        />
        <MetricCard
          label="Open Action Items"
          value={String(openActions)}
          subtitle="Requiring attention"
          icon={AlertCircle}
          color="#CF7F00"
        />
        <MetricCard
          label="Upcoming Milestones"
          value={String(upcomingMilestones)}
          subtitle="Next 14 days"
          icon={CalendarClock}
          color="#0085CA"
        />
        <MetricCard
          label="Team Size"
          value={String(teamSize)}
          subtitle="Active members"
          icon={Users}
          color="#29702A"
        />
      </div>

      {/* Secondary Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overdue DRLs</p>
                <div className="flex items-center gap-2 mt-2">
                  <p className="text-2xl font-bold text-red-600">{overdueDrls}</p>
                  {overdueDrls > 0 && (
                    <Badge className="bg-red-100 text-red-800 text-xs">{overdueDrls} overdue</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Past due date</p>
              </div>
              <div className="p-2 rounded-lg bg-red-50">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overdue Actions</p>
                <div className="flex items-center gap-2 mt-2">
                  <p className="text-2xl font-bold text-red-600">{overdueActions}</p>
                  {overdueActions > 0 && (
                    <Badge className="bg-red-100 text-red-800 text-xs">{overdueActions} overdue</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Action items past deadline</p>
              </div>
              <div className="p-2 rounded-lg bg-red-50">
                <ClipboardList className="h-5 w-5 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">RIF Progress</p>
                <p className="text-2xl font-bold text-am-navy mt-2">
                  {rif.completed}<span className="text-base text-muted-foreground font-normal">/{rif.total}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">Completed of total</p>
              </div>
              <div className="p-2 rounded-lg bg-purple-50">
                <UserMinus className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Task Completion */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-am-navy" />
            Task Completion
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Progress value={taskPct} className="flex-1 h-3" />
            <span className="text-sm font-semibold text-am-navy whitespace-nowrap">
              {tasks.completed}/{tasks.total} tasks ({taskPct}%)
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
