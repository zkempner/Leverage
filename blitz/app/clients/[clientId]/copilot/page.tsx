"use client";

import { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, User, Loader2, Sparkles } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function CopilotPage() {
  const { clientId } = useParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: client } = useQuery({
    queryKey: [`/api/clients/${clientId}`],
    queryFn: () => fetch(`/api/clients/${clientId}`).then((r) => r.json()),
  });

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch(`/api/clients/${clientId}/copilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, sessionId }),
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
                setMessages((prev) => {
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
              if (data.sessionId) setSessionId(data.sessionId);
            } catch {}
          }
        }
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, an error occurred. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    "How are my campaigns performing this week?",
    "Which channel has the best ROAS?",
    "Generate 5 ad headlines for my top campaign",
    "What optimizations do you recommend?",
    "Create an email for our next promotion",
    "Analyze my funnel conversion rates",
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-card/50 px-8 py-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Bot className="h-8 w-8 text-primary" /> AI Copilot
        </h1>
        <p className="text-muted-foreground">
          Ask questions about {client?.name || "your client"}&apos;s marketing performance or generate content
        </p>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden p-8">
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardContent className="flex-1 flex flex-col overflow-hidden p-0">
            <ScrollArea className="flex-1 p-6">
              {messages.length === 0 ? (
                <div className="space-y-6">
                  <div className="text-center py-8">
                    <Sparkles className="h-12 w-12 text-primary mx-auto mb-4" />
                    <h3 className="text-lg font-semibold">Welcome to Blitz AI Copilot</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      I can analyze your campaigns, generate content, and provide optimization recommendations.
                    </p>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {quickPrompts.map((prompt) => (
                      <Button
                        key={prompt}
                        variant="outline"
                        className="h-auto py-3 px-4 text-left text-sm justify-start"
                        onClick={() => { setInput(prompt); }}
                      >
                        {prompt}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                      {msg.role === "assistant" && (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      <div
                        className={`rounded-lg px-4 py-3 max-w-[80%] text-sm whitespace-pre-wrap ${
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
                  <div ref={scrollRef} />
                </div>
              )}
            </ScrollArea>
            <div className="border-t p-4 flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder="Ask about campaigns, generate content, get recommendations..."
                disabled={loading}
              />
              <Button size="icon" onClick={sendMessage} disabled={loading || !input.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
