import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, LayoutGrid, Calendar } from "lucide-react";

interface Phase {
  id: number;
  name: string;
  sort_order: number;
  start_date?: string;
  end_date?: string;
  status: string;
}

interface Task {
  id: number;
  task_name: string;
  phase_id?: number;
  workstream?: string;
  owner?: string;
  status: string;
  priority?: string;
  due_date?: string;
  deliverable?: string;
  notes?: string;
}

interface WorkPlanData {
  phases: Phase[];
  tasks: Task[];
}

const taskStatuses = ["not_started", "in_progress", "completed", "blocked", "deferred"];
const phaseStatuses = ["not_started", "in_progress", "completed"];
const taskPriorities = ["critical", "high", "medium", "low"];

const statusColors: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-800",
  completed: "bg-emerald-100 text-emerald-800",
  blocked: "bg-red-100 text-red-800",
  deferred: "bg-amber-100 text-amber-800",
};

const priorityDots: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-blue-500",
  low: "bg-gray-400",
};

const emptyPhaseForm = { name: "", sort_order: "0", start_date: "", end_date: "", status: "not_started" };
const emptyTaskForm = {
  task_name: "", phase_id: "", workstream: "", owner: "",
  status: "not_started", priority: "medium", due_date: "", deliverable: "", notes: "",
};

