import { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatPrice } from "@/lib/api/adapter";
import { useGroupOrder, groupOrdersApi } from "@/lib/queries";
import { useCart } from "@/lib/cartContext";
import { getDishById } from "@workspace/menu-catalog";
import {
  Users,
  Copy,
  Trash2,
  Lock,
  ShoppingBag,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Share2,
  Check,
} from "lucide-react";

export default function GroupOrder() {
  const { code: rawCode } = useParams<{ code: string }>();
  const code = (rawCode ?? "").toUpperCase();
  const navigate = useNavigate();
  const { data: group, isLoading, error, refetch } = useGroupOrder(code);
  const { addItem, clear } = useCart();
  const [copied, setCopied] = useState(false);
  const [closing, setClosing] = useState(false);

  const subtotal = useMemo(
    () => (group?.items ?? []).reduce((s, it) => s + it.unitPrice * it.quantity, 0),
    [group],
  );

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/group/${code}`;
  }, [code]);

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Group link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const removeLine = async (lineId: string) => {
    try {
      await groupOrdersApi.removeLine(code, lineId);
      await refetch();
    } catch {
      toast.error("Could not remove item");
    }
  };

  const closeAndCheckout = async () => {
    if (!group) return;
    if (group.items.length === 0) {
      toast.error("Add at least one item before closing");
      return;
    }
    setClosing(true);
    try {
      // Server enforces "host only"; non-hosts will get 403. Use the
      // close response as source of truth — it includes any item added
      // since our last poll.
      const { group: closed } = await groupOrdersApi.close(code);
      clear();
      let unresolved = 0;
      for (const it of closed.items) {
        // Resolve canonical dish metadata from the catalog so cart
        // preference checks, macros, and routing all work correctly.
        const dish = getDishById(it.dishId);
        if (!dish) {
          unresolved++;
          continue;
        }
        addItem({
          dishId: dish.id,
          slug: dish.slug,
          name: dish.name,
          image: dish.image,
          basePrice: dish.price,
          unitPrice: dish.price,
          quantity: it.quantity,
          kitchen: dish.kitchen,
          isVeg: dish.isVeg,
          rdVerified: dish.rdVerified,
          macros: dish.macros,
          customizations: it.customizations,
        });
      }
      if (unresolved > 0) {
        toast.warning(
          `${unresolved} item${unresolved === 1 ? "" : "s"} could not be transferred`,
        );
      }
      toast.success(`Group order ${code} closed — proceed to checkout`);
      navigate("/checkout");
    } catch {
      toast.error("Only the host can close this group order");
      setClosing(false);
    }
  };

  if (!code) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <p className="text-clinical-zinc">No group code provided.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center text-clinical-zinc">
        Loading group order…
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-3">
        <p className="text-white">Group {code} was not found.</p>
        <Link to="/menu">
          <Button className="bg-clinical-gold text-[#050505]">Browse Menu</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-5 animate-in fade-in duration-500">
      <Link
        to="/menu"
        className="inline-flex items-center gap-1.5 min-h-[36px] py-2 -ml-1 px-1 text-xs text-clinical-zinc hover:text-clinical-gold transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Menu
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <p className="text-clinical-label">Group Order</p>
          <h1 className="text-clinical-h2 text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-clinical-gold" />
            <span className="font-mono tracking-widest">{group.code}</span>
            <Badge
              variant="outline"
              className={`text-[10px] ${
                group.status === "open"
                  ? "border-clinical-sage/50 text-clinical-sage bg-clinical-sage/10"
                  : "border-clinical-slate/50 text-clinical-zinc"
              }`}
            >
              {group.status === "open" ? "OPEN" : "CLOSED"}
            </Badge>
          </h1>
          <p className="text-xs text-clinical-zinc">
            Hosted by <span className="text-white">{group.hostName}</span> ·{" "}
            {group.participants.length} participant
            {group.participants.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={copyShare}
          className="border-clinical-gold/40 text-clinical-gold hover:bg-clinical-gold/10 gap-2"
        >
          {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
          {copied ? "Copied!" : "Share link"}
        </Button>
      </div>

      <Card className="bg-clinical-gold/5 border-clinical-gold/30">
        <CardContent className="p-4 text-xs text-clinical-zinc flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-clinical-gold shrink-0 mt-0.5" />
          <span>
            Share code <span className="font-mono text-clinical-gold">{code}</span> or
            the link above. Anyone with the link can add their own items. The host
            closes the order and pays for everyone.
          </span>
        </CardContent>
      </Card>

      {group.status === "open" && (
        <Card className="bg-clinical-surface border-clinical-slate/20">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-white font-medium">Add your items</p>
              <p className="text-[10px] text-clinical-zinc">
                Browse the menu, then come back to add to this group.
              </p>
            </div>
            <Link to={`/menu?group=${code}`}>
              <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 gap-1.5">
                <ShoppingBag className="w-4 h-4" /> Browse Menu
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <Card className="bg-clinical-surface border-clinical-slate/20">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Items in this group</h2>
            <span className="text-[10px] text-clinical-zinc tabular-nums">
              {group.items.length} line{group.items.length === 1 ? "" : "s"}
            </span>
          </div>

          {group.items.length === 0 && (
            <p className="text-xs text-clinical-zinc text-center py-6">
              No items yet. Share the code with friends to get started.
            </p>
          )}

          <div className="space-y-2">
            {group.items.map((it) => (
              <div
                key={it.lineId}
                className="flex items-center gap-3 p-2 rounded-lg border border-clinical-slate/15 bg-clinical-dark/40"
              >
                <img
                  src={it.image}
                  alt={it.name}
                  className="w-12 h-12 rounded object-cover border border-clinical-slate/20 shrink-0"
                  loading="lazy"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white font-medium truncate">
                    {it.name}
                  </p>
                  <p className="text-[10px] text-clinical-zinc">
                    Added by{" "}
                    <span className="text-clinical-gold">{it.addedByName}</span> ·
                    Qty {it.quantity}
                  </p>
                </div>
                <span className="tabular-nums text-xs text-white font-medium shrink-0">
                  {formatPrice(it.unitPrice * it.quantity)}
                </span>
                {group.status === "open" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeLine(it.lineId)}
                    className="h-7 w-7 text-clinical-zinc hover:text-red-400"
                    aria-label="Remove line"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {group.items.length > 0 && (
            <div className="flex items-center justify-between pt-2 border-t border-clinical-slate/15">
              <span className="text-xs text-clinical-zinc">Group subtotal</span>
              <span className="tabular-nums text-base font-bold text-clinical-gold">
                {formatPrice(subtotal)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {group.status === "open" && (
        <div className="flex flex-wrap gap-2 justify-end">
          <Button
            variant="outline"
            onClick={copyShare}
            className="border-clinical-slate/30 text-clinical-zinc gap-2"
          >
            <Copy className="w-4 h-4" /> Copy link
          </Button>
          <Button
            onClick={closeAndCheckout}
            disabled={closing || group.items.length === 0}
            className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold gap-2"
          >
            <Lock className="w-4 h-4" />
            {closing ? "Closing…" : "Close & Checkout"}
            <ArrowRight className="w-4 h-4" />
          </Button>
          <p className="w-full text-[10px] text-clinical-zinc text-right">
            Only{" "}
            <span className="text-white">{group.hostName}</span> (the host) can
            close this order and pay for everyone.
          </p>
        </div>
      )}

      {group.status === "closed" && (
        <Card className="bg-clinical-slate/10 border-clinical-slate/30">
          <CardContent className="p-4 text-xs text-clinical-zinc flex items-center gap-2">
            <Lock className="w-4 h-4" />
            This group order is closed. The host has moved everything to checkout.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
