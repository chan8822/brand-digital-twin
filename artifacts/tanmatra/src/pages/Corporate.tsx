import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { corporateApi, type Company } from "@/lib/corporateApi";
import { formatPrice } from "@/lib/api/adapter";

export default function Corporate() {
  const nav = useNavigate();
  const [companies, setCompanies] = useState<
    Array<{ company: Company; role: string; status: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [budgetRupees, setBudgetRupees] = useState("3000");
  const [creating, setCreating] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    corporateApi
      .listMine()
      .then((r) => setCompanies(r.companies))
      .catch((e: Error) => {
        if (String(e.message).startsWith("401")) setUnauthorized(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Company name required");
      return;
    }
    const paise = Math.max(0, Math.round(Number(budgetRupees || 0) * 100));
    setCreating(true);
    try {
      const r = await corporateApi.createCompany(name.trim(), paise);
      toast.success(`${r.company.name} created`);
      nav(`/corporate/${r.company.slug}`);
    } catch {
      toast.error("Could not create company");
    } finally {
      setCreating(false);
    }
  };

  if (unauthorized) {
    return (
      <div className="max-w-2xl mx-auto p-6 sm:p-10 space-y-8">
        <div className="text-center space-y-3">
          <Building2 className="w-10 h-10 mx-auto text-clinical-gold" />
          <h1 className="text-3xl font-bold text-white">Corporate Plans</h1>
          <p className="text-sm text-clinical-zinc max-w-md mx-auto">
            Subsidize meals for your team, run office lunch programs, and gift wellness vouchers — all on a single monthly invoice.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { title: "Per-employee budgets", desc: "Set a monthly meal allowance employees redeem at checkout." },
            { title: "Office lunch programs", desc: "Schedule recurring team meals with one-click reorder." },
            { title: "Wellness vouchers", desc: "Gift one-off meals and RD consults for milestones or hires." },
          ].map((b) => (
            <div key={b.title} className="rounded-lg border border-clinical-border bg-clinical-surface p-4 space-y-1">
              <p className="text-sm font-semibold text-white">{b.title}</p>
              <p className="text-[11px] text-clinical-zinc">{b.desc}</p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-clinical-gold/30 bg-clinical-gold/5 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">Sign in to get started</p>
            <p className="text-xs text-clinical-zinc mt-1">
              Already an HR admin? Sign in to create your company workspace, invite teammates, and configure subsidies.
            </p>
          </div>
          <Button
            onClick={() => nav("/login?next=/corporate")}
            className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 shrink-0"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6 animate-in fade-in duration-500">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Building2 className="w-6 h-6 text-clinical-gold" /> Corporate Plans
        </h1>
        <p className="text-sm text-clinical-zinc">
          Subsidize meals for your team, run office lunch programs, and gift wellness vouchers.
        </p>
      </div>

      <Card className="bg-clinical-surface border-clinical-border">
        <CardContent className="p-5 space-y-3">
          <h2 className="text-sm font-semibold text-white">Your companies</h2>
          {loading ? (
            <p className="text-xs text-clinical-zinc">Loading…</p>
          ) : companies.length === 0 ? (
            <p className="text-xs text-clinical-zinc">
              You're not part of any company yet. Create one below or accept an invite from your admin.
            </p>
          ) : (
            <div className="space-y-2">
              {companies.map(({ company, role }) => (
                <Link
                  key={company.id}
                  to={`/corporate/${company.slug}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-clinical-border bg-clinical-dark hover:border-clinical-gold/40 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{company.name}</p>
                    <p className="text-[10px] text-clinical-zinc">
                      {role.toUpperCase()} · Budget {formatPrice(company.perEmployeeMonthlyBudgetPaise)}/mo per employee
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-clinical-gold" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-clinical-surface border-clinical-border">
        <CardContent className="p-5 space-y-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Plus className="w-4 h-4 text-clinical-gold" /> Create a company
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] text-clinical-zinc">Company name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Inc."
                className="h-9 text-xs bg-clinical-dark border-clinical-border"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-clinical-zinc">
                Monthly budget per employee (Rs.)
              </Label>
              <Input
                type="number"
                value={budgetRupees}
                onChange={(e) => setBudgetRupees(e.target.value)}
                className="h-9 text-xs bg-clinical-dark border-clinical-border"
              />
            </div>
          </div>
          <Button
            onClick={handleCreate}
            disabled={creating}
            className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90"
          >
            {creating ? "Creating…" : "Create company"}
          </Button>
        </CardContent>
      </Card>

      <div className="text-xs text-clinical-zinc">
        Looking for vouchers?{" "}
        <Link to="/vouchers" className="text-clinical-gold underline">
          Buy or redeem a wellness voucher
        </Link>
        .
      </div>
    </div>
  );
}
