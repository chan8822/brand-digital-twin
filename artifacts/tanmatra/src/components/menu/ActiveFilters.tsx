import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

export type ActiveFilter = {
  id: string;
  label: string;
  onClear: () => void;
};

type ActiveFiltersProps = {
  filters: ActiveFilter[];
  onClearAll?: () => void;
};

export default function ActiveFilters({ filters, onClearAll }: ActiveFiltersProps) {
  if (filters.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] uppercase tracking-[0.18em] text-clinical-zinc font-semibold pr-1">
        Active
      </span>
      <AnimatePresence initial={false}>
        {filters.map((f) => (
          <motion.button
            key={f.id}
            type="button"
            onClick={f.onClear}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            whileHover={{ y: -1 }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-clinical-gold/40 bg-clinical-gold/10 text-clinical-gold text-[11px] font-semibold uppercase tracking-[0.1em] hover:bg-clinical-gold/15 transition-colors"
            aria-label={`Remove filter ${f.label}`}
          >
            {f.label}
            <X className="w-3 h-3" aria-hidden="true" />
          </motion.button>
        ))}
      </AnimatePresence>
      {onClearAll && filters.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-[11px] text-clinical-zinc hover:text-clinical-gold underline-offset-2 hover:underline ml-1"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
