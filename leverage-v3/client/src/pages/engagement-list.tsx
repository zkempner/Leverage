import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Briefcase, Trash2, Loader2, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { Engagement } from "@shared/schema";

function HealthBadge({ engagementId }: { engagementId: number }) {
  const { data } = useQuery<any>({
    queryKey: ["/api/engagements", engagementId, "health-score"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/health-score`);
      return res.json();
    },
  });

  if (!data || data.overall_score == null) return null;
  const score = Math.round(data.overall_score);
  const color = score <= 40 ? "bg-red-100 text-red-800" : score <= 65 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800";
  return (
    <Badge className={`text-[10px] ${color}`} data-testid={`health-badge-${engagementId}`}>
      Health: {score}
    </Badge>
  );
}

function ModeBadge({ mode }: { mode?: string }) {
  if (!mode) return null;
  const isPE = mode === "pe_100_day";
  return (
    <Badge variant="outline" className={`text-[10px] ${isPE ? "border-blue-300 text-blue-700" : "border-gray-300 text-gray-600"}`}>
      {isPE ? "PE" : "Ops"}
    </Badge>
  );
}

const statusColors: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  completed: "bg-blue-100 text-blue-800",
  on_hold: "bg-amber-100 text-amber-800",
  cancelled: "bg-gray-100 text-gray-600",
};

function formatDate(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function EngagementListPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: engagements, isLoading } = useQuery<Engagement[]>({
    queryKey: ["/api/engagements"],
  });

  const seedDemoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/seed/demo-engagement");
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Demo data loaded", description: `Engagement "${data.name || "Demo"}" created with sample data` });
      queryClient.invalidateQueries({ queryKey: ["/api/engagements"] });
      if (data.id) navigate(`/engagements/${data.id}`);
    },
    onError: (err: any) => {
      toast({ title: "Seed failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/engagements/${id}`);
      return res.json();
    },
    onSuccess: (_data, id) => {
      toast({ title: "Engagement deleted", description: `Engagement #${id} removed` });
      queryClient.invalidateQueries({ queryKey: ["/api/engagements"] });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto p-6 space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6" data-testid="engagement-list-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-am-navy">Engagements</h1>
          <p className="text-sm text-muted-foreground mt-1">Select an engagement to view or create a new one</p>
        </div>
        <Button onClick={() => navigate("/new-engagement")} data-testid="new-engagement-btn">
          <Plus className="h-4 w-4 mr-2" /> New Engagement
        </Button>
      </div>

      {(!engagements || engagements.length === 0) && (
        <Card className="border-dashed" data-testid="empty-engagements">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Briefcase className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No engagements yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first procurement engagement or load demo data to get started</p>
            <div className="flex gap-3">
              <Button onClick={() => navigate("/new-engagement")} data-testid="empty-new-engagement-btn">
                <Plus className="h-4 w-4 mr-2" /> New Engagement
              </Button>
              <Button
                variant="outline"
                onClick={() => seedDemoMutation.mutate()}
                disabled={seedDemoMutation.isPending}
                data-testid="load-demo-btn"
              >
                {seedDemoMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Database className="h-4 w-4 mr-2" />}
                Load Demo Data
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(engagements || []).map(eng => (
          <Card
            key={eng.id}
            className="cursor-pointer hover:border-am-gold/50 hover:shadow-md transition-all"
            data-testid={`engagement-card-${eng.id}`}
            onClick={() => navigate(`/engagements/${eng.id}`)}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold truncate">{eng.name}</h3>
                  <p className="text-sm text-muted-foreground truncate">{eng.portfolio_company}</p>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <ModeBadge mode={(eng as any).engagement_mode} />
                  <HealthBadge engagementId={eng.id} />
                  <Badge className={`text-xs ${statusColors[eng.status] || statusColors.active}`}>
                    {eng.status}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete "${eng.name}"?`)) deleteMutation.mutate(eng.id);
                    }}
                    disabled={deleteMutation.isPending}
                    data-testid={`delete-engagement-${eng.id}`}
                  >
                    {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {eng.industry && <span className="capitalize">{eng.industry.replace(/_/g, " ")}</span>}
                {eng.company_size && <span className="capitalize">{eng.company_size.replace(/_/g, " ")}</span>}
                {eng.pe_sponsor && <span>{eng.pe_sponsor}</span>}
                {eng.created_at && <span>Created {formatDate(eng.created_at)}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
