import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Sparkles,
  RefreshCw,
  Replace,
  Check,
  Trash2,
  Wallet,
  Flame,
  Drumstick,
  Settings,
  CalendarDays,
} from "lucide-react";
import {
  mealPlanApi,
  formatPaise,
  formatDay,
  type MealPlan,
  type MealPlanSettings,
  type MealPlanSlot,
  type MealPlanSlotEntry,
  type WeekDayCalendarKind,
} from "@/lib/mealPlanApi";

const CALENDAR_KINDS: WeekDayCalendarKind[] = ["normal", "gym", "travel", "wfh"];
const CALENDAR_LABEL: Record<WeekDayCalendarKind, string> = {
  normal: "Normal",
  gym: "Gym",
  travel: "Travel",
  wfh: "WFH",
};
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const SLOTS: MealPlanSlot[] = ["breakfast", "lunch", "dinner"];
const SLOT_LABEL: Record<MealPlanSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

export default function WeeklyPlanner() {
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [activePlan, setActivePlan] = useState<MealPlan | null>(null);
  const [settings, setSettings] = useState<MealPlanSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [busyDay, setBusyDay] = useState<number | null>(null);
  const [swapDialog, setSwapDialog] = useState<{
    dayIndex: number;
    slot: MealPlanSlot;
    suggestions: MealPlanSlotEntry[];
    loading: boolean;
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [weekCalendar, setWeekCalendar] = useState<WeekDayCalendarKind[]>(
    () => Array<WeekDayCalendarKind>(7).fill("normal"),
  );

  const cycleCalendar = (i: number) => {
    setWeekCalendar((prev) => {
      const next = [...prev];
      const cur = next[i] ?? "normal";
      const idx = CALENDAR_KINDS.indexOf(cur);
      next[i] = CALENDAR_KINDS[(idx + 1) % CALENDAR_KINDS.length]!;
      return next;
    });
  };
  const [settingsDraft, setSettingsDraft] = useState<{
    autoReplanEnabled: boolean;
    weeklyBudgetRupees: string;
    maxRepetitionsPerDish: number;
  }>({
    autoReplanEnabled: false,
    weeklyBudgetRupees: "",
    maxRepetitionsPerDish: 2,
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [{ plans }, { settings }] = await Promise.all([
        mealPlanApi.listPlans(),
        mealPlanApi.getSettings(),
      ]);
      setPlans(plans);
      setSettings(settings);
      const draftOrLatest =
        plans.find((p) => p.status === "draft") ?? plans[0] ?? null;
      setActivePlan(draftOrLatest);
    } catch (err) {
      toast.error("Could not load meal plans");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!settings) return;
    setSettingsDraft({
      autoReplanEnabled: settings.autoReplanEnabled,
      weeklyBudgetRupees:
        settings.weeklyBudgetPaise != null
          ? String(Math.round(settings.weeklyBudgetPaise / 100))
          : "",
      maxRepetitionsPerDish: settings.maxRepetitionsPerDish,
    });
  }, [settings]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { plan, usedFallback } = await mealPlanApi.generate({
        overrides: { weekCalendar },
      });
      setActivePlan(plan);
      setPlans((prev) => {
        const without = prev.filter((p) => p.id !== plan.id);
        return [plan, ...without];
      });
      toast.success(
        usedFallback
          ? "Plan generated using rule-based fallback."
          : "Personalized weekly plan ready!",
      );
    } catch (err) {
      toast.error("Could not generate plan");
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenDay = async (dayIndex: number) => {
    if (!activePlan) return;
    setBusyDay(dayIndex);
    try {
      const { plan } = await mealPlanApi.regenerateDay(activePlan.id, dayIndex);
      setActivePlan(plan);
      toast.success("Day refreshed");
    } catch (err) {
      toast.error((err as Error).message || "Could not regenerate day");
    } finally {
      setBusyDay(null);
    }
  };

  const openSwap = async (dayIndex: number, slot: MealPlanSlot) => {
    if (!activePlan) return;
    setSwapDialog({ dayIndex, slot, suggestions: [], loading: true });
    try {
      const { suggestions } = await mealPlanApi.swapSuggestions(
        activePlan.id,
        dayIndex,
        slot,
      );
      setSwapDialog({ dayIndex, slot, suggestions, loading: false });
    } catch (err) {
      toast.error("Could not load swap options");
      setSwapDialog(null);
      console.error(err);
    }
  };

  const handleSwap = async (dishId: number) => {
    if (!activePlan || !swapDialog) return;
    try {
      const { plan } = await mealPlanApi.swapSlot(
        activePlan.id,
        swapDialog.dayIndex,
        swapDialog.slot,
        dishId,
      );
      setActivePlan(plan);
      setSwapDialog(null);
      toast.success("Swapped");
    } catch (err) {
      toast.error((err as Error).message || "Swap rejected");
    }
  };

  const handleAccept = async () => {
    if (!activePlan) return;
    try {
      const result = await mealPlanApi.accept(activePlan.id);
      setActivePlan(result.plan);
      setPlans((prev) =>
        prev.map((p) => (p.id === result.plan.id ? result.plan : p)),
      );
      if (result.subscriptionId) {
        toast.success(
          `Plan accepted — ${result.deliveryIds.length} deliveries scheduled.`,
        );
      } else {
        toast.success(
          "Plan accepted. Start a weekly subscription to schedule deliveries.",
        );
      }
    } catch (err) {
      toast.error((err as Error).message || "Could not accept plan");
    }
  };

  const handleDiscard = async () => {
    if (!activePlan) return;
    try {
      const { plan } = await mealPlanApi.discard(activePlan.id);
      setActivePlan(plan);
      setPlans((prev) => prev.map((p) => (p.id === plan.id ? plan : p)));
      toast.success("Plan discarded");
    } catch (err) {
      toast.error((err as Error).message || "Could not discard");
    }
  };

  const saveSettings = async () => {
    const budgetRupees = settingsDraft.weeklyBudgetRupees.trim();
    const patch = {
      autoReplanEnabled: settingsDraft.autoReplanEnabled,
      weeklyBudgetPaise:
        budgetRupees === "" ? null : Math.round(Number(budgetRupees) * 100),
      maxRepetitionsPerDish: settingsDraft.maxRepetitionsPerDish,
    };
    if (
      patch.weeklyBudgetPaise !== null &&
      (!Number.isFinite(patch.weeklyBudgetPaise) ||
        patch.weeklyBudgetPaise < 0)
    ) {
      toast.error("Invalid budget");
      return;
    }
    try {
      const { settings } = await mealPlanApi.updateSettings(patch);
      setSettings(settings);
      setSettingsOpen(false);
      toast.success("Settings saved");
    } catch (err) {
      toast.error((err as Error).message || "Could not save settings");
    }
  };

  const isDraft = activePlan?.status === "draft";

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-3xl font-semibold text-clinical-cream flex items-center gap-3">
            <Sparkles className="h-7 w-7 text-clinical-gold" />
            Weekly Meal Planner
          </h1>
          <p className="text-clinical-zinc mt-1 max-w-xl">
            A personalized 7-day plan tuned to your goals, diet, allergens and
            budget. Swap, regenerate or accept — accepting schedules the week on
            your active weekly subscription.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setSettingsOpen(true)}
            data-testid="button-meal-plan-settings"
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={generating}
            data-testid="button-generate-plan"
          >
            {generating ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {activePlan ? "Regenerate week" : "Generate plan"}
          </Button>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-12 text-center text-clinical-zinc">
            Loading…
          </CardContent>
        </Card>
      ) : !activePlan ? (
        <Card>
          <CardContent className="p-12 text-center">
            <CalendarDays className="h-12 w-12 mx-auto text-clinical-zinc mb-3" />
            <h2 className="text-xl font-medium text-clinical-cream mb-2">
              No plan yet
            </h2>
            <p className="text-clinical-zinc mb-4">
              Generate your first 7-day plan tailored to your preferences.
            </p>
            <Button onClick={handleGenerate} disabled={generating}>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate plan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-3">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <CalendarDays className="h-4 w-4 text-clinical-zinc" />
                <span className="text-xs text-clinical-zinc">
                  Week calendar (tap a day to mark gym/travel/WFH — applied next time you regenerate)
                </span>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {weekCalendar.map((kind, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => cycleCalendar(i)}
                    className="flex flex-col items-center gap-0.5 p-1 rounded border border-clinical-zinc/20 hover:border-clinical-cream/40"
                    data-testid={`button-calendar-${i}`}
                  >
                    <span className="text-xs text-clinical-zinc">{DAY_LABELS[i]}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {CALENDAR_LABEL[kind]}
                    </Badge>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
          <PlanSummary plan={activePlan} />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
            {activePlan.days.map((day, idx) => (
              <DayCard
                key={day.date}
                day={day}
                dayIndex={idx}
                editable={isDraft}
                busy={busyDay === idx}
                onRegenerate={() => handleRegenDay(idx)}
                onSwap={(slot) => openSwap(idx, slot)}
              />
            ))}
          </div>

          {isDraft ? (
            <div className="flex gap-3 justify-end mt-6">
              <Button
                variant="outline"
                onClick={handleDiscard}
                data-testid="button-discard-plan"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Discard
              </Button>
              <Button onClick={handleAccept} data-testid="button-accept-plan">
                <Check className="h-4 w-4 mr-2" />
                Accept &amp; schedule
              </Button>
            </div>
          ) : (
            <div className="mt-6 text-center text-clinical-zinc text-sm">
              Status:{" "}
              <Badge variant="outline" className="ml-1">
                {activePlan.status}
              </Badge>
            </div>
          )}

          {plans.length > 1 ? (
            <div className="mt-10">
              <h3 className="text-clinical-cream font-medium mb-2">
                Recent plans
              </h3>
              <div className="flex flex-wrap gap-2">
                {plans.map((p) => (
                  <Button
                    key={p.id}
                    size="sm"
                    variant={
                      p.id === activePlan.id ? "default" : "outline"
                    }
                    onClick={() => setActivePlan(p)}
                  >
                    {formatDay(p.weekStartDate)} · {p.status}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}

      <Dialog
        open={swapDialog !== null}
        onOpenChange={(open) => !open && setSwapDialog(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Swap{" "}
              {swapDialog ? SLOT_LABEL[swapDialog.slot] : ""}
            </DialogTitle>
          </DialogHeader>
          {swapDialog?.loading ? (
            <p className="text-clinical-zinc text-center py-8">Loading…</p>
          ) : swapDialog && swapDialog.suggestions.length === 0 ? (
            <p className="text-clinical-zinc text-center py-8">
              No safe alternatives match your constraints.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
              {swapDialog?.suggestions.map((s) => (
                <button
                  key={s.dishId}
                  type="button"
                  onClick={() => handleSwap(s.dishId)}
                  className="text-left p-3 rounded-lg border border-clinical-zinc/30 hover:border-clinical-gold/60 hover:bg-clinical-gold/5 transition"
                  data-testid={`button-swap-${s.dishId}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-clinical-cream">
                      {s.name}
                    </div>
                    <div className="text-clinical-gold font-medium">
                      {formatPaise(s.pricePaise)}
                    </div>
                  </div>
                  <div className="text-xs text-clinical-zinc mt-1">
                    {s.calories} kcal · {s.protein}g protein
                  </div>
                </button>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSwapDialog(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Meal planner settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-clinical-cream">Auto-replan weekly</Label>
                <p className="text-xs text-clinical-zinc">
                  We'll draft next week's plan automatically (you still confirm).
                </p>
              </div>
              <Switch
                checked={settingsDraft.autoReplanEnabled}
                onCheckedChange={(v) =>
                  setSettingsDraft((d) => ({ ...d, autoReplanEnabled: v }))
                }
                data-testid="switch-auto-replan"
              />
            </div>
            <div>
              <Label htmlFor="budget" className="text-clinical-cream">
                Weekly budget (₹)
              </Label>
              <Input
                id="budget"
                type="number"
                min={0}
                placeholder="No limit"
                value={settingsDraft.weeklyBudgetRupees}
                onChange={(e) =>
                  setSettingsDraft((d) => ({
                    ...d,
                    weeklyBudgetRupees: e.target.value,
                  }))
                }
                data-testid="input-weekly-budget"
              />
            </div>
            <div>
              <Label htmlFor="repeat" className="text-clinical-cream">
                Max repetitions per dish (per week)
              </Label>
              <Input
                id="repeat"
                type="number"
                min={1}
                max={7}
                value={settingsDraft.maxRepetitionsPerDish}
                onChange={(e) =>
                  setSettingsDraft((d) => ({
                    ...d,
                    maxRepetitionsPerDish: Math.max(
                      1,
                      Math.min(7, Number(e.target.value) || 1),
                    ),
                  }))
                }
                data-testid="input-max-repetitions"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveSettings} data-testid="button-save-settings">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlanSummary({ plan }: { plan: MealPlan }) {
  const c = plan.constraints;
  const t = plan.totals;
  return (
    <Card>
      <CardContent className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <div className="text-xs text-clinical-zinc">Week of</div>
          <div className="text-clinical-cream font-medium">
            {formatDay(plan.weekStartDate)}
          </div>
        </div>
        <div>
          <div className="text-xs text-clinical-zinc flex items-center gap-1">
            <Wallet className="h-3 w-3" /> Total
          </div>
          <div className="text-clinical-cream font-medium">
            {t ? formatPaise(t.totalPaise) : "—"}
            {c.weeklyBudgetPaise != null ? (
              <span className="text-clinical-zinc text-sm">
                {" "}
                / {formatPaise(c.weeklyBudgetPaise)}
              </span>
            ) : null}
          </div>
        </div>
        <div>
          <div className="text-xs text-clinical-zinc flex items-center gap-1">
            <Flame className="h-3 w-3" /> Avg kcal/day
          </div>
          <div className="text-clinical-cream font-medium">
            {t?.avgCalories ?? "—"}
            {c.dailyCalorieTarget ? (
              <span className="text-clinical-zinc text-sm">
                {" "}
                / {c.dailyCalorieTarget}
              </span>
            ) : null}
          </div>
        </div>
        <div>
          <div className="text-xs text-clinical-zinc flex items-center gap-1">
            <Drumstick className="h-3 w-3" /> Avg protein/day
          </div>
          <div className="text-clinical-cream font-medium">
            {t?.avgProteinGrams ?? "—"}g
            {c.dailyProteinTargetGrams ? (
              <span className="text-clinical-zinc text-sm">
                {" "}
                / {c.dailyProteinTargetGrams}g
              </span>
            ) : null}
          </div>
        </div>
        {c.allergens.length > 0 ? (
          <div className="col-span-2 md:col-span-4">
            <div className="text-xs text-clinical-zinc mb-1">Avoiding</div>
            <div className="flex flex-wrap gap-1">
              {c.allergens.map((a) => (
                <Badge key={a} variant="outline" className="text-xs">
                  {a}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DayCard({
  day,
  dayIndex,
  editable,
  busy,
  onRegenerate,
  onSwap,
}: {
  day: { date: string } & Record<MealPlanSlot, MealPlanSlotEntry>;
  dayIndex: number;
  editable: boolean;
  busy: boolean;
  onRegenerate: () => void;
  onSwap: (slot: MealPlanSlot) => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-medium text-clinical-cream">
            {formatDay(day.date)}
          </div>
          {editable ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRegenerate}
              disabled={busy}
              data-testid={`button-regen-day-${dayIndex}`}
            >
              <RefreshCw
                className={`h-3 w-3 mr-1 ${busy ? "animate-spin" : ""}`}
              />
              Regen
            </Button>
          ) : null}
        </div>
        <div className="space-y-2">
          {SLOTS.map((slot) => {
            const entry = day[slot];
            return (
              <div
                key={slot}
                className="flex items-start justify-between gap-2 p-2 rounded border border-clinical-zinc/20"
              >
                <div className="min-w-0">
                  <div className="text-xs text-clinical-zinc">
                    {SLOT_LABEL[slot]}
                  </div>
                  {entry ? (
                    <>
                      <div className="text-clinical-cream text-sm font-medium truncate">
                        {entry.name}
                      </div>
                      <div className="text-xs text-clinical-zinc">
                        {entry.calories} kcal · {entry.protein}g · {formatPaise(entry.pricePaise)}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-clinical-amber italic">
                      No dish picked — try Swap or Regen
                    </div>
                  )}
                </div>
                {editable ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0"
                    onClick={() => onSwap(slot)}
                    data-testid={`button-swap-${dayIndex}-${slot}`}
                  >
                    <Replace className="h-3 w-3" />
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
