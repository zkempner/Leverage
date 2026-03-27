"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, Send, Bot, User, Upload, Loader2 } from "lucide-react";

export default function OnboardingPage() {
  const { clientId } = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Questionnaire state
  const [audience, setAudience] = useState("");
  const [goals, setGoals] = useState("");
  const [brandVoice, setBrandVoice] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [channels, setChannels] = useState("");
  const [budgetNotes, setBudgetNotes] = useState("");

  // AI Interview state
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([
    { role: "assistant", content: "Hi! I'm Blitz, your AI marketing strategist. I'd like to learn about your business to create the best possible marketing strategy. Let's start — what does your company do, and who are your ideal customers?" },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const { data: onboarding } = useQuery({
    queryKey: [`/api/clients/${clientId}/onboarding`],
    queryFn: () => fetch(`/api/clients/${clientId}/onboarding`).then((r) => r.json()),
  });

  // Hydrate form fields from saved onboarding data
  useEffect(() => {
    if (!onboarding) return;
    try {
      if (onboarding.targetAudience) {
        const parsed = JSON.parse(onboarding.targetAudience);
        if (parsed.description) setAudience(parsed.description);
      }
      if (onboarding.goals) {
        const parsed = JSON.parse(onboarding.goals);
        if (parsed.description) setGoals(parsed.description);
      }
      if (onboarding.brandVoice) {
        const parsed = JSON.parse(onboarding.brandVoice);
        if (parsed.description) setBrandVoice(parsed.description);
      }
      if (onboarding.competitors) {
        const parsed = JSON.parse(onboarding.competitors);
        if (parsed.list) setCompetitors(parsed.list);
      }
      if (onboarding.existingChannels) {
        const parsed = JSON.parse(onboarding.existingChannels);
        if (parsed.description) setChannels(parsed.description);
      }
      if (onboarding.budgetBreakdown) {
        const parsed = JSON.parse(onboarding.budgetBreakdown);
        if (parsed.notes) setBudgetNotes(parsed.notes);
      }
    } catch {}
  }, [onboarding]);

  const { data: client } = useQuery({
    queryKey: [`/api/clients/${clientId}`],
    queryFn: () => fetch(`/api/clients/${clientId}`).then((r) => r.json()),
  });

  const saveQuestionnaire = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/onboarding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetAudience: { description: audience },
          goals: { description: goals },
          brandVoice: { description: brandVoice },
          competitors: { list: competitors },
          existingChannels: { description: channels },
          budgetBreakdown: { notes: budgetNotes },
        }),
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/onboarding`] }),
  });

  const completeOnboarding = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/onboarding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completed: true,
          interviewTranscript: chatMessages.map((m) => `${m.role}: ${m.content}`).join("\n\n"),
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}`] });
      router.push(`/clients/${clientId}/strategy`);
    },
  });

  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMessage = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setChatLoading(true);

    try {
      const res = await fetch(`/api/clients/${clientId}/copilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `[ONBOARDING INTERVIEW] The client says: "${userMessage}"\n\nQuestionnaire responses so far:\n- Target Audience: ${audience || "(not yet provided)"}\n- Marketing Goals: ${goals || "(not yet provided)"}\n- Brand Voice: ${brandVoice || "(not yet provided)"}\n- Competitors: ${competitors || "(not yet provided)"}\n- Existing Channels: ${channels || "(not yet provided)"}\n- Budget Notes: ${budgetNotes || "(not yet provided)"}\n\nContinue the onboarding interview. Reference the questionnaire answers above when relevant. Ask follow-up questions about their business, target market, competitors, goals, budget, and brand voice. Be conversational and extract useful marketing insights. When you feel you have enough information, summarize what you've learned.`,
        }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.text) {
                assistantMessage += data.text;
                setChatMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") {
                    last.content = assistantMessage;
                  } else {
                    updated.push({ role: "assistant", content: assistantMessage });
                  }
                  return [...updated];
                });
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I encountered an error. Please try again." },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Auto-save questionnaire when switching tabs
  const handleTabChange = (value: string) => {
    if (audience || goals || brandVoice || competitors || channels || budgetNotes) {
      saveQuestionnaire.mutate();
    }
    setActiveTab(value);
  };

  const [activeTab, setActiveTab] = useState("questionnaire");

  const isCompleted = !!onboarding?.completedAt;
  const progress = [audience, goals, brandVoice, competitors].filter(Boolean).length * 25;

  return (
    <div>
      <div className="border-b bg-card/50 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Client Onboarding</h1>
            <p className="text-muted-foreground">{client?.name} — gather information to power AI strategy</p>
          </div>
          {isCompleted && <Badge className="bg-emerald-500/20 text-emerald-400">Completed</Badge>}
        </div>
      </div>

      <div className="p-8">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList>
            <TabsTrigger value="questionnaire">Questionnaire</TabsTrigger>
            <TabsTrigger value="interview">AI Interview</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>

          <TabsContent value="questionnaire" className="space-y-6">
            <div className="flex items-center gap-4 mb-6">
              <Progress value={progress} className="flex-1" />
              <span className="text-sm text-muted-foreground">{progress}%</span>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Target Audience</CardTitle>
                  <CardDescription>Who are your ideal customers?</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    placeholder="Describe your target audience: demographics, interests, pain points, buying behavior..."
                    rows={5}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Marketing Goals</CardTitle>
                  <CardDescription>What do you want to achieve?</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={goals}
                    onChange={(e) => setGoals(e.target.value)}
                    placeholder="Your primary marketing goals: lead generation, brand awareness, revenue targets, growth rate..."
                    rows={5}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Brand Voice</CardTitle>
                  <CardDescription>How should your brand sound?</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={brandVoice}
                    onChange={(e) => setBrandVoice(e.target.value)}
                    placeholder="Describe your brand personality: tone (professional, casual, bold), style guidelines, words to use/avoid..."
                    rows={5}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Competitors</CardTitle>
                  <CardDescription>Who are you competing against?</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={competitors}
                    onChange={(e) => setCompetitors(e.target.value)}
                    placeholder="List your main competitors and what makes you different..."
                    rows={5}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Existing Channels</CardTitle>
                  <CardDescription>Where are you already marketing?</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={channels}
                    onChange={(e) => setChannels(e.target.value)}
                    placeholder="Current marketing channels and what's working/not working..."
                    rows={5}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Budget Notes</CardTitle>
                  <CardDescription>Any budget allocation preferences?</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={budgetNotes}
                    onChange={(e) => setBudgetNotes(e.target.value)}
                    placeholder="Budget constraints, channel preferences, ROI expectations..."
                    rows={5}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="flex gap-4">
              <Button onClick={() => saveQuestionnaire.mutate()} disabled={saveQuestionnaire.isPending}>
                {saveQuestionnaire.isPending ? "Saving..." : "Save Questionnaire"}
              </Button>
              <Button variant="outline" onClick={() => completeOnboarding.mutate()} disabled={completeOnboarding.isPending}>
                {completeOnboarding.isPending ? "Completing..." : "Complete Onboarding & Generate Strategy"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="interview">
            <Card className="h-[600px] flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" /> AI Marketing Interview
                </CardTitle>
                <CardDescription>Chat with Blitz to provide detailed information about your client</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col overflow-hidden">
                <ScrollArea className="flex-1 pr-4">
                  <div className="space-y-4">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                        {msg.role === "assistant" && (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                            <Bot className="h-4 w-4 text-primary" />
                          </div>
                        )}
                        <div
                          className={`rounded-lg px-4 py-2 max-w-[80%] text-sm ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          {msg.content}
                        </div>
                        {msg.role === "user" && (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                            <User className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <div className="flex gap-2 pt-4 border-t mt-4">
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendChatMessage()}
                    placeholder="Tell me about your business..."
                    disabled={chatLoading}
                  />
                  <Button size="icon" onClick={sendChatMessage} disabled={chatLoading || !chatInput.trim()}>
                    {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Upload Documents</CardTitle>
                <CardDescription>
                  Upload brand guidelines, past campaign reports, competitor analysis, or any other relevant documents
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed rounded-lg p-12 text-center">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-2">
                    Drag and drop files here, or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Supports PDF, DOCX, XLSX, CSV, TXT, PNG, JPG
                  </p>
                  <Button variant="outline">Browse Files</Button>
                </div>
                {onboarding?.documents?.length > 0 && (
                  <div className="mt-6 space-y-2">
                    <h4 className="font-medium text-sm">Uploaded Documents</h4>
                    {onboarding.documents.map((doc: { id: string; filename: string; fileType: string }) => (
                      <div key={doc.id} className="flex items-center gap-2 text-sm p-2 rounded bg-muted">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        {doc.filename}
                        <Badge variant="outline" className="ml-auto">{doc.fileType}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
