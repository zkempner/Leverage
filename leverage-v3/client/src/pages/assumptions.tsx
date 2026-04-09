import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, Calculator, Loader2, Info, Pencil, Check, X, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function BenchmarkBar({ low, mid, high }: { low: number; mid: number; high: number }) {
  const max = high * 1.2 || 1;
  return (
    <div className="relative h-5 w-32 bg-muted rounded-full overflow-hidden" data-testid="benchmark-bar">
      <div className="absolute h-full bg-am-blue/20 rounded-full" style={{ left: `${(low / max) * 100}%`, width: `${((high - low) / max) * 100}%` }} />
      <div className="absolute top-0 h-full w-1 bg-am-blue rounded-full" style={{ left: `${(mid / max) * 100}%` }} />
      <div className="absolute top-1 h-3 w-0.5 bg-gray-400" style={{ left: `${(low / max) * 100}%` }} />
      <div className="absolute top-1 h-3 w-0.5 bg-gray-400" style={{ left: `${Math.min((high / max) * 100, 99)}%` }} />
    </div>
  );
}

interface EditState {
  low_value: string;
  mid_value: string;
  high_value: string;
}

export default function AssumptionsPage({ engagementId }: { engagementId: number }) {
  const { toast } = useToast();
  const [expandedLever, setExpandedLever] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<EditState>({ low_value: "", mid_value: "", high_value: "" });

  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["/api/engagements", engagementId, "assumptions", "benchmarks"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/assumptions/benchmarks`);
      return res.json();
    },
  });

  const { data: engagement } = useQuery<any>({
    queryKey: ["/api/engagements", engagementId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}`);
      return res.json();
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/engagements/${engagementId}/assumptions/generate`, {});
      return res.json();
    },
    onSuccess: (d: any) => {
      toast({ title: "Benchmarks Generated", description: `${d.created} benchmarks from industry lookup tables` });
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId, "assumptions"] });
    },
    onError: (e: any) => toast({ title: "Generation Failed", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: number; values: Partial<EditState> }) => {
      const res = await apiRequest("PUT", `/api/assumptions/benchmarks/${id}`, {
        low_value: parseFloat(values.low_value || "0"),
        mid_value: parseFloat(values.mid_value || "0"),
        high_value: parseFloat(values.high_value || "0"),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Benchmark updated" });
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId, "assumptions"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/assumptions/benchmarks/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Benchmark deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId, "assumptions"] });
    },
  });

  const startEdit = (b: any) => {
    setEditingId(b.id);
    setEditValues({
      low_value: String(b.low_value ?? 0),
      mid_value: String(b.mid_value ?? 0),
      high_value: String(b.high_value ?? 0),
    });
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = (id: number) => {
    updateMutation.mutate({ id, values: editValues });
  };

  if (isLoading) return <div className="space-y-4">{[1,2].map(i => <Skeleton key={i} className="h-40" />)}</div>;

  const grouped: Record<string, any[]> = {};
  for (const b of data || []) {
    const key = b.lever_type || "Other";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(b);
  }

  const totalBenchmarks = data?.length || 0;

  return (
    <div className="space-y-6" data-testid="assumptions-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-base font-semibold">Assumption Benchmarks</h2>
          <p className="text-xs text-muted-foreground">
            Click any Low / Mid / High value to adjust. Benchmarks adjusted for {engagement?.industry || "industry"}, {engagement?.location || "geography"}, {engagement?.company_size || "company size"}.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          data-testid="generate-benchmarks-btn"
        >
          {generateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Calculator className="h-3 w-3 mr-1" />}
          Generate Benchmarks
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Company</p>
          <p className="text-lg font-bold mt-1">{engagement?.portfolio_company || "\u2014"}</p>
          <p className="text-xs text-muted-foreground mt-1">{engagement?.industry || "\u2014"} \u00b7 {engagement?.location || "\u2014"}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Total Benchmarks</p>
          <p className="text-2xl font-bold mt-1 text-am-blue">{totalBenchmarks}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Lever Types</p>
          <p className="text-2xl font-bold mt-1 text-am-navy">{Object.keys(grouped).length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Sources</p>
          <p className="text-2xl font-bold mt-1 text-am-gold">{new Set((data || []).map((b: any) => b.source)).size}</p>
        </CardContent></Card>
      </div>

      {Object.entries(grouped).map(([lever, benchmarks]) => {
        const isExpanded = expandedLever === null || expandedLever === lever;
        return (
          <Card key={lever}>
            <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpandedLever(expandedLever === lever ? null : lever)}>
              <CardTitle className="text-sm font-semibold capitalize flex items-center gap-2">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <Badge className="bg-am-navy text-white text-xs">{lever.replace(/_/g, " ")}</Badge>
                <span className="text-muted-foreground font-normal text-xs">{benchmarks.length} benchmarks</span>
              </CardTitle>
            </CardHeader>
            {isExpanded && (
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Metric</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Low</TableHead>
                        <TableHead className="text-right">Mid</TableHead>
                        <TableHead className="text-right">High</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Range</TableHead>
                        <TableHead>Rationale</TableHead>
                        <TableHead className="w-24">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {benchmarks.map((b: any) => {
                        const isEditing = editingId === b.id;
                        return (
                          <TableRow key={b.id} data-testid={`benchmark-${b.id}`} className={isEditing ? "bg-am-gold/5" : ""}>
                            <TableCell className="text-sm font-medium">{(b.metric_name || "").replace(/_/g, " ")}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{b.category}</TableCell>
                            <TableCell className="text-right">
                              {isEditing ? (
                                <Input
                                  type="number"
                                  step="0.1"
                                  value={editValues.low_value}
                                  onChange={e => setEditValues({ ...editValues, low_value: e.target.value })}
                                  className="w-20 h-7 text-xs text-right"
                                  data-testid={`edit-low-${b.id}`}
                                />
                              ) : (
                                <span className="text-sm text-muted-foreground cursor-pointer hover:text-am-blue hover:underline" onClick={() => startEdit(b)}>{b.low_value}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {isEditing ? (
                                <Input
                                  type="number"
                                  step="0.1"
                                  value={editValues.mid_value}
                                  onChange={e => setEditValues({ ...editValues, mid_value: e.target.value })}
                                  className="w-20 h-7 text-xs text-right font-bold"
                                  data-testid={`edit-mid-${b.id}`}
                                />
                              ) : (
                                <span className="text-sm font-bold text-am-blue cursor-pointer hover:underline" onClick={() => startEdit(b)}>{b.mid_value}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {isEditing ? (
                                <Input
                                  type="number"
                                  step="0.1"
                                  value={editValues.high_value}
                                  onChange={e => setEditValues({ ...editValues, high_value: e.target.value })}
                                  className="w-20 h-7 text-xs text-right"
                                  data-testid={`edit-high-${b.id}`}
                                />
                              ) : (
                                <span className="text-sm text-muted-foreground cursor-pointer hover:text-am-blue hover:underline" onClick={() => startEdit(b)}>{b.high_value}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{b.unit}</TableCell>
                            <TableCell>
                              {!isEditing && <BenchmarkBar low={b.low_value ?? 0} mid={b.mid_value ?? 0} high={b.high_value ?? 0} />}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                              {b.rationale ? (
                                <span className="flex items-center gap-1" title={b.rationale}>
                                  <Info className="h-3 w-3 flex-shrink-0" /> {b.rationale}
                                </span>
                              ) : "\u2014"}
                            </TableCell>
                            <TableCell>
                              {isEditing ? (
                                <div className="flex items-center gap-1">
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-am-green" onClick={() => saveEdit(b.id)} data-testid={`save-${b.id}`}>
                                    <Check className="h-3 w-3" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={cancelEdit} data-testid={`cancel-${b.id}`}>
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-am-blue" onClick={() => startEdit(b)} data-testid={`edit-${b.id}`}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-red-500" onClick={() => deleteMutation.mutate(b.id)} data-testid={`delete-${b.id}`}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      {totalBenchmarks === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Calculator className="h-8 w-8 text-am-blue mx-auto mb-3" />
            <p className="text-sm font-medium">No benchmarks yet</p>
            <p className="text-xs text-muted-foreground mt-1">Click "Generate Benchmarks" to create industry-adjusted benchmarks from published reference data</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
