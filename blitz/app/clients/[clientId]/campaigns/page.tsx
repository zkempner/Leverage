"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Zap, Upload } from "lucide-react";
import { CHANNELS, formatCurrency } from "@/lib/utils";

export default function CampaignsPage() {
  const { clientId } = useParams();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("");
  const [objective, setObjective] = useState("");
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");
  const [importChannel, setImportChannel] = useState("");

  const { data: campaigns = [] } = useQuery<any[]>({
    queryKey: [`/api/clients/${clientId}/campaigns`],
    queryFn: () => fetch(`/api/clients/${clientId}/campaigns`).then((r) => r.json()),
  });

  const createCampaign = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, channel, objective, budget: budget ? parseFloat(budget) : null, notes }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/campaigns`] });
      setOpen(false);
      setName(""); setChannel(""); setObjective(""); setBudget(""); setNotes("");
    },
  });

  const handleImport = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set("channel", importChannel);
    await fetch(`/api/clients/${clientId}/import`, { method: "POST", body: form });
    queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/performance`] });
    setImportOpen(false);
  };

  const channelLabel = (val: string) => CHANNELS.find((c) => c.value === val)?.label || val;

  const statusColor: Record<string, string> = {
    draft: "bg-gray-500/20 text-gray-400",
    active: "bg-emerald-500/20 text-emerald-400",
    paused: "bg-yellow-500/20 text-yellow-400",
    completed: "bg-blue-500/20 text-blue-400",
  };

  return (
    <div>
      <div className="border-b bg-card/50 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
            <p className="text-muted-foreground">Manage campaigns and import performance data</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><Upload className="mr-2 h-4 w-4" /> Import Data</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Import Campaign Data (CSV)</DialogTitle></DialogHeader>
                <form onSubmit={handleImport} className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Channel</Label>
                    <Select value={importChannel} onValueChange={setImportChannel}>
                      <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                      <SelectContent>
                        {CHANNELS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>CSV File</Label>
                    <Input type="file" name="file" accept=".csv" required />
                    <p className="text-xs text-muted-foreground">
                      Supported columns: date, impressions, clicks, spend, conversions, ctr, cpc, cpa, roas, revenue, leads
                    </p>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={!importChannel}>Import</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> New Campaign</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Campaign</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Campaign Name</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Q1 Brand Awareness" />
                  </div>
                  <div className="space-y-2">
                    <Label>Channel</Label>
                    <Select value={channel} onValueChange={setChannel}>
                      <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                      <SelectContent>
                        {CHANNELS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Objective</Label>
                    <Select value={objective} onValueChange={setObjective}>
                      <SelectTrigger><SelectValue placeholder="Select objective" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="awareness">Awareness</SelectItem>
                        <SelectItem value="consideration">Consideration</SelectItem>
                        <SelectItem value="conversion">Conversion</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Budget ($)</Label>
                    <Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="5000" />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Campaign details..." rows={2} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={() => createCampaign.mutate()} disabled={!name || !channel || createCampaign.isPending}>
                    {createCampaign.isPending ? "Creating..." : "Create"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="p-8">
        {campaigns.length === 0 ? (
          <Card className="mx-auto max-w-md text-center">
            <CardHeader>
              <CardTitle>No campaigns yet</CardTitle>
              <CardDescription>Create campaigns or import data from your ad platforms</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2 justify-center">
              <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" /> Create Campaign</Button>
              <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="mr-2 h-4 w-4" /> Import Data</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign: any) => (
              <Card key={campaign.id} className="transition-colors hover:border-primary/50">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Zap className="h-4 w-4" /> {campaign.name}
                    </CardTitle>
                    <Badge className={statusColor[campaign.status] || ""} variant="secondary">
                      {campaign.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Channel</span>
                    <Badge variant="outline">{channelLabel(campaign.channel)}</Badge>
                  </div>
                  {campaign.objective && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Objective</span>
                      <span>{campaign.objective}</span>
                    </div>
                  )}
                  {campaign.budget && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Budget</span>
                      <span className="font-medium">{formatCurrency(campaign.budget)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Content</span>
                    <span>{campaign._count?.content || 0} pieces</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Data Points</span>
                    <span>{campaign._count?.metrics || 0}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
