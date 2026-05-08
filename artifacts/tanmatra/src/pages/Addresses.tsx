import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  House,
  Buildings,
  MapPin,
  PencilSimple,
  CaretLeft,
  Plus,
} from "@phosphor-icons/react";
import { SAVED_ADDRESSES, type SavedAddress } from "@/lib/savedAddresses";

const TYPE_ICON: Record<SavedAddress["type"], typeof House> = {
  home: House,
  work: Buildings,
};

export default function Addresses() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <header className="space-y-2">
        <Link
          to="/account"
          className="inline-flex items-center gap-1 text-[11px] text-clinical-zinc hover:text-clinical-gold transition-colors"
        >
          <CaretLeft className="w-3 h-3" aria-hidden />
          Back to account
        </Link>
        <h1 className="font-serif text-3xl text-white tracking-tight">
          Address book
        </h1>
        <p className="text-sm text-clinical-zinc">
          Saved delivery addresses used at checkout and on subscription
          deliveries.
        </p>
      </header>

      <div className="space-y-3">
        {SAVED_ADDRESSES.map((addr, idx) => {
          const Icon = TYPE_ICON[addr.type];
          return (
            <Card
              key={addr.id}
              className="bg-clinical-surface border-clinical-slate/30"
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-md bg-clinical-gold/10 border border-clinical-gold/20 flex items-center justify-center shrink-0">
                    <Icon
                      className="w-4 h-4 text-clinical-gold"
                      aria-hidden
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm text-white font-medium">
                        {addr.label}
                      </p>
                      {idx === 0 && (
                        <Badge className="bg-clinical-sage/15 text-clinical-sage border border-clinical-sage/30 text-[10px] font-medium">
                          Default
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-clinical-zinc leading-relaxed">
                      {addr.line1}
                      {addr.line2 ? `, ${addr.line2}` : ""}
                      <br />
                      {addr.city} — {addr.pincode}
                    </p>
                    <p className="mt-1.5 text-[11px] text-clinical-zinc text-clinical-data">
                      {addr.phone}
                    </p>
                  </div>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="border-clinical-slate/40 text-clinical-zinc hover:text-white hover:border-clinical-gold/40 gap-1.5 shrink-0"
                  >
                    <Link to="/checkout">
                      <PencilSimple className="w-3.5 h-3.5" aria-hidden />
                      Edit
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-clinical-surface border-clinical-slate/30 border-dashed">
        <CardContent className="p-5 flex items-center gap-4">
          <div className="h-10 w-10 rounded-md bg-white/5 border border-clinical-slate/30 flex items-center justify-center shrink-0">
            <Plus className="w-4 h-4 text-clinical-zinc" aria-hidden />
          </div>
          <div className="flex-1">
            <p className="text-sm text-white">Add a new address</p>
            <p className="text-[11px] text-clinical-zinc">
              New addresses are added during checkout for now.
            </p>
          </div>
          <Button
            asChild
            size="sm"
            className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold gap-1.5"
          >
            <Link to="/checkout">
              <MapPin className="w-3.5 h-3.5" aria-hidden />
              Go to checkout
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
