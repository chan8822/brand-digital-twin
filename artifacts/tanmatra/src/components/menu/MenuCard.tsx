import { useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { Sparkle } from "@phosphor-icons/react";
import {
  AlertTriangle,
  Crown,
  Plus,
  ShieldAlert,
  Sparkles as SparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/api/adapter";
import {
  CATEGORY_LABELS,
  type DishData,
} from "@/lib/menuData";
import type { DishMatchResult } from "@/lib/preferencesMatch";
import { findSmartSwap } from "@/lib/preferencesMatch";
import type { UserPreferences } from "@/lib/preferencesApi";
import type { DishRationale } from "@/lib/dishRationaleApi";

type MenuCardProps = {
  item: DishData;
  match: DishMatchResult;
  index: number;
  isPremium: boolean;
  premiumSlugs: Set<string>;
  preferences: UserPreferences | null;
  lifestyleTag: string | null;
  rationale: DishRationale | undefined;
  onQuickAdd: (e: React.MouseEvent, item: DishData) => void;
  onPremiumGate: () => void;
};

export default function MenuCard({
  item,
  match,
  index,
  isPremium,
  premiumSlugs,
  preferences,
  lifestyleTag,
  rationale,
  onQuickAdd,
  onPremiumGate,
}: MenuCardProps) {
  const isPremiumOnly = premiumSlugs.has(item.slug);
  const showPremiumGate = isPremiumOnly && !isPremium;

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index, 8) * 0.04 }}
      whileHover={{ y: -4 }}
      className={`group relative flex flex-col rounded-2xl overflow-hidden bg-clinical-surface-elevated border border-clinical-slate/20 hover:border-clinical-gold/50 hover:shadow-[0_8px_30px_rgba(212,175,55,0.12)] transition-all duration-300 ${
        !item.isAvailable ? "opacity-50 grayscale" : ""
      } ${match.blocked ? "ring-1 ring-orange-500/40" : ""}`}
    >
      {/* Image */}
      <div className="relative h-52 overflow-hidden">
        <img
          src={item.image}
          alt={item.name}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-clinical-surface-elevated via-clinical-surface-elevated/30 to-transparent z-10" />

        {/* Sparkle hover flourish */}
        <motion.div
          className="absolute top-3 right-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity"
          initial={{ scale: 0 }}
          whileHover={{ scale: 1, rotate: 12 }}
          aria-hidden="true"
        >
          <Sparkle weight="fill" className="w-3.5 h-3.5 text-clinical-gold drop-shadow-[0_0_6px_rgba(212,175,55,0.6)]" />
        </motion.div>

        {/* Top-left: veg dot + RD + premium */}
        <div className="absolute top-3 left-3 z-20 flex gap-1.5 items-center">
          <span
            className={`w-3.5 h-3.5 rounded-sm border-2 flex items-center justify-center bg-[#050505]/80 ${
              item.isVeg ? "border-green-500" : "border-red-500"
            }`}
            title={item.isVeg ? "Vegetarian" : "Non-vegetarian"}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                item.isVeg ? "bg-green-500" : "bg-red-500"
              }`}
            />
          </span>
          {item.rdVerified && (
            <span className="text-[9px] px-1.5 py-0.5 rounded border border-clinical-sage/40 text-clinical-sage bg-clinical-sage/10 backdrop-blur-sm font-semibold tracking-wider uppercase">
              RD
            </span>
          )}
          {isPremiumOnly && (
            <span className="text-[9px] px-1.5 py-0.5 rounded border border-clinical-gold/50 text-clinical-gold bg-[#050505]/80 backdrop-blur-sm font-bold tracking-wider uppercase flex items-center gap-1">
              <Crown className="w-2.5 h-2.5" /> Premium
            </span>
          )}
        </div>

        {/* Lifestyle tag (only when no premium overlay would conflict) */}
        {lifestyleTag && !showPremiumGate && (
          <div className="absolute top-3 right-3 z-10">
            <span className="text-[9px] px-2 py-1 rounded border border-clinical-gold/40 text-clinical-gold bg-[#050505]/70 backdrop-blur-sm font-bold tracking-[0.12em] uppercase">
              {lifestyleTag}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="relative z-20 -mt-10 flex-1 flex flex-col p-5 gap-3">
        <div className="flex justify-between items-start gap-3">
          <h3 className="font-serif text-lg font-medium leading-tight text-white">
            {item.name}
          </h3>
          <span className="font-serif text-lg font-medium text-clinical-gold tabular-nums shrink-0">
            {formatPrice(item.price)}
          </span>
        </div>
        <p className="text-xs text-clinical-zinc line-clamp-2 leading-relaxed">
          {item.description}
        </p>

        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label={`Nutrition for ${item.name}`}
        >
          <MacroChip
            label="CAL"
            value={`${item.macros.calories}`}
            ariaLabel={`${item.macros.calories} kilocalories`}
          />
          <MacroChip
            label="PRO"
            value={`${item.macros.protein}g`}
            ariaLabel={`${item.macros.protein} grams of protein`}
          />
          <MacroChip
            label="C"
            value={`${item.macros.carbs}g`}
            ariaLabel={`${item.macros.carbs} grams of carbohydrates`}
          />
          <MacroChip
            label="F"
            value={`${item.macros.fat}g`}
            ariaLabel={`${item.macros.fat} grams of fat`}
          />
          <MacroChip
            label="GI"
            value={String(item.glycaemicIndex)}
            ariaLabel={`Glycaemic index ${item.glycaemicIndex}`}
          />
        </div>

        <div className="text-[10px] uppercase tracking-[0.12em] text-clinical-zinc font-semibold">
          {CATEGORY_LABELS[item.category]} · {item.kitchen}
        </div>

        {preferences &&
          (preferences.calorieTarget || preferences.proteinTargetGrams) && (
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              {preferences.calorieTarget && (
                <span className="px-1.5 py-0.5 rounded bg-clinical-slate/20 text-clinical-zinc">
                  {Math.round(
                    (item.macros.calories / preferences.calorieTarget) * 100,
                  )}
                  % of daily kcal
                </span>
              )}
              {preferences.proteinTargetGrams && (
                <span className="px-1.5 py-0.5 rounded bg-clinical-slate/20 text-clinical-zinc">
                  {Math.round(
                    (item.macros.protein / preferences.proteinTargetGrams) *
                      100,
                  )}
                  % of daily protein
                </span>
              )}
            </div>
          )}

        {match.warnings.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-start gap-1.5 text-[11px] text-orange-400">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="leading-tight">{match.warnings[0]}</span>
            </div>
            {(() => {
              const swap = findSmartSwap(item, preferences);
              if (!swap) return null;
              return (
                <Link
                  to={`/dish/${swap.slug}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 text-[11px] text-clinical-gold hover:underline"
                >
                  <SparklesIcon className="w-3 h-3" />
                  Smart swap: {swap.name} →
                </Link>
              );
            })()}
          </div>
        )}
        {match.warnings.length === 0 && match.reasons.length > 0 && (
          <div className="flex items-start gap-1.5 text-[11px] text-clinical-sage">
            <SparklesIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="leading-tight">
              Why this for you: {match.reasons[0]}
            </span>
          </div>
        )}

        <WhyThisMealRow rationale={rationale} />

        <div className="mt-auto pt-2 flex gap-2">
          <Link to={`/dish/${item.slug}`} className="flex-1">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-10 border-clinical-slate/30 bg-transparent text-clinical-zinc hover:bg-clinical-surface hover:text-white hover:border-clinical-gold/40 text-[11px] uppercase tracking-[0.12em] font-semibold"
            >
              Details
            </Button>
          </Link>
          {showPremiumGate ? (
            <Button
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPremiumGate();
              }}
              disabled={!item.isAvailable}
              className="flex-1 h-10 bg-transparent border border-clinical-gold/50 text-clinical-gold hover:bg-clinical-gold/10 text-[11px] uppercase tracking-[0.12em] font-bold gap-1"
            >
              <Crown className="w-3 h-3" />
              Premium Only
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={(e) => onQuickAdd(e, item)}
              disabled={!item.isAvailable}
              className="flex-1 h-10 bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 disabled:opacity-50 disabled:pointer-events-none text-[11px] uppercase tracking-[0.12em] font-bold gap-1 shadow-[0_0_15px_rgba(212,175,55,0.15)] hover:shadow-[0_0_20px_rgba(212,175,55,0.3)]"
            >
              <Plus className="w-3 h-3" />
              Add to Order
            </Button>
          )}
        </div>
      </div>

      {!item.isAvailable && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 pointer-events-none">
          <span className="text-xs flex items-center gap-1 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 font-semibold">
            <AlertTriangle className="w-3 h-3" />
            Out of Stock
          </span>
        </div>
      )}
      {showPremiumGate && item.isAvailable && (
        <div className="absolute inset-0 z-20 flex items-start justify-end p-2 bg-gradient-to-b from-[#050505]/30 to-transparent pointer-events-none">
          <span className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-full bg-clinical-gold/15 border border-clinical-gold/40 text-clinical-gold font-bold uppercase tracking-wider backdrop-blur-sm">
            <Crown className="w-3 h-3" />
            Premium
          </span>
        </div>
      )}
    </motion.article>
  );
}

