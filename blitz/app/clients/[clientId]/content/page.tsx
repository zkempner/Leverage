"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Sparkles, PenTool, Copy, Check } from "lucide-react";
import { CONTENT_TYPES, CHANNELS } from "@/lib/utils";

export default function ContentPage() {
  const { clientId } = useParams();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [contentType, setContentType] = useState("ad_copy");
  const [channel, setChannel] = useState("");
  const [context, setContext] = useState("");
  const [objective, setObjective] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: contentList = [] } = useQuery<any[]>({
    queryKey: [`/api/clients/${clientId}/content`],
    queryFn: () => fetch(`/api/clients/${clientId}/content`).then((r) => r.json()),
  });

  const generate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/content/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: contentType, channel, context, objective }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/content`] });
      setOpen(false);
      setContext("");
      setObjective("");
    },
  });

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  function renderContent(item: any) {
    try {
      const parsed = JSON.parse(item.body);

      if (parsed.variants) {
        return (
          <div className="space-y-3">
            {parsed.variants.map((v: any, i: number) => (
              <div key={i} className="rounded-lg bg-muted/50 p-3 space-y-1">
                <p className="font-medium text-sm">{v.headline}</p>
                <p className="text-sm text-muted-foreground">{v.description}</p>
                {v.cta && <Badge variant="secondary" className="text-xs">{v.cta}</Badge>}
              </div>
            ))}
          </div>
        );
      }

      if (parsed.headlines) {
        return (
          <div className="space-y-2">
            {parsed.headlines.map((h: string, i: number) => (
              <div key={i} className="flex items-center justify-between rounded bg-muted/50 px-3 py-2">
                <span className="text-sm">{h}</span>
                <Button size="sm" variant="ghost" onClick={() => copyToClipboard(h, `${item.id}-${i}`)}>
                  {copiedId === `${item.id}-${i}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
            ))}
          </div>
        );
      }

      if (parsed.posts) {
        return (
          <div className="space-y-3">
            {parsed.posts.map((p: any, i: number) => (
              <div key={i} className="rounded-lg bg-muted/50 p-3">
                <Badge variant="outline" className="text-xs mb-2">{p.platform}</Badge>
                <p className="text-sm">{p.text}</p>
                {p.hashtags && <p className="text-xs text-primary mt-1">{p.hashtags.join(" ")}</p>}
              </div>
            ))}
          </div>
        );
      }

      if (parsed.subject) {
        return (
          <div className="space-y-2">
            <div className="text-sm"><span className="font-medium">Subject:</span> {parsed.subject}</div>
            {parsed.preheader && <div className="text-sm text-muted-foreground">Preheader: {parsed.preheader}</div>}
            <div className="text-sm whitespace-pre-wrap mt-2 rounded bg-muted/50 p-3">{parsed.body}</div>
          </div>
        );
      }

      if (parsed.title && parsed.body) {
        return (
          <div className="space-y-2">
            <h4 className="font-medium">{parsed.title}</h4>
            {parsed.metaDescription && <p className="text-sm text-muted-foreground">{parsed.metaDescription}</p>}
            <div className="text-sm whitespace-pre-wrap rounded bg-muted/50 p-3 max-h-60 overflow-y-auto">{parsed.body}</div>
          </div>
        );
      }

      return <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(parsed, null, 2)}</pre>;
    } catch {
      return <p className="text-sm whitespace-pre-wrap">{item.body}</p>;
    }
  }

  const typeLabel = (val: string) => CONTENT_TYPES.find((t) => t.value === val)?.label || val;
  const channelLabel = (val: string) => CHANNELS.find((c) => c.value === val)?.label || val;

  return (
    <div>
      <div className="border-b bg-card/50 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Content Studio</h1>
            <p className="text-muted-foreground">AI-powered content generation and library</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Sparkles className="mr-2 h-4 w-4" /> Generate Content</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Generate Content with AI</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Content Type</Label>
                  <Select value={contentType} onValueChange={setContentType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONTENT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Channel (optional)</Label>
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
                      <SelectItem value="awareness">Brand Awareness</SelectItem>
                      <SelectItem value="consideration">Consideration</SelectItem>
                      <SelectItem value="conversion">Conversion</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Additional Context</Label>
                  <Textarea
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="Any specific requirements, topics, or details..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
                  {generate.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</> : "Generate"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="p-8">
        {contentList.length === 0 ? (
          <Card className="mx-auto max-w-md text-center">
            <CardHeader>
              <CardTitle>No content yet</CardTitle>
              <CardDescription>Generate AI-powered marketing content for your campaigns</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setOpen(true)}>
                <Sparkles className="mr-2 h-4 w-4" /> Generate Content
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {contentList.map((item: any) => (
              <Card key={item.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <PenTool className="h-4 w-4" /> {item.name}
                    </CardTitle>
                    <div className="flex gap-2">
                      <Badge variant="secondary">{typeLabel(item.type)}</Badge>
                      {item.channel && <Badge variant="outline">{channelLabel(item.channel)}</Badge>}
                      <Badge variant={item.status === "approved" ? "default" : "secondary"}>
                        {item.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>{renderContent(item)}</CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
