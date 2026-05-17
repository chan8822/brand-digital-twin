import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Trophy, Users } from "lucide-react";
import { useCommunityMe } from "@/lib/contentApi";

const METRIC_LABELS: Record<string, string> = {
  high_protein_lunches: "high-protein meals",
  plant_forward_meals: "plant-forward meals",
  calorie_floor_days: "calorie-floor days",
  logged_meals: "logged meals",
  ordered_days: "ordered days",
};

export default function CommunityCohortPanel() {
  const { data, isLoading } = useCommunityMe();

  if (isLoading) {
    return (
      <p className="text-sm text-clinical-zinc">Loading your cohorts…</p>
    );
  }
  if (!data || data.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-clinical-gold" />
        <h2 className="font-serif text-xl text-white">
          Your cohort this week
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.map((card) => {
          const pct = Math.round(card.progress.ratio * 100);
          const metricLabel =
            METRIC_LABELS[card.challenge.metric] ?? card.challenge.metric;
          return (
            <Card
              key={card.cohort.id}
              className="bg-clinical-surface border-clinical-border"
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge className="bg-clinical-blue/20 text-clinical-blue border-0 text-[10px]">
                    {card.cohort.name}
                  </Badge>
                  <span className="text-[10px] uppercase tracking-wider text-clinical-zinc">
                    Week of {card.challenge.weekStartDate}
                  </span>
                </div>
                <div>
                  <h3 className="text-white font-semibold text-base">
                    {card.challenge.title}
                  </h3>
                  <p className="text-sm text-clinical-zinc mt-1">
                    {card.challenge.description}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-clinical-zinc">
                    <span>
                      {card.progress.count}/{card.challenge.targetCount}{" "}
                      {metricLabel}
                    </span>
                    <span className="flex items-center gap-1 text-clinical-gold">
                      <Trophy className="w-3 h-3" />
                      {card.challenge.rewardPoints} pts
                    </span>
                  </div>
                  <div className="h-2 bg-clinical-surface-elevated rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        card.progress.completed
                          ? "bg-clinical-sage"
                          : "bg-clinical-gold"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {card.progress.completed && (
                    <p className="text-xs text-clinical-sage flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Goal reached — reward unlocked.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
