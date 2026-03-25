import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Loader2, AlertCircle, CheckCircle2, FileSearch } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GapItem {
  category: string;
  document_name: string;
  rationale: string;
  priority: string;
}

interface DrlSummary {
  total_items: number;
  received_count: number;
}

const priorityColors: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-blue-100 text-blue-800 border-blue-200",
};

const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default function CCDrlGapsPage({ engagementId }: { engagementId?: number }) {
  const { toast } = useToast();
  const [gaps, setGaps] = useState<GapItem[]>([]);
  const [hasRun, setHasRun] = useState(false);

  const base = `/api/cc/engagements/${engagementId}`;

  const { data: drlSummary } = useQuery<DrlSummary>({
    queryKey: [base, "drls", "summary"],
    queryFn: async () => {
      const r = await apiRequest("GET", `${base}/drls`);
      const items: any[] = await r.json();
      const received = items.filter((i: any) => i.status === "received" || i.status === "reviewed").length;
      return { total_items: items.length, received_count: received };
    },
    enabled: !!engagementId,
  });

  const { data: engagement } = useQuery<any>({
    queryKey: [base, "info"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/cc/engagements/${engagementId}`);
      return r.json();
    },
    enabled: !!engagementId,
  });

  const analysisMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `${base}/drls/gap-analysis`);
      return r.json();
    },
    onSuccess: (data: any) => {
      const gapList = data.gaps || data || [];
      setGaps(Array.isArray(gapList) ? gapList : []);
      setHasRun(true);
      toast({ title: "Gap analysis complete", description: `Found ${Array.isArray(gapList) ? gapList.length : 0} potential gaps` });
    },
    onError: (e: any) => toast({ title: "Analysis failed", description: e.message, variant: "destructive" }),
  });

  if (!engagementId) return <div className="p-6 text-muted-foreground">No engagement selected</div>;

  const sortedGaps = [...gaps].sort((a, b) => (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99));
  const groupedByCategory: Record<string, GapItem[]> = {};
  sortedGaps.forEach(g => {
    if (!groupedByCategory[g.category]) groupedByCategory[g.category] = [];
    groupedByCategory[g.category].push(g);
  });

  return (
    <div className="space-y-6" data-testid="cc-drl-gaps-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-am-navy">DRL Gap Analysis</h1>
          <p className="text-sm text-muted-foreground mt-1">AI-powered analysis to identify missing documents in your DRL</p>
        </div>
        <Button
          onClick={() => analysisMutation.mutate()}
          disabled={analysisMutation.isPending}
          className="bg-am-gold text-am-navy hover:bg-am-gold/90 font-semibold"
        >
          {analysisMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          Run Gap Analysis
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">DRL Items</p>
            <p className="text-2xl font-bold text-am-navy">{drlSummary?.total_items ?? "-"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Received</p>
            <p className="text-2xl font-bold text-emerald-600">{drlSummary?.received_count ?? "-"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Engagement Type</p>
            <p className="text-lg font-semibold text-am-navy capitalize">
              {engagement?.engagement_type?.replace(/_/g, " ") || engagement?.engagement_mode?.replace(/_/g, " ") || "-"}
            </p>
          </CardContent>
        </Card>
      </div>

      {analysisMutation.isPending && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Loader2 className="h-10 w-10 text-am-gold animate-spin mb-4" />
            <h3 className="text-lg font-semibold mb-1">Analyzing your DRL...</h3>
            <p className="text-sm text-muted-foreground">AI is reviewing your document request list for gaps and missing items</p>
          </CardContent>
        </Card>
      )}

      {!analysisMutation.isPending && !hasRun && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileSearch className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-1">Ready to analyze</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Click "Run Gap Analysis" to identify potentially missing documents in your DRL
            </p>
          </CardContent>
        </Card>
      )}

      {hasRun && !analysisMutation.isPending && gaps.length === 0 && (
        <Card className="border-emerald-200">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-3" />
            <h3 className="text-lg font-semibold mb-1">No gaps identified</h3>
            <p className="text-sm text-muted-foreground">Your DRL appears to be comprehensive for this engagement type</p>
          </CardContent>
        </Card>
      )}

      {hasRun && !analysisMutation.isPending && gaps.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            <span className="text-sm font-medium">{gaps.length} potential gap{gaps.length !== 1 ? "s" : ""} identified</span>
          </div>
          {Object.entries(groupedByCategory).map(([category, items]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-am-navy mb-2 uppercase tracking-wide">{category}</h3>
              <div className="space-y-2">
                {items.map((gap, idx) => (
                  <Card key={`${category}-${idx}`} className={`border-l-4 ${
                    gap.priority === "critical" ? "border-l-red-500" :
                    gap.priority === "high" ? "border-l-orange-500" :
                    gap.priority === "medium" ? "border-l-amber-500" : "border-l-blue-500"
                  }`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium">{gap.document_name}</p>
                            <Badge className={`text-[10px] ${priorityColors[gap.priority] || "bg-gray-100 text-gray-800"}`}>
                              {gap.priority}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{gap.rationale}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
