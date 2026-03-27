import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, ShieldAlert, FileWarning, Copy, DollarSign } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

function fmt(v: number) {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

const FLAG_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  maverick: { label: "Maverick Spend", color: "#DC2626", icon: ShieldAlert },
  off_contract: { label: "Off-Contract", color: "#CF7F00", icon: FileWarning },
  tail: { label: "Tail Spend", color: "#0085CA", icon: DollarSign },
  duplicate: { label: "Duplicates", color: "#8B5CF6", icon: Copy },
  critical: { label: "Critical Supplier", color: "#002B49", icon: AlertTriangle },
};

function SummaryCard({
  flagType,
  totalAmount,
  count,
}: {
  flagType: string;
  totalAmount: number;
  count: number;
}) {
  const config = FLAG_CONFIG[flagType] || { label: flagType, color: "#666", icon: AlertTriangle };
  const Icon = config.icon;

  return (
    <Card data-testid={`flag-summary-${flagType}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{config.label}</p>
            <p className="text-xl font-bold mt-1" style={{ color: config.color }}>{fmt(totalAmount)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{count} record{count !== 1 ? "s" : ""}</p>
          </div>
          <div className="p-2 rounded-lg" style={{ backgroundColor: `${config.color}15` }}>
            <Icon className="h-5 w-5" style={{ color: config.color }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SpendFlagsPage({ engagementId }: { engagementId: number }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/engagements", engagementId, "analysis", "spend-flags"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/analysis/spend-flags`);
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-80" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const byFlag: Record<string, { total_amount: number; count: number }> = data?.by_flag || {};
  const flaggedRecords: any[] = data?.flagged_records || [];

  // Build chart data
  const chartData = Object.entries(byFlag).map(([type, info]) => ({
    name: FLAG_CONFIG[type]?.label || type,
    amount: info.total_amount,
    count: info.count,
    color: FLAG_CONFIG[type]?.color || "#666",
  })).sort((a, b) => b.amount - a.amount);

  // Summary cards for the 4 main flag types
  const summaryFlags = ["maverick", "off_contract", "tail", "duplicate"];

  return (
    <div className="space-y-6" data-testid="spend-flags-page">
      <div>
        <h2 className="text-lg font-bold">Spend Quality Flags</h2>
        <p className="text-sm text-muted-foreground">
          {flaggedRecords.length} flagged records across {Object.keys(byFlag).length} flag types
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryFlags.map(ft => (
          <SummaryCard
            key={ft}
            flagType={ft}
            totalAmount={byFlag[ft]?.total_amount || 0}
            count={byFlag[ft]?.count || 0}
          />
        ))}
      </div>

      {/* Bar chart */}
      {chartData.length > 0 && (
        <Card data-testid="flag-chart">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Spend by Flag Type</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tickFormatter={(v: number) => fmt(v)} tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number) => fmt(v)}
                  labelFormatter={(l) => String(l)}
                />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Flagged records table */}
      <Card data-testid="flagged-records-table">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Flagged Records ({flaggedRecords.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Flag Type</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flaggedRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-sm text-muted-foreground">
                      No flagged records found
                    </TableCell>
                  </TableRow>
                ) : (
                  flaggedRecords.slice(0, 200).map((r: any, i: number) => {
                    const config = FLAG_CONFIG[r.flag_type] || { label: r.flag_type, color: "#666" };
                    return (
                      <TableRow key={i} data-testid={`flagged-record-${i}`}>
                        <TableCell>
                          <Badge
                            className="text-[10px]"
                            style={{ backgroundColor: `${config.color}20`, color: config.color }}
                          >
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{r.supplier_name || r.supplier || "—"}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{fmt(r.amount || 0)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                          {r.reason || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {flaggedRecords.length > 200 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Showing 200 of {flaggedRecords.length} records
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
