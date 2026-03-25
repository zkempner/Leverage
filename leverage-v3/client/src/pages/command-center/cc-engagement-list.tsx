import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Shield, Plus, Trash2, Loader2, ArrowLeft, Building2, Calendar } from "lucide-react";

const engagementTypeLabels: Record<string, string> = {
  ODD: "Operational DD",
  Commercial_DD: "Commercial DD",
  IT_DD: "IT DD",
  HR_DD: "HR DD",
  Software_Tech_DD: "Software & Tech DD",
  Rapid_Results: "Rapid Results",
  CFO_Services: "CFO Services",
  Commercial_Excellence: "Commercial Excellence",
  Cost_Optimization: "Cost Optimization",
  Merger_Integration: "Merger Integration",
  Carve_Out: "Carve-Out",
  Ops_Management: "Operations Management",
  Supply_Chain: "Supply Chain & Procurement",
  Interim_Mgmt: "Interim Management",
  Tech_Services: "Technology Services",
};

const statusColors: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  completed: "bg-blue-100 text-blue-800",
  on_hold: "bg-amber-100 text-amber-800",
  cancelled: "bg-gray-100 text-gray-600",
};

const dealStageColors: Record<string, string> = {
  "Pre-Acq": "bg-blue-100 text-blue-800",
  "Post-Acq": "bg-purple-100 text-purple-800",
};

function formatDate(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CCEngagementListPage({ engagementId }: { engagementId?: number }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: engagements, isLoading } = useQuery<any[]>({
    queryKey: ["/api/cc/engagements"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/cc/engagements");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/cc/engagements/${id}`);
      return res.json();
    },
    onSuccess: (_data, id) => {
      toast({ title: "Engagement deleted", description: `Engagement #${id} has been removed.` });
      queryClient.invalidateQueries({ queryKey: ["/api/cc/engagements"] });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6" data-testid="cc-engagement-list-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-am-navy">Command Center</h1>
          <p className="text-sm text-muted-foreground mt-1">A&M PEPI Engagement Management</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate("/")} data-testid="back-home-btn">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Home
          </Button>
          <Button onClick={() => navigate("/command-center/new")} data-testid="new-cc-engagement-btn">
            <Plus className="h-4 w-4 mr-2" /> New Engagement
          </Button>
        </div>
      </div>

      {(!engagements || engagements.length === 0) && (
        <Card className="border-dashed" data-testid="cc-empty-engagements">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Shield className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No engagements yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first PEPI engagement to get started with the Command Center.
            </p>
            <Button onClick={() => navigate("/command-center/new")}>
              <Plus className="h-4 w-4 mr-2" /> New Engagement
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(engagements || []).map((eng: any) => (
          <Card
            key={eng.id}
            className="cursor-pointer hover:border-am-gold/50 hover:shadow-md transition-all"
            data-testid={`cc-engagement-card-${eng.id}`}
            onClick={() => navigate(`/command-center/${eng.id}`)}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-am-navy truncate">{eng.name}</h3>
                  <div className="flex items-center gap-1 mt-1">
                    <Building2 className="h-3 w-3 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground truncate">{eng.portfolio_company}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete "${eng.name}"? This action cannot be undone.`)) {
                        deleteMutation.mutate(eng.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    data-testid={`cc-delete-engagement-${eng.id}`}
                  >
                    {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                {eng.engagement_type && (
                  <Badge variant="outline" className="text-xs border-am-gold/50 text-am-navy">
                    {engagementTypeLabels[eng.engagement_type] || eng.engagement_type.replace(/_/g, " ")}
                  </Badge>
                )}
                {eng.deal_stage && (
                  <Badge className={`text-xs ${dealStageColors[eng.deal_stage] || "bg-gray-100 text-gray-800"}`}>
                    {eng.deal_stage}
                  </Badge>
                )}
                <Badge className={`text-xs ${statusColors[eng.status] || statusColors.active}`}>
                  {(eng.status || "active").replace(/_/g, " ")}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {eng.pe_sponsor && <span>PE: {eng.pe_sponsor}</span>}
                {eng.industry && <span className="capitalize">{eng.industry.replace(/_/g, " ")}</span>}
                {eng.start_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(eng.start_date)}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
