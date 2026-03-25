import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, Users } from "lucide-react";

interface TeamMember {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  member_type: string;
  role?: string;
  title?: string;
  company?: string;
  department?: string;
  workstream?: string;
  availability?: string;
  status?: string;
}

const emptyForm = {
  name: "", email: "", phone: "", member_type: "am_team", role: "", title: "",
  company: "", department: "", workstream: "", availability: "full_time",
};

const memberTypeLabels: Record<string, string> = {
  am_team: "A&M Team",
  client_contact: "Client Contacts",
  pe_sponsor: "PE Sponsor",
};

const availabilityLabels: Record<string, string> = {
  full_time: "Full-Time",
  part_time: "Part-Time",
  as_needed: "As Needed",
};

function MemberDialog({
  open, onOpenChange, form, setForm, onSubmit, isPending, title,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  form: typeof emptyForm; setForm: (f: typeof emptyForm) => void;
  onSubmit: () => void; isPending: boolean; title: string;
}) {
  const set = (field: string, value: string) => setForm({ ...form, [field]: value });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Name *</label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input value={form.email} onChange={(e) => set("email", e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Phone</label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Member Type *</label>
              <Select value={form.member_type} onValueChange={(v) => set("member_type", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="am_team">A&M Team</SelectItem>
                  <SelectItem value="client_contact">Client Contact</SelectItem>
                  <SelectItem value="pe_sponsor">PE Sponsor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Role</label>
              <Input value={form.role} onChange={(e) => set("role", e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input value={form.title} onChange={(e) => set("title", e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Company</label>
              <Input value={form.company} onChange={(e) => set("company", e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Department</label>
              <Input value={form.department} onChange={(e) => set("department", e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Workstream</label>
              <Input value={form.workstream} onChange={(e) => set("workstream", e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Availability</label>
              <Select value={form.availability} onValueChange={(v) => set("availability", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full-Time</SelectItem>
                  <SelectItem value="part_time">Part-Time</SelectItem>
                  <SelectItem value="as_needed">As Needed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={onSubmit} disabled={!form.name.trim() || !form.member_type || isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {title.startsWith("Edit") ? "Save Changes" : "Add Member"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TeamTable({
  members, onEdit, onDelete, isDeleting,
}: {
  members: TeamMember[]; onEdit: (m: TeamMember) => void; onDelete: (id: number) => void; isDeleting: boolean;
}) {
  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">No members in this group</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Role / Title</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Workstream</TableHead>
          <TableHead>Availability</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-24">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((m) => (
          <TableRow key={m.id}>
            <TableCell className="font-medium">{m.name}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {[m.role, m.title].filter(Boolean).join(" / ") || "-"}
            </TableCell>
            <TableCell className="text-sm">{m.email || "-"}</TableCell>
            <TableCell>
              {m.workstream ? (
                <Badge variant="outline" className="text-xs">{m.workstream}</Badge>
              ) : "-"}
            </TableCell>
            <TableCell className="text-sm">
              {availabilityLabels[m.availability || ""] || m.availability || "-"}
            </TableCell>
            <TableCell>
              <Badge className={`text-xs ${
                m.status === "active" ? "bg-emerald-100 text-emerald-800" :
                m.status === "inactive" ? "bg-gray-100 text-gray-600" :
                "bg-blue-100 text-blue-800"
              }`}>
                {m.status || "active"}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEdit(m)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  size="sm" variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                  disabled={isDeleting}
                  onClick={() => { if (confirm(`Remove "${m.name}" from the team?`)) onDelete(m.id); }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function CCTeamPage({ engagementId }: { engagementId?: number }) {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const qk = ["/api/cc/engagements", engagementId, "team"];

  const { data: members = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: qk,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/cc/engagements/${engagementId}/team`);
      return res.json();
    },
    enabled: !!engagementId,
  });

  const addMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", `/api/cc/engagements/${engagementId}/team`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Member added" });
      queryClient.invalidateQueries({ queryKey: qk });
      setAddOpen(false);
      setForm({ ...emptyForm });
    },
    onError: (err: any) => toast({ title: "Failed to add member", description: err.message, variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      const res = await apiRequest("PATCH", `/api/cc/engagements/${engagementId}/team/${id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Member updated" });
      queryClient.invalidateQueries({ queryKey: qk });
      setEditOpen(false);
      setEditId(null);
    },
    onError: (err: any) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/cc/engagements/${engagementId}/team/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Member removed" });
      queryClient.invalidateQueries({ queryKey: qk });
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const openAdd = () => {
    setForm({ ...emptyForm });
    setAddOpen(true);
  };

  const openEdit = (m: TeamMember) => {
    setForm({
      name: m.name || "", email: m.email || "", phone: m.phone || "",
      member_type: m.member_type || "am_team", role: m.role || "", title: m.title || "",
      company: m.company || "", department: m.department || "", workstream: m.workstream || "",
      availability: m.availability || "full_time",
    });
    setEditId(m.id);
    setEditOpen(true);
  };

  const handleAdd = () => {
    const payload: any = { ...form };
    Object.keys(payload).forEach((k) => { if (!payload[k]) delete payload[k]; });
    addMutation.mutate(payload);
  };

  const handleEdit = () => {
    if (editId == null) return;
    const payload: any = { ...form };
    Object.keys(payload).forEach((k) => { if (!payload[k]) delete payload[k]; });
    editMutation.mutate({ id: editId, payload });
  };

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="cc-team-page">
        <Skeleton className="h-10 w-64" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
      </div>
    );
  }

  const groups: Record<string, TeamMember[]> = {
    am_team: [], client_contact: [], pe_sponsor: [],
  };
  (members || []).forEach((m) => {
    const key = m.member_type || "am_team";
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  });

  return (
    <div className="space-y-6" data-testid="cc-team-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-am-navy">Team</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage engagement team members and contacts</p>
        </div>
        <Button onClick={openAdd} data-testid="add-team-member-btn">
          <Plus className="h-4 w-4 mr-2" /> Add Team Member
        </Button>
      </div>

      {members.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No team members yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Add team members to get started</p>
            <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" /> Add Team Member</Button>
          </CardContent>
        </Card>
      ) : (
        Object.entries(groups).map(([type, list]) => (
          <Card key={type}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                {memberTypeLabels[type] || type}
                <Badge variant="secondary" className="text-xs">{list.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TeamTable
                members={list}
                onEdit={openEdit}
                onDelete={(id) => deleteMutation.mutate(id)}
                isDeleting={deleteMutation.isPending}
              />
            </CardContent>
          </Card>
        ))
      )}

      <MemberDialog
        open={addOpen} onOpenChange={setAddOpen}
        form={form} setForm={setForm}
        onSubmit={handleAdd} isPending={addMutation.isPending}
        title="Add Team Member"
      />
      <MemberDialog
        open={editOpen} onOpenChange={setEditOpen}
        form={form} setForm={setForm}
        onSubmit={handleEdit} isPending={editMutation.isPending}
        title="Edit Team Member"
      />
    </div>
  );
}
