import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, Check, Loader2, Sparkles, Wrench, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TARGET_FIELDS = [
  { value: "supplier_name", label: "Supplier Name" },
  { value: "vendor_id", label: "Vendor ID" },
  { value: "amount", label: "Amount (primary)" },
  { value: "invoice_amount", label: "Invoice Amount" },
  { value: "payment_amount", label: "Payment Amount" },
  { value: "credit_memo", label: "Credit Memo" },
  { value: "description", label: "Description" },
  { value: "gl_description", label: "GL Description" },
  { value: "gl_code", label: "GL Code / Account" },
  { value: "date", label: "Date (primary)" },
  { value: "payment_date", label: "Payment Date" },
  { value: "invoice_number", label: "Invoice #" },
  { value: "days_to_pay", label: "Days to Pay" },
  { value: "currency", label: "Currency" },
  { value: "cost_center", label: "Cost Center" },
  { value: "project_code", label: "Project Code" },
  { value: "l1_category", label: "L1 Category" },
  { value: "l2_category", label: "L2 Category" },
  { value: "l3_category", label: "L3 Category" },
  { value: "business_unit", label: "Business Unit" },
  { value: "location", label: "Office / Location" },
  { value: "buyer", label: "Buyer / Requestor" },
  { value: "po_type", label: "PO Type" },
  { value: "contract_flag", label: "Contract Y/N" },
  { value: "contract_id", label: "Contract ID" },
  { value: "payment_terms", label: "Payment Terms" },
  { value: "fiscal_year", label: "Fiscal Year" },
  { value: "fiscal_quarter", label: "Fiscal Quarter" },
  { value: "data_source", label: "Data Source" },
  { value: "spend_flag", label: "Spend Flag" },
  { value: "skip", label: "(Skip)" },
];

