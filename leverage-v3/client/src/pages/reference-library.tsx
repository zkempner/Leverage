import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BookOpen } from "lucide-react";

export default function ReferenceLibraryPage() {
  const { data: benchmarkData, isLoading: loadingBench } = useQuery<any>({
    queryKey: ["/api/reference/benchmarks"],
  });

  const { data: catRulesData, isLoading: loadingCat } = useQuery<any>({
    queryKey: ["/api/reference/categorization-rules"],
  });

  const { data: tariffData, isLoading: loadingTariff } = useQuery<any>({
    queryKey: ["/api/reference/tariff-rates"],
  });

  const { data: sizingData, isLoading: loadingSizing } = useQuery<any>({
    queryKey: ["/api/reference/sizing-rules"],
  });

  const isLoading = loadingBench || loadingCat || loadingTariff || loadingSizing;

  if (isLoading) {
    return <div className="space-y-4 p-6">{[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}</div>;
  }

  const industries = ["chemicals", "manufacturing", "technology", "healthcare", "retail", "financial_services"];

  return (
    <div className="space-y-6 max-w-7xl mx-auto" data-testid="reference-library-page">
      <div className="flex items-center gap-3">
        <BookOpen className="h-5 w-5 text-am-navy" />
        <div>
          <h2 className="text-lg font-bold text-am-navy">Reference Library</h2>
          <p className="text-xs text-muted-foreground">Static lookup tables and rules that power all deterministic engines</p>
        </div>
      </div>

      <Tabs defaultValue="benchmarks" data-testid="reference-tabs">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="benchmarks" data-testid="tab-benchmarks">Benchmark Rates</TabsTrigger>
          <TabsTrigger value="categorization" data-testid="tab-categorization">Category Rules</TabsTrigger>
          <TabsTrigger value="tariffs" data-testid="tab-tariffs">Tariff Rates</TabsTrigger>
          <TabsTrigger value="sizing" data-testid="tab-sizing">Sizing Logic</TabsTrigger>
        </TabsList>

        {/* Tab 1: Benchmark Reference Rates */}
        <TabsContent value="benchmarks" className="space-y-4">
          {/* Multipliers summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card data-testid="industry-multipliers">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Industry Multipliers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {benchmarkData?.industry_multipliers && Object.entries(benchmarkData.industry_multipliers).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                      <span className="font-mono font-medium">{String(v)}x</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card data-testid="size-multipliers">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Size Multipliers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {benchmarkData?.size_multipliers && Object.entries(benchmarkData.size_multipliers).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                      <span className="font-mono font-medium">{String(v)}x</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card data-testid="benchmark-table">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Benchmark Table ({benchmarkData?.benchmark_table?.length || 0} entries)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lever Type</TableHead>
                    <TableHead>Metric</TableHead>
                    <TableHead className="text-center">Default (L/M/H)</TableHead>
                    {industries.map(ind => (
                      <TableHead key={ind} className="text-center capitalize">{ind.replace(/_/g, " ").slice(0, 8)}</TableHead>
                    ))}
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(benchmarkData?.benchmark_table || []).map((entry: any, idx: number) => {
                    const def = entry.industries?.manufacturing || entry.industries?.[Object.keys(entry.industries)[0]];
                    return (
                      <TableRow key={idx}>
                        <TableCell className="text-xs font-mono">{entry.lever_type}</TableCell>
                        <TableCell className="text-xs">{entry.metric_name}</TableCell>
                        <TableCell className="text-center text-xs font-mono">
                          {def ? `${def.low}/${def.mid}/${def.high}` : "—"}
                        </TableCell>
                        {industries.map(ind => {
                          const vals = entry.industries?.[ind];
                          return (
                            <TableCell key={ind} className="text-center text-xs font-mono">
                              {vals ? `${vals.mid}${entry.unit}` : "—"}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-xs text-muted-foreground">{entry.source}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Category Rules Library */}
        <TabsContent value="categorization" className="space-y-4">
          <Card data-testid="categorization-rules-table">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Default Categorization Rules ({catRulesData?.rules?.length || 0} rules)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Priority</TableHead>
                    <TableHead>Match Field</TableHead>
                    <TableHead>Match Type</TableHead>
                    <TableHead>Match Value</TableHead>
                    <TableHead>Target Category</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(catRulesData?.rules || []).map((rule: any, idx: number) => (
                    <TableRow key={idx}>
                      <TableCell className="text-sm">{rule.priority || idx + 1}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-mono">{rule.match_field}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{rule.match_type}</TableCell>
                      <TableCell className="text-xs font-mono">{rule.match_value}</TableCell>
                      <TableCell className="text-sm font-medium">{rule.target_category}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Tariff Rate Schedule */}
        <TabsContent value="tariffs" className="space-y-4">
          <Card data-testid="tariff-rates-table">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">HTS Tariff Rate Schedule ({tariffData?.rates?.length || 0} entries)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead className="text-right">Current Rate</TableHead>
                    <TableHead className="text-right">Proposed Rate</TableHead>
                    <TableHead className="text-right">Increase</TableHead>
                    <TableHead>HTS Chapter</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(tariffData?.rates || []).map((r: any, idx: number) => {
                    const increase = r.proposed_rate - r.current_rate;
                    return (
                      <TableRow key={idx}>
                        <TableCell className="text-sm font-medium">{r.category}</TableCell>
                        <TableCell className="text-sm">{r.country}</TableCell>
                        <TableCell className="text-right text-sm font-mono">{r.current_rate}%</TableCell>
                        <TableCell className="text-right text-sm font-mono">{r.proposed_rate}%</TableCell>
                        <TableCell className="text-right">
                          <Badge className={`text-xs ${increase > 10 ? "bg-red-100 text-red-800" : increase > 5 ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>
                            +{increase.toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{r.hts_chapter}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Sizing Logic */}
        <TabsContent value="sizing" className="space-y-4">
          <Card data-testid="sizing-formula">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Sizing Formula</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-muted/50 rounded-lg font-mono text-sm">
                {sizingData?.formula || "target = category_spend × addressable_pct × savings_rate × industry_adj × size_adj"}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card data-testid="sizing-industry-adj">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Industry Adjustments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  {sizingData?.industry_adjustments && Object.entries(sizingData.industry_adjustments).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                      <span className="font-mono font-medium">{String(v)}x</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card data-testid="sizing-size-adj">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Size Adjustments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  {sizingData?.size_adjustments && Object.entries(sizingData.size_adjustments).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                      <span className="font-mono font-medium">{String(v)}x</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card data-testid="sizing-confidence">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Confidence Scoring Rules</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {sizingData?.confidence_rules && Object.entries(sizingData.confidence_rules).map(([level, rule]) => (
                  <div key={level} className="flex items-center gap-3">
                    <Badge className={`text-xs w-16 justify-center ${level === "high" ? "bg-emerald-100 text-emerald-800" : level === "medium" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
                      {level}
                    </Badge>
                    <span className="text-muted-foreground">{String(rule)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="category-lever-map">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Category → Lever Mapping ({sizingData?.category_lever_map?.length || 0} patterns)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pattern (regex)</TableHead>
                    <TableHead>Lever Type</TableHead>
                    <TableHead className="text-right">Addressable %</TableHead>
                    <TableHead className="text-right">Savings Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(sizingData?.category_lever_map || []).map((m: any, idx: number) => {
                    const bench = sizingData?.lever_benchmarks?.[m.lever_type];
                    return (
                      <TableRow key={idx}>
                        <TableCell className="text-xs font-mono">{m.pattern}</TableCell>
                        <TableCell className="text-sm capitalize">{m.lever_type.replace(/_/g, " ")}</TableCell>
                        <TableCell className="text-right text-sm font-mono">{bench ? `${(bench.addressable_pct * 100).toFixed(0)}%` : "—"}</TableCell>
                        <TableCell className="text-right text-sm font-mono">{bench ? `${(bench.savings_rate * 100).toFixed(1)}%` : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
