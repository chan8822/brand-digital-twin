import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import {
  streamCoachAgentChat,
  type CoachAction,
  type CoachActionAddToCart,
  type CoachActionBookRd,
} from "@/lib/queries";
import { useCart, type CartItem } from "@/lib/cartContext";
import { getDishBySlug } from "@/lib/menuData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Sparkles,
  X,
  Send,
  Bot,
  User,
  ShoppingCart,
  Calendar,
  ArrowUpRight,
  Apple,
} from "lucide-react";

interface ChatMessage {
  role: "user" | "agent";
  text: string;
  actions?: CoachAction[];
  escalated?: boolean;
  timestamp: string;
}

interface CoachAgentWidgetProps {
  /** When provided, the coach opens scoped to this dish and includes it as context. */
  dishSlug?: string;
  /** Custom trigger label/icon. Defaults to a floating gold button. */
  trigger?: React.ReactNode;
  /** When true, render the chat surface inline (no floating button). Used for the dish detail "ask the coach" panel. */
  inline?: boolean;
  /** Initial open state for inline mode. */
  defaultOpen?: boolean;
}

const greetingFor = (dishSlug?: string): string => {
  if (dishSlug) {
    const d = getDishBySlug(dishSlug);
    if (d) {
      return `Hi! I'm your nutrition coach. Want to know more about the ${d.name} — its macros, how it fits your goal, or a higher-protein swap? Ask me anything (general guidance, not medical advice).`;
    }
  }
  return "Hi! I'm your nutrition coach. Ask me about macros, swaps to hit your protein goal, or what to add to your next order. I'll only suggest dishes that respect your allergens and diet — and route you to a dietitian for anything clinical.";
};