function WhyThisMealRow({ rationale }: { rationale: DishRationale | undefined }) {
  const [open, setOpen] = useState(false);
  if (!rationale) return null;
  return (
    <div className="rounded-md border border-clinical-gold/20 bg-clinical-gold/[0.04] px-2.5 py-1.5">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="w-full flex items-start gap-1.5 text-left"
        aria-expanded={open}
      >
        <SparklesIcon className="w-3 h-3 mt-0.5 text-clinical-gold shrink-0" />
        <span className="flex-1 text-[11px] leading-snug text-clinical-zinc">
          <span className="text-clinical-gold font-semibold uppercase tracking-[0.1em] text-[9px] mr-1">
            Why this meal
          </span>
          {open ? rationale.expanded : rationale.rationale}
        </span>
        <span className="text-[10px] text-clinical-zinc/60 shrink-0">
          {open ? "Less" : "More"}
        </span>
      </button>
    </div>
  );
}

function MacroChip({
  label,
  value,
  ariaLabel,
}: {
  label: string;
  value: string;
  ariaLabel?: string;
}) {
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-clinical-surface border border-clinical-slate/20"
      aria-label={ariaLabel ?? `${label} ${value}`}
      role="group"
    >
      <span
        className="text-[9px] uppercase tracking-[0.12em] text-clinical-zinc font-semibold"
        aria-hidden="true"
      >
        {label}
      </span>
      <span
        className="text-[11px] tabular-nums text-clinical-gold font-medium"
        aria-hidden="true"
      >
        {value}
      </span>
    </div>
  );
}
