import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { FolderTree, Play, Plus, Loader2, Trash2, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = ["#002B49", "#CF7F00", "#0085CA", "#29702A", "#00677F", "#5E8AB4", "#767171"];

function formatCurrency(v: number) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export default function CategorizationPage({ engagementId }: { engagementId: number }) {
  const { toast } = useToast();
  const [newRule, setNewRule] = useState({ match_field: "GL_CODE", match_type: "STARTS_WITH", match_value: "", category_id: "" });

  const { data: coverage, isLoading } = useQuery<any>({
    queryKey: ["/api/engagements", engagementId, "categorization", "coverage"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/categorization/coverage`);
      return res.json();
    },
  });

  const { data: cats } = useQuery<any[]>({
    queryKey: ["/api/engagements", engagementId, "categories"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/categories`);
      return res.json();
    },
  });

  const { data: rules } = useQuery<any[]>({
    queryKey: ["/api/engagements", engagementId, "categorization", "rules"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/categorization/rules`);
      return res.json();
    },
  });

  const createRuleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/engagements/${engagementId}/categorization/rules`, {
        ...newRule,
        category_id: Number(newRule.category_id),
        priority: (rules?.length || 0) + 1,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rule created" });
      setNewRule({ match_field: "GL_CODE", match_type: "STARTS_WITH", match_value: "", category_id: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId, "categorization"] });
    },
  });

  const applyRulesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/engagements/${engagementId}/categorization/apply-rules`, {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Rules applied", description: `${data.applied} records categorized` });
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId] });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId: number) => {
      const res = await apiRequest("DELETE", `/api/engagements/${engagementId}/categorization/rules/${ruleId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rule deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId, "categorization"] });
    },
  });

  const autoCategorizeMutation = useMutation({
    mutationFn: async (recategorizeAll: boolean = false) => {
      const res = await apiRequest("POST", `/api/engagements/${engagementId}/categorization/auto-categorize`, { recategorize_all: recategorizeAll });
      return res.json();
    },
    onSuccess: (data: any) => {
      const parts = [];
      if (data.by_imported) parts.push(`${data.by_imported} from imported categories`);
      if (data.by_user_rule) parts.push(`${data.by_user_rule} by user rules`);
      if (data.by_learned_gl) parts.push(`${data.by_learned_gl} by learned GL mappings`);
      if (data.by_learned_supplier) parts.push(`${data.by_learned_supplier} by learned supplier mappings`);
      if (data.by_supplier_keyword) parts.push(`${data.by_supplier_keyword} by supplier keywords`);
      if (data.by_description_keyword) parts.push(`${data.by_description_keyword} by description keywords`);
      toast({
        title: "Auto-Categorization Complete",
        description: `${data.categorized} records categorized: ${parts.join(", ")}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId] });
    },
    onError: (err: any) => {
      toast({ title: "Auto-Categorization Failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) return <div className="space-y-4">{[1,2].map(i => <Skeleton key={i} className="h-40" />)}</div>;

  const pieData = (coverage?.by_category || []).slice(0, 8).map((c: any) => ({
    name: c.name || "Uncategorized",
    value: c.total_amount,
  }));

  const l2Cats = (cats || []).filter((c: any) => c.level === "L2" || c.level === "L3");

  return (
    <div className="space-y-6" data-testid="categorization-page">
      {/* Coverage stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1" data-testid="coverage-stats">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Coverage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-center">
              <p className="text-3xl font-bold text-am-blue">{coverage?.coverage_pct || 0}%</p>
              <p className="text-xs text-muted-foreground mt-1">of records categorized</p>
              <Progress value={coverage?.coverage_pct || 0} className="h-2 mt-3" data-testid="coverage-progress" />
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Records</span>
                <span className="font-medium">{coverage?.total_records || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Categorized</span>
                <span className="font-medium text-am-green">{coverage?.categorized_records || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Uncategorized</span>
                <span className="font-medium text-amber-600">{(coverage?.total_records || 0) - (coverage?.categorized_records || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Categorized Spend</span>
                <span className="font-medium">{formatCurrency(coverage?.categorized_amount || 0)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2" data-testid="category-distribution">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Spend by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                  {pieData.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 justify-center mt-2">
              {pieData.slice(0, 6).map((d: any, i: number) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span>{d.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rules Manager */}
      <Card data-testid="rules-manager">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Category Rules</CardTitle>
          <Button size="sm" variant="outline" onClick={() => applyRulesMutation.mutate()} disabled={applyRulesMutation.isPending} data-testid="apply-rules-btn">
            {applyRulesMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
            Apply Rules
          </Button>
          <Button size="sm" variant="outline" onClick={() => autoCategorizeMutation.mutate(false)} disabled={autoCategorizeMutation.isPending} data-testid="auto-categorize-btn">
            {autoCategorizeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
            Auto-Categorize Uncategorized
          </Button>
          <Button size="sm" onClick={() => { if (confirm("This will clear all existing categories and re-run rules on every record. Continue?")) autoCategorizeMutation.mutate(true); }} disabled={autoCategorizeMutation.isPending} data-testid="recategorize-all-btn">
            {autoCategorizeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
            Re-categorize All Records
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add new rule */}
          <div className="flex flex-wrap gap-2 items-end p-3 bg-muted/50 rounded-lg">
            <div>
              <label className="text-xs font-medium">Field</label>
              <Select value={newRule.match_field} onValueChange={v => setNewRule(p => ({ ...p, match_field: v }))}>
                <SelectTrigger className="w-32 text-xs" data-testid="rule-field">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GL_CODE">GL Code</SelectItem>
                  <SelectItem value="SUPPLIER_NAME">Supplier</SelectItem>
                  <SelectItem value="DESCRIPTION">Description</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium">Match</label>
              <Select value={newRule.match_type} onValueChange={v => setNewRule(p => ({ ...p, match_type: v }))}>
                <SelectTrigger className="w-32 text-xs" data-testid="rule-match-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STARTS_WITH">Starts with</SelectItem>
                  <SelectItem value="CONTAINS">Contains</SelectItem>
                  <SelectItem value="EQUALS">Equals</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium">Value</label>
              <Input className="w-32 text-xs" value={newRule.match_value} onChange={e => setNewRule(p => ({ ...p, match_value: e.target.value }))} placeholder="e.g. 61" data-testid="rule-value" />
            </div>
            <div>
              <label className="text-xs font-medium">Category</label>
              <Select value={newRule.category_id} onValueChange={v => setNewRule(p => ({ ...p, category_id: v }))}>
                <SelectTrigger className="w-48 text-xs" data-testid="rule-category">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {l2Cats.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.level === "L3" ? "  " : ""}{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={() => createRuleMutation.mutate()} disabled={!newRule.match_value || !newRule.category_id} data-testid="add-rule-btn">
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>

          {/* Rules table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Priority</TableHead>
                <TableHead>Field</TableHead>
                <TableHead>Match Type</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Category</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rules || []).map((r: any) => {
                const cat = (cats || []).find((c: any) => c.id === r.category_id);
                return (
                  <TableRow key={r.id} data-testid={`rule-row-${r.id}`}>
                    <TableCell className="text-sm">{r.priority}</TableCell>
                    <TableCell className="text-sm font-mono">{r.match_field}</TableCell>
                    <TableCell className="text-sm">{r.match_type}</TableCell>
                    <TableCell className="text-sm font-mono">{r.match_value}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{cat?.name || `ID:${r.category_id}`}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600 hover:text-red-800" onClick={() => deleteRuleMutation.mutate(r.id)} disabled={deleteRuleMutation.isPending} data-testid={`delete-rule-${r.id}`}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!rules || rules.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">No rules defined</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Category tree */}
      <Card data-testid="category-tree">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Category Taxonomy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(cats || []).filter((c: any) => c.level === "L1").map((l1: any) => (
              <div key={l1.id} className="space-y-1">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <FolderTree className="h-4 w-4 text-am-navy" />
                  {l1.name}
                </div>
                {(cats || []).filter((c: any) => c.parent_id === l1.id).map((l2: any) => (
                  <div key={l2.id} className="ml-6 space-y-0.5">
                    <p className="text-sm font-medium text-muted-foreground">{l2.name}</p>
                    <div className="ml-4 flex flex-wrap gap-1">
                      {(cats || []).filter((c: any) => c.parent_id === l2.id).map((l3: any) => (
                        <Badge key={l3.id} variant="secondary" className="text-xs">{l3.name}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
