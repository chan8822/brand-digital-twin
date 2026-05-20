import { useEffect, useMemo, useState } from "react";
import { Link, type MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Wellness Protocol | Tanmatra" },
  { name: "description", content: "Dietitian-designed meals and plans for everyday wellness, immune support, gut health, and sustainable healthy habits." },
  { property: "og:title", content: "Wellness Protocol | Tanmatra" },
  { property: "og:description", content: "Dietitian-designed meals for everyday wellness, immune support, and sustainable healthy habits." },
  { property: "og:image", content: "https://tanmatra.food/opengraph.jpg" },
];
import { ArrowLeft } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { API_BASE } from "@/lib/apiBase";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import SegmentToggle from "@/components/layout/SegmentToggle";
import {
  Apple,
  Activity,
  Award,
  Droplets,
  Flame,
  Leaf,
  Plus,
  RefreshCw,
  Trash2,
  Wheat,
  HeartPulse,
  Smartphone,
  Copy,
  Check,
  EyeOff,
  ArrowRight,
  Utensils,
  Stethoscope,
  CalendarDays,
} from "lucide-react";
import { toast } from "sonner";
import {
  wellnessApi,
  type DayTotals,
  type WellnessTodayResponse,
  type WellnessWeekResponse,
} from "@/lib/wellnessApi";
import { useMenuCatalog } from "@/lib/menuData";
import { dishesForProtocol, plansForProtocol, rdsForProtocol } from "@/lib/protocols";
import { RD_PLANS } from "@/lib/rdPlans";
import { RD_BOOKING } from "@/lib/rdBookingData";
import { TEAM } from "@/lib/teamData";
import { formatPrice } from "@/lib/api/adapter";

function clampPct(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)));
}

interface RingProps {
  label: string;
  value: number;
  target: number;
  unit: string;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
}

function Ring({ label, value, target, unit, color, icon: Icon }: RingProps) {
  const pct = clampPct(value, target);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-28 h-28">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            className="text-clinical-zinc-muted"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={color}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Icon className={`w-4 h-4 ${color}`} />
          <div className="text-white font-semibold text-sm mt-1">
            {Math.round(value)}
            <span className="text-clinical-zinc-muted text-[10px] ml-0.5">
              /{Math.round(target)}
            </span>
          </div>
          <div className="text-[9px] uppercase tracking-wider text-clinical-zinc-muted">
            {unit}
          </div>
        </div>
      </div>
      <div className="text-xs uppercase tracking-widest text-clinical-zinc-muted">
        {label}
      </div>
    </div>
  );
}

