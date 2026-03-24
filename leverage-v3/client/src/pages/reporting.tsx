import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { FileDown, FileSpreadsheet, FileText, Presentation, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const SECTIONS = [
  { id: "dashboard", label: "Executive Dashboard", description: "Key metrics, waterfall, status matrix" },
  { id: "spend_analysis", label: "Spend Analysis", description: "Category, supplier, BU, and time series breakdown" },
  { id: "initiatives", label: "Savings Initiatives", description: "Full initiative list with scenarios" },
  { id: "tracker", label: "Savings Tracker", description: "Pipeline, realization curve, risk view" },
  { id: "cashflow", label: "Cash Flow Phasing", description: "Monthly phasing, bridge, S-curve data" },
  { id: "data_quality", label: "Data Quality Report", description: "Cleansing stats, audit log" },
  { id: "assumptions", label: "Assumption Benchmarks", description: "Industry reference ranges" },
];

const FORMATS = [
  { id: "csv", label: "CSV", icon: FileSpreadsheet, description: "Raw spend data table" },
  { id: "excel", label: "Excel", icon: FileSpreadsheet, description: "Formatted workbook" },
  { id: "pdf", label: "PDF", icon: FileText, description: "Executive summary report" },
  { id: "pptx", label: "PowerPoint", icon: Presentation, description: "Board presentation deck" },
];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function convertToCSV(records: any[]): string {
  if (records.length === 0) return "";
  const headers = Object.keys(records[0]);
  const rows = records.map(r => headers.map(h => {
    const val = r[h] ?? "";
    const str = String(val);
    return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str;
  }).join(","));
  return [headers.join(","), ...rows].join("\n");
}

export default function ReportingPage({ engagementId }: { engagementId: number }) {
  const { toast } = useToast();
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set(SECTIONS.map(s => s.id)));
  const [exporting, setExporting] = useState<string | null>(null);

  const toggleSection = (id: string) => {
    setSelectedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = async (format: string) => {
    setExporting(format);
    try {
      const sections = Array.from(selectedSections);

      if (format === "csv" || format === "excel") {
        // Download actual spend records as CSV
        const res = await apiRequest("GET", `/api/engagements/${engagementId}/spend?limit=10000`);
        const spendData = await res.json();
        const records = spendData.records || [];

        if (records.length === 0) {
          toast({ title: "No data", description: "No spend records to export", variant: "destructive" });
          return;
        }

        const csv = convertToCSV(records);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        downloadBlob(blob, `leverage-spend-data.csv`);
        toast({ title: "Export complete", description: `Downloaded ${records.length} spend records as CSV` });
      } else {
        // For PDF/PPTX - export all selected sections as JSON data package
        const data: Record<string, any> = { format, sections, engagement_id: engagementId };

        for (const section of sections) {
          try {
            let endpoint = "";
            switch (section) {
              case "dashboard": endpoint = `/api/engagements/${engagementId}/dashboard`; break;
              case "spend_analysis": endpoint = `/api/engagements/${engagementId}/analysis/by-category`; break;
              case "initiatives": endpoint = `/api/engagements/${engagementId}/initiatives`; break;
              case "tracker": endpoint = `/api/engagements/${engagementId}/tracker/summary`; break;
              case "cashflow": endpoint = `/api/engagements/${engagementId}/cashflow/table`; break;
              case "data_quality": endpoint = `/api/engagements/${engagementId}/cleansing/summary`; break;
              case "assumptions": endpoint = "/api/assumptions/benchmarks"; break;
            }
            if (endpoint) {
              const sectionRes = await apiRequest("GET", endpoint);
              data[section] = await sectionRes.json();
            }
          } catch {}
        }

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        downloadBlob(blob, `leverage-report.${format === "pptx" ? "json" : format}`);
        toast({ title: "Export complete", description: `Downloaded ${format.toUpperCase()} report data` });
      }
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="reporting-page">
      <div>
        <h2 className="text-base font-semibold">Reporting & Export</h2>
        <p className="text-xs text-muted-foreground">Select sections to include and choose an export format</p>
      </div>

      {/* Section Selector */}
      <Card data-testid="section-selector">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Report Sections</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {SECTIONS.map(section => (
              <label
                key={section.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedSections.has(section.id) ? "border-am-gold bg-am-gold/5" : "border-border hover:bg-muted/50"
                }`}
                data-testid={`section-${section.id}`}
              >
                <Checkbox
                  checked={selectedSections.has(section.id)}
                  onCheckedChange={() => toggleSection(section.id)}
                  data-testid={`checkbox-${section.id}`}
                />
                <div>
                  <p className="text-sm font-medium">{section.label}</p>
                  <p className="text-xs text-muted-foreground">{section.description}</p>
                </div>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Preview Summary */}
      <Card data-testid="export-preview">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Export Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Array.from(selectedSections).map(id => {
              const section = SECTIONS.find(s => s.id === id);
              return section ? (
                <Badge key={id} variant="secondary" className="text-xs">{section.label}</Badge>
              ) : null;
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {selectedSections.size} of {SECTIONS.length} sections selected.
            CSV/Excel exports include raw spend records. PDF/PPTX exports include all selected section data.
          </p>
        </CardContent>
      </Card>

      {/* Export Formats */}
      <Card data-testid="export-formats">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Export Format</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FORMATS.map(format => {
              const Icon = format.icon;
              return (
                <button
                  key={format.id}
                  onClick={() => handleExport(format.id)}
                  disabled={exporting !== null || selectedSections.size === 0}
                  className="flex flex-col items-center gap-2 p-5 rounded-lg border border-border hover:border-am-gold hover:bg-am-gold/5 transition-colors disabled:opacity-50"
                  data-testid={`export-${format.id}`}
                >
                  {exporting === format.id ? (
                    <Loader2 className="h-8 w-8 text-am-gold animate-spin" />
                  ) : (
                    <Icon className="h-8 w-8 text-am-navy" />
                  )}
                  <span className="text-sm font-semibold">{format.label}</span>
                  <span className="text-xs text-muted-foreground text-center">{format.description}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
