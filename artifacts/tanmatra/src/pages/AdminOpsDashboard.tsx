import { useState, useRef, useEffect, useCallback } from "react";
import { useSupportAgentChat } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import {
  Send,
  Bot,
  User,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Clock,
  ArrowUpRight,
  Activity,
} from "lucide-react";

interface ChatMessage {
  role: "user" | "agent";
  text: string;
  toolCalls?: Array<{ name: string; result: any }>;
  escalated?: boolean;
  timestamp: string;
  id: string;
}

interface PendingAction {
  id: string;
  actionType: "refund" | "stock_update" | "rider_assign" | "order_cancel" | "price_change";
  description: string;
  parameters: Record<string, unknown>;
  riskScore: number;
  requestedAt: string;
}

function generateId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function AdminOpsDashboard() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "agent",
      text: "Tanmatra Ops Agent online. I can check inventory, assign riders, process refunds, and update stock levels. Destructive actions require your explicit confirmation.",
      timestamp: new Date().toLocaleTimeString(),
      id: generateId(),
    },
  ]);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<PendingAction | null>(null);
  const [actionHistory, setActionHistory] = useState<
    Array<PendingAction & { approved: boolean; decidedAt: string }>
  >([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatMutation = useSupportAgentChat();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const parsePendingActions = useCallback(
    (_agentText: string, toolCalls?: any[]): PendingAction[] => {
      const actions: PendingAction[] = [];
      if (!toolCalls) return actions;
      for (const tc of toolCalls) {
        let actionType: PendingAction["actionType"] | null = null;
        let riskScore = 0.5;
        if (tc.name === "refund_payment") {
          actionType = "refund";
          riskScore = 0.9;
        } else if (tc.name === "update_inventory" || tc.name === "consume_inventory") {
          actionType = "stock_update";
          riskScore = 0.6;
        } else if (tc.name === "assign_rider") {
          actionType = "rider_assign";
          riskScore = 0.3;
        } else if (tc.name === "cancel_order") {
          actionType = "order_cancel";
          riskScore = 0.85;
        }
        if (actionType && riskScore >= 0.5) {
          actions.push({
            id: generateId(),
            actionType,
            description: `${tc.name}: ${JSON.stringify(tc.args ?? tc.parameters ?? {})}`,
            parameters: tc.args ?? tc.parameters ?? {},
            riskScore,
            requestedAt: new Date().toISOString(),
          });
        }
      }
      return actions;
    },
    []
  );

  const handleSend = async () => {
    if (!input.trim() || chatMutation.isPending) return;
    const userMsg: ChatMessage = {
      role: "user",
      text: input.trim(),
      timestamp: new Date().toLocaleTimeString(),
      id: generateId(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      const result = await chatMutation.mutateAsync({
        message: userMsg.text,
        history: messages
          .filter((m) => m.role === "user" || m.role === "agent")
          .map((m) => ({ role: m.role, text: m.text })),
      });

      const newActions = parsePendingActions(result.text, (result as any).toolCalls);
      if (newActions.length > 0) {
        setPendingActions((prev) => [...prev, ...newActions]);
        const highestRisk = newActions.sort((a, b) => b.riskScore - a.riskScore)[0];
        if (highestRisk.riskScore >= 0.7) {
          setConfirmDialog(highestRisk);
        }
      }

      const agentMsg: ChatMessage = {
        role: "agent",
        text: result.text,
        toolCalls: (result as any).toolCalls,
        escalated: (result as any).escalated,
        timestamp: new Date().toLocaleTimeString(),
        id: generateId(),
      };
      setMessages((prev) => [...prev, agentMsg]);

      if ((result as any).escalated) {
        toast.info("Escalated to human support. Ticket created.");
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: "Ops Agent connection failed. Please retry or escalate to on-call engineer.",
          timestamp: new Date().toLocaleTimeString(),
          id: generateId(),
        },
      ]);
    }
  };

  const handleConfirmAction = (approved: boolean) => {
    if (!confirmDialog) return;
    const action = confirmDialog;
    setActionHistory((prev) => [...prev, { ...action, approved, decidedAt: new Date().toISOString() }]);
    setPendingActions((prev) => prev.filter((a) => a.id !== action.id));
    setConfirmDialog(null);
    toast[approved ? "success" : "error"](`Action ${approved ? "approved" : "rejected"}: ${action.actionType}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const pendingCount = pendingActions.length;
  const highRiskCount = pendingActions.filter((a) => a.riskScore >= 0.7).length;

  return (
    <div className="h-[calc(100vh-4rem)] flex gap-4 p-4 animate-in fade-in duration-500">
      <div className="flex-1 flex flex-col min-w-0">
        <Card className="flex-1 flex flex-col border-2 border-[#D4AF37]/20">
          <CardHeader className="shrink-0 py-3 px-4 border-b bg-[#050505]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#D4AF37]/20 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-[#D4AF37]" />
                </div>
                <div>
                  <CardTitle className="text-sm text-white">Ops Agent</CardTitle>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    Execution-capable · Confirmation required for destructive ops
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {pendingCount > 0 && (
                  <Badge variant="outline" className="border-orange-500/30 text-orange-400 gap-1">
                    <ShieldAlert className="w-3 h-3" />
                    {pendingCount} pending
                  </Badge>
                )}
                <Badge variant="outline" className="border-green-500/30 text-green-400 text-[10px]">
                  Online
                </Badge>
              </div>
            </div>
          </CardHeader>

          <ScrollArea className="flex-1 p-4" ref={scrollRef as any}>
            <div className="space-y-4">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
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
                        {msg.toolCalls.map((tc, ti) => {
                          const isDestructive = ["refund_payment", "cancel_order", "update_inventory"].includes(tc.name);
                          return (
                            <div
                              key={ti}
                              className={`flex items-center gap-1.5 text-[10px] rounded px-2 py-1 ${
                                isDestructive
                                  ? "bg-orange-500/10 text-orange-400"
                                  : "bg-background/50 text-muted-foreground"
                              }`}
                            >
                              <Wrench className="w-3 h-3" />
                              <span className="font-mono">{tc.name}</span>
                              {isDestructive && <ShieldAlert className="w-3 h-3 text-orange-400" />}
                              {"success" in (tc.result ?? {}) && tc.result.success ? (
                                <CheckCircle2 className="w-3 h-3 text-green-500" />
                              ) : (
                                <XCircle className="w-3 h-3 text-red-500" />
                              )}
                            </div>
                          );
                        })}
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
              {chatMutation.isPending && (
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#D4AF37]/10 flex items-center justify-center">
                    <Bot className="w-3 h-3 text-[#D4AF37] animate-bounce" />
                  </div>
                  <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground">Analyzing...</div>
                </div>
              )}
            </div>
          </ScrollArea>

          <CardContent className="shrink-0 p-3 border-t">
            <div className="flex gap-2">
              <Input
                placeholder="Ask the Ops Agent: check inventory, assign rider, refund order #123..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1"
                aria-label="Ops agent chat input"
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!input.trim() || chatMutation.isPending}
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="w-80 shrink-0 space-y-4 hidden lg:flex lg:flex-col">
        <Card className={pendingCount > 0 ? "border-orange-500/30" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              Pending Confirmations
              {highRiskCount > 0 && (
                <Badge variant="destructive" className="text-[10px]">
                  {highRiskCount} high risk
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingActions.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No actions awaiting confirmation.</p>
            ) : (
              <div className="space-y-2">
                {pendingActions.map((action) => (
                  <div
                    key={action.id}
                    className={`flex items-center justify-between p-2 rounded-md text-xs ${
                      action.riskScore >= 0.7
                        ? "bg-orange-500/10 border border-orange-500/20"
                        : "bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle
                        className={`w-3 h-3 ${
                          action.riskScore >= 0.7 ? "text-orange-400" : "text-muted-foreground"
                        }`}
                      />
                      <span className="font-medium capitalize">{action.actionType.replace("_", " ")}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px]"
                      onClick={() => setConfirmDialog(action)}
                    >
                      Review
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Recent Decisions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {actionHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No decisions yet.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {actionHistory.slice(-10).map((h, i) => (
                  <div key={i} className="flex items-center justify-between text-xs p-2 rounded-md bg-muted/30">
                    <span className="font-medium capitalize">{h.actionType.replace("_", " ")}</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        h.approved
                          ? "border-green-500/30 text-green-400"
                          : "border-red-500/30 text-red-400"
                      }`}
                    >
                      {h.approved ? "Approved" : "Rejected"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Live Ops
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Active Orders</span>
              <span className="font-bold">-</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Riders Online</span>
              <span className="font-bold">-</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Avg Delivery</span>
              <span className="font-bold">18 min</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Revenue Today</span>
              <span className="font-bold text-[#D4AF37]">{formatCurrency(0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!confirmDialog} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-400">
              <ShieldAlert className="w-5 h-5" />
              Confirm Destructive Action
            </DialogTitle>
            <DialogDescription>
              The Ops Agent has requested a <strong>{confirmDialog?.actionType.replace("_", " ")}</strong> that
              may have financial or operational impact. Review before confirming.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 my-2">
            <div className="bg-muted/50 rounded-md p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Action Type</p>
              <p className="text-sm font-mono font-medium">{confirmDialog?.actionType}</p>
            </div>
            <div className="bg-muted/50 rounded-md p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Description</p>
              <p className="text-sm font-mono">{confirmDialog?.description}</p>
            </div>
            <div className="bg-muted/50 rounded-md p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Risk Score</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      (confirmDialog?.riskScore ?? 0) >= 0.8 ? "bg-red-500" : "bg-orange-500"
                    }`}
                    style={{ width: `${(confirmDialog?.riskScore ?? 0) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-mono">
                  {((confirmDialog?.riskScore ?? 0) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => handleConfirmAction(false)}>
              Reject
            </Button>
            <Button
              variant="default"
              onClick={() => handleConfirmAction(true)}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              Approve & Execute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
