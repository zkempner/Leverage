import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Zap } from "lucide-react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ZAxis, ReferenceLine, Cell, Legend,
} from "recharts";

function fmt(v: number) {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

const QUADRANT_COLORS: Record<string, string> = {
  leverage: "#29702A",
  strategic: "#0085CA",
  bottleneck: "#CF7F00",
  "non-critical": "#767171",
  non_critical: "#767171",
};

const QUADRANT_LABELS: Record<string, string> = {
  leverage: "Leverage",
  strategic: "Strategic",
  bottleneck: "Bottleneck",
  "non-critical": "Non-Critical",
  non_critical: "Non-Critical",
};

function getQuadrant(supplyRisk: number, profitImpact: number): string {
  if (profitImpact >= 50 && supplyRisk < 50) return "leverage";
  if (profitImpact >= 50 && supplyRisk >= 50) return "strategic";
  if (profitImpact < 50 && supplyRisk >= 50) return "bottleneck";
  return "non_critical";
}

function KraljicMatrix({ strategies }: { strategies: any[] }) {
  const scatterData = strategies.map((s: any) => ({
    x: s.supply_risk_score ?? s.supply_risk ?? 50,
    y: s.profit_impact_score ?? s.profit_impact ?? 50,
    z: s.total_spend || s.spend || 1000,
    name: s.category_name || s.name || "Unknown",
    quadrant: s.quadrant || getQuadrant(
      s.supply_risk_score ?? s.supply_risk ?? 50,
      s.profit_impact_score ?? s.profit_impact ?? 50
    ),
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-md text-xs">
        <p className="font-semibold">{d.name}</p>
        <p>Supply Risk: {d.x.toFixed(0)}</p>
        <p>Profit Impact: {d.y.toFixed(0)}</p>
        <p>Spend: {fmt(d.z)}</p>
        <Badge className="mt-1" style={{ backgroundColor: QUADRANT_COLORS[d.quadrant] || "#666", color: "white" }}>
          {QUADRANT_LABELS[d.quadrant] || d.quadrant}
        </Badge>
      </div>
    );
  };

  return (
    <Card data-testid="kraljic-matrix">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Kraljic Portfolio Matrix</CardTitle>
        <p className="text-xs text-muted-foreground">Categories positioned by supply risk and profit impact</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={420}>
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, 100]}
              name="Supply Risk"
              tick={{ fontSize: 11 }}
              label={{ value: "Supply Risk →", position: "insideBottom", offset: -10, fontSize: 12 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0, 100]}
              name="Profit Impact"
              tick={{ fontSize: 11 }}
              label={{ value: "← Profit Impact", angle: -90, position: "insideLeft", offset: 10, fontSize: 12 }}
            />
            <ZAxis type="number" dataKey="z" range={[60, 600]} />
            <ReferenceLine x={50} stroke="#999" strokeDasharray="3 3" />
            <ReferenceLine y={50} stroke="#999" strokeDasharray="3 3" />
            <Tooltip content={<CustomTooltip />} />
            <Scatter data={scatterData} name="Categories">
              {scatterData.map((entry: any, i: number) => (
                <Cell key={i} fill={QUADRANT_COLORS[entry.quadrant] || "#666"} fillOpacity={0.8} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>

        {/* Quadrant labels overlay */}
        <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-center">
          <div className="p-2 rounded bg-green-50 text-green-800 font-medium">Leverage (High Impact, Low Risk)</div>
          <div className="p-2 rounded bg-blue-50 text-blue-800 font-medium">Strategic (High Impact, High Risk)</div>
          <div className="p-2 rounded bg-gray-50 text-gray-600 font-medium">Non-Critical (Low Impact, Low Risk)</div>
          <div className="p-2 rounded bg-amber-50 text-amber-800 font-medium">Bottleneck (Low Impact, High Risk)</div>
        </div>
      </CardContent>
    </Card>
  );
}

function StrategyCard({ strategy }: { strategy: any }) {
  const quadrant = strategy.quadrant || "non_critical";
  const color = QUADRANT_COLORS[quadrant] || "#666";
  const label = QUADRANT_LABELS[quadrant] || quadrant;

  return (
    <Card data-testid={`strategy-card-${strategy.category_name || strategy.name}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-bold">{strategy.category_name || strategy.name}</h4>
          <Badge style={{ backgroundColor: color, color: "white" }} className="shrink-0 text-[10px]">
            {label}
          </Badge>
        </div>

        {strategy.total_spend != null && (
          <p className="text-xs text-muted-foreground">
            Total Spend: <span className="font-semibold text-foreground">{fmt(strategy.total_spend || 0)}</span>
            {strategy.top_supplier_share != null && (
              <> · Top supplier: {(strategy.top_supplier_share * 100).toFixed(0)}%</>
            )}
          </p>
        )}

        <div className="space-y-2">
          {strategy.sourcing_strategy && (
            <div className="text-xs">
              <span className="text-muted-foreground">Sourcing: </span>
              <span className="font-medium">{strategy.sourcing_strategy}</span>
            </div>
          )}
          {strategy.contract_strategy && (
            <div className="text-xs">
              <span className="text-muted-foreground">Contract: </span>
              <span className="font-medium">{strategy.contract_strategy}</span>
            </div>
          )}
        </div>

        {strategy.recommended_levers && strategy.recommended_levers.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Top Levers</p>
            <div className="flex flex-wrap gap-1">
              {strategy.recommended_levers.slice(0, 3).map((lever: string, i: number) => (
                <Badge key={i} variant="outline" className="text-[10px]">
                  {lever.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {strategy.transition_path && (
          <div className="text-xs p-2 bg-muted/50 rounded">
            <span className="text-muted-foreground">Transition: </span>
            <span className="font-medium">{strategy.transition_path}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CategoryStrategyPage({ engagementId }: { engagementId: number }) {
  const { data: strategies, isLoading } = useQuery<any[]>({
    queryKey: ["/api/engagements", engagementId, "category-strategy"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/category-strategy`);
      return res.json();
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/engagements/${engagementId}/category-strategy/generate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId, "category-strategy"] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10" />
        <Skeleton className="h-[450px]" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  const items = strategies || [];

  return (
    <div className="space-y-6" data-testid="category-strategy-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Category Strategy</h2>
          <p className="text-sm text-muted-foreground">
            Kraljic-based portfolio positioning and strategic recommendations
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          data-testid="generate-strategies-btn"
        >
          <Zap className="h-4 w-4 mr-1" />
          {generateMutation.isPending ? "Generating..." : "Generate Strategies"}
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-sm font-semibold mb-1">No Category Strategies Yet</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Click "Generate Strategies" to run Kraljic analysis and create strategic recommendations for each category.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <KraljicMatrix strategies={items} />

          {/* Strategy cards grid */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Category Strategies ({items.length})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {items.map((s: any, i: number) => (
                <StrategyCard key={s.category_id || i} strategy={s} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