// Auto-detect mapping based on column name patterns
function autoDetectMapping(columns: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const patterns: [RegExp, string][] = [
    [/^vendor\s*name|^supplier/i, "supplier_name"],
    [/^vendor\s*id/i, "vendor_id"],
    [/^invoice\s*#|^invoice\s*number|^inv\s*#/i, "invoice_number"],
    [/^invoice\s*date/i, "date"],
    [/^gl\s*post\s*date/i, "date"],
    [/^payment\s*date/i, "payment_date"],
    [/^days\s*to\s*pay/i, "days_to_pay"],
    [/^invoice\s*amt|^invoice\s*amount/i, "invoice_amount"],
    [/^payment\s*amt|^payment\s*amount/i, "payment_amount"],
    [/^credit\s*memo/i, "credit_memo"],
    [/^currency/i, "currency"],
    [/^gl\s*account|^gl\s*code/i, "gl_code"],
    [/^gl\s*desc/i, "gl_description"],
    [/^cost\s*center/i, "cost_center"],
    [/^project\s*code/i, "project_code"],
    [/^l1\s*category/i, "l1_category"],
    [/^l2\s*category/i, "l2_category"],
    [/^l3\s*category/i, "l3_category"],
    [/^business\s*unit/i, "business_unit"],
    [/^office|^location/i, "location"],
    [/^buyer|^requestor/i, "buyer"],
    [/^po\s*type/i, "po_type"],
    [/^contract\s*y|^contract\s*flag/i, "contract_flag"],
    [/^contract\s*id/i, "contract_id"],
    [/^payment\s*term/i, "payment_terms"],
    [/^fiscal\s*year/i, "fiscal_year"],
    [/^fiscal\s*quarter/i, "fiscal_quarter"],
    [/^data\s*source/i, "data_source"],
    [/^spend\s*flag/i, "spend_flag"],
    [/^amount$|^total$|^spend$/i, "amount"],
    [/^description$|^desc$/i, "description"],
  ];

  const used = new Set<string>();
  for (const col of columns) {
    for (const [pattern, target] of patterns) {
      if (pattern.test(col) && !used.has(target)) {
        map[col] = target;
        used.add(target);
        break;
      }
    }
    if (!map[col]) map[col] = "skip";
  }

  // If no primary amount was mapped, try invoice_amount or payment_amount
  if (!used.has("amount")) {
    for (const col of columns) {
      if (map[col] === "invoice_amount") { map[col] = "amount"; break; }
      if (map[col] === "payment_amount") { map[col] = "amount"; break; }
    }
  }

  return map;
}

export default function DataImportPage({ engagementId }: { engagementId: number }) {
  const { toast } = useToast();
  const [staged, setStaged] = useState<any>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [fixesApplied, setFixesApplied] = useState(false);

  const { data: imports, isLoading } = useQuery<any[]>({
    queryKey: ["/api/engagements", engagementId, "imports"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/imports`);
      return res.json();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
      const res = await fetch(`${API_BASE}/api/engagements/${engagementId}/imports/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      setStaged(data);
      setAnalysis(null);
      setFixesApplied(false);
      // Auto-detect column mappings client-side (will be overridden by server analysis)
      setMapping(autoDetectMapping(data.columns));
      toast({ title: "File uploaded", description: `${data.row_count} rows parsed` });
      // Auto-trigger server-side analysis
      analyzeMutation.mutate(data.import_id);
    },
    onError: (err: any) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async (importId: number) => {
      const res = await apiRequest("POST", `/api/engagements/${engagementId}/imports/analyze`, {
        import_id: importId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setAnalysis(data);
      // Override client-side mapping with server-side ERP-aware mapping
      if (data.mapping?.mapping) {
        setMapping(data.mapping.mapping);
      }
      toast({
        title: `Format detected: ${data.format?.format?.toUpperCase() ?? "Generic"}`,
        description: `Quality score: ${data.quality?.overall_score ?? 0}/100`,
      });
    },
  });

  const applyFixesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/engagements/${engagementId}/imports/apply-fixes`, {
        import_id: staged.import_id,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setFixesApplied(true);
      toast({
        title: "Fixes applied",
        description: `${data.fixes_applied} fixes. Quality: ${data.overall_score_before} → ${data.overall_score_after}`,
      });
      // Re-run analysis to get updated view
      analyzeMutation.mutate(staged.import_id);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const columnMapping: Record<string, string> = {};
      for (const [source, target] of Object.entries(mapping)) {
        if (target !== "skip") columnMapping[target] = source;
      }
      const res = await apiRequest("POST", `/api/engagements/${engagementId}/imports/confirm`, {
        import_id: staged.import_id,
        column_mapping: columnMapping,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Import complete", description: `${data.records_inserted} records imported` });
      setStaged(null);
      setMapping({});
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId, "imports"] });
    },
  });

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadMutation.mutate(file);
  }, [uploadMutation]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  };

  return (
    <div className="space-y-6" data-testid="import-page">
      {/* Upload dropzone */}
      <Card data-testid="upload-dropzone">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Upload Spend Data</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragging ? "border-am-gold bg-am-gold/5" : "border-border hover:border-am-blue"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            data-testid="drop-area"
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium mb-1">Drop CSV or Excel file here</p>
            <p className="text-xs text-muted-foreground mb-3">Supports .csv and .xlsx formats</p>
            <label>
              <input type="file" accept=".csv,.xlsx" className="hidden" onChange={handleFileInput} data-testid="file-input" />
              <Button variant="outline" size="sm" asChild>
                <span>{uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Browse Files</span>
              </Button>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Smart Analysis Card */}
      {staged && analysis && (
        <Card data-testid="smart-analysis">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Smart Analysis
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {analysis.format?.format?.toUpperCase() ?? "GENERIC"}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  Confidence: {Math.round((analysis.format?.confidence ?? 0) * 100)}%
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Quality Score */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Data Quality Score</span>
                <span className="font-semibold">{analysis.quality?.overall_score ?? 0}/100</span>
              </div>
              <Progress value={analysis.quality?.overall_score ?? 0} className="h-2" />
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Complete Records", value: `${analysis.quality?.summary?.completeness_pct ?? 0}%` },
                { label: "Blank Suppliers", value: `${analysis.quality?.summary?.blank_supplier_pct ?? 0}%` },
                { label: "Duplicates", value: `${analysis.quality?.summary?.duplicate_pct ?? 0}%` },
                { label: "Date Format", value: analysis.quality?.summary?.date_format_detected ?? "Unknown" },
              ].map(({ label, value }) => (
                <div key={label} className="text-center p-2 bg-muted rounded">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm font-semibold">{value}</p>
                </div>
              ))}
            </div>

            {/* High Confidence Fixes */}
            {(analysis.quality?.high_confidence_fixes?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium flex items-center gap-1">
                  <Wrench className="h-3.5 w-3.5" />
                  Auto-Fixes Available ({analysis.quality.high_confidence_fixes.length})
                </p>
                <div className="space-y-1">
                  {analysis.quality.high_confidence_fixes.map((fix: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-green-50 p-2 rounded">
                      <span>{fix.description}</span>
                      <span className="text-muted-foreground">{fix.affected_count} records</span>
                    </div>
                  ))}
                </div>
                {!fixesApplied && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyFixesMutation.mutate()}
                    disabled={applyFixesMutation.isPending}
                  >
                    {applyFixesMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                    Apply All Fixes
                  </Button>
                )}
                {fixesApplied && (
                  <Badge variant="default" className="text-xs bg-green-600">Fixes Applied</Badge>
                )}
              </div>
            )}

            {/* Issues */}
            {(analysis.quality?.low_confidence_issues?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  Issues to Review ({analysis.quality.low_confidence_issues.length})
                </p>
                <div className="space-y-1">
                  {analysis.quality.low_confidence_issues.map((issue: any, i: number) => (
                    <div key={i} className={`flex items-center justify-between text-xs p-2 rounded ${
                      issue.severity === "high" ? "bg-red-50" : issue.severity === "medium" ? "bg-amber-50" : "bg-gray-50"
                    }`}>
                      <span>{issue.description}</span>
                      <Badge variant="outline" className="text-xs">{issue.severity}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Matched signals */}
            {analysis.format?.matched_signals?.length > 0 && (
              <details className="text-xs">
                <summary className="text-muted-foreground cursor-pointer">
                  Detected signals: {analysis.format.matched_signals.length} ERP columns matched
                </summary>
                <p className="mt-1 text-muted-foreground">
                  {analysis.format.matched_signals.join(", ")}
                </p>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {/* Column Mapper */}
      {staged && (
        <Card data-testid="column-mapper">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Map Columns — {staged.file_name} ({staged.row_count} rows)
              {analysis && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {analysis.mapping?.unmapped?.length ?? 0} unmapped columns
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {analyzeMutation.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted rounded">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing data format and quality...
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {staged.columns.map((col: string) => (
                <div key={col} className="flex items-center gap-2">
                  <span className="text-sm font-mono w-40 truncate" title={col}>{col}</span>
                  <span className="text-muted-foreground">→</span>
                  <Select
                    value={mapping[col] || "skip"}
                    onValueChange={(v) => setMapping(prev => ({ ...prev, [col]: v }))}
                  >
                    <SelectTrigger className="text-sm" data-testid={`map-${col}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TARGET_FIELDS.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {analysis?.mapping?.mapping_confidence?.[mapping[col]] != null && mapping[col] !== "skip" && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {Math.round(analysis.mapping.mapping_confidence[mapping[col]] * 100)}%
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Preview */}
            {staged.sample_rows && staged.sample_rows.length > 0 && (
              <div className="overflow-x-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {staged.columns.map((col: string) => (
                        <TableHead key={col} className="text-xs whitespace-nowrap">{col}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staged.sample_rows.slice(0, 3).map((row: any, i: number) => (
                      <TableRow key={i}>
                        {staged.columns.map((col: string) => (
                          <TableCell key={col} className="text-xs whitespace-nowrap">{row[col]}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <Button
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending}
              data-testid="confirm-import-btn"
            >
              {confirmMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Confirm Import
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Import History */}
      <Card data-testid="import-history">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Import History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Records</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(imports || []).map((imp: any) => (
                <TableRow key={imp.id} data-testid={`import-row-${imp.id}`}>
                  <TableCell className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{imp.file_name}</span>
                  </TableCell>
                  <TableCell className="text-sm">{imp.record_count}</TableCell>
                  <TableCell>
                    <Badge variant={imp.status === "completed" ? "default" : "secondary"} className="text-xs">
                      {imp.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {imp.created_at ? new Date(imp.created_at).toLocaleDateString() : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {(!imports || imports.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                    No imports yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