function formatDateShort(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function CCWorkPlanPage({ engagementId }: { engagementId?: number }) {
  const { toast } = useToast();

  const [phaseDialogOpen, setPhaseDialogOpen] = useState(false);
  const [phaseEditId, setPhaseEditId] = useState<number | null>(null);
  const [phaseForm, setPhaseForm] = useState({ ...emptyPhaseForm });

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskEditId, setTaskEditId] = useState<number | null>(null);
  const [taskForm, setTaskForm] = useState({ ...emptyTaskForm });

  const qk = ["/api/cc/engagements", engagementId, "work-plan"];

  const { data, isLoading } = useQuery<WorkPlanData>({
    queryKey: qk,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/cc/engagements/${engagementId}/work-plan`);
      return res.json();
    },
    enabled: !!engagementId,
  });

  const phases = (data?.phases || []).sort((a, b) => a.sort_order - b.sort_order);
  const tasks = data?.tasks || [];

  // Phase mutations
  const phaseMutation = useMutation({
    mutationFn: async ({ id, payload, method }: { id?: number; payload?: any; method: string }) => {
      if (method === "DELETE") {
        const res = await apiRequest("DELETE", `/api/cc/engagements/${engagementId}/work-plan/phases/${id}`);
        return res.json();
      }
      if (method === "PATCH") {
        const res = await apiRequest("PATCH", `/api/cc/engagements/${engagementId}/work-plan/phases/${id}`, payload);
        return res.json();
      }
      const res = await apiRequest("POST", `/api/cc/engagements/${engagementId}/work-plan/phases`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk });
      setPhaseDialogOpen(false);
      setPhaseEditId(null);
      toast({ title: "Phase saved" });
    },
    onError: (err: any) => toast({ title: "Phase error", description: err.message, variant: "destructive" }),
  });

  // Task mutations
  const taskMutation = useMutation({
    mutationFn: async ({ id, payload, method }: { id?: number; payload?: any; method: string }) => {
      if (method === "DELETE") {
        const res = await apiRequest("DELETE", `/api/cc/engagements/${engagementId}/work-plan/tasks/${id}`);
        return res.json();
      }
      if (method === "PATCH") {
        const res = await apiRequest("PATCH", `/api/cc/engagements/${engagementId}/work-plan/tasks/${id}`, payload);
        return res.json();
      }
      const res = await apiRequest("POST", `/api/cc/engagements/${engagementId}/work-plan/tasks`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk });
      setTaskDialogOpen(false);
      setTaskEditId(null);
      toast({ title: "Task saved" });
    },
    onError: (err: any) => toast({ title: "Task error", description: err.message, variant: "destructive" }),
  });

  // Phase dialog helpers
  const openAddPhase = () => {
    setPhaseForm({ ...emptyPhaseForm, sort_order: String(phases.length + 1) });
    setPhaseEditId(null);
    setPhaseDialogOpen(true);
  };
  const openEditPhase = (p: Phase) => {
    setPhaseForm({
      name: p.name, sort_order: String(p.sort_order),
      start_date: p.start_date ? p.start_date.split("T")[0] : "",
      end_date: p.end_date ? p.end_date.split("T")[0] : "",
      status: p.status || "not_started",
    });
    setPhaseEditId(p.id);
    setPhaseDialogOpen(true);
  };
  const submitPhase = () => {
    const payload: any = {
      name: phaseForm.name,
      sort_order: parseInt(phaseForm.sort_order) || 0,
      status: phaseForm.status,
    };
    if (phaseForm.start_date) payload.start_date = phaseForm.start_date;
    if (phaseForm.end_date) payload.end_date = phaseForm.end_date;
    if (phaseEditId != null) {
      phaseMutation.mutate({ id: phaseEditId, payload, method: "PATCH" });
    } else {
      phaseMutation.mutate({ payload, method: "POST" });
    }
  };

  // Task dialog helpers
  const openAddTask = (phaseId?: number) => {
    setTaskForm({ ...emptyTaskForm, phase_id: phaseId ? String(phaseId) : "" });
    setTaskEditId(null);
    setTaskDialogOpen(true);
  };
  const openEditTask = (t: Task) => {
    setTaskForm({
      task_name: t.task_name, phase_id: t.phase_id ? String(t.phase_id) : "",
      workstream: t.workstream || "", owner: t.owner || "",
      status: t.status || "not_started", priority: t.priority || "medium",
      due_date: t.due_date ? t.due_date.split("T")[0] : "",
      deliverable: t.deliverable || "", notes: t.notes || "",
    });
    setTaskEditId(t.id);
    setTaskDialogOpen(true);
  };
  const submitTask = () => {
    const payload: any = {
      task_name: taskForm.task_name,
      status: taskForm.status,
      priority: taskForm.priority,
    };
    if (taskForm.phase_id) payload.phase_id = parseInt(taskForm.phase_id);
    if (taskForm.workstream) payload.workstream = taskForm.workstream;
    if (taskForm.owner) payload.owner = taskForm.owner;
    if (taskForm.due_date) payload.due_date = taskForm.due_date;
    if (taskForm.deliverable) payload.deliverable = taskForm.deliverable;
    if (taskForm.notes) payload.notes = taskForm.notes;
    if (taskEditId != null) {
      taskMutation.mutate({ id: taskEditId, payload, method: "PATCH" });
    } else {
      taskMutation.mutate({ payload, method: "POST" });
    }
  };

  // Group tasks by workstream within each phase
  const workstreams = Array.from(new Set(tasks.map((t) => t.workstream || "Unassigned"))).sort();
  const getTasksForPhaseAndWorkstream = (phaseId: number, ws: string) =>
    tasks.filter((t) => t.phase_id === phaseId && (t.workstream || "Unassigned") === ws);

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="cc-work-plan-page">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="cc-work-plan-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-am-navy">Work Plan</h1>
          <p className="text-sm text-muted-foreground mt-1">Phase-based work plan matrix</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={openAddPhase} data-testid="add-phase-btn">
            <Plus className="h-4 w-4 mr-2" /> Add Phase
          </Button>
          <Button onClick={() => openAddTask()} data-testid="add-task-btn">
            <Plus className="h-4 w-4 mr-2" /> Add Task
          </Button>
        </div>
      </div>

      {/* Matrix or Empty State */}
      {phases.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <LayoutGrid className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No phases yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Add your first phase to start building the work plan</p>
            <Button onClick={openAddPhase}><Plus className="h-4 w-4 mr-2" /> Add your first phase</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[800px]">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 bg-muted/30 font-semibold text-sm text-am-navy w-44 sticky left-0 bg-white z-10">
                      Workstream
                    </th>
                    {phases.map((phase) => (
                      <th key={phase.id} className="p-3 bg-muted/30 min-w-[220px]">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-sm text-am-navy">{phase.name}</span>
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openEditPhase(phase)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600"
                              onClick={() => {
                                if (confirm(`Delete phase "${phase.name}"?`)) {
                                  phaseMutation.mutate({ id: phase.id, method: "DELETE" });
                                }
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {(phase.start_date || phase.end_date) && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDateShort(phase.start_date)}{phase.start_date && phase.end_date ? " - " : ""}{formatDateShort(phase.end_date)}
                            </span>
                          )}
                          <Badge className={`text-[10px] ${statusColors[phase.status] || statusColors.not_started}`}>
                            {(phase.status || "not_started").replace(/_/g, " ")}
                          </Badge>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workstreams.length === 0 ? (
                    <tr>
                      <td colSpan={phases.length + 1} className="text-center p-8 text-muted-foreground text-sm">
                        No tasks yet. Add tasks to populate the matrix.
                      </td>
                    </tr>
                  ) : (
                    workstreams.map((ws) => (
                      <tr key={ws} className="border-b border-border/50">
                        <td className="p-3 font-medium text-sm text-am-navy align-top sticky left-0 bg-white">
                          {ws}
                        </td>
                        {phases.map((phase) => {
                          const phaseTasks = getTasksForPhaseAndWorkstream(phase.id, ws);
                          return (
                            <td key={phase.id} className="p-2 align-top">
                              <div className="space-y-2">
                                {phaseTasks.map((task) => (
                                  <div
                                    key={task.id}
                                    className="p-2 rounded-md border bg-white hover:shadow-sm transition-shadow cursor-pointer group"
                                    onClick={() => openEditTask(task)}
                                  >
                                    <div className="flex items-start justify-between gap-1">
                                      <span className="text-xs font-medium leading-tight flex-1">{task.task_name}</span>
                                      <Button
                                        size="sm" variant="ghost"
                                        className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (confirm(`Delete task "${task.task_name}"?`)) {
                                            taskMutation.mutate({ id: task.id, method: "DELETE" });
                                          }
                                        }}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                    {task.owner && (
                                      <p className="text-[10px] text-muted-foreground mt-1">{task.owner}</p>
                                    )}
                                    <div className="flex items-center gap-1.5 mt-1.5">
                                      <Badge className={`text-[10px] py-0 ${statusColors[task.status] || statusColors.not_started}`}>
                                        {(task.status || "not_started").replace(/_/g, " ")}
                                      </Badge>
                                      {task.priority && (
                                        <span className={`inline-block h-2 w-2 rounded-full ${priorityDots[task.priority] || priorityDots.medium}`} title={task.priority} />
                                      )}
                                    </div>
                                  </div>
                                ))}
                                {phaseTasks.length === 0 && (
                                  <button
                                    className="w-full p-2 rounded border border-dashed text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
                                    onClick={() => openAddTask(phase.id)}
                                  >
                                    + Add task
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Phase Dialog */}
      <Dialog open={phaseDialogOpen} onOpenChange={setPhaseDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{phaseEditId != null ? "Edit Phase" : "Add Phase"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Phase Name *</label>
              <Input
                value={phaseForm.name}
                onChange={(e) => setPhaseForm({ ...phaseForm, name: e.target.value })}
                className="mt-1"
                placeholder="e.g., Phase 1: Discovery"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Sort Order</label>
                <Input
                  type="number"
                  value={phaseForm.sort_order}
                  onChange={(e) => setPhaseForm({ ...phaseForm, sort_order: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Status</label>
                <Select value={phaseForm.status} onValueChange={(v) => setPhaseForm({ ...phaseForm, status: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {phaseStatuses.map((s) => (
                      <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Start Date</label>
                <Input
                  type="date"
                  value={phaseForm.start_date}
                  onChange={(e) => setPhaseForm({ ...phaseForm, start_date: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">End Date</label>
                <Input
                  type="date"
                  value={phaseForm.end_date}
                  onChange={(e) => setPhaseForm({ ...phaseForm, end_date: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setPhaseDialogOpen(false)}>Cancel</Button>
              <Button onClick={submitPhase} disabled={!phaseForm.name.trim() || phaseMutation.isPending}>
                {phaseMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {phaseEditId != null ? "Save Changes" : "Add Phase"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Task Dialog */}
      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{taskEditId != null ? "Edit Task" : "Add Task"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Task Name *</label>
              <Input
                value={taskForm.task_name}
                onChange={(e) => setTaskForm({ ...taskForm, task_name: e.target.value })}
                className="mt-1"
                placeholder="e.g., Conduct management interviews"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Phase</label>
                <Select value={taskForm.phase_id} onValueChange={(v) => setTaskForm({ ...taskForm, phase_id: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select phase..." /></SelectTrigger>
                  <SelectContent>
                    {phases.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Workstream</label>
                <Input
                  value={taskForm.workstream}
                  onChange={(e) => setTaskForm({ ...taskForm, workstream: e.target.value })}
                  className="mt-1"
                  placeholder="e.g., Operations"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Owner</label>
                <Input
                  value={taskForm.owner}
                  onChange={(e) => setTaskForm({ ...taskForm, owner: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Status</label>
                <Select value={taskForm.status} onValueChange={(v) => setTaskForm({ ...taskForm, status: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {taskStatuses.map((s) => (
                      <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Priority</label>
                <Select value={taskForm.priority} onValueChange={(v) => setTaskForm({ ...taskForm, priority: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {taskPriorities.map((p) => (
                      <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Due Date</label>
                <Input
                  type="date"
                  value={taskForm.due_date}
                  onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Deliverable</label>
              <Input
                value={taskForm.deliverable}
                onChange={(e) => setTaskForm({ ...taskForm, deliverable: e.target.value })}
                className="mt-1"
                placeholder="Expected output or deliverable"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                value={taskForm.notes}
                onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })}
                className="mt-1"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setTaskDialogOpen(false)}>Cancel</Button>
              <Button onClick={submitTask} disabled={!taskForm.task_name.trim() || taskMutation.isPending}>
                {taskMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {taskEditId != null ? "Save Changes" : "Add Task"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