function WeekBars({
  data,
  field,
  target,
  color,
  label,
  unit,
}: {
  data: DayTotals[];
  field: keyof DayTotals;
  target: number;
  color: string;
  label: string;
  unit: string;
}) {
  const max = Math.max(target, ...data.map((d) => Number(d[field] ?? 0)));
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-widest text-clinical-zinc-muted">
          {label}
        </div>
        <div className="text-[10px] text-clinical-zinc-muted">
          target {target} {unit}
        </div>
      </div>
      <div className="flex items-end gap-2 h-24">
        {data.map((d) => {
          const v = Number(d[field] ?? 0);
          const pct = max > 0 ? (v / max) * 100 : 0;
          const hit = v >= target;
          const day = new Date(d.date + "T00:00:00").toLocaleDateString(
            undefined,
            { weekday: "narrow" },
          );
          return (
            <div
              key={d.date}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <div className="w-full h-full flex items-end">
                <div
                  className={`w-full rounded-t ${hit ? color : "bg-clinical-surface-elevated"}`}
                  style={{ height: `${Math.max(4, pct)}%` }}
                  title={`${d.date}: ${Math.round(v)} ${unit}`}
                />
              </div>
              <div className="text-[10px] text-clinical-zinc-muted">{day}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const WATER_PRESETS = [200, 250, 500];

type NumericField =
  | "calories"
  | "proteinGrams"
  | "fiberGrams"
  | "carbsGrams"
  | "fatGrams"
  | "vegServings";

interface ManualLogForm {
  label: string;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number;
  vegServings: number;
}

const NUMERIC_FIELDS: Array<{ key: NumericField; label: string }> = [
  { key: "calories", label: "kcal" },
  { key: "proteinGrams", label: "Protein g" },
  { key: "fiberGrams", label: "Fiber g" },
  { key: "carbsGrams", label: "Carbs g" },
  { key: "fatGrams", label: "Fat g" },
  { key: "vegServings", label: "Veg servings" },
];

function ManualLogDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ManualLogForm>({
    label: "",
    calories: 0,
    proteinGrams: 0,
    carbsGrams: 0,
    fatGrams: 0,
    fiberGrams: 0,
    vegServings: 0,
  });
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!form.label.trim()) {
      toast.error("Add a label so you remember what this was");
      return;
    }
    setSaving(true);
    try {
      await wellnessApi.log(form);
      toast.success("Logged");
      setForm({
        label: "",
        calories: 0,
        proteinGrams: 0,
        carbsGrams: 0,
        fatGrams: 0,
        fiberGrams: 0,
        vegServings: 0,
      });
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error(`Failed to log: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="bg-clinical-sage text-clinical-dark hover:bg-clinical-sage/90"
        >
          <Plus className="w-4 h-4 mr-1" /> Log meal
        </Button>
      </DialogTrigger>
      <DialogContent
        className="bg-clinical-dark border border-clinical-border text-white"
        aria-describedby="manual-log-help"
      >
        <DialogHeader>
          <DialogTitle>Log a meal or snack</DialogTitle>
        </DialogHeader>
        <p id="manual-log-help" className="sr-only">
          Add a quick meal or snack to today's wellness totals.
        </p>
        <div className="space-y-3">
          <div>
            <Label className="text-clinical-zinc-muted text-xs uppercase tracking-widest">
              What was it?
            </Label>
            <Input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="e.g. Greek yoghurt with berries"
              className="bg-clinical-surface-elevated border-clinical-border text-white"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {NUMERIC_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <Label className="text-clinical-zinc-muted text-[10px] uppercase tracking-widest">
                  {label}
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={form[key]}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      [key]: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                  className="bg-clinical-surface-elevated border-clinical-border text-white"
                />
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            className="text-clinical-zinc-muted"
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={saving}
            className="bg-clinical-sage text-clinical-dark hover:bg-clinical-sage/90"
          >
            {saving ? "Saving…" : "Save log"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WearableCard({
  data,
  refresh,
}: {
  data: WellnessTodayResponse;
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  // Consent confirmation: DPDP §6/§7 + HealthKit/Health Connect platform
  // policies require explicit, scoped, opt-in consent before reading
  // health/biometric data. The pendingProvider gates the actual API call
  // behind a clear disclosure of what's being read and how it's stored.
  const [pendingProvider, setPendingProvider] = useState<
    "apple_health" | "google_fit" | null
  >(null);
  const apple = data.wearables.find((w) => w.provider === "apple_health");
  const gfit = data.wearables.find((w) => w.provider === "google_fit");

  async function performConnect(provider: "apple_health" | "google_fit") {
    setBusy(true);
    try {
      await wellnessApi.connectWearable(provider);
      toast.success(
        `${provider === "apple_health" ? "Apple Health" : "Google Fit"} linked (web preview)`,
      );
      refresh();
    } catch (e) {
      toast.error(`Connect failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      setPendingProvider(null);
    }
  }

  async function sync(provider: "apple_health" | "google_fit") {
    setBusy(true);
    try {
      // Web cannot read native HealthKit/Fit data; simulate a daily activity
      // bump in the 200-450 kcal range so the dashboard reflects movement.
      const activityKcal = 200 + Math.floor(Math.random() * 250);
      const steps = 4000 + Math.floor(Math.random() * 6000);
      await wellnessApi.syncWearable(provider, activityKcal, steps);
      toast.success(`Synced (+${activityKcal} kcal target)`);
      refresh();
    } catch (e) {
      toast.error(`Sync failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function row(
    name: string,
    provider: "apple_health" | "google_fit",
    link: typeof apple,
  ) {
    const linked = link?.connected;
    return (
      <div className="flex items-center justify-between py-2 border-b border-clinical-border last:border-b-0">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-clinical-sage" />
          <div>
            <div className="text-sm text-white">{name}</div>
            <div className="text-[11px] text-clinical-zinc-muted">
              {linked
                ? link?.lastSyncedAt
                  ? `Last sync ${new Date(link.lastSyncedAt).toLocaleString()} · +${link.lastActivityKcal ?? 0} kcal`
                  : "Linked — pull to sync"
                : "Not connected"}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {linked ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => sync(provider)}
              className="border-clinical-border text-clinical-zinc-muted hover:text-white"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Sync
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => setPendingProvider(provider)}
              className="bg-clinical-sage text-clinical-dark hover:bg-clinical-sage/90"
            >
              Connect
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Consent dialog rendered at WearableCard level so both rows share it.
  const consentLabel =
    pendingProvider === "apple_health" ? "Apple Health" : "Google Fit / Health Connect";

  const consentDialog = (
    <AlertDialog
      open={pendingProvider !== null}
      onOpenChange={(open) => !open && setPendingProvider(null)}
    >
      <AlertDialogContent className="bg-clinical-surface border-clinical-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">
            Connect {consentLabel}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-clinical-zinc text-xs">
            Before we connect, here&apos;s exactly what we&apos;ll read and how
            it&apos;s used.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="text-xs text-clinical-zinc space-y-2 leading-relaxed">
          <li className="flex items-start gap-2">
            <span className="text-clinical-sage font-bold mt-0.5">·</span>
            <span>
              <strong className="text-white">Read only</strong>: daily step
              count and active calories burned. Nothing else — not heart rate,
              not sleep, not weight, not glucose, not location.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-clinical-sage font-bold mt-0.5">·</span>
            <span>
              <strong className="text-white">Stored encrypted</strong> on
              Tanmatra servers, accessible only to you and the registered
              dietitian you book a consult with.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-clinical-sage font-bold mt-0.5">·</span>
            <span>
              <strong className="text-white">Never shared</strong> with
              advertisers or third parties. Treated as sensitive personal
              data under the DPDP Act 2023.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-clinical-sage font-bold mt-0.5">·</span>
            <span>
              <strong className="text-white">Disconnect any time</strong> from
              this page. Erasure of historical readings is covered by the
              Privacy Policy.
            </span>
          </li>
        </ul>
        <p className="text-[10px] text-clinical-zinc-muted leading-snug">
          Full details:{" "}
          <Link to="/privacy" className="text-clinical-gold hover:underline">
            Privacy Policy → Health &amp; wearable data
          </Link>
          .
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11">
            Don&apos;t connect
          </AlertDialogCancel>
          <AlertDialogAction
            className="min-h-11 bg-clinical-sage text-clinical-dark hover:bg-clinical-sage/90"
            disabled={busy}
            onClick={() => {
              if (pendingProvider) void performConnect(pendingProvider);
            }}
          >
            I agree, connect
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return (
    <Card className="bg-clinical-surface-elevated border border-clinical-border">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-clinical-zinc-muted">
              Activity sync
            </div>
            <div className="text-white text-sm mt-1">
              Wearables adjust your calorie target based on movement.
            </div>
          </div>
          <Badge className="bg-clinical-surface-elevated text-clinical-zinc-muted border-clinical-border">
            Web preview
          </Badge>
        </div>
        {row("Apple Health", "apple_health", apple)}
        {row("Google Fit", "google_fit", gfit)}
        <p className="text-[10px] text-clinical-zinc-muted mt-3 leading-snug">
          We only read steps + active calories. See{" "}
          <Link to="/privacy" className="text-clinical-gold hover:underline">
            how wearable data is handled
          </Link>
          .
        </p>
      </CardContent>
      {consentDialog}
    </Card>
  );
}

interface MobileSession {
  id: string;
  label: string;
  createdAt: string | null;
  expiresAt: string;
}

function PairMobileCard() {
  const [token, setToken] = useState<string | null>(null);
  const [ttlMs, setTtlMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sessions, setSessions] = useState<MobileSession[]>([]);
  const [label, setLabel] = useState("");

  const apiBase = API_BASE;

  async function loadSessions() {
    try {
      const res = await fetch(`${apiBase}/auth/mobile-sessions`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const json = (await res.json()) as { sessions: MobileSession[] };
      setSessions(json.sessions);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function issueToken() {
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/auth/mobile-pair`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || undefined }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = (await res.json()) as { token: string; ttlMs: number };
      setToken(json.token);
      setTtlMs(json.ttlMs);
      // Auto-copy on issue so the user only taps once. Falls through silently
      // if the browser blocks clipboard access (e.g. insecure context); the
      // explicit Copy button below remains as a manual fallback.
      try {
        await navigator.clipboard.writeText(json.token);
        setCopied(true);
        toast.success("Token generated & copied to clipboard");
        setTimeout(() => setCopied(false), 2500);
      } catch {
        setCopied(false);
        toast.success("Token generated — tap Copy to copy it");
      }
      loadSessions();
    } catch (e) {
      toast.error(`Could not issue token: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string | "all") {
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/auth/mobile-sessions/revoke`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id === "all" ? { all: true } : { id }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = (await res.json()) as { revoked: number };
      toast.success(
        json.revoked === 1 ? "Device revoked" : `${json.revoked} devices revoked`,
      );
      loadSessions();
    } catch (e) {
      toast.error(`Revoke failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      toast.success("Token copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed — long-press to select");
    }
  }

  const masked = token
    ? `${token.slice(0, 6)}${"•".repeat(20)}${token.slice(-4)}`
    : "";

  return (
    <Card
      id="pair-device"
      className="bg-clinical-surface-elevated border border-clinical-border scroll-mt-20"
    >
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-clinical-sage" />
            <div>
              <div className="text-xs uppercase tracking-widest text-clinical-zinc-muted">
                Pair Tanmatra mobile
              </div>
              <div className="text-white text-sm mt-1">
                Stream Apple Health / Health Connect activity from your phone.
              </div>
            </div>
          </div>
        </div>

        {!token ? (
          <div className="space-y-3">
            <p className="text-[12px] text-clinical-zinc-muted leading-relaxed">
              Generate a pairing token, then paste it into the Tanmatra mobile
              app on your device. Each token is a dedicated mobile session
              (valid {Math.round((ttlMs ?? 7 * 24 * 60 * 60 * 1000) / (24 * 60 * 60 * 1000))} days)
              you can revoke separately from your web sign-in.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="Device label (e.g. iPhone 15)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="flex-1 bg-clinical-dark border-clinical-border text-white placeholder:text-clinical-zinc-muted text-sm"
              />
              <Button
                size="sm"
                disabled={busy}
                onClick={issueToken}
                className="bg-clinical-sage text-clinical-dark hover:bg-clinical-sage/90"
              >
                {busy ? "Generating…" : "Generate"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-stretch gap-2">
              <code className="flex-1 px-3 py-2 rounded-md bg-clinical-dark border border-clinical-border text-[12px] font-mono text-clinical-sage break-all">
                {masked}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={copy}
                className="border-clinical-border text-clinical-zinc-muted hover:text-white"
              >
                {copied ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setToken(null)}
                className="border-clinical-border text-clinical-zinc-muted hover:text-white"
                title="Hide"
              >
                <EyeOff className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[11px] text-clinical-zinc-muted leading-relaxed">
              Tap copy, open the Tanmatra mobile app, and paste into the
              pairing field. Treat this token like a password — anyone with it
              can post activity as you.
            </p>
          </div>
        )}

        {sessions.length > 0 && (
          <div className="mt-4 pt-4 border-t border-clinical-border">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] uppercase tracking-widest text-clinical-zinc-muted">
                Paired devices ({sessions.length})
              </div>
              {sessions.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => revoke("all")}
                  className="h-7 px-2 text-[11px] text-clinical-zinc-muted hover:text-white"
                >
                  Revoke all
                </Button>
              )}
            </div>
            <ul className="space-y-1">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between py-1.5 text-[12px]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-white truncate">{s.label}</div>
                    <div className="text-[10px] text-clinical-zinc-muted">
                      {s.createdAt
                        ? `Paired ${new Date(s.createdAt).toLocaleDateString()}`
                        : `Expires ${new Date(s.expiresAt).toLocaleDateString()}`}
                      {" · "}
                      <span className="font-mono">{s.id}</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => revoke(s.id)}
                    className="h-7 px-2 text-clinical-zinc-muted hover:text-red-400"
                    title="Revoke this device"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StreakBadge({
  label,
  current,
  best,
  icon: Icon,
}: {
  label: string;
  current: number;
  best: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="bg-clinical-surface-elevated border border-clinical-border">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-clinical-sage/15 flex items-center justify-center border border-clinical-sage/25">
          <Icon className="w-5 h-5 text-clinical-sage" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-clinical-zinc-muted">
            {label}
          </div>
          <div className="text-white text-lg font-semibold">
            {current} day{current === 1 ? "" : "s"}
          </div>
          <div className="text-[11px] text-clinical-zinc-muted">
            Best {best} day{best === 1 ? "" : "s"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProtocolActions() {
  const { dishes } = useMenuCatalog();
  const dishCount = useMemo(
    () => dishesForProtocol(dishes, "wellness").length,
    [dishes],
  );
  const planCount = useMemo(
    () => plansForProtocol(RD_PLANS, "wellness").length,
    [],
  );
  const rds = useMemo(() => rdsForProtocol(RD_BOOKING, "wellness"), []);
  const teamBySlug = useMemo(
    () => new Map(TEAM.map((m) => [m.slug, m])),
    [],
  );
  const samplePlan = useMemo(
    () => plansForProtocol(RD_PLANS, "wellness")[0],
    [],
  );

  return (
    <section className="border-b border-clinical-border bg-clinical-sage/5 py-10">
      <div className="max-w-7xl mx-auto px-4 space-y-6">
        <div className="flex items-center gap-2">
          <Leaf className="w-4 h-4 text-clinical-sage" />
          <Badge className="bg-clinical-sage/15 text-clinical-sage border-clinical-sage/30 text-[10px] tracking-widest uppercase">
            Wellness Protocol
          </Badge>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="bg-clinical-surface border-clinical-sage/30 hover:border-clinical-sage/60 transition-colors">
            <CardContent className="p-5 space-y-3 flex flex-col h-full">
              <div className="flex items-center gap-2">
                <Utensils className="w-4 h-4 text-clinical-sage" />
                <p className="text-[10px] uppercase tracking-widest text-clinical-sage">
                  Eat
                </p>
              </div>
              <h3 className="text-white text-lg font-semibold">
                {dishCount} wellness-aligned dishes
              </h3>
              <p className="text-xs text-clinical-zinc leading-relaxed flex-1">
                High-fibre, low-glycaemic plates with restrained sugar — the
                everyday building blocks of preventive nutrition.
              </p>
              <Link to="/menu?protocol=wellness">
                <Button className="w-full bg-clinical-sage text-clinical-dark hover:bg-clinical-sage/90 gap-2 h-10">
                  See wellness-aligned dishes
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="bg-clinical-surface border-clinical-sage/30 hover:border-clinical-sage/60 transition-colors">
            <CardContent className="p-5 space-y-3 flex flex-col h-full">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-clinical-sage" />
                <p className="text-[10px] uppercase tracking-widest text-clinical-sage">
                  Plan
                </p>
              </div>
              <h3 className="text-white text-lg font-semibold">
                {planCount} curated weekly plans
              </h3>
              {samplePlan && (
                <p className="text-xs text-clinical-zinc leading-relaxed flex-1">
                  Featuring{" "}
                  <span className="text-white font-medium">
                    {samplePlan.name}
                  </span>{" "}
                  — {samplePlan.calorieTargetPerDay} kcal · {samplePlan.proteinTargetGrams}g protein per day, from{" "}
                  {formatPrice(samplePlan.pricePerWeekPaise)}/wk.
                </p>
              )}
              <Link to="/plans?protocol=wellness">
                <Button
                  variant="outline"
                  className="w-full border-clinical-sage/40 text-clinical-sage hover:bg-clinical-sage/10 gap-2 h-10"
                >
                  Browse wellness plans
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="bg-clinical-surface border-clinical-sage/30 hover:border-clinical-sage/60 transition-colors">
            <CardContent className="p-5 space-y-3 flex flex-col h-full">
              <div className="flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-clinical-sage" />
                <p className="text-[10px] uppercase tracking-widest text-clinical-sage">
                  Talk
                </p>
              </div>
              <h3 className="text-white text-lg font-semibold">
                {rds.length} {rds.length === 1 ? "RD" : "RDs"} for wellness coaching
              </h3>
              {rds.length > 0 && (
                <p className="text-xs text-clinical-zinc leading-relaxed flex-1">
                  {rds
                    .slice(0, 2)
                    .map((rd) => teamBySlug.get(rd.slug)?.name ?? rd.slug)
                    .filter(Boolean)
                    .join(" · ")}{" "}
                  — first 15-min consult is free.
                </p>
              )}
              <Link to="/rd?protocol=wellness">
                <Button
                  variant="outline"
                  className="w-full border-clinical-sage/40 text-clinical-sage hover:bg-clinical-sage/10 gap-2 h-10"
                >
                  Book a wellness RD
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

export default function Wellness() {
  const qc = useQueryClient();

  const todayQ = useQuery({
    queryKey: ["wellness", "today"],
    queryFn: () => wellnessApi.today(),
    retry: false,
  });
  const weekQ = useQuery({
    queryKey: ["wellness", "week"],
    queryFn: () => wellnessApi.week(),
    retry: false,
  });

  const unauth =
    (todayQ.error && String(todayQ.error).includes("401")) ||
    (weekQ.error && String(weekQ.error).includes("401"));
  const loadError =
    !unauth &&
    ((todayQ.error && !String(todayQ.error).includes("401")) ||
      (weekQ.error && !String(weekQ.error).includes("401")));

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["wellness"] });
  }

  async function logWater(ml: number) {
    try {
      await wellnessApi.water(ml);
      toast.success(`+${ml} ml water`);
      refreshAll();
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    }
  }

  async function deleteLog(id: number) {
    try {
      await wellnessApi.deleteLog(id);
      toast.success("Removed");
      refreshAll();
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    }
  }

  const data = todayQ.data;
  const week = weekQ.data;

  return (
    <div className="min-h-screen bg-clinical-dark">
      <SegmentToggle />

      <div className="max-w-7xl mx-auto px-4 pt-3">
        <Link
          to="/challenges"
          className="inline-flex items-center gap-1.5 min-h-[36px] py-2 -ml-1 px-1 text-xs text-clinical-zinc hover:text-clinical-gold transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Community
        </Link>
      </div>

      <ProtocolActions />

      <section className="border-b border-clinical-border py-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-9 h-9 rounded-xl bg-clinical-sage/15 flex items-center justify-center border border-clinical-sage/25">
                  <HeartPulse className="w-4 h-4 text-clinical-sage" />
                </div>
                <Badge className="bg-clinical-sage/15 text-clinical-sage border-clinical-sage/30 text-[10px] tracking-widest uppercase">
                  Wellness Dashboard
                </Badge>
              </div>
              <h1 className="text-3xl md:text-4xl text-white font-semibold">
                Today's nutrition
              </h1>
              <p className="text-clinical-zinc-muted text-sm mt-1">
                Auto-logged from delivered orders. Manual entries and water
                count too.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={refreshAll}
                className="text-clinical-zinc-muted hover:text-white"
              >
                <RefreshCw className="w-4 h-4 mr-1" /> Refresh
              </Button>
              <ManualLogDialog onSaved={refreshAll} />
            </div>
          </div>

          {unauth ? (
            <Card className="mt-6 bg-clinical-surface-elevated border border-clinical-border">
              <CardContent className="p-6 text-center space-y-3">
                <p className="text-clinical-zinc-muted text-sm">
                  Sign in to track your daily nutrition, water, and streaks.
                </p>
                <Link to="/login?next=/wellness">
                  <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold h-10 px-5">
                    Sign in
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : loadError ? (
            <Card className="mt-6 bg-clinical-surface-elevated border border-clinical-border">
              <CardContent className="p-6 text-center space-y-3">
                <p className="text-clinical-zinc-muted text-sm">
                  Couldn't load your wellness dashboard.
                </p>
                <Button
                  onClick={refreshAll}
                  className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold h-10 px-5"
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : !data ? (
            <Card className="mt-6 bg-clinical-surface-elevated border border-clinical-border">
              <CardContent className="p-6 text-clinical-zinc-muted text-sm">
                Loading your dashboard…
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-clinical-surface-elevated border border-clinical-border">
                  <CardContent className="p-5 flex justify-center">
                    <Ring
                      label="Calories"
                      value={data.totals.calories}
                      target={
                        data.targets.effectiveCalorieTarget ??
                        data.targets.calorieTarget
                      }
                      unit="kcal"
                      color="text-clinical-sage"
                      icon={Flame}
                    />
                  </CardContent>
                </Card>
                <Card className="bg-clinical-surface-elevated border border-clinical-border">
                  <CardContent className="p-5 flex justify-center">
                    <Ring
                      label="Protein"
                      value={data.totals.proteinGrams}
                      target={data.targets.proteinTargetGrams}
                      unit="g"
                      color="text-amber-400"
                      icon={Apple}
                    />
                  </CardContent>
                </Card>
                <Card className="bg-clinical-surface-elevated border border-clinical-border">
                  <CardContent className="p-5 flex justify-center">
                    <Ring
                      label="Fiber"
                      value={data.totals.fiberGrams}
                      target={data.targets.fiberTargetGrams}
                      unit="g"
                      color="text-emerald-400"
                      icon={Wheat}
                    />
                  </CardContent>
                </Card>
                <Card className="bg-clinical-surface-elevated border border-clinical-border">
                  <CardContent className="p-5 flex flex-col items-center gap-3">
                    <Ring
                      label="Water"
                      value={data.totals.waterMl}
                      target={data.targets.waterTargetMl}
                      unit="ml"
                      color="text-sky-400"
                      icon={Droplets}
                    />
                    <div className="flex gap-1">
                      {WATER_PRESETS.map((ml) => (
                        <Button
                          key={ml}
                          size="sm"
                          variant="outline"
                          onClick={() => logWater(ml)}
                          className="border-sky-400/40 text-sky-300 hover:text-white hover:bg-sky-400/10 px-2 h-7 text-[11px]"
                        >
                          +{ml}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {(data.targets.activityKcal ?? 0) > 0 && (
                <div className="mt-3 text-xs text-clinical-zinc-muted">
                  Activity bump: +{data.targets.activityKcal} kcal added to
                  today's calorie target from your wearable.
                </div>
              )}

              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <StreakBadge
                  label="Protein streak"
                  current={data.streaks.protein?.currentDays ?? 0}
                  best={data.streaks.protein?.bestDays ?? 0}
                  icon={Award}
                />
                <StreakBadge
                  label="Veg-forward streak"
                  current={data.streaks.veg?.currentDays ?? 0}
                  best={data.streaks.veg?.bestDays ?? 0}
                  icon={Leaf}
                />
                <Card className="bg-clinical-surface-elevated border border-clinical-border">
                  <CardContent className="p-4">
                    <div className="text-xs uppercase tracking-widest text-clinical-zinc-muted">
                      Today's logs
                    </div>
                    <div className="text-white text-lg font-semibold mt-1">
                      {data.logs.length} entries
                    </div>
                    <div className="text-[11px] text-clinical-zinc-muted">
                      {
                        data.logs.filter((l) => l.source === "auto_order")
                          .length
                      }{" "}
                      from delivered orders
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      </section>

      {data && week && (
        <section className="border-b border-clinical-border py-10">
          <div className="max-w-7xl mx-auto px-4">
            <h2 className="text-white text-xl font-semibold mb-4">
              Last 7 days
            </h2>
            <Card className="bg-clinical-surface-elevated border border-clinical-border">
              <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                <WeekBars
                  data={week.days}
                  field="calories"
                  target={
                    week.targets.effectiveCalorieTarget ??
                    week.targets.calorieTarget
                  }
                  color="bg-clinical-sage"
                  label="Calories"
                  unit="kcal"
                />
                <WeekBars
                  data={week.days}
                  field="proteinGrams"
                  target={week.targets.proteinTargetGrams}
                  color="bg-amber-400"
                  label="Protein"
                  unit="g"
                />
                <WeekBars
                  data={week.days}
                  field="fiberGrams"
                  target={week.targets.fiberTargetGrams}
                  color="bg-emerald-400"
                  label="Fiber"
                  unit="g"
                />
                <WeekBars
                  data={week.days}
                  field="waterMl"
                  target={week.targets.waterTargetMl}
                  color="bg-sky-400"
                  label="Water"
                  unit="ml"
                />
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {data && (
        <section className="border-b border-clinical-border py-10">
          <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-clinical-surface-elevated border border-clinical-border">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs uppercase tracking-widest text-clinical-zinc-muted">
                    Today's entries
                  </div>
                  <ManualLogDialog onSaved={refreshAll} />
                </div>
                {data.logs.length === 0 ? (
                  <div className="text-clinical-zinc-muted text-sm py-6 text-center">
                    Nothing logged yet today. Order a meal or add one manually.
                  </div>
                ) : (
                  <ul className="divide-y divide-clinical-border">
                    {data.logs.map((log) => (
                      <li
                        key={log.id}
                        className="py-3 flex items-center justify-between"
                      >
                        <div>
                          <div className="text-white text-sm">{log.label}</div>
                          <div className="text-[11px] text-clinical-zinc-muted">
                            {log.source === "auto_order"
                              ? "From delivered order"
                              : log.source === "water"
                                ? "Water"
                                : "Manual"}{" "}
                            · {log.calories} kcal · P{log.proteinGrams}g · F
                            {log.fiberGrams}g
                            {log.waterMl > 0 ? ` · ${log.waterMl} ml` : ""}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteLog(log.id)}
                          className="text-clinical-zinc-muted hover:text-white"
                          aria-label="Delete log"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <WearableCard data={data} refresh={refreshAll} />
            <PairMobileCard />
          </div>
        </section>
      )}
    </div>
  );
}

export function WeeklySummaryCard() {
  const weekQ = useQuery({
    queryKey: ["wellness", "week"],
    queryFn: () => wellnessApi.week(),
    retry: false,
  });
  const week: WellnessWeekResponse | undefined = weekQ.data;

  const summary = useMemo(() => {
    if (!week) return null;
    const totals = week.days.reduce(
      (acc, d) => ({
        calories: acc.calories + d.calories,
        protein: acc.protein + d.proteinGrams,
        fiber: acc.fiber + d.fiberGrams,
        water: acc.water + d.waterMl,
      }),
      { calories: 0, protein: 0, fiber: 0, water: 0 },
    );
    const proteinHits = week.days.filter(
      (d) => d.proteinGrams >= week.targets.proteinTargetGrams,
    ).length;
    return { totals, proteinHits, days: week.days.length };
  }, [week]);

  if (!week || !summary || summary.totals.calories === 0) return null;

  return (
    <Card className="bg-clinical-surface-elevated border border-clinical-border">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-clinical-zinc">
              Your week so far
            </div>
            <div className="text-white text-lg font-semibold">
              {summary.proteinHits}/{summary.days} protein-target days
            </div>
          </div>
          <Link
            to="/wellness"
            className="text-clinical-sage text-xs uppercase tracking-widest hover:underline"
          >
            Open dashboard
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="text-white font-semibold">
              {Math.round(summary.totals.calories / Math.max(1, summary.days))}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-clinical-zinc">
              avg kcal
            </div>
          </div>
          <div>
            <div className="text-white font-semibold">
              {Math.round(summary.totals.protein / Math.max(1, summary.days))}g
            </div>
            <div className="text-[10px] uppercase tracking-widest text-clinical-zinc">
              avg protein
            </div>
          </div>
          <div>
            <div className="text-white font-semibold">
              {Math.round(summary.totals.fiber / Math.max(1, summary.days))}g
            </div>
            <div className="text-[10px] uppercase tracking-widest text-clinical-zinc">
              avg fiber
            </div>
          </div>
          <div>
            <div className="text-white font-semibold">
              {Math.round(summary.totals.water / Math.max(1, summary.days))} ml
            </div>
            <div className="text-[10px] uppercase tracking-widest text-clinical-zinc">
              avg water
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
