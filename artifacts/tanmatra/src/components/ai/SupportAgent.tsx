import { useState, useRef, useEffect } from "react";
import { streamSupportAgentChat } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { MessageCircle, X, Send, Bot, User, Wrench, ArrowUpRight } from "lucide-react";

interface ChatMessage {
  role: "user" | "agent";
  text: string;
  toolCalls?: Array<{ name: string; result: unknown }>;
  escalated?: boolean;
  timestamp: string;
}

export default function SupportAgentWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "agent",
      text:
        "Hello! I'm the Tanmatra Support Agent. I can help with order status, rider availability, menu inventory, and looking up allergens for a dish.\n\nFor changes to an existing order, cancellations, refunds, or severe-allergy questions, I'll route you straight to our care team.",
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [streaming, setStreaming] = useState(false);
  const streamingIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || streaming) return;
    const userMsg: ChatMessage = {
      role: "user",
      text: input.trim(),
      timestamp: new Date().toLocaleTimeString(),
    };
    // Append the user message AND a blank agent placeholder we will fill
    // as deltas stream in.
    let placeholderIdx = -1;
    setMessages((prev) => {
      const next = [...prev, userMsg, {
        role: "agent" as const,
        text: "",
        timestamp: new Date().toLocaleTimeString(),
      }];
      placeholderIdx = next.length - 1;
      streamingIndexRef.current = placeholderIdx;
      return next;
    });
    setInput("");
    setStreaming(true);

    try {
      const result = await streamSupportAgentChat(
        {
          message: userMsg.text,
          history: messages.map((m) => ({ role: m.role, text: m.text })),
        },
        {
          onDelta: (delta) => {
            setMessages((prev) => {
              const idx = streamingIndexRef.current;
              if (idx == null) return prev;
              const copy = prev.slice();
              const cur = copy[idx];
              if (!cur) return prev;
              copy[idx] = { ...cur, text: cur.text + delta };
              return copy;
            });
          },
        },
      );
      setMessages((prev) => {
        const idx = streamingIndexRef.current;
        if (idx == null) return prev;
        const copy = prev.slice();
        const cur = copy[idx];
        if (!cur) return prev;
        copy[idx] = {
          ...cur,
          text: result.text,
          toolCalls: result.toolCalls?.map((tc) => ({
            name: tc.name,
            result: tc.result,
          })),
          escalated: result.escalated,
        };
        return copy;
      });
      if (result.escalated) {
        toast.info("Conversation escalated to human support. ETA: 15 minutes.");
      }
    } catch {
      setMessages((prev) => {
        const idx = streamingIndexRef.current;
        if (idx == null) return prev;
        const copy = prev.slice();
        copy[idx] = {
          role: "agent",
          text: "Connection issue. Please try again or contact support directly.",
          timestamp: new Date().toLocaleTimeString(),
        };
        return copy;
      });
    } finally {
      streamingIndexRef.current = null;
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-50 h-12 w-12 md:h-14 md:w-14 rounded-full shadow-lg"
        aria-label={isOpen ? "Close support chat" : "Open support chat"}
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </Button>

      {isOpen && (
        <Card className="fixed bottom-[152px] md:bottom-24 right-3 md:right-6 left-3 md:left-auto z-50 w-auto md:w-[380px] max-h-[65vh] md:max-h-[560px] flex flex-col shadow-2xl border-2 border-[#D4AF37]/30">
          <CardHeader className="shrink-0 py-3 px-4 border-b bg-[#050505]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#D4AF37]/20 flex items-center justify-center">
                <Bot className="w-5 h-5 text-[#D4AF37]" />
              </div>
              <div>
                <CardTitle className="text-sm text-white">Support Agent</CardTitle>
                <p className="text-[10px] text-muted-foreground font-mono">Function-calling enabled</p>
              </div>
              <Badge variant="outline" className="ml-auto text-[10px] border-green-500/30 text-green-400">
                Online
              </Badge>
            </div>
          </CardHeader>

          <ScrollArea className="flex-1 p-4" ref={scrollRef as any}>
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "agent" && (
                    <div className="w-6 h-6 rounded-full bg-[#D4AF37]/10 flex items-center justify-center shrink-0 mt-1">
                      <Bot className="w-3 h-3 text-[#D4AF37]" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === "user" ? "bg-[#6BA3C8] text-white" : "bg-muted text-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {msg.toolCalls.map((tc, ti) => (
                          <div
                            key={ti}
                            className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-background/50 rounded px-2 py-1"
                          >
                            <Wrench className="w-3 h-3" />
                            <span className="font-mono">{tc.name}</span>
                            {"success" in (tc.result as any) && (tc.result as any).success ? (
                              <span className="text-green-500">&#10003;</span>
                            ) : (
                              <span className="text-red-500">&#10007;</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {msg.escalated && (
                      <div className="mt-2 flex items-center gap-1 text-[10px] text-orange-400">
                        <ArrowUpRight className="w-3 h-3" />
                        Escalated to human
                      </div>
                    )}
                    <p className="text-[10px] opacity-60 mt-1 text-right">{msg.timestamp}</p>
                  </div>
                  {msg.role === "user" && (
                    <div className="w-6 h-6 rounded-full bg-[#6BA3C8]/10 flex items-center justify-center shrink-0 mt-1">
                      <User className="w-3 h-3 text-[#6BA3C8]" />
                    </div>
                  )}
                </div>
              ))}
              {streaming &&
                messages[streamingIndexRef.current ?? -1]?.text === "" && (
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#D4AF37]/10 flex items-center justify-center">
                      <Bot className="w-3 h-3 text-[#D4AF37] animate-bounce" />
                    </div>
                    <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground">
                      Thinking...
                    </div>
                  </div>
                )}
            </div>
          </ScrollArea>

          <CardContent className="shrink-0 p-3 border-t">
            <div className="flex gap-2">
              <Input
                placeholder="Ask about orders, riders, inventory..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1"
                aria-label="Support chat input"
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!input.trim() || streaming}
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
