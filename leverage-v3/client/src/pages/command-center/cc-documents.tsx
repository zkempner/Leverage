import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Trash2, ExternalLink, FolderOpen, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DocEntry {
  id: number;
  name: string;
  description?: string;
  category: string;
  file_link?: string;
  file_type?: string;
  tags?: string;
  created_at: string;
}

const CATEGORIES = ["Deliverable", "Reference", "Template", "Data Room"];

const categoryColors: Record<string, string> = {
  Deliverable: "bg-emerald-100 text-emerald-800",
  deliverable: "bg-emerald-100 text-emerald-800",
  Reference: "bg-blue-100 text-blue-800",
  reference: "bg-blue-100 text-blue-800",
  Template: "bg-purple-100 text-purple-800",
  template: "bg-purple-100 text-purple-800",
  "Data Room": "bg-amber-100 text-amber-800",
  data_room: "bg-amber-100 text-amber-800",
};

function formatDate(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function parseTags(tags?: string | null): string[] {
  if (!tags) return [];
  try {
    const parsed = JSON.parse(tags);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return tags.split(",").map(t => t.trim()).filter(Boolean);
}

function displayCategory(cat: string) {
  if (cat === "data_room") return "Data Room";
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

const emptyForm = () => ({
  name: "", description: "", category: "Reference", file_link: "", file_type: "", tags: "",
});

export default function CCDocumentsPage({ engagementId }: { engagementId?: number }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [categoryFilter, setCategoryFilter] = useState("All");

  const base = `/api/cc/engagements/${engagementId}`;
  const qk = [base, "documents"];

  const { data: documents, isLoading } = useQuery<DocEntry[]>({
    queryKey: qk,
    queryFn: async () => { const r = await apiRequest("GET", `${base}/documents`); return r.json(); },
    enabled: !!engagementId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingId) {
        const r = await apiRequest("PATCH", `${base}/documents/${editingId}`, data);
        return r.json();
      }
      const r = await apiRequest("POST", `${base}/documents`, data);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk });
      setDialogOpen(false);
      toast({ title: editingId ? "Document updated" : "Document added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `${base}/documents/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: qk }); toast({ title: "Document deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openAdd = () => { setEditingId(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (doc: DocEntry) => {
    setEditingId(doc.id);
    const tagStr = parseTags(doc.tags).join(", ");
    setForm({
      name: doc.name,
      description: doc.description || "",
      category: doc.category,
      file_link: doc.file_link || "",
      file_type: doc.file_type || "",
      tags: tagStr,
    });
    setDialogOpen(true);
  };
  const setField = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    const tagsValue = form.tags
      ? JSON.stringify(form.tags.split(",").map(t => t.trim()).filter(Boolean))
      : "[]";
    saveMutation.mutate({
      name: form.name,
      description: form.description || null,
      category: form.category,
      file_link: form.file_link || null,
      file_type: form.file_type || null,
      tags: tagsValue,
    });
  };

  if (!engagementId) return <div className="p-6 text-muted-foreground">No engagement selected</div>;
  if (isLoading) return <div className="space-y-4 p-6">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>;

  const all = documents || [];
  const matchesFilter = (d: DocEntry) => {
    if (categoryFilter === "All") return true;
    const cat = d.category.toLowerCase().replace(/\s+/g, "_");
    const filterKey = categoryFilter.toLowerCase().replace(/\s+/g, "_");
    return cat === filterKey;
  };
  const filtered = all.filter(matchesFilter);

  return (
    <div className="space-y-6" data-testid="cc-documents-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-am-navy">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">Document repository for engagement deliverables and references</p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" /> Add Document</Button>
      </div>

      <div className="flex gap-2">
        {["All", ...CATEGORIES].map(cat => (
          <Badge
            key={cat}
            className={`cursor-pointer text-sm px-3 py-1 ${
              categoryFilter === cat
                ? "bg-am-navy text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            onClick={() => setCategoryFilter(cat)}
          >
            {cat}
          </Badge>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FolderOpen className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-1">
              {all.length > 0 ? "No documents in this category" : "No documents yet"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">Add documents to organize your engagement files</p>
            {all.length === 0 && (
              <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" /> Add Document</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold">Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>File Type</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(doc => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{doc.description || "-"}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${categoryColors[doc.category] || "bg-gray-100 text-gray-800"}`}>
                        {displayCategory(doc.category)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{doc.file_type || "-"}</TableCell>
                    <TableCell>
                      {parseTags(doc.tags).length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {parseTags(doc.tags).map((tag, i) => (
                            <Badge key={i} variant="outline" className="text-[10px]">{tag}</Badge>
                          ))}
                        </div>
                      ) : "-"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(doc.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {doc.file_link && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => window.open(doc.file_link, "_blank")}>
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(doc)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => { if (confirm("Delete this document?")) deleteMutation.mutate(doc.id); }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit Document" : "Add Document"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setField("name", e.target.value)} placeholder="Document name" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setField("description", e.target.value)} placeholder="Brief description" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setField("category", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>File Type</Label>
                <Input value={form.file_type} onChange={e => setField("file_type", e.target.value)} placeholder="e.g., PDF, XLSX, DOCX" />
              </div>
            </div>
            <div>
              <Label>File Link (URL)</Label>
              <Input value={form.file_link} onChange={e => setField("file_link", e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <Label>Tags</Label>
              <Input value={form.tags} onChange={e => setField("tags", e.target.value)} placeholder="Comma-separated tags" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editingId ? "Update" : "Add Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