function ActionCard({
  action,
  onAddToCart,
  onBookRd,
}: {
  action: CoachAction;
  onAddToCart: (a: CoachActionAddToCart) => void;
  onBookRd: (a: CoachActionBookRd) => void;
}) {
  if (action.kind === "add_to_cart") {
    return (
      <div className="mt-2 rounded-lg border border-[#D4AF37]/30 bg-background/50 p-3">
        <div className="flex items-start gap-3">
          {action.image && (
            <img
              src={action.image}
              alt={action.name}
              className="w-12 h-12 rounded object-cover shrink-0"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold leading-tight">{action.name}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {action.priceLabel} · {action.macros.protein}g protein ·{" "}
              {action.macros.calories} kcal
            </p>
            <p className="text-[10px] text-muted-foreground mt-1 italic">
              {action.reasoning}
            </p>
          </div>
        </div>
        <div className="flex gap-2 mt-2">
          <Button
            size="sm"
            className="flex-1 h-7 text-[11px]"
            onClick={() => onAddToCart(action)}
          >
            <ShoppingCart className="w-3 h-3 mr-1" />
            {action.target === "next_delivery"
              ? "Add to next order"
              : action.target === "replace_in_cart"
                ? "Replace cart with this"
                : `Add ${action.quantity > 1 ? `×${action.quantity}` : ""} to cart`}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            asChild
          >
            <Link to={`/dish/${action.slug}`}>View</Link>
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-2 rounded-lg border border-orange-500/30 bg-background/50 p-3">
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-orange-400" />
        <p className="text-xs font-semibold">Talk to a Registered Dietitian</p>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">{action.reason}</p>
      {action.premiumConsultsRemaining != null && (
        <p className="text-[10px] text-clinical-gold mt-1">
          {action.premiumConsultsRemaining} premium consult
          {action.premiumConsultsRemaining === 1 ? "" : "s"} remaining
        </p>
      )}
      <Button size="sm" className="w-full h-7 text-[11px] mt-2" onClick={() => onBookRd(action)}>
        <ArrowUpRight className="w-3 h-3 mr-1" />
        Book a consult
      </Button>
    </div>
  );
}

export default function CoachAgentWidget({
  dishSlug,
  trigger,
  inline = false,
  defaultOpen = false,
}: CoachAgentWidgetProps = {}) {
  const [isOpen, setIsOpen] = useState(inline ? defaultOpen : false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "agent",
      text: greetingFor(dishSlug),
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [streaming, setStreaming] = useState(false);
  const streamingIndexRef = useRef<number | null>(null);
  const navigate = useNavigate();
  const { items: cartItems, addItem, removeItem } = useCart();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleAddToCart = async (a: CoachActionAddToCart) => {
    const dish = getDishBySlug(a.slug);
    if (!dish) {
      toast.error("Dish unavailable right now");
      return;
    }
    if (a.target === "next_delivery") {
      try {
        const base = import.meta.env.BASE_URL.replace(/\/$/, "");
        const res = await fetch(`${base}/api/subscriptions/next-delivery/add-item`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            slug: dish.slug,
            name: dish.name,
            image: dish.image,
            quantity: a.quantity,
            unitPricePaise: dish.price,
          }),
        });
        if (res.status === 409) {
          addItem({
            dishId: dish.id,
            slug: dish.slug,
            name: dish.name,
            image: dish.image,
            basePrice: dish.price,
            unitPrice: dish.price,
            quantity: a.quantity,
            kitchen: dish.kitchen,
            isVeg: dish.isVeg,
            rdVerified: dish.rdVerified,
            macros: dish.macros,
            customizations: [],
          });
          toast.success(`${dish.name} added to your order`, {
            description:
              "No upcoming subscription delivery — placed in your cart instead.",
            action: { label: "View Cart", onClick: () => navigate("/cart") },
          });
          return;
        }
        if (!res.ok) throw new Error(`add-to-next-delivery failed: ${res.status}`);
        toast.success(`${dish.name} queued for your next subscription delivery`);
      } catch {
        toast.error("Couldn't add to next delivery — please try again.");
      }
      return;
    }
    let replacedName: string | null = null;
    if (a.target === "replace_in_cart") {
      // Surgical replace: only drop the cart line(s) matching the slug
      // the coach explicitly named. Without an explicit replaceSlug we
      // refuse to guess which item to evict — fall through to a plain
      // add so we can never silently remove an unrelated line.
      const targetSlug = a.replaceSlug ?? null;
      const toRemove: CartItem[] = targetSlug
        ? cartItems.filter((it) => it.slug === targetSlug)
        : [];
      for (const it of toRemove) {
        removeItem(it.lineId);
      }
      replacedName = toRemove[0]?.name ?? null;
    }
    addItem({
      dishId: dish.id,
      slug: dish.slug,
      name: dish.name,
      image: dish.image,
      basePrice: dish.price,
      unitPrice: dish.price,
      quantity: a.quantity,
      kitchen: dish.kitchen,
      isVeg: dish.isVeg,
      rdVerified: dish.rdVerified,
      macros: dish.macros,
      customizations: [],
    });
    toast.success(
      a.target === "replace_in_cart"
        ? replacedName
          ? `Swapped ${replacedName} for ${dish.name}`
          : `${dish.name} added to your order`
        : `${dish.name} added to your order`,
      {
        action: { label: "View Cart", onClick: () => navigate("/cart") },
      },
    );
  };

  const handleBookRd = (a: CoachActionBookRd) => {
    setIsOpen(false);
    navigate(a.href);
  };

  const handleSend = async () => {
    if (!input.trim() || streaming) return;
    const userMsg: ChatMessage = {
      role: "user",
      text: input.trim(),
      timestamp: new Date().toLocaleTimeString(),
    };
    let placeholderIdx = -1;
    setMessages((prev) => {
      const next = [
        ...prev,
        userMsg,
        {
          role: "agent" as const,
          text: "",
          timestamp: new Date().toLocaleTimeString(),
        },
      ];
      placeholderIdx = next.length - 1;
      streamingIndexRef.current = placeholderIdx;
      return next;
    });
    setInput("");
    setStreaming(true);

    try {
      const result = await streamCoachAgentChat(
        {
          message: userMsg.text,
          history: messages.map((m) => ({ role: m.role, text: m.text })),
          dishSlug,
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
          actions: result.actions,
          escalated: result.escalated,
        };
        return copy;
      });
    } catch {
      setMessages((prev) => {
        const idx = streamingIndexRef.current;
        if (idx == null) return prev;
        const copy = prev.slice();
        copy[idx] = {
          role: "agent",
          text: "Sorry — I'm having trouble reaching the menu right now. Please try again in a moment.",
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

  const chatSurface = (
    <Card
      className={
        inline
          ? "w-full flex flex-col shadow-md border border-[#D4AF37]/30 max-h-[520px]"
          : "fixed bottom-[152px] md:bottom-24 right-3 md:right-6 left-3 md:left-auto z-50 w-auto md:w-[380px] max-h-[65vh] md:max-h-[560px] flex flex-col shadow-2xl border-2 border-[#D4AF37]/30"
      }
    >
      <CardHeader className="shrink-0 py-3 px-4 border-b bg-[#050505]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#D4AF37]/20 flex items-center justify-center">
            <Apple className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <div>
            <CardTitle className="text-sm text-white">Nutrition Coach</CardTitle>
            <p className="text-[10px] text-muted-foreground font-mono">
              General guidance · not medical advice
            </p>
          </div>
          <Badge
            variant="outline"
            className="ml-auto text-[10px] border-green-500/30 text-green-400"
          >
            Online
          </Badge>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close nutrition coach"
            className="text-clinical-zinc hover:text-white p-1 -mr-1 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </CardHeader>

      <ScrollArea className="flex-1 p-4" ref={scrollRef as never}>
        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "agent" && (
                <div className="w-6 h-6 rounded-full bg-[#D4AF37]/10 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="w-3 h-3 text-[#D4AF37]" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-[#6BA3C8] text-white"
                    : "bg-muted text-foreground"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>
                {msg.actions?.map((a, ai) => (
                  <ActionCard
                    key={ai}
                    action={a}
                    onAddToCart={handleAddToCart}
                    onBookRd={handleBookRd}
                  />
                ))}
                {msg.escalated && (
                  <div className="mt-2 flex items-center gap-1 text-[10px] text-orange-400">
                    <ArrowUpRight className="w-3 h-3" />
                    Routed to RD
                  </div>
                )}
                <p className="text-[10px] opacity-60 mt-1 text-right">
                  {msg.timestamp}
                </p>
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
            placeholder={
              dishSlug ? "Ask about this dish..." : "Ask about macros, swaps, goals..."
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1"
            aria-label="Coach chat input"
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
  );

  if (inline) {
    if (!isOpen) {
      return (
        <Button
          variant="outline"
          className="w-full border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10"
          onClick={() => setIsOpen(true)}
        >
          <Sparkles className="w-4 h-4 mr-2" />
          Ask the coach about this dish
        </Button>
      );
    }
    return chatSurface;
  }

  return (
    <>
      {trigger ? (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Close nutrition coach" : "Open nutrition coach"}
        >
          {trigger}
        </button>
      ) : (
        <Button
          onClick={() => setIsOpen(!isOpen)}
          className="fixed bottom-40 md:bottom-24 right-4 md:right-6 z-50 h-12 w-12 md:h-14 md:w-14 rounded-full shadow-lg bg-[#D4AF37] text-[#050505] hover:bg-[#D4AF37]/90"
          aria-label={isOpen ? "Close nutrition coach" : "Open nutrition coach"}
        >
          {isOpen ? <X className="w-6 h-6" /> : <Apple className="w-6 h-6" />}
        </Button>
      )}

      {isOpen && chatSurface}
    </>
  );
}
