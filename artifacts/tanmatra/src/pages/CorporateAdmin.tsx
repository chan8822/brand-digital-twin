import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Building2,
  Mail,
  Users,
  Wallet,
  Trash2,
  Copy,
  CalendarClock,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  corporateApi,
  type Company,
  type CompanyMember,
  type OfficeOrder,
} from "@/lib/corporateApi";
import { formatPrice } from "@/lib/api/adapter";

export default function CorporateAdmin() {
  const { slug = "" } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const [data, setData] = useState<{
    company: Company;
    members: CompanyMember[];
    membership: CompanyMember;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [budgetRupees, setBudgetRupees] = useState("");
  const [officeOrders, setOfficeOrders] = useState<OfficeOrder[]>([]);

  // Office order form
  const [ooTitle, setOoTitle] = useState("Team lunch");
  const [ooBudget, setOoBudget] = useState("400");
  const [ooLine, setOoLine] = useState("");
  const [ooCity, setOoCity] = useState("Bengaluru");
  const [ooPincode, setOoPincode] = useState("");

  const refresh = async () => {
    try {
      const r = await corporateApi.getCompany(slug);
      setData({
        company: r.company,
        members: r.members,
        membership: r.membership,
      });
      setBudgetRupees(String(r.company.perEmployeeMonthlyBudgetPaise / 100));
      const o = await corporateApi.listOfficeOrders(slug);
      setOfficeOrders(o.officeOrders);
    } catch (e) {
      toast.error("Could not load company");
      nav("/corporate");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (loading || !data) {
    return <div className="p-6 text-sm text-clinical-zinc">Loading…</div>;
  }

  const isAdmin = data.membership.role === "admin";

  const handleInvite = async () => {
    if (!inviteEmail.includes("@")) {
      toast.error("Valid email required");
      return;
    }
    try {
      const r = await corporateApi.invite(slug, inviteEmail.trim());
      const url = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}${r.inviteUrl}`;
      await navigator.clipboard.writeText(url).catch(() => undefined);
      toast.success(`Invite sent — link copied to clipboard`);
      setInviteEmail("");
      refresh();
    } catch {
      toast.error("Could not send invite");
    }
  };

  const handleRemove = async (memberId: number) => {
    try {
      await corporateApi.removeMember(slug, memberId);
      toast.success("Member removed");
      refresh();
    } catch {
      toast.error("Could not remove member");
    }
  };

  const handleBudget = async () => {
    const paise = Math.max(0, Math.round(Number(budgetRupees || 0) * 100));
    try {
      await corporateApi.updateBudget(slug, paise);
      toast.success("Budget updated");
      refresh();
    } catch {
      toast.error("Could not update budget");
    }
  };

  const handleCreateOfficeOrder = async () => {
    const budget = Math.max(0, Math.round(Number(ooBudget || 0) * 100));
    if (!ooLine.trim() || !ooPincode.trim()) {
      toast.error("Address required");
      return;
    }
    const scheduledFor = new Date();
    scheduledFor.setDate(scheduledFor.getDate() + 1);
    scheduledFor.setHours(13, 0, 0, 0);
    const windowClosesAt = new Date(scheduledFor);
    windowClosesAt.setHours(scheduledFor.getHours() - 3);
    try {
      await corporateApi.createOfficeOrder({
        companySlug: slug,
        title: ooTitle,
        scheduledFor: scheduledFor.toISOString(),
        windowClosesAt: windowClosesAt.toISOString(),
        perEmployeeBudgetPaise: budget,
        address: {
          line: ooLine.trim(),
          city: ooCity.trim(),
          pincode: ooPincode.trim(),
        },
      });
      toast.success("Office lunch scheduled");
      setOoLine("");
      setOoPincode("");
      refresh();
    } catch {
      toast.error("Could not schedule office lunch");
    }
  };

  const totalSpent = data.members.reduce(
    (s, m) => s + (m.spentThisMonthPaise ?? 0),
    0,
  );
  const activeCount = data.members.filter((m) => m.status === "active").length;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-5 animate-in fade-in duration-500">
      <div className="space-y-1">
        <Link
          to="/corporate"
          className="text-[10px] text-clinical-zinc hover:text-clinical-gold"
        >
          ← All companies
        </Link>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Building2 className="w-6 h-6 text-clinical-gold" />
          {data.company.name}
        </h1>
        <p className="text-xs text-clinical-zinc">
          {isAdmin ? "Admin console" : "Member view"} · Slug: {data.company.slug}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-clinical-surface border-clinical-slate/20">
          <CardContent className="p-4">
            <p className="text-[10px] text-clinical-zinc">Active members</p>
            <p className="text-xl font-bold text-white">{activeCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-clinical-surface border-clinical-slate/20">
          <CardContent className="p-4">
            <p className="text-[10px] text-clinical-zinc">Spent this month</p>
            <p className="text-xl font-bold text-white">{formatPrice(totalSpent)}</p>
          </CardContent>
        </Card>
        <Card className="bg-clinical-surface border-clinical-slate/20">
          <CardContent className="p-4">
            <p className="text-[10px] text-clinical-zinc">Budget / employee</p>
            <p className="text-xl font-bold text-clinical-gold">
              {formatPrice(data.company.perEmployeeMonthlyBudgetPaise)}
            </p>
          </CardContent>
        </Card>
      </div>

      {isAdmin && (
        <Card className="bg-clinical-surface border-clinical-slate/20">
          <CardContent className="p-5 space-y-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Wallet className="w-4 h-4 text-clinical-gold" /> Per-employee monthly budget
            </h2>
            <div className="flex gap-2">
              <Input
                type="number"
                value={budgetRupees}
                onChange={(e) => setBudgetRupees(e.target.value)}
                className="h-9 text-xs bg-clinical-dark border-clinical-slate/30 max-w-[200px]"
              />
              <Button onClick={handleBudget} className="bg-clinical-gold text-[#050505]">
                Update
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-clinical-surface border-clinical-slate/20">
        <CardContent className="p-5 space-y-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-clinical-gold" /> Members
          </h2>
          {isAdmin && (
            <div className="flex gap-2">
              <Input
                placeholder="employee@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="h-9 text-xs bg-clinical-dark border-clinical-slate/30"
              />
              <Button onClick={handleInvite} className="bg-clinical-gold text-[#050505]">
                <Mail className="w-3.5 h-3.5 mr-1" /> Invite
              </Button>
            </div>
          )}
          <div className="space-y-2">
            {data.members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between p-2 rounded-md border border-clinical-slate/20 bg-clinical-dark"
              >
                <div className="min-w-0">
                  <p className="text-xs text-white truncate">{m.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[9px] capitalize">
                      {m.role}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-[9px] capitalize ${
                        m.status === "active"
                          ? "border-clinical-sage/40 text-clinical-sage"
                          : m.status === "invited"
                            ? "border-clinical-gold/40 text-clinical-gold"
                            : "border-clinical-slate/40 text-clinical-zinc"
                      }`}
                    >
                      {m.status}
                    </Badge>
                    <span className="text-[9px] text-clinical-zinc">
                      Spent {formatPrice(m.spentThisMonthPaise ?? 0)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {m.status === "invited" && m.inviteToken && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px]"
                      onClick={async () => {
                        const url = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/corporate/invite/${m.inviteToken}`;
                        await navigator.clipboard.writeText(url).catch(() => undefined);
                        toast.success("Invite link copied");
                      }}
                    >
                      <Copy className="w-3 h-3 mr-1" /> Copy link
                    </Button>
                  )}
                  {isAdmin &&
                    m.userId !== data.company.ownerUserId &&
                    m.status !== "removed" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-red-400 hover:text-red-300"
                        onClick={() => handleRemove(m.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-clinical-surface border-clinical-slate/20">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-clinical-gold" /> Office lunch
            </h2>
            <Link
              to={`/corporate/${slug}/lunch-planner`}
              className="text-xs text-clinical-gold underline"
            >
              Open weekly planner →
            </Link>
          </div>
          {isAdmin && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-clinical-zinc">Title</Label>
                  <Input
                    value={ooTitle}
                    onChange={(e) => setOoTitle(e.target.value)}
                    className="h-9 text-xs bg-clinical-dark border-clinical-slate/30"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-clinical-zinc">
                    Per-employee budget (₹)
                  </Label>
                  <Input
                    type="number"
                    value={ooBudget}
                    onChange={(e) => setOoBudget(e.target.value)}
                    className="h-9 text-xs bg-clinical-dark border-clinical-slate/30"
                  />
                </div>
              </div>
              <Input
                placeholder="Office address"
                value={ooLine}
                onChange={(e) => setOoLine(e.target.value)}
                className="h-9 text-xs bg-clinical-dark border-clinical-slate/30"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="City"
                  value={ooCity}
                  onChange={(e) => setOoCity(e.target.value)}
                  className="h-9 text-xs bg-clinical-dark border-clinical-slate/30"
                />
                <Input
                  placeholder="Pincode"
                  value={ooPincode}
                  onChange={(e) => setOoPincode(e.target.value)}
                  className="h-9 text-xs bg-clinical-dark border-clinical-slate/30"
                />
              </div>
              <Button
                onClick={handleCreateOfficeOrder}
                className="bg-clinical-gold text-[#050505]"
              >
                Schedule for tomorrow 1pm
              </Button>
              <Separator className="bg-clinical-slate/20" />
            </>
          )}
          {officeOrders.length === 0 ? (
            <p className="text-xs text-clinical-zinc">No office lunches yet.</p>
          ) : (
            <div className="space-y-2">
              {officeOrders.map((o) => (
                <Link
                  key={o.id}
                  to={`/office-lunch/${o.id}`}
                  className="flex items-center justify-between p-3 rounded-md border border-clinical-slate/20 bg-clinical-dark hover:border-clinical-gold/40"
                >
                  <div>
                    <p className="text-xs font-medium text-white">{o.title}</p>
                    <p className="text-[10px] text-clinical-zinc">
                      {new Date(o.scheduledFor).toLocaleString("en-IN", {
                        weekday: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {" · "}
                      {o.picks.length} picks · {formatPrice(o.totalPaise)} · {o.status}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-clinical-gold" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
