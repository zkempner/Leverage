import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, Check, Loader2 } from "lucide-react";
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
      // Auto-detect column mappings using pattern matching
      setMapping(autoDetectMapping(data.columns));
      toast({ title: "File uploaded", description: `${data.row_count} rows parsed` });
    },
    onError: (err: any) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
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

      {/* Column Mapper */}
      {staged && (
        <Card data-testid="column-mapper">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Map Columns — {staged.file_name} ({staged.row_count} rows)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {staged.columns.map((col: string) => (
                <div key={col} className="flex items-center gap-2">
                  <span className="text-sm font-mono w-40 truncate">{col}</span>
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
