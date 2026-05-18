import { useEffect, useState } from "react";
import { Link, type MetaFunction } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  House,
  Buildings,
  MapPin,
  PencilSimple,
  CaretLeft,
  Plus,
  Trash,
  CheckCircle,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  addressesApi,
  type UserAddress,
  type AddressInput,
} from "@/lib/userAddressesApi";

const TYPE_ICON: Record<UserAddress["type"], typeof House> = {
  home: House,
  work: Buildings,
  other: MapPin,
};

interface FormState {
  label: string;
  type: UserAddress["type"];
  line1: string;
  line2: string;
  city: string;
  pincode: string;
  phone: string;
}

const EMPTY_FORM: FormState = {
  label: "",
  type: "home",
  line1: "",
  line2: "",
  city: "",
  pincode: "",
  phone: "",
};

export const meta: MetaFunction = () => [
  { title: "Addresses | Tanmatra" },
  { name: "robots", content: "noindex, nofollow" },
];

export default function Addresses() {
  const [addresses, setAddresses] = useState<UserAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<UserAddress | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      const r = await addressesApi.list();
      setAddresses(r.addresses);
    } catch {
      toast.error("Could not load addresses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setAdding(true);
  };

  const openEdit = (addr: UserAddress) => {
    setForm({
      label: addr.label,
      type: addr.type,
      line1: addr.line1,
      line2: addr.line2,
      city: addr.city,
      pincode: addr.pincode,
      phone: addr.phone,
    });
    setError(null);
    setEditing(addr);
  };

  const close = () => {
    setAdding(false);
    setEditing(null);
    setError(null);
  };

  const handleSave = async () => {
    setError(null);
    if (
      !form.label.trim() ||
      !form.line1.trim() ||
      !form.city.trim() ||
      !form.pincode.trim() ||
      !form.phone.trim()
    ) {
      setError("Please fill label, line 1, city, pincode and phone");
      return;
    }
    setSaving(true);
    try {
      const payload: AddressInput = {
        label: form.label.trim(),
        type: form.type,
        line1: form.line1.trim(),
        line2: form.line2.trim() || undefined,
        city: form.city.trim(),
        pincode: form.pincode.trim(),
        phone: form.phone.trim(),
      };
      if (editing) {
        await addressesApi.update(editing.id, payload);
        toast.success("Address updated");
      } else {
        await addressesApi.create(payload);
        toast.success("Address saved");
      }
      await reload();
      close();
    } catch (e) {
      const msg = String((e as Error).message).replace(/^\d{3}:\s*/, "");
      setError(msg || "Could not save address");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (addr: UserAddress) => {
    if (!confirm(`Delete "${addr.label}"? This cannot be undone.`)) return;
    try {
      await addressesApi.remove(addr.id);
      toast.success("Address deleted");
      await reload();
    } catch {
      toast.error("Could not delete address");
    }
  };

  const handleSetDefault = async (addr: UserAddress) => {
    try {
      await addressesApi.update(addr.id, { isDefault: true });
      await reload();
    } catch {
      toast.error("Could not set default");
    }
  };

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

      {loading ? (
        <p className="text-sm text-clinical-zinc">Loading…</p>
      ) : (
        <div className="space-y-3">
          {addresses.map((addr) => {
            const Icon = TYPE_ICON[addr.type] ?? MapPin;
            return (
              <Card
                key={addr.id}
                className="bg-clinical-surface border-clinical-border"
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
                        {addr.isDefault && (
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
                      <p className="mt-1.5 text-[11px] text-clinical-zinc">
                        {addr.phone}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(addr)}
                        className="border-clinical-border text-clinical-zinc hover:text-white hover:border-clinical-gold/40 gap-1.5"
                      >
                        <PencilSimple className="w-3.5 h-3.5" aria-hidden />
                        Edit
                      </Button>
                      {!addr.isDefault && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSetDefault(addr)}
                          className="text-clinical-zinc hover:text-clinical-sage gap-1.5"
                        >
                          <CheckCircle className="w-3.5 h-3.5" aria-hidden />
                          Set default
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(addr)}
                        className="text-clinical-zinc hover:text-red-400 gap-1.5"
                      >
                        <Trash className="w-3.5 h-3.5" aria-hidden />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="bg-clinical-surface border-clinical-border border-dashed">
        <CardContent className="p-5 flex items-center gap-4">
          <div className="h-10 w-10 rounded-md bg-white/5 border border-clinical-border flex items-center justify-center shrink-0">
            <Plus className="w-4 h-4 text-clinical-zinc" aria-hidden />
          </div>
          <div className="flex-1">
            <p className="text-sm text-white">Add a new address</p>
            <p className="text-[11px] text-clinical-zinc">
              Save a place once, reuse it on every order.
            </p>
          </div>
          <Button
            size="sm"
            onClick={openAdd}
            className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold gap-1.5"
          >
            <MapPin className="w-3.5 h-3.5" aria-hidden />
            Add address
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={adding || editing !== null}
        onOpenChange={(open) => !open && close()}
      >
        <DialogContent className="bg-clinical-surface border-clinical-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editing ? "Edit address" : "New address"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-clinical-zinc">Label</Label>
                <Input
                  placeholder="Home"
                  value={form.label}
                  onChange={(e) =>
                    setForm({ ...form, label: e.target.value })
                  }
                  className="h-9 text-xs bg-clinical-dark border-clinical-border"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-clinical-zinc">Type</Label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      type: e.target.value as UserAddress["type"],
                    })
                  }
                  className="h-9 text-xs bg-clinical-dark border border-clinical-border rounded-md w-full px-2 text-white"
                >
                  <option value="home">Home</option>
                  <option value="work">Work</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-clinical-zinc">
                Address line 1
              </Label>
              <Input
                placeholder="Street, building"
                value={form.line1}
                onChange={(e) =>
                  setForm({ ...form, line1: e.target.value })
                }
                className="h-9 text-xs bg-clinical-dark border-clinical-border"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-clinical-zinc">
                Address line 2 (optional)
              </Label>
              <Input
                placeholder="Apt, floor"
                value={form.line2}
                onChange={(e) =>
                  setForm({ ...form, line2: e.target.value })
                }
                className="h-9 text-xs bg-clinical-dark border-clinical-border"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-clinical-zinc">City</Label>
                <Input
                  placeholder="Mumbai"
                  value={form.city}
                  onChange={(e) =>
                    setForm({ ...form, city: e.target.value })
                  }
                  className="h-9 text-xs bg-clinical-dark border-clinical-border"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-clinical-zinc">
                  Pincode
                </Label>
                <Input
                  placeholder="400001"
                  inputMode="numeric"
                  value={form.pincode}
                  onChange={(e) =>
                    setForm({ ...form, pincode: e.target.value })
                  }
                  className="h-9 text-xs bg-clinical-dark border-clinical-border"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-clinical-zinc">
                Phone (rider will call)
              </Label>
              <Input
                placeholder="+91 98765 43210"
                inputMode="tel"
                value={form.phone}
                onChange={(e) =>
                  setForm({ ...form, phone: e.target.value })
                }
                className="h-9 text-xs bg-clinical-dark border-clinical-border"
              />
            </div>
            {error && (
              <p className="text-[11px] text-red-400" role="alert">
                {error}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={close}
              disabled={saving}
              className="border-clinical-border text-clinical-zinc hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold"
            >
              {saving ? "Saving…" : editing ? "Save changes" : "Add address"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
