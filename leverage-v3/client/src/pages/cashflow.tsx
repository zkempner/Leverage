import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, AreaChart, Area, ComposedChart, Cell
} from "recharts";

function formatCurrency(v: number) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export default function CashFlowPage({ engagementId }: { engagementId: number }) {
  const { data: tableData, isLoading: tLoading } = useQuery<any[]>({
    queryKey: ["/api/engagements", engagementId, "cashflow", "table"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/cashflow/table`);
      return res.json();
    },
  });

  const { data: bridgeData } = useQuery<any[]>({
    queryKey: ["/api/engagements", engagementId, "cashflow", "bridge"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/cashflow/bridge`);
      return res.json();
    },
  });

  const { data: cumulativeData } = useQuery<any[]>({
    queryKey: ["/api/engagements", engagementId, "cashflow", "cumulative"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/cashflow/cumulative`);
      return res.json();
    },
  });

  if (tLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-40" />)}</div>;

  // Group phasing table by initiative
  const byInitiative: Record<string, any[]> = {};
  for (const row of tableData || []) {
    const name = row.initiative_name || `Initiative ${row.initiative_id}`;
    if (!byInitiative[name]) byInitiative[name] = [];
    byInitiative[name].push(row);
  }

  return (
    <div className="space-y-6" data-testid="cashflow-page">
      {/* Bridge chart */}
      <Card data-testid="bridge-chart">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Cash Flow Bridge (Planned vs Actual)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={bridgeData || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Legend />
              <Bar dataKey="planned" fill="#002B49" name="Planned" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" fill="#29702A" name="Actual" radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Cumulative S-curve */}
      <Card data-testid="s-curve">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Cumulative Savings (S-Curve)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={cumulativeData || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Legend />
              <Area type="monotone" dataKey="cumulative_planned" stroke="#002B49" fill="#002B49" fillOpacity={0.08} strokeWidth={2} name="Planned" />
              <Area type="monotone" dataKey="cumulative_actual" stroke="#29702A" fill="#29702A" fillOpacity={0.1} strokeWidth={2} name="Actual" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Phasing Table */}
      <Card data-testid="phasing-table">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Monthly Phasing Detail</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            {Object.entries(byInitiative).map(([name, rows]) => (
              <div key={name} className="mb-6">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  {name}
                  <Badge variant="secondary" className="text-xs">{rows.length} months</Badge>
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm">{r.date}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatCurrency(r.amount || 0)}</TableCell>
                        <TableCell>
                          <Badge variant={r.is_actual ? "default" : "secondary"} className="text-xs">
                            {r.is_actual ? "Actual" : "Planned"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}

            {Object.keys(byInitiative).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No phasing data available</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
