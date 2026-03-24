"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Calendar } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function ReportsPage() {
  const { clientId } = useParams();
  const [reportType, setReportType] = useState("monthly");

  const { data: client } = useQuery({
    queryKey: [`/api/clients/${clientId}`],
    queryFn: () => fetch(`/api/clients/${clientId}`).then((r) => r.json()),
  });

  const { data: perfData } = useQuery({
    queryKey: [`/api/clients/${clientId}/performance`],
    queryFn: () => fetch(`/api/clients/${clientId}/performance`).then((r) => r.json()),
  });

  const { data: strategies = [] } = useQuery<any[]>({
    queryKey: [`/api/clients/${clientId}/strategy`],
    queryFn: () => fetch(`/api/clients/${clientId}/strategy`).then((r) => r.json()),
  });

  const summary = perfData?.summary;

  return (
    <div>
      <div className="border-b bg-card/50 px-8 py-6">
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">Generate client-facing performance reports</p>
      </div>

      <div className="p-8 space-y-8">
        {/* Report Builder */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Generate Report</CardTitle>
            <CardDescription>Create a polished performance report for stakeholder presentations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Report Type</Label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly Report</SelectItem>
                    <SelectItem value="monthly">Monthly Report</SelectItem>
                    <SelectItem value="quarterly">Quarterly Report</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>From</Label>
                <Input type="date" />
              </div>
              <div className="space-y-2">
                <Label>To</Label>
                <Input type="date" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button>
                <FileText className="mr-2 h-4 w-4" /> Generate Report
              </Button>
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" /> Export as PDF
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quick Summary */}
        {summary && summary.totalSpend > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Performance Summary</CardTitle>
              <CardDescription>Latest data for {client?.name}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-xs text-muted-foreground">Total Spend</p>
                  <p className="text-xl font-bold">${summary.totalSpend.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-xs text-muted-foreground">Conversions</p>
                  <p className="text-xl font-bold">{summary.totalConversions.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-xs text-muted-foreground">Avg ROAS</p>
                  <p className="text-xl font-bold">{summary.avgRoas.toFixed(2)}x</p>
                </div>
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-xs text-muted-foreground">Avg CPA</p>
                  <p className="text-xl font-bold">${summary.avgCpa.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Strategy Summary */}
        {strategies.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Active Strategy</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {strategies.slice(0, 3).map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="font-medium text-sm">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(s.createdAt)}</p>
                    </div>
                    <Badge variant="secondary">{s.status}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
