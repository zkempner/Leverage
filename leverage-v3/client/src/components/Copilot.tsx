import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  X, Send, Bot, User, Loader2, Wrench, CheckCircle2, AlertCircle,
  ChevronRight, Plus, Clock, MessageSquare, Pencil, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CopilotMessage {
  role: "user" | "assistant";
  content: string;
}

interface ToolEvent {
  type: "tool_start" | "tool_running" | "tool_result";
  tool: string;
  input?: Record<string, unknown>;
  preview?: string;
}

interface StreamMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolEvents?: ToolEvent[];
  streaming?: boolean;
  error?: boolean;
}

interface SessionMeta {
  id: number;
  session_name: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

// ---------------------------------------------------------------------------
// Tool display name map
// ---------------------------------------------------------------------------
const TOOL_LABELS: Record<string, string> = {
  get_spend_summary: "Analyzing spend data",
  get_top_vendors: "Fetching vendor list",
  get_initiative_scores: "Loading initiative pipeline",
  get_kraljic_matrix: "Reading Kraljic matrix",
  get_financial_model: "Computing financial model",
  get_maturity_gap: "Loading maturity assessment",
  get_tariff_exposure: "Checking tariff exposure",
  get_contract_status: "Querying contracts",
  run_market_lookup: "Looking up market data",
  get_supplier_risk: "Assessing supplier risk",
  search_engagement_data: "Searching engagement data",
  generate_deliverable: "Queuing deliverable generation",
};

// ---------------------------------------------------------------------------
// Tool indicator component
// ---------------------------------------------------------------------------
function ToolIndicator({ event }: { event: ToolEvent }) {
  const label = TOOL_LABELS[event.tool] ?? event.tool;
  const isDone = event.type === "tool_result";
  const isRunning = event.type === "tool_running";
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground py-1">
      <div className="mt-0.5 shrink-0">
        {isDone
          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          : <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
        }
      </div>
      <div>
        <span className="font-medium text-foreground/70">{label}</span>
        {isDone && event.preview && (
          <span className="ml-1.5 text-muted-foreground/70">— {event.preview}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------
function MessageBubble({ msg }: { msg: StreamMessage }) {
  const isUser = msg.role === "user";

  return (
    <div className={cn("flex gap-3 mb-4", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div className={cn(
        "h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
        isUser ? "bg-primary text-primary-foreground" : "bg-muted border"
      )}>
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>

      <div className={cn("max-w-[85%] space-y-1.5", isUser ? "items-end" : "items-start")}>
        {/* Tool events (assistant only) */}
        {!isUser && msg.toolEvents && msg.toolEvents.length > 0 && (
          <div className="bg-muted/40 rounded-lg px-3 py-2 border border-border/50">
            {msg.toolEvents.map((ev, i) => (
              <ToolIndicator key={i} event={ev} />
            ))}
          </div>
        )}

        {/* Content bubble */}
        {(msg.content || msg.streaming) && (
          <div className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted border rounded-tl-sm",
            msg.error && "bg-destructive/10 border-destructive/30 text-destructive"
          )}>
            {msg.content
              ? <span className="whitespace-pre-wrap">{msg.content}</span>
              : <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" />Thinking…
                </span>
            }
            {msg.streaming && msg.content && (
              <span className="inline-block w-0.5 h-3.5 bg-current ml-0.5 animate-pulse" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session list sidebar
// ---------------------------------------------------------------------------
function SessionList({
  sessions,
  activeId,
  onSelect,
  onNew,
}: {
  sessions: SessionMeta[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
}) {
  return (
    <div className="w-52 border-r flex flex-col h-full">
      <div className="p-3 border-b flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">History</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onNew}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {sessions.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No sessions yet</p>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={cn(
                "w-full text-left rounded-lg px-2.5 py-2 text-xs hover:bg-muted transition-colors",
                activeId === s.id && "bg-muted font-medium"
              )}
            >
              <div className="flex items-start gap-1.5">
                <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate">{s.session_name ?? `Session ${s.id}`}</p>
                  <p className="text-muted-foreground mt-0.5">
                    {s.message_count} messages · {new Date(s.updated_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Copilot Panel
// ---------------------------------------------------------------------------
interface CopilotPanelProps {
  engagementId: number;
  onClose: () => void;
}

export function CopilotPanel({ engagementId, onClose }: CopilotPanelProps) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [showSessions, setShowSessions] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Sessions list
  const { data: sessions = [] } = useQuery<SessionMeta[]>({
    queryKey: [`/api/engagements/${engagementId}/copilot/sessions`],
    staleTime: 30_000,
  });

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Keyboard shortcut: Cmd+K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        textareaRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const newSession = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setInput("");
    textareaRef.current?.focus();
  }, []);

  const loadSession = useCallback(async (sid: number) => {
    const resp = await fetch(`/api/copilot/sessions/${sid}`);
    if (!resp.ok) return;
    const data = await resp.json();
    const history: CopilotMessage[] = JSON.parse(data.message_history_json || "[]");
    setSessionId(sid);
    setMessages(
      history.map((m, i) => ({
        id: `hist-${i}`,
        role: m.role,
        content: m.content,
      }))
    );
    setShowSessions(false);
  }, []);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming) return;
    const userText = input.trim();
    setInput("");

    const userMsg: StreamMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userText,
    };

    const assistantMsgId = `assistant-${Date.now()}`;
    const assistantMsg: StreamMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      toolEvents: [],
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    // Build history for API (exclude current streaming message)
    const history: CopilotMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch(`/api/engagements/${engagementId}/copilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, history, session_id: sessionId }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = await resp.json();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: `Error: ${err.error ?? resp.statusText}`, streaming: false, error: true }
              : m
          )
        );
        setIsStreaming(false);
        return;
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) continue;
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let parsed: { delta?: string; tool?: string; input?: Record<string,unknown>; preview?: string; session_id?: number; message?: string } = {};
          try { parsed = JSON.parse(raw); } catch { continue; }

          // Text delta
          if ("delta" in parsed && parsed.delta) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, content: m.content + parsed.delta } : m
              )
            );
          }

          // Tool events
          if ("tool" in parsed && parsed.tool) {
            const eventType = raw.includes('"preview"') ? "tool_result"
              : raw.includes('"input"') ? "tool_running"
              : "tool_start";
            const toolEvent: ToolEvent = {
              type: eventType,
              tool: parsed.tool,
              input: parsed.input,
              preview: parsed.preview,
            };
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, toolEvents: [...(m.toolEvents ?? []), toolEvent] }
                  : m
              )
            );
          }

          // Done
          if ("session_id" in parsed && parsed.session_id) {
            setSessionId(parsed.session_id);
            queryClient.invalidateQueries({ queryKey: [`/api/engagements/${engagementId}/copilot/sessions`] });
          }

          // Error
          if ("message" in parsed && !("delta" in parsed) && !("tool" in parsed) && !("session_id" in parsed)) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: `Error: ${parsed.message}`, streaming: false, error: true }
                  : m
              )
            );
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId ? { ...m, streaming: false } : m
        )
      );
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: `Connection error: ${(err as Error).message}`, streaming: false, error: true }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, messages, engagementId, sessionId, queryClient]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Welcome message
  const isEmpty = messages.length === 0;

  return (
    <div className="fixed inset-y-0 right-0 w-[520px] z-50 flex flex-col shadow-2xl border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Zap className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <span className="text-sm font-semibold">LEVERAGE Co-pilot</span>
            {sessionId && <span className="text-xs text-muted-foreground ml-2">Session {sessionId}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowSessions((v) => !v)}
            title="Session history"
          >
            <Clock className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={newSession} title="New session">
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Session sidebar */}
        {showSessions && (
          <SessionList
            sessions={sessions}
            activeId={sessionId}
            onSelect={loadSession}
            onNew={newSession}
          />
        )}

        {/* Main chat area */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
            {isEmpty ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Bot className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-sm mb-1">LEVERAGE Co-pilot</h3>
                <p className="text-xs text-muted-foreground max-w-xs mb-6">
                  Ask me about spend, initiatives, contracts, supplier risk, or market data for this engagement.
                </p>
                <div className="space-y-2 w-full max-w-xs">
                  {[
                    "What are the top 10 vendors by spend?",
                    "Which initiatives are at risk?",
                    "Show me tariff exposure by category",
                    "What contracts expire in the next 90 days?",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => { setInput(suggestion); textareaRef.current?.focus(); }}
                      className="w-full text-left text-xs px-3 py-2 rounded-lg border hover:bg-muted transition-colors flex items-center gap-2"
                    >
                      <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t p-3 bg-background shrink-0">
            <div className="flex gap-2 items-end">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about spend, savings, contracts, risk… (⌘K to focus)"
                className="resize-none min-h-[60px] max-h-[160px] text-sm"
                rows={2}
                disabled={isStreaming}
              />
              <Button
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={sendMessage}
                disabled={!input.trim() || isStreaming}
              >
                {isStreaming
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Send className="h-4 w-4" />
                }
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 px-1">
              Enter to send · Shift+Enter for new line
              {isStreaming && (
                <button
                  className="ml-3 text-destructive hover:underline"
                  onClick={() => { abortRef.current?.abort(); setIsStreaming(false); }}
                >
                  Stop
                </button>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trigger button (rendered in Layout)
// ---------------------------------------------------------------------------
interface CopilotTriggerProps {
  engagementId: number;
}

export function CopilotTrigger({ engagementId }: CopilotTriggerProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 h-8"
        onClick={() => setOpen(true)}
        title="Open Co-pilot (⌘K)"
      >
        <Zap className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs">Co-pilot</span>
        <kbd className="ml-1 hidden sm:inline-flex items-center gap-0.5 text-[10px] text-muted-foreground border rounded px-1">
          ⌘K
        </kbd>
      </Button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setOpen(false)}
          />
          <CopilotPanel engagementId={engagementId} onClose={() => setOpen(false)} />
        </>
      )}
    </>
  );
}
