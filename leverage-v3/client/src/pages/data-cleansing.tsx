import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle, AlertCircle, ArrowRight, Loader2, CheckCheck, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function formatCurrency(v: number) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export default function DataCleansingPage({ engagementId }: { engagementId: number }) {
  const { toast } = useToast();
  const [editingGroup, setEditingGroup] = useState<number | null>(null);
  const [canonicalName, setCanonicalName] = useState("");

  const { data: summary, isLoading: summaryLoading } = useQuery<any>({
    queryKey: ["/api/engagements", engagementId, "cleansing", "summary"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/cleansing/summary`);
      return res.json();
    },
  });

  const { data: groups } = useQuery<any[]>({
    queryKey: ["/api/engagements", engagementId, "cleansing", "supplier-groups"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/cleansing/supplier-groups`);
      return res.json();
    },
  });

  const { data: auditLog } = useQuery<any[]>({
    queryKey: ["/api/engagements", engagementId, "cleansing", "audit-log"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/cleansing/audit-log`);
      return res.json();
    },
  });

  const mappingMutation = useMutation({
    mutationFn: async (mappings: { original_name: string; canonical_name: string }[]) => {
      const res = await apiRequest("POST", `/api/engagements/${engagementId}/cleansing/supplier-mappings`, { mappings });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Mapping applied" });
      setEditingGroup(null);
      setCanonicalName("");
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId, "cleansing"] });
    },
  });

  const bulkAcceptMutation = useMutation({
    mutationFn: async () => {
      // Accept all unnormalized suppliers by mapping them to their own name
      const unnormalized = (groups || []).filter((g: any) => !g.normalized_supplier_name);
      const mappings = unnormalized.map((g: any) => ({
        original_name: g.supplier_name,
        canonical_name: g.supplier_name, // Accept as-is
      }));
      if (mappings.length > 0) {
        const res = await apiRequest("POST", `/api/engagements/${engagementId}/cleansing/supplier-mappings`, { mappings });
        return res.json();
      }
    },
    onSuccess: () => {
      toast({ title: "All suppliers normalized", description: "Accepted current names as canonical" });
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId, "cleansing"] });
    },
  });

  const autoNormalizeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/engagements/${engagementId}/cleansing/auto-normalize`, { renormalize_all: true });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Auto-Normalization Complete",
        description: `${data.normalized} of ${data.total} suppliers normalized using fuzzy matching`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId, "cleansing"] });
    },
    onError: (err: any) => {
      toast({ title: "Auto-Normalization Failed", description: err.message, variant: "destructive" });
    },
  });

  const handleAccept = (group: any) => {
    mappingMutation.mutate([{
      original_name: group.supplier_name,
      canonical_name: group.supplier_name,
    }]);
  };

  const handleAcceptWithName = (group: any) => {
    if (!canonicalName.trim()) return;
    mappingMutation.mutate([{
      original_name: group.supplier_name,
      canonical_name: canonicalName.trim(),
    }]);
  };

  if (summaryLoading) {
    return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-32" />)}</div>;
  }

  const unnormalizedCount = (groups || []).filter((g: any) => !g.normalized_supplier_name).length;

  return (
    <div className="space-y-6" data-testid="cleansing-page">
      {/* Summary Stats with Progress Bars */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="stat-total-records">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Total Records</p>
            <p className="text-2xl font-bold mt-1">{summary?.total_records || 0}</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-normalized">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Normalized</p>
            <p className="text-2xl font-bold mt-1 text-am-blue">{summary?.normalized_pct || 0}%</p>
            <Progress value={summary?.normalized_pct || 0} className="h-2 mt-2" data-testid="normalized-progress" />
            <p className="text-xs text-muted-foreground mt-1">{summary?.normalized || 0} records</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-categorized">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Categorized</p>
            <p className="text-2xl font-bold mt-1 text-am-green">{summary?.categorized_pct || 0}%</p>
            <Progress value={summary?.categorized_pct || 0} className="h-2 mt-2" data-testid="categorized-progress" />
            <p className="text-xs text-muted-foreground mt-1">{summary?.categorized || 0} records</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-duplicates">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Duplicates</p>
            <p className="text-2xl font-bold mt-1 text-amber-600">{summary?.duplicates || 0}</p>
            <p className="text-xs text-muted-foreground mt-1">flagged records</p>
          </CardContent>
        </Card>
      </div>

      {/* Supplier Groups with Accept/Reject */}
      <Card data-testid="supplier-groups">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Supplier Normalization</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => autoNormalizeMutation.mutate()} disabled={autoNormalizeMutation.isPending} data-testid="auto-normalize-btn">
              {autoNormalizeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
              Auto-Normalize Suppliers
            </Button>
            {unnormalizedCount > 0 && (
              <Button size="sm" variant="outline" onClick={() => bulkAcceptMutation.mutate()} disabled={bulkAcceptMutation.isPending} data-testid="bulk-accept-btn">
                {bulkAcceptMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCheck className="h-3 w-3 mr-1" />}
                Accept All ({unnormalizedCount})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier Name</TableHead>
                  <TableHead>Normalized Name</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                  <TableHead className="text-right">Total Spend</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(groups || []).slice(0, 30).map((g: any, i: number) => (
                  <TableRow key={i} data-testid={`supplier-group-${i}`}>
                    <TableCell className="text-sm font-medium">{g.supplier_name}</TableCell>
                    <TableCell className="text-sm">
                      {g.normalized_supplier_name ? (
                        <span className="flex items-center gap-1 text-am-green">
                          <ArrowRight className="h-3 w-3" />
                          {g.normalized_supplier_name}
                        </span>
                      ) : editingGroup === i ? (
                        <div className="flex items-center gap-1">
                          <Input
                            className="h-7 text-xs w-40"
                            value={canonicalName}
                            onChange={e => setCanonicalName(e.target.value)}
                            placeholder="Canonical name"
                            data-testid={`canonical-input-${i}`}
                          />
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleAcceptWithName(g)} disabled={mappingMutation.isPending} data-testid={`save-canonical-${i}`}>
                            <CheckCircle className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">{g.record_count}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatCurrency(g.total_spend || 0)}</TableCell>
                    <TableCell>
                      {g.normalized_supplier_name ? (
                        <Badge className="bg-green-100 text-green-800 text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" /> Normalized
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          <AlertCircle className="h-3 w-3 mr-1" /> Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {!g.normalized_supplier_name && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-green-700" onClick={() => handleAccept(g)} disabled={mappingMutation.isPending} data-testid={`accept-group-${i}`}>
                            Accept
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setEditingGroup(i); setCanonicalName(g.supplier_name); }} data-testid={`rename-group-${i}`}>
                            Rename
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log with scroll area */}
      <Card data-testid="audit-log">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Cleansing Audit Log</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Before</TableHead>
                  <TableHead>After</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(auditLog || []).map((log: any) => (
                  <TableRow key={log.id} data-testid={`audit-log-${log.id}`}>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{log.action}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{log.field}</TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">{log.old_value}</TableCell>
                    <TableCell className="text-sm font-mono">{log.new_value}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{log.reason}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.created_at ? new Date(log.created_at).toLocaleDateString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {(!auditLog || auditLog.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                      No audit entries yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
