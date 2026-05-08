import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Gift, Copy, Ticket } from "lucide-react";
import { toast } from "sonner";
import { corporateApi, type Voucher } from "@/lib/corporateApi";
import { formatPrice } from "@/lib/api/adapter";

const PRESET_AMOUNTS = [50000, 100000, 250000, 500000];

export default function VouchersPage() {
  const [purchased, setPurchased] = useState<Voucher[]>([]);
  const [redeemed, setRedeemed] = useState<Voucher[]>([]);
  const [amountPaise, setAmountPaise] = useState(100000);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [message, setMessage] = useState("");
  const [redeemCode, setRedeemCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  const refresh = async () => {
    try {
      const r = await corporateApi.myVouchers();
      setPurchased(r.purchased);
      setRedeemed(r.redeemed);
    } catch (e) {
      if (String((e as Error).message).startsWith("401")) setUnauthorized(true);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handlePurchase = async () => {
    if (amountPaise < 10_000) {
      toast.error("Minimum Rs. 100");
      return;
    }
    setBusy(true);
    try {
      const r = await corporateApi.purchaseVoucher({
        amountPaise,
        recipientEmail: recipientEmail || undefined,
        recipientName: recipientName || undefined,
        message: message || undefined,
      });
      toast.success(`Voucher ${r.voucher.code} purchased`);
      setRecipientEmail("");
      setRecipientName("");
      setMessage("");
      refresh();
    } catch {
      toast.error("Could not purchase voucher");
    } finally {
      setBusy(false);
    }
  };

  const handleRedeem = async () => {
    if (!redeemCode.trim()) {
      toast.error("Enter a code");
      return;
    }
    setBusy(true);
    try {
      const r = await corporateApi.redeemVoucher(redeemCode.trim());
      toast.success(`Redeemed ${formatPrice(r.creditedPaise)} to your wallet`);
      setRedeemCode("");
      refresh();
    } catch (e) {
      const msg = String((e as Error).message);
      toast.error(msg.includes("404") ? "Code not found" : msg.includes("409") ? "Already redeemed" : "Could not redeem");
    } finally {
      setBusy(false);
    }
  };

  if (unauthorized) {
    return (
      <div className="max-w-xl mx-auto p-8 text-center space-y-3">
        <Gift className="w-10 h-10 mx-auto text-clinical-gold" />
        <h1 className="text-2xl font-bold text-white">Wellness vouchers</h1>
        <p className="text-sm text-clinical-zinc">Sign in to buy or redeem vouchers.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-5 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Gift className="w-6 h-6 text-clinical-gold" /> Wellness vouchers
        </h1>
        <p className="text-sm text-clinical-zinc">
          Buy a voucher for a friend or colleague — they redeem it as wallet credit at checkout.
        </p>
      </div>

      <Card className="bg-clinical-surface border-clinical-slate/20">
        <CardContent className="p-5 space-y-3">
          <h2 className="text-sm font-semibold text-white">Buy a voucher</h2>
          <div className="flex flex-wrap gap-2">
            {PRESET_AMOUNTS.map((p) => (
              <Button
                key={p}
                size="sm"
                variant={amountPaise === p ? "default" : "outline"}
                className={
                  amountPaise === p
                    ? "bg-clinical-gold/20 border-clinical-gold/40 text-clinical-gold"
                    : "border-clinical-slate/30"
                }
                onClick={() => setAmountPaise(p)}
              >
                {formatPrice(p)}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-clinical-zinc">Recipient email (optional)</Label>
              <Input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="h-9 text-xs bg-clinical-dark border-clinical-slate/30"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-clinical-zinc">Recipient name (optional)</Label>
              <Input
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="h-9 text-xs bg-clinical-dark border-clinical-slate/30"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-clinical-zinc">Personal message (optional)</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={512}
              rows={2}
              className="text-xs bg-clinical-dark border-clinical-slate/30"
            />
          </div>
          <Button
            onClick={handlePurchase}
            disabled={busy}
            className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90"
          >
            Purchase {formatPrice(amountPaise)} voucher
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-clinical-surface border-clinical-slate/20">
        <CardContent className="p-5 space-y-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Ticket className="w-4 h-4 text-clinical-gold" /> Redeem a voucher
          </h2>
          <div className="flex gap-2">
            <Input
              placeholder="TM-XXXXXXXXXX"
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
              className="h-9 text-xs bg-clinical-dark border-clinical-slate/30 font-mono"
            />
            <Button
              onClick={handleRedeem}
              disabled={busy}
              className="bg-clinical-gold text-[#050505]"
            >
              Redeem
            </Button>
          </div>
        </CardContent>
      </Card>

      {purchased.length > 0 && (
        <Card className="bg-clinical-surface border-clinical-slate/20">
          <CardContent className="p-5 space-y-2">
            <h2 className="text-sm font-semibold text-white">Vouchers you bought</h2>
            <div className="space-y-2">
              {purchased.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between p-2 rounded-md border border-clinical-slate/20 bg-clinical-dark"
                >
                  <div>
                    <p className="text-xs font-mono text-white">{v.code}</p>
                    <p className="text-[10px] text-clinical-zinc">
                      {formatPrice(v.amountPaise)}
                      {v.recipientEmail ? ` → ${v.recipientEmail}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[9px] capitalize ${
                        v.status === "active"
                          ? "border-clinical-sage/40 text-clinical-sage"
                          : "border-clinical-slate/40 text-clinical-zinc"
                      }`}
                    >
                      {v.status}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={async () => {
                        await navigator.clipboard.writeText(v.code).catch(() => undefined);
                        toast.success("Code copied");
                      }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {redeemed.length > 0 && (
        <Card className="bg-clinical-surface border-clinical-slate/20">
          <CardContent className="p-5 space-y-2">
            <h2 className="text-sm font-semibold text-white">Vouchers you redeemed</h2>
            <div className="space-y-2">
              {redeemed.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between p-2 rounded-md border border-clinical-slate/20 bg-clinical-dark"
                >
                  <p className="text-xs font-mono text-white">{v.code}</p>
                  <span className="text-[10px] tabular-nums text-clinical-gold">
                    +{formatPrice(v.amountPaise)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
