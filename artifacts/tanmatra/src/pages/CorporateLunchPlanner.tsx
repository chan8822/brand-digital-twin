import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  b2bPlannerApi,
  type LunchPlanProposal,
  type TeamDietConstraints,
  type TeamDietProfile,
} from "@/lib/b2bPlannerApi";

const ALLERGENS = [
  "peanut",
  "tree_nut",
  "milk",
  "egg",
  "wheat",
  "gluten",
  "soy",
  "shellfish",
  "fish",
  "sesame",
];

const EMPTY: TeamDietConstraints = {
  headcount: 10,
  vegPct: 0,
  vegCount: 6,
  veganCount: 1,
  glutenFreeCount: 0,
  jainCount: 0,
  halalCount: 0,
  allergens: [],
  cuisinePrefs: [],
  calorieFloor: null,
  calorieCeiling: null,
  notes: "",
};

export default function CorporateLunchPlanner() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [profile, setProfile] = useState<TeamDietProfile | null>(null);
  const [form, setForm] = useState<TeamDietConstraints>(EMPTY);
  const [cuisineInput, setCuisineInput] = useState("");
  const [proposal, setProposal] = useState<LunchPlanProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, c] = await Promise.all([
          b2bPlannerApi.getDietProfile(slug),
          b2bPlannerApi.getCurrentPlan(slug),
        ]);
        if (cancelled) return;
        if (p.profile) {
          setProfile(p.profile);
          setForm(p.profile.constraints);
        }
        setProposal(c.proposal);
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const remainingNonVeg = useMemo(
    () => Math.max(0, form.headcount - form.vegCount),
    [form.headcount, form.vegCount],
  );

  const toggleAllergen = (a: string) =>
    setForm((f) => ({
      ...f,
      allergens: f.allergens.includes(a)
        ? f.allergens.filter((x) => x !== a)
        : [...f.allergens, a],
    }));

  const addCuisine = () => {
    const v = cuisineInput.trim().toLowerCase();
    if (!v) return;
    if (form.cuisinePrefs.includes(v)) return;
    setForm((f) => ({ ...f, cuisinePrefs: [...f.cuisinePrefs, v] }));
    setCuisineInput("");
  };
  const removeCuisine = (c: string) =>
    setForm((f) => ({
      ...f,
      cuisinePrefs: f.cuisinePrefs.filter((x) => x !== c),
    }));

  const onSave = async () => {
    setSaving(true);
    try {
      const r = await b2bPlannerApi.saveDietProfile(slug, form);
      setProfile(r.profile);
      setForm(r.profile.constraints);
      toast.success("Diet profile saved");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onGenerate = async () => {
    setGenerating(true);
    try {
      const r = await b2bPlannerApi.generatePlan(slug);
      setProposal(r.proposal);
      toast.success(
        `Plan ready (${r.proposal.plan.generatedBy === "ai" ? "AI" : "deterministic"})`,
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const onSchedule = async () => {
    if (!proposal) return;
    setScheduling(true);
    try {
      const r = await b2bPlannerApi.schedulePlan(proposal.id, {
        scheduledHour: 13,
        perEmployeeBudgetPaise: 40_000,
      });
      setProposal(r.proposal);
      toast.success(
        `Scheduled ${r.scheduledOfficeOrderIds.length} office orders`,
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setScheduling(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-clinical-zinc">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Office lunch planner</h1>
          <p className="text-sm text-clinical-zinc">
            Capture your team's diet shape, then let the planner build a
            constraint-respecting weekly menu you can schedule.
          </p>
        </div>
        <Link
          to={`/corporate/${slug}`}
          className="text-sm text-clinical-zinc underline"
        >
          ← Back to admin
        </Link>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-medium">Team diet profile</h2>
            {profile && (
              <span className="text-xs text-clinical-zinc">
                Last updated {new Date(profile.lastSurveyAt).toLocaleString()}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Headcount">
              <Input
                type="number"
                value={form.headcount}
                onChange={(e) =>
                  setForm({ ...form, headcount: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Vegetarian">
              <Input
                type="number"
                value={form.vegCount}
                onChange={(e) =>
                  setForm({ ...form, vegCount: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Non-veg (computed)">
              <Input value={remainingNonVeg} readOnly />
            </Field>
            <Field label="Vegan">
              <Input
                type="number"
                value={form.veganCount}
                onChange={(e) =>
                  setForm({ ...form, veganCount: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Gluten-free">
              <Input
                type="number"
                value={form.glutenFreeCount}
                onChange={(e) =>
                  setForm({
                    ...form,
                    glutenFreeCount: Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Jain">
              <Input
                type="number"
                value={form.jainCount}
                onChange={(e) =>
                  setForm({ ...form, jainCount: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Halal">
              <Input
                type="number"
                value={form.halalCount}
                onChange={(e) =>
                  setForm({ ...form, halalCount: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Calorie floor (per meal)">
              <Input
                type="number"
                value={form.calorieFloor ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    calorieFloor:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Calorie ceiling (per meal)">
              <Input
                type="number"
                value={form.calorieCeiling ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    calorieCeiling:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
          </div>

          <div className="space-y-2">
            <Label>Team-wide allergens to exclude</Label>
            <div className="flex flex-wrap gap-2">
              {ALLERGENS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleAllergen(a)}
                  className={`rounded-full border px-3 py-1 text-xs capitalize ${
                    form.allergens.includes(a)
                      ? "border-rose-500 bg-rose-500/10 text-rose-300"
                      : "border-zinc-700 text-clinical-zinc hover:border-zinc-500"
                  }`}
                >
                  {a.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Cuisine preferences</Label>
            <div className="flex gap-2">
              <Input
                value={cuisineInput}
                onChange={(e) => setCuisineInput(e.target.value)}
                placeholder="e.g. indian, thai, mediterranean"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCuisine();
                  }
                }}
              />
              <Button type="button" variant="secondary" onClick={addCuisine}>
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {form.cuisinePrefs.map((c) => (
                <Badge
                  key={c}
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => removeCuisine(c)}
                >
                  {c} ✕
                </Badge>
              ))}
            </div>
          </div>

          <Field label="Notes for the planner">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="e.g. avoid heavy lunches on Mondays; prefer rotating cuisines"
              rows={3}
            />
          </Field>

          <div className="flex justify-end">
            <Button onClick={onSave} disabled={saving}>
              {saving ? "Saving…" : profile ? "Update profile" : "Save profile"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">This week's menu plan</h2>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={onGenerate}
                disabled={generating || !profile}
              >
                {generating ? "Planning…" : proposal ? "Regenerate" : "Generate"}
              </Button>
              {proposal && (
                <Button
                  onClick={onSchedule}
                  disabled={scheduling || proposal.status === "scheduled"}
                >
                  {proposal.status === "scheduled"
                    ? "Scheduled"
                    : scheduling
                      ? "Scheduling…"
                      : "Schedule as office orders"}
                </Button>
              )}
            </div>
          </div>

          {!profile && (
            <p className="rounded border border-amber-700 bg-amber-900/20 p-3 text-sm text-amber-200">
              Save a team diet profile above to enable plan generation.
            </p>
          )}

          {proposal ? (
            <div className="space-y-4">
              <p className="text-sm text-clinical-zinc">
                Week of {proposal.plan.weekStartDate} ·{" "}
                <Badge variant="outline">{proposal.status}</Badge>{" "}
                <Badge variant="outline">
                  {proposal.plan.generatedBy === "ai" ? "AI" : "deterministic"}
                </Badge>
              </p>
              <p className="text-sm">{proposal.plan.summary}</p>
              <Separator />
              <div className="grid gap-4 md:grid-cols-2">
                {proposal.plan.days.map((day) => (
                  <div
                    key={day.date}
                    className="rounded border border-zinc-800 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="font-medium">{day.date}</h3>
                      {day.warnings.length > 0 && (
                        <Badge variant="destructive">
                          {day.warnings.length} warn
                        </Badge>
                      )}
                    </div>
                    <ul className="space-y-2 text-sm">
                      {day.picks.map((p) => (
                        <li key={p.menuItemId}>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-clinical-zinc">
                            {p.why}
                          </div>
                        </li>
                      ))}
                    </ul>
                    {day.warnings.length > 0 && (
                      <div className="mt-2 space-y-1 text-xs text-amber-300">
                        {day.warnings.map((w) => (
                          <div key={w}>• {w}</div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-clinical-zinc">
              No plan yet for the upcoming week.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wide text-clinical-zinc">
        {label}
      </Label>
      {children}
    </div>
  );
}
