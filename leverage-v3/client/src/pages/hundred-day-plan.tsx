import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayCircle, Filter, DollarSign, Target, BarChart3 } from "lucide-react";

function fmt(v: number) {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

const PHASE_CONFIG: Record<string, { label: string; range: string; color: string }> = {
  quick_win: { label: "Quick Wins", range: "0-90 Days", color: "#29702A" },
  medium_term: { label: "Medium Term", range: "90-180 Days", color: "#CF7F00" },
  long_term: { label: "Long Term", range: "180-365 Days", color: "#002B49" },
};

function InitiativeCard({ initiative }: { initiative: any }) {
  return (
    <Card className="mb-3" data-testid={`initiative-card-${initiative.id}`}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold leading-tight">{initiative.name}</h4>
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {(initiative.lever_type || "").replace(/_/g, " ")}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{initiative.category_name || "Uncategorized"}</p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Target</span>
            <p className="font-semibold">{fmt(initiative.target_amount || 0)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Prob</span>
            <p className="font-semibold">{(initiative.probability ?? 0)}%</p>
          </div>
          <div>
            <span className="text-muted-foreground">Risk-Adj</span>
            <p className="font-semibold">{fmt(initiative.risk_adjusted_target || 0)}</p>
          </div>
        </div>
        {initiative.implementation_owner && (
          <p className="text-[11px] text-muted-foreground">
            Owner: <span className="font-medium text-foreground">{initiative.implementation_owner}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PhaseColumn({
  phase,
  initiatives,
  mcBands,
}: {
  phase: string;
  initiatives: any[];
  mcBands?: { p10: number; p50: number; p90: number };
}) {
  const config = PHASE_CONFIG[phase] || { label: phase, range: "", color: "#666" };
  const totalIdentified = initiatives.reduce((s: number, i: any) => s + (i.target_amount || 0), 0);
  const totalWeighted = initiatives.reduce((s: number, i: any) => s + (i.risk_adjusted_target || 0), 0);

  return (
    <div className="flex flex-col" data-testid={`phase-column-${phase}`}>
      <div className="rounded-t-lg p-4 text-white" style={{ backgroundColor: config.color }}>
        <h3 className="text-sm font-bold">{config.label}</h3>
        <p className="text-xs opacity-80">{config.range}</p>
        <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
          <div>
            <span className="opacity-70">Identified</span>
            <p className="font-bold">{fmt(totalIdentified)}</p>
          </div>
          <div>
            <span className="opacity-70">Weighted</span>
            <p className="font-bold">{fmt(totalWeighted)}</p>
          </div>
          <div>
            <span className="opacity-70">Count</span>
            <p className="font-bold">{initiatives.length}</p>
          </div>
        </div>
      </div>

      {mcBands && (
        <div className="bg-muted/50 border-x border-border px-4 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Monte Carlo</p>
          <div className="flex justify-between text-xs">
            <span>P10: <strong>{fmt(mcBands.p10)}</strong></span>
            <span>P50: <strong>{fmt(mcBands.p50)}</strong></span>
            <span>P90: <strong>{fmt(mcBands.p90)}</strong></span>
          </div>
          <div className="relative h-2 bg-gray-200 rounded mt-1">
            <div
              className="absolute h-2 rounded opacity-40"
              style={{
                backgroundColor: config.color,
                left: `${mcBands.p90 > 0 ? (mcBands.p10 / mcBands.p90) * 100 : 0}%`,
                right: "0%",
              }}
            />
            <div
              className="absolute h-2 w-0.5 bg-foreground rounded"
              style={{ left: `${mcBands.p90 > 0 ? (mcBands.p50 / mcBands.p90) * 100 : 50}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex-1 border-x border-b border-border rounded-b-lg p-3 bg-card overflow-y-auto max-h-[60vh]">
        {initiatives.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">No initiatives in this phase</p>
        ) : (
          initiatives.map((init: any) => <InitiativeCard key={init.id} initiative={init} />)
        )}
      </div>
    </div>
  );
}

export default function HundredDayPlanPage({ engagementId }: { engagementId: number }) {
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [leverFilter, setLeverFilter] = useState("all");
  const [minTarget, setMinTarget] = useState("");

  const { data: planData, isLoading } = useQuery<any>({
    queryKey: ["/api/engagements", engagementId, "100-day-plan"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/100-day-plan`);
      return res.json();
    },
  });

  const { data: mcData } = useQuery<any>({
    queryKey: ["/api/engagements", engagementId, "monte-carlo", "latest"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/monte-carlo/latest`);
      return res.json();
    },
  });

  const runMC = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/engagements/${engagementId}/monte-carlo`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId, "monte-carlo"] });
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId, "100-day-plan"] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-96" />)}
        </div>
      </div>
    );
  }

  const phases: Record<string, any[]> = planData?.phases || { quick_win: [], medium_term: [], long_term: [] };
  const mcByPhase: Record<string, any> = mcData?.by_phase_json
    ? (typeof mcData.by_phase_json === "string" ? JSON.parse(mcData.by_phase_json) : mcData.by_phase_json)
    : {};

  // Collect filter options
  const allInitiatives = [...(phases.quick_win || []), ...(phases.medium_term || []), ...(phases.long_term || [])];
  const categories = [...new Set(allInitiatives.map((i: any) => i.category_name).filter(Boolean))].sort();
  const levers = [...new Set(allInitiatives.map((i: any) => i.lever_type).filter(Boolean))].sort();

  // Apply filters
  const minTargetNum = minTarget ? Number(minTarget) : 0;
  const filterFn = (init: any) => {
    if (categoryFilter !== "all" && init.category_name !== categoryFilter) return false;
    if (leverFilter !== "all" && init.lever_type !== leverFilter) return false;
    if (minTargetNum > 0 && (init.target_amount || 0) < minTargetNum) return false;
    return true;
  };

  const filteredPhases: Record<string, any[]> = {
    quick_win: (phases.quick_win || []).filter(filterFn),
    medium_term: (phases.medium_term || []).filter(filterFn),
    long_term: (phases.long_term || []).filter(filterFn),
  };

  return (
    <div className="space-y-6" data-testid="hundred-day-plan-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">100-Day Plan</h2>
          <p className="text-sm text-muted-foreground">
            {allInitiatives.length} initiatives across 3 phases
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => runMC.mutate()}
          disabled={runMC.isPending}
          data-testid="run-monte-carlo-btn"
        >
          <PlayCircle className="h-4 w-4 mr-1" />
          {runMC.isPending ? "Running..." : "Run Monte Carlo"}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48 h-8 text-xs" data-testid="filter-category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={leverFilter} onValueChange={setLeverFilter}>
              <SelectTrigger className="w-48 h-8 text-xs" data-testid="filter-lever">
                <SelectValue placeholder="Lever Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levers</SelectItem>
                {levers.map(l => (
                  <SelectItem key={l} value={l}>{(l || "").replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="Min target ($)"
              className="w-36 h-8 text-xs"
              value={minTarget}
              onChange={e => setMinTarget(e.target.value)}
              data-testid="filter-min-target"
            />
          </div>
        </CardContent>
      </Card>

      {/* Totals row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {(["quick_win", "medium_term", "long_term"] as const).map(phase => {
          const inits = filteredPhases[phase] || [];
          const total = inits.reduce((s: number, i: any) => s + (i.target_amount || 0), 0);
          const config = PHASE_CONFIG[phase];
          return (
            <Card key={phase}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: `${config.color}15` }}>
                  <Target className="h-5 w-5" style={{ color: config.color }} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{config.label} Total</p>
                  <p className="text-lg font-bold">{fmt(total)}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Three-column swimlane */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <PhaseColumn
          phase="quick_win"
          initiatives={filteredPhases.quick_win || []}
          mcBands={mcByPhase.quick_win}
        />
        <PhaseColumn
          phase="medium_term"
          initiatives={filteredPhases.medium_term || []}
          mcBands={mcByPhase.medium_term}
        />
        <PhaseColumn
          phase="long_term"
          initiatives={filteredPhases.long_term || []}
          mcBands={mcByPhase.long_term}
        />
      </div>
    </div>
  );
}
