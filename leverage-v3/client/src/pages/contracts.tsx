import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, AlertTriangle, FileText } from "lucide-react";

function fmt(v: number) {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function isExpiringSoon(endDate: string | null): boolean {
  if (!endDate) return false;
  const diff = new Date(endDate).getTime() - Date.now();
  return diff > 0 && diff < 90 * 24 * 60 * 60 * 1000;
}

interface ContractForm {
  supplier_name: string;
  category_name: string;
  annual_value: string;
  end_date: string;
  payment_terms_days: string;
  benchmark_gap_days: string;
  escalation_clause: string;
  compliance_rate: string;
  sole_source: string;
}

const EMPTY_FORM: ContractForm = {
  supplier_name: "",
  category_name: "",
  annual_value: "",
  end_date: "",
  payment_terms_days: "",
  benchmark_gap_days: "",
  escalation_clause: "none",
  compliance_rate: "100",
  sole_source: "0",
};

function ContractDialog({
  open,
  onOpenChange,
  form,
  setForm,
  onSubmit,
  isEdit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: ContractForm;
  setForm: (f: ContractForm) => void;
  onSubmit: () => void;
  isEdit: boolean;
  isPending: boolean;
}) {
  const update = (field: keyof ContractForm, value: string) =>
    setForm({ ...form, [field]: value });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="contract-dialog">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Contract" : "Add Contract"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Supplier Name</Label>
              <Input
                value={form.supplier_name}
                onChange={e => update("supplier_name", e.target.value)}
                placeholder="Acme Corp"
                data-testid="input-supplier"
              />
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Input
                value={form.category_name}
                onChange={e => update("category_name", e.target.value)}
                placeholder="IT Services"
                data-testid="input-category"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Annual Value ($)</Label>
              <Input
                type="number"
                value={form.annual_value}
                onChange={e => update("annual_value", e.target.value)}
                placeholder="500000"
                data-testid="input-annual-value"
              />
            </div>
            <div>
              <Label className="text-xs">End Date</Label>
              <Input
                type="date"
                value={form.end_date}
                onChange={e => update("end_date", e.target.value)}
                data-testid="input-end-date"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Payment Terms (days)</Label>
              <Input
                type="number"
                value={form.payment_terms_days}
                onChange={e => update("payment_terms_days", e.target.value)}
                placeholder="30"
                data-testid="input-payment-terms"
              />
            </div>
            <div>
              <Label className="text-xs">Benchmark Gap (days)</Label>
              <Input
                type="number"
                value={form.benchmark_gap_days}
                onChange={e => update("benchmark_gap_days", e.target.value)}
                placeholder="15"
                data-testid="input-gap-days"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Escalation</Label>
              <Select value={form.escalation_clause} onValueChange={v => update("escalation_clause", v)}>
                <SelectTrigger className="h-9 text-xs" data-testid="select-escalation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="cpi">CPI</SelectItem>
                  <SelectItem value="fixed">Fixed %</SelectItem>
                  <SelectItem value="market">Market</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Compliance (%)</Label>
              <Input
                type="number"
                value={form.compliance_rate}
                onChange={e => update("compliance_rate", e.target.value)}
                placeholder="95"
                data-testid="input-compliance"
              />
            </div>
            <div>
              <Label className="text-xs">Sole Source</Label>
              <Select value={form.sole_source} onValueChange={v => update("sole_source", v)}>
                <SelectTrigger className="h-9 text-xs" data-testid="select-sole-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">No</SelectItem>
                  <SelectItem value="1">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm">Cancel</Button>
          </DialogClose>
          <Button size="sm" onClick={onSubmit} disabled={isPending} data-testid="save-contract-btn">
            {isPending ? "Saving..." : isEdit ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ContractsPage({ engagementId }: { engagementId: number }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ContractForm>({ ...EMPTY_FORM });
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const { data: contracts, isLoading } = useQuery<any[]>({
    queryKey: ["/api/engagements", engagementId, "contracts"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/contracts`);
      return res.json();
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId, "contracts"] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const body = {
        supplier_name: form.supplier_name,
        category_name: form.category_name,
        annual_value: Number(form.annual_value) || 0,
        end_date: form.end_date || null,
        payment_terms_days: Number(form.payment_terms_days) || 30,
        benchmark_gap_days: Number(form.benchmark_gap_days) || 0,
        escalation_clause: form.escalation_clause,
        compliance_rate: Number(form.compliance_rate) || 100,
        sole_source: Number(form.sole_source),
      };
      await apiRequest("POST", `/api/engagements/${engagementId}/contracts`, body);
    },
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      setForm({ ...EMPTY_FORM });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const body = {
        supplier_name: form.supplier_name,
        category_name: form.category_name,
        annual_value: Number(form.annual_value) || 0,
        end_date: form.end_date || null,
        payment_terms_days: Number(form.payment_terms_days) || 30,
        benchmark_gap_days: Number(form.benchmark_gap_days) || 0,
        escalation_clause: form.escalation_clause,
        compliance_rate: Number(form.compliance_rate) || 100,
        sole_source: Number(form.sole_source),
      };
      await apiRequest("PUT", `/api/engagements/${engagementId}/contracts/${editId}`, body);
    },
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      setEditId(null);
      setForm({ ...EMPTY_FORM });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (cid: number) => {
      await apiRequest("DELETE", `/api/engagements/${engagementId}/contracts/${cid}`);
    },
    onSuccess: () => {
      invalidate();
      setDeleteConfirm(null);
    },
  });

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (c: any) => {
    setEditId(c.id);
    setForm({
      supplier_name: c.supplier_name || "",
      category_name: c.category_name || "",
      annual_value: String(c.annual_value || ""),
      end_date: c.end_date || "",
      payment_terms_days: String(c.payment_terms_days || ""),
      benchmark_gap_days: String(c.benchmark_gap_days || ""),
      escalation_clause: c.escalation_clause || "none",
      compliance_rate: String(c.compliance_rate ?? 100),
      sole_source: String(c.sole_source ?? 0),
    });
    setDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const items = contracts || [];

  return (
    <div className="space-y-6" data-testid="contracts-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Contracts</h2>
          <p className="text-sm text-muted-foreground">{items.length} contracts</p>
        </div>
        <Button size="sm" onClick={openCreate} data-testid="add-contract-btn">
          <Plus className="h-4 w-4 mr-1" /> Add Contract
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-sm font-semibold mb-1">No Contracts Yet</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Add contract metadata to improve scoring accuracy and enable contract-based analysis.
            </p>
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Add First Contract
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Annual Value</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead className="text-center">Payment Terms</TableHead>
                    <TableHead className="text-center">Gap Days</TableHead>
                    <TableHead>Escalation</TableHead>
                    <TableHead className="text-center">Compliance</TableHead>
                    <TableHead className="text-center">Sole Source</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((c: any) => {
                    const expiring = isExpiringSoon(c.end_date);
                    return (
                      <TableRow key={c.id} data-testid={`contract-row-${c.id}`}>
                        <TableCell className="font-medium text-sm">{c.supplier_name}</TableCell>
                        <TableCell className="text-sm">{c.category_name}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(c.annual_value || 0)}</TableCell>
                        <TableCell className="text-sm">
                          {c.end_date || "—"}
                          {expiring && (
                            <Badge className="ml-2 bg-red-100 text-red-800 text-[10px]">
                              <AlertTriangle className="h-3 w-3 mr-0.5" /> Expiring Soon
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-sm">{c.payment_terms_days ?? "—"}d</TableCell>
                        <TableCell className="text-center text-sm">{c.benchmark_gap_days ?? "—"}d</TableCell>
                        <TableCell className="text-sm capitalize">{c.escalation_clause || "—"}</TableCell>
                        <TableCell className="text-center text-sm">{c.compliance_rate ?? "—"}%</TableCell>
                        <TableCell className="text-center">
                          {c.sole_source ? (
                            <Badge className="bg-amber-100 text-amber-800 text-[10px]">Yes</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">No</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openEdit(c)}
                              data-testid={`edit-contract-${c.id}`}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-600 hover:text-red-700"
                              onClick={() => setDeleteConfirm(c.id)}
                              data-testid={`delete-contract-${c.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <ContractDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        setForm={setForm}
        onSubmit={() => (editId ? updateMutation.mutate() : createMutation.mutate())}
        isEdit={!!editId}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm" data-testid="delete-confirm-dialog">
          <DialogHeader>
            <DialogTitle>Delete Contract</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this contract? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
              disabled={deleteMutation.isPending}
              data-testid="confirm-delete-btn"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
